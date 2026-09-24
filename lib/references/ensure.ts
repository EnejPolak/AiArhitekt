import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/database.types";
import type { ProductSelectionView } from "@/lib/discovery/types";
import { acquireProductReferenceAsset, isReusableReferenceAsset } from "./acquire";
import { MAX_PRODUCT_REFERENCE_EVALUATE } from "./constants";
import {
  extractProductImageCandidates,
  fetchProductPageHtmlResult,
} from "./extractProductImages";
import { isSameDirectProductPage } from "./imageUrlGuards";
import type { FetchLike } from "./fetchImage";
import {
  associateProductImage,
  evidenceCandidateUrls,
  extractedSourceToEvidenceSource,
  isUsableExactProductImageUrl,
  mergeImageEvidence,
  type ProductImageEvidence,
  type ProductReferenceFailureCode,
} from "./imageEvidence";
import { getProductReferenceAssetBySelection } from "./queries";
import {
  candidateCouldBeatCurrent,
  isHigherQualityReference,
  isPageSourcedEvidenceSource,
  parseDeclaredSizeFromUrl,
  rankExactProductEvidence,
  referenceQualityFromDimensions,
  type DeclaredImageSize,
} from "./referenceQuality";
import { runBoundedImageRescue, type ImageRescueSearch } from "./rescueImage";
import type { AddressLookup } from "./ssrf";
import type { ProductReferenceAssetView } from "./types";
import { ReferenceError } from "./errors";

type Client = SupabaseClient<Database>;

export type EnsureReferenceAssetsInput = {
  persistClient: Client;
  ownerUserId: string;
  projectId: string;
  selections: ProductSelectionView[];
  fetch?: FetchLike;
  lookup?: AddressLookup;
  rescueSearch?: ImageRescueSearch;
  /**
   * Re-read the merchant page and replace a READY cache when a higher-quality
   * exact-product image is found. Default false so render refresh stays cache-first.
   */
  replaceIfHigherQuality?: boolean;
};

export type EnsureReferenceAssetsResult = {
  assetsBySelectionId: Map<string, ProductReferenceAssetView>;
  failedSelectionIds: string[];
  reusedCount: number;
  fetchedCount: number;
  rescueAttemptedCount: number;
};

async function markSelectionReference(
  client: Client,
  selection: ProductSelectionView,
  patch: {
    status: "ready" | "unavailable" | "pending";
    failureCode?: ProductReferenceFailureCode | null;
    rescueAttempted?: boolean;
    imageEvidence?: ProductImageEvidence[];
    productImageUrl?: string | null;
  }
): Promise<void> {
  const row: Record<string, unknown> = {
    reference_status: patch.status,
    reference_failure_code: patch.status === "ready" ? null : patch.failureCode ?? null,
  };
  if (patch.rescueAttempted != null) row.reference_rescue_attempted = patch.rescueAttempted;
  if (patch.imageEvidence) row.image_evidence = patch.imageEvidence as unknown as Json;
  if (patch.productImageUrl) {
    row.product_image_url = patch.productImageUrl;
    row.has_reference_image = true;
  }
  await client
    .from("project_product_selections")
    .update(row as never)
    .eq("id", selection.id)
    .eq("project_id", selection.projectId);
}

function failureFromAcquire(error: unknown): ProductReferenceFailureCode {
  if (error instanceof ReferenceError && error.code === "invalid_image") return "invalid_image";
  if (error instanceof ReferenceError && error.code === "unsafe_url") return "association_unverified";
  return "fetch_failed";
}

function declaredForEvidence(
  item: ProductImageEvidence,
  declaredSizeByUrl: Map<string, DeclaredImageSize>
): DeclaredImageSize {
  return declaredSizeByUrl.get(item.url) ?? parseDeclaredSizeFromUrl(item.url);
}

function evaluationList(
  evidence: ProductImageEvidence[],
  declaredSizeByUrl: Map<string, DeclaredImageSize>
): ProductImageEvidence[] {
  const ranked = rankExactProductEvidence(evidence, declaredSizeByUrl);
  const pageSourced = ranked.filter((item) => isPageSourcedEvidenceSource(item.source));
  return pageSourced.length > 0 ? pageSourced : ranked;
}

export async function ensureProductReferenceAssets(
  input: EnsureReferenceAssetsInput
): Promise<EnsureReferenceAssetsResult> {
  const assetsBySelectionId = new Map<string, ProductReferenceAssetView>();
  const failedSelectionIds: string[] = [];
  let reusedCount = 0;
  let fetchedCount = 0;
  let rescueAttemptedCount = 0;
  const replaceIfHigherQuality = input.replaceIfHigherQuality === true;

  for (const selection of input.selections) {
    const existing = await getProductReferenceAssetBySelection(input.persistClient, selection.id);
    const reusableExisting = isReusableReferenceAsset(existing, input.projectId, selection.id)
      ? existing
      : null;
    const reusableUsable =
      reusableExisting &&
      isUsableExactProductImageUrl(
        reusableExisting.sourceImageUrl,
        selection.productTitle,
        selection.itemSpec
      )
        ? reusableExisting
        : null;
    if (reusableUsable && !replaceIfHigherQuality) {
      assetsBySelectionId.set(selection.id, reusableUsable);
      reusedCount += 1;
      await markSelectionReference(input.persistClient, selection, { status: "ready" });
      continue;
    }

    if (
      !replaceIfHigherQuality &&
      selection.referenceStatus === "unavailable" &&
      selection.referenceRescueAttempted
    ) {
      failedSelectionIds.push(selection.id);
      continue;
    }

    const tryAcquire = async (url: string) =>
      acquireProductReferenceAsset({
        persistClient: input.persistClient,
        ownerUserId: input.ownerUserId,
        projectId: input.projectId,
        selectionId: selection.id,
        sourceImageUrl: url,
        sourcePageUrl: selection.productUrl,
        fetch: input.fetch,
        lookup: input.lookup,
        cacheFirst: false,
      });

    const acquireBest = async (
      evidence: ProductImageEvidence[],
      declaredSizeByUrl: Map<string, DeclaredImageSize>,
      current: ProductReferenceAssetView | null
    ) => {
      const urls = evaluationList(evidence, declaredSizeByUrl);
      let best = current;
      let lastError: unknown = null;
      let evaluated = 0;
      for (const item of urls) {
        const declared = declaredForEvidence(item, declaredSizeByUrl);
        if (best && !candidateCouldBeatCurrent(declared, best)) continue;
        if (evaluated >= MAX_PRODUCT_REFERENCE_EVALUATE) break;
        evaluated += 1;
        try {
          const saved = await tryAcquire(item.url);
          fetchedCount += 1;
          if (!best || isHigherQualityReference(saved, best)) {
            best = saved;
          } else if (best.sourceImageUrl !== saved.sourceImageUrl) {
            best = await tryAcquire(best.sourceImageUrl);
            fetchedCount += 1;
          }
          if (best && referenceQualityFromDimensions(best.width, best.height) === "high") break;
        } catch (error) {
          lastError = error;
        }
      }
      const upgraded = Boolean(best && (!current || isHigherQualityReference(best, current)));
      return {
        saved: upgraded ? best : null,
        lastError,
        best,
      };
    };

    const declaredSizeByUrl = new Map<string, DeclaredImageSize>();
    let evidence = mergeImageEvidence(selection.imageEvidence, [
      selection.productImageUrl
        ? associateProductImage({
            url: selection.productImageUrl,
            source: "existing_product_image_url",
            productUrl: selection.productUrl,
            merchantDomain: selection.retailerDomain,
            sourcePageUrl: selection.productUrl,
            productTitle: selection.productTitle,
            itemSpec: selection.itemSpec,
          })
        : null,
    ]);

    let htmlBlocked = false;
    let htmlAttempted = false;
    let categoryRedirect = false;
    htmlAttempted = true;
    const page = await fetchProductPageHtmlResult(selection.productUrl, {
      fetch: input.fetch,
      lookup: input.lookup,
    });
    if (!page.ok) {
      htmlBlocked = true;
    } else if (!isSameDirectProductPage(selection.productUrl, page.finalUrl)) {
      categoryRedirect = true;
      htmlBlocked = true;
    } else {
      const extracted = extractProductImageCandidates(page.html, page.finalUrl);
      const associated = extracted.map((item) => {
        declaredSizeByUrl.set(item.url, {
          width: item.declaredWidth,
          height: item.declaredHeight,
        });
        return associateProductImage({
          url: item.url,
          source: extractedSourceToEvidenceSource(item.source),
          productUrl: selection.productUrl,
          merchantDomain: selection.retailerDomain,
          sourcePageUrl: selection.productUrl,
          productTitle: selection.productTitle,
          itemSpec: selection.itemSpec,
        });
      });
      evidence = mergeImageEvidence(evidence, associated);
    }

    let result = await acquireBest(evidence, declaredSizeByUrl, reusableUsable);
    if (result.saved) {
      assetsBySelectionId.set(selection.id, result.saved);
      await markSelectionReference(input.persistClient, selection, {
        status: "ready",
        imageEvidence: evidence,
        productImageUrl: result.saved.sourceImageUrl,
      });
      continue;
    }

    let rescueAttempted = Boolean(selection.referenceRescueAttempted);
    let associationRejected = 0;
    if (!reusableExisting) {
      const rescued = await runBoundedImageRescue(
        {
          productTitle: selection.productTitle,
          merchantDomain: selection.retailerDomain,
          productUrl: selection.productUrl,
          sku: null,
          existingEvidence: [
            selection.productTitle,
            selection.productUrl,
            selection.productImageUrl ?? "",
            ...evidenceCandidateUrls(selection.imageEvidence),
          ],
          rescueAlreadyAttempted: rescueAttempted,
        },
        input.rescueSearch
      );
      if (rescued.attempted) {
        rescueAttempted = true;
        rescueAttemptedCount += 1;
      }
      const rescuedEvidence: Array<ProductImageEvidence | null> = [];
      for (const url of rescued.urls) {
        const associated = associateProductImage({
          url,
          source: "search_evidence",
          productUrl: selection.productUrl,
          merchantDomain: selection.retailerDomain,
          sourcePageUrl: selection.productUrl,
        });
        if (!associated) associationRejected += 1;
        rescuedEvidence.push(associated);
      }
      evidence = mergeImageEvidence(evidence, rescuedEvidence);
      result = await acquireBest(evidence, declaredSizeByUrl, null);
    }

    if (result.saved) {
      assetsBySelectionId.set(selection.id, result.saved);
      await markSelectionReference(input.persistClient, selection, {
        status: "ready",
        rescueAttempted,
        imageEvidence: evidence,
        productImageUrl: result.saved.sourceImageUrl,
      });
      continue;
    }

    // Prefer a newly acquired exact-product image. If none, keep only a
    // previously cached asset that still passes exact-product usability.
    const keepUsable =
      (result.best &&
      isUsableExactProductImageUrl(
        result.best.sourceImageUrl,
        selection.productTitle,
        selection.itemSpec
      )
        ? result.best
        : null) ?? reusableUsable;
    if (keepUsable) {
      assetsBySelectionId.set(selection.id, keepUsable);
      if (keepUsable === reusableUsable) reusedCount += 1;
      await markSelectionReference(input.persistClient, selection, {
        status: "ready",
        rescueAttempted,
        imageEvidence: evidence,
        productImageUrl: keepUsable.sourceImageUrl,
      });
      continue;
    }

    // Never keep an invalid cached asset as READY — wrong product / legal chrome
    // must fail closed even when bytes were previously persisted.
    let failureCode: ProductReferenceFailureCode = "no_image";
    if (categoryRedirect) failureCode = "wrong_product";
    else if (associationRejected > 0 && evidence.length === 0) failureCode = "association_unverified";
    else if (result.lastError) failureCode = failureFromAcquire(result.lastError);
    else if (htmlBlocked && htmlAttempted) failureCode = "merchant_blocked";
    else if (reusableExisting) failureCode = "association_unverified";

    failedSelectionIds.push(selection.id);
    await markSelectionReference(input.persistClient, selection, {
      status: "unavailable",
      failureCode,
      rescueAttempted,
      imageEvidence: evidence,
    });
  }

  return { assetsBySelectionId, failedSelectionIds, reusedCount, fetchedCount, rescueAttemptedCount };
}

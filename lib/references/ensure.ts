import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/database.types";
import type { ProductSelectionView } from "@/lib/discovery/types";
import { acquireProductReferenceAsset, isReusableReferenceAsset } from "./acquire";
import { MAX_PRODUCT_REFERENCE_CANDIDATES } from "./constants";
import {
  extractProductImageCandidates,
  fetchProductPageHtml,
} from "./extractProductImages";
import type { FetchLike } from "./fetchImage";
import {
  associateProductImage,
  evidenceCandidateUrls,
  extractedSourceToEvidenceSource,
  mergeImageEvidence,
  type ProductImageEvidence,
  type ProductReferenceFailureCode,
} from "./imageEvidence";
import { getProductReferenceAssetBySelection } from "./queries";
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

export async function ensureProductReferenceAssets(
  input: EnsureReferenceAssetsInput
): Promise<EnsureReferenceAssetsResult> {
  const assetsBySelectionId = new Map<string, ProductReferenceAssetView>();
  const failedSelectionIds: string[] = [];
  let reusedCount = 0;
  let fetchedCount = 0;
  let rescueAttemptedCount = 0;

  for (const selection of input.selections) {
    const existing = await getProductReferenceAssetBySelection(input.persistClient, selection.id);
    if (isReusableReferenceAsset(existing, input.projectId, selection.id)) {
      assetsBySelectionId.set(selection.id, existing);
      reusedCount += 1;
      await markSelectionReference(input.persistClient, selection, { status: "ready" });
      continue;
    }

    if (selection.referenceStatus === "unavailable" && selection.referenceRescueAttempted) {
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
        cacheFirst: true,
      });

    const acquireFirst = async (evidence: ProductImageEvidence[]) => {
      const urls = evidenceCandidateUrls(evidence).slice(0, MAX_PRODUCT_REFERENCE_CANDIDATES);
      let lastError: unknown = null;
      for (const url of urls) {
        try {
          const saved = await tryAcquire(url);
          fetchedCount += 1;
          return { saved, lastError: null as unknown };
        } catch (error) {
          lastError = error;
        }
      }
      return { saved: null as ProductReferenceAssetView | null, lastError };
    };

    let evidence = mergeImageEvidence(selection.imageEvidence, [
      selection.productImageUrl
        ? associateProductImage({
            url: selection.productImageUrl,
            source: "existing_product_image_url",
            productUrl: selection.productUrl,
            merchantDomain: selection.retailerDomain,
            sourcePageUrl: selection.productUrl,
          })
        : null,
    ]);

    let result = await acquireFirst(evidence);
    let htmlBlocked = false;
    let htmlAttempted = false;

    if (!result.saved) {
      htmlAttempted = true;
      const html = await fetchProductPageHtml(selection.productUrl, {
        fetch: input.fetch,
        lookup: input.lookup,
      });
      if (!html) {
        htmlBlocked = true;
      } else {
        const extracted = extractProductImageCandidates(html, selection.productUrl).map((item) =>
          associateProductImage({
            url: item.url,
            source: extractedSourceToEvidenceSource(item.source),
            productUrl: selection.productUrl,
            merchantDomain: selection.retailerDomain,
            sourcePageUrl: selection.productUrl,
          })
        );
        evidence = mergeImageEvidence(evidence, extracted);
        result = await acquireFirst(evidence);
      }
    }

    let rescueAttempted = Boolean(selection.referenceRescueAttempted);
    let associationRejected = 0;
    if (!result.saved) {
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
      result = await acquireFirst(evidence);
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

    let failureCode: ProductReferenceFailureCode = "no_image";
    if (associationRejected > 0 && evidence.length === 0) failureCode = "association_unverified";
    else if (result.lastError) failureCode = failureFromAcquire(result.lastError);
    else if (htmlBlocked && htmlAttempted) failureCode = "merchant_blocked";

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

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { ensureProductReferenceAssets } from "@/lib/references/ensure";
import { fetchProductPageHtmlResult } from "@/lib/references/extractProductImages";
import {
  isUsableExactProductImageUrl,
  selectionHasUsableExactProductImage,
} from "@/lib/references/imageEvidence";
import { isSameDirectProductPage } from "@/lib/references/imageUrlGuards";
import { getProductReferenceAssetBySelection } from "@/lib/references/queries";
import { parseProductPageEnrichment } from "@/lib/serp/productPageEnrichment";
import { acquireMerchantEvidenceFromHtml } from "@/lib/productDiscovery/merchantEvidence";
import { selectionConflictsRequirementCategory } from "./requirementCategory";
import {
  getProjectProductDiscovery,
  getProjectProductSelections,
  updateOwnedSelectionVerifiedPrice,
} from "./queries";
import type { ProductSelectionView } from "./types";

type Client = SupabaseClient<Database>;

export type SelectionRepairReport = {
  selectionId: string;
  requirementKey: string;
  productTitle: string;
  priceBefore: number | null;
  priceAfter: number | null;
  priceUpdated: boolean;
  priceSkipReason?: string;
  referenceBefore: string | null;
  referenceAfter: string | null;
  referenceStatusAfter: string;
  categoryConflict: boolean;
  merchantFetches: number;
};

function readVerifiedEurPrice(html: string, pageUrl: string): number | null {
  const merchant = acquireMerchantEvidenceFromHtml(html, pageUrl);
  const verified = merchant.verifiedPrice;
  if (verified && Number.isFinite(verified.amount) && verified.amount > 0) {
    const currency = verified.currency?.toUpperCase() ?? null;
    if (!currency || currency === "EUR") return verified.amount;
  }
  const pagePrice = parseProductPageEnrichment(html, pageUrl);
  if (
    pagePrice.price != null &&
    Number.isFinite(pagePrice.price) &&
    pagePrice.price > 0 &&
    (pagePrice.currency == null || pagePrice.currency === "EUR")
  ) {
    return pagePrice.price;
  }
  return null;
}

/**
 * Bounded re-enrichment for already-selected products only.
 * No Step C / Places / Images. Preserves confirmation and product identity.
 */
export async function repairSelectedProductEvidence(input: {
  persistClient: Client;
  ownerUserId: string;
  projectId: string;
  /** When set, only these selection IDs are considered. */
  selectionIds?: string[];
  /** Price re-enrichment targets (exact existing URLs). */
  priceSelectionIds?: string[];
  /** Force reference re-evaluation for these selection IDs. */
  reevaluateReferenceIds?: string[];
  fetch?: typeof fetch;
}): Promise<{ reports: SelectionRepairReport[]; merchantFetches: number }> {
  const discovery = await getProjectProductDiscovery(input.persistClient, input.projectId);
  if (!discovery) {
    throw new Error(`No discovery for project ${input.projectId}`);
  }
  let selections = await getProjectProductSelections(input.persistClient, discovery.id);
  if (input.selectionIds?.length) {
    const allow = new Set(input.selectionIds);
    selections = selections.filter((item) => allow.has(item.id));
  }

  const priceTargets = new Set(input.priceSelectionIds ?? []);
  const refTargets = new Set(input.reevaluateReferenceIds ?? []);
  const reports: SelectionRepairReport[] = [];
  let merchantFetches = 0;

  for (const selection of selections) {
    const asset = await getProductReferenceAssetBySelection(input.persistClient, selection.id);
    const report: SelectionRepairReport = {
      selectionId: selection.id,
      requirementKey: selection.requirementKey,
      productTitle: selection.productTitle,
      priceBefore: selection.price,
      priceAfter: selection.price,
      priceUpdated: false,
      referenceBefore: asset?.sourceImageUrl ?? selection.productImageUrl,
      referenceAfter: asset?.sourceImageUrl ?? selection.productImageUrl,
      referenceStatusAfter: selection.referenceStatus ?? "pending",
      categoryConflict: selectionConflictsRequirementCategory(selection),
      merchantFetches: 0,
    };

    if (priceTargets.has(selection.id) && selection.price == null) {
      merchantFetches += 1;
      report.merchantFetches += 1;
      const page = await fetchProductPageHtmlResult(selection.productUrl, {
        fetch: input.fetch ?? globalThis.fetch,
      });
      if (!page.ok) {
        report.priceSkipReason = page.reason;
      } else if (!isSameDirectProductPage(selection.productUrl, page.finalUrl)) {
        report.priceSkipReason = "category_redirect";
      } else {
        const amount = readVerifiedEurPrice(page.html, page.finalUrl);
        if (amount == null) {
          report.priceSkipReason = "no_verifiable_price";
        } else {
          const updated = await updateOwnedSelectionVerifiedPrice(input.persistClient, {
            selectionId: selection.id,
            projectId: input.projectId,
            price: amount,
            currency: "EUR",
          });
          report.priceAfter = updated.price;
          report.priceUpdated = true;
        }
      }
    }

    const needsReferencePass =
      refTargets.has(selection.id) ||
      !selectionHasUsableExactProductImage(selection) ||
      (asset != null &&
        !isUsableExactProductImageUrl(asset.sourceImageUrl, selection.productTitle, selection.itemSpec));

    if (needsReferencePass) {
      const ensure = await ensureProductReferenceAssets({
        persistClient: input.persistClient,
        ownerUserId: input.ownerUserId,
        projectId: input.projectId,
        selections: [selection],
        fetch: input.fetch,
        replaceIfHigherQuality: true,
      });
      merchantFetches += ensure.fetchedCount > 0 ? 1 : 0;
      report.merchantFetches += ensure.fetchedCount > 0 ? 1 : 0;
      const afterAsset = await getProductReferenceAssetBySelection(input.persistClient, selection.id);
      const refreshed = (await getProjectProductSelections(input.persistClient, discovery.id)).find(
        (row) => row.id === selection.id
      );
      report.referenceAfter = afterAsset?.sourceImageUrl ?? refreshed?.productImageUrl ?? null;
      report.referenceStatusAfter = refreshed?.referenceStatus ?? selection.referenceStatus ?? "pending";
    }

    reports.push(report);
  }

  return { reports, merchantFetches };
}

export function isSelectionUsableForRender(selection: ProductSelectionView): boolean {
  return (
    selection.referenceStatus === "ready" &&
    selectionHasUsableExactProductImage(selection) &&
    !selectionConflictsRequirementCategory(selection)
  );
}

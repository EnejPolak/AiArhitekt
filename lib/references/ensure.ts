import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { ProductSelectionView } from "@/lib/discovery/types";
import { acquireProductReferenceAsset, isReusableReferenceAsset } from "./acquire";
import { MAX_PRODUCT_REFERENCE_CANDIDATES } from "./constants";
import {
  extractProductImageCandidates,
  fetchProductPageHtml,
  type ExtractedProductImage,
} from "./extractProductImages";
import type { FetchLike } from "./fetchImage";
import { getProductReferenceAssetBySelection } from "./queries";
import type { AddressLookup } from "./ssrf";
import type { ProductReferenceAssetView } from "./types";

type Client = SupabaseClient<Database>;

export type EnsureReferenceAssetsInput = {
  persistClient: Client;
  ownerUserId: string;
  projectId: string;
  selections: ProductSelectionView[];
  fetch?: FetchLike;
  lookup?: AddressLookup;
};

export type EnsureReferenceAssetsResult = {
  assetsBySelectionId: Map<string, ProductReferenceAssetView>;
  failedSelectionIds: string[];
  reusedCount: number;
  fetchedCount: number;
};

function uniqueCandidateUrls(
  selection: ProductSelectionView,
  extracted: ExtractedProductImage[]
): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  const push = (url: string | null | undefined) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    urls.push(url);
  };
  push(selection.productImageUrl);
  for (const item of extracted) push(item.url);
  return urls.slice(0, MAX_PRODUCT_REFERENCE_CANDIDATES);
}

export async function ensureProductReferenceAssets(
  input: EnsureReferenceAssetsInput
): Promise<EnsureReferenceAssetsResult> {
  const assetsBySelectionId = new Map<string, ProductReferenceAssetView>();
  const failedSelectionIds: string[] = [];
  let reusedCount = 0;
  let fetchedCount = 0;

  for (const selection of input.selections) {
    const existing = await getProductReferenceAssetBySelection(input.persistClient, selection.id);
    if (isReusableReferenceAsset(existing, input.projectId, selection.id)) {
      assetsBySelectionId.set(selection.id, existing);
      reusedCount += 1;
      continue;
    }

    let extracted: ExtractedProductImage[] = [];
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

    let saved: ProductReferenceAssetView | null = null;
    if (selection.productImageUrl) {
      try {
        saved = await tryAcquire(selection.productImageUrl);
        fetchedCount += 1;
      } catch {
        saved = null;
      }
    }

    if (!saved && selection.productUrl) {
      const html = await fetchProductPageHtml(selection.productUrl, {
        fetch: input.fetch,
        lookup: input.lookup,
      });
      if (html) {
        extracted = extractProductImageCandidates(html, selection.productUrl);
      }
      const remaining = uniqueCandidateUrls(selection, extracted).filter(
        (url) => url !== selection.productImageUrl
      );
      for (const url of remaining) {
        try {
          saved = await tryAcquire(url);
          fetchedCount += 1;
          break;
        } catch {
          saved = null;
        }
      }
    }

    if (saved) {
      assetsBySelectionId.set(selection.id, saved);
    } else {
      failedSelectionIds.push(selection.id);
    }
  }

  return { assetsBySelectionId, failedSelectionIds, reusedCount, fetchedCount };
}

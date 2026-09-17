import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { getProjectProductDiscovery, getProjectProductSelections } from "@/lib/discovery/queries";
import { listProjectProductReferenceAssets } from "@/lib/references/queries";
import type { ProductSelectionView } from "@/lib/discovery/types";
import type { ProductReferenceAssetView } from "@/lib/references/types";
import { isValidReferenceForSelection } from "./order";

export type RenderReadyReferenceAsset = {
  id: string;
  storagePath: string;
  mimeType: string;
  sourceImageUrl: string;
  sourcePageUrl: string | null;
  isPrimary: boolean;
};

export type RenderGroundingStatus = "reference-grounded" | "reference-unavailable";

export type RenderReadySelectedProduct = {
  selectionId: string;
  requirementId: string;
  category: string;
  productName: string;
  merchant: string;
  merchantDomain: string;
  productUrl: string;
  price: number | null;
  currency: "EUR" | null;
  dimensions: string | null;
  material: string | null;
  color: string | null;
  grounding: RenderGroundingStatus;
  referenceAssets: RenderReadyReferenceAsset[];
};

function snapshotString(snapshot: unknown, keys: string[]): string | null {
  if (!snapshot || typeof snapshot !== "object") return null;
  const record = snapshot as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export function categoryFromSelection(selection: ProductSelectionView): string {
  return snapshotString(selection.requirementSnapshot, ["category", "surface"]) ?? selection.itemSpec;
}

export function toRenderReadySelectedProduct(
  selection: ProductSelectionView,
  asset: ProductReferenceAssetView | undefined
): RenderReadySelectedProduct {
  const grounded = isValidReferenceForSelection(selection, asset);
  return {
    selectionId: selection.id,
    requirementId: selection.requirementKey,
    category: categoryFromSelection(selection),
    productName: selection.productTitle,
    merchant: selection.retailerName ?? selection.retailerDomain,
    merchantDomain: selection.retailerDomain,
    productUrl: selection.productUrl,
    price: selection.price,
    currency: selection.currency,
    dimensions: snapshotString(selection.requirementSnapshot, ["dimensions", "size"]),
    material: snapshotString(selection.requirementSnapshot, ["material"]),
    color: snapshotString(selection.requirementSnapshot, ["color"]),
    grounding: grounded ? "reference-grounded" : "reference-unavailable",
    referenceAssets: grounded
      ? [
          {
            id: asset.id,
            storagePath: asset.storagePath,
            mimeType: asset.mimeType,
            sourceImageUrl: asset.sourceImageUrl,
            sourcePageUrl: asset.sourcePageUrl,
            isPrimary: asset.isPrimary,
          },
        ]
      : [],
  };
}

export function loadRenderReadySelectedProductsFromState(
  selections: ProductSelectionView[],
  assets: ProductReferenceAssetView[]
): RenderReadySelectedProduct[] {
  const assetsBySelectionId = new Map(assets.map((asset) => [asset.selectionId, asset]));
  return selections.map((selection) =>
    toRenderReadySelectedProduct(selection, assetsBySelectionId.get(selection.id))
  );
}

export async function loadRenderReadySelectedProducts(
  client: SupabaseClient<Database>,
  projectId: string
): Promise<RenderReadySelectedProduct[]> {
  const discovery = await getProjectProductDiscovery(client, projectId);
  if (!discovery) return [];
  const [selections, assets] = await Promise.all([
    getProjectProductSelections(client, discovery.id),
    listProjectProductReferenceAssets(client, projectId),
  ]);
  return loadRenderReadySelectedProductsFromState(selections, assets);
}

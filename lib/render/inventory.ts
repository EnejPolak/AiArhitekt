import type { ProductSelectionView } from "@/lib/discovery/types";
import type { ProductReferenceAssetView } from "@/lib/references/types";
import type { Json } from "@/lib/database.types";
import { orderRenderReferences, isValidReferenceForSelection, type OrderedRenderReference } from "./order";
import { snapshotString } from "./productFacts";
import {
  referenceQualityFromDimensions,
  type ReferenceQualityClass,
} from "@/lib/references/referenceQuality";

export type ExpectedRenderInventoryItem = {
  selectionId: string;
  requirementId: string;
  productName: string;
  merchantName: string;
  productUrl: string;
  price: number | null;
  currency: "EUR" | null;
  referenceAssetId: string;
  referenceStatus: "ready";
  referenceImageIndex: number;
  category: string;
  referenceQuality: ReferenceQualityClass | null;
  referenceWidth: number | null;
  referenceHeight: number | null;
  referenceSizeBytes: number | null;
  referenceSource: string | null;
  exactProductAssociation: boolean;
};

export function isReadyShoppableSelection(
  selection: ProductSelectionView,
  asset: ProductReferenceAssetView | undefined
): asset is ProductReferenceAssetView {
  if (selection.referenceStatus === "unavailable" || selection.referenceStatus === "pending") {
    return false;
  }
  if (selection.referenceStatus != null && selection.referenceStatus !== "ready") {
    return false;
  }
  if (!isValidReferenceForSelection(selection, asset)) return false;
  if (asset.sizeBytes <= 0) return false;
  return true;
}

export function overlayInventoryQualityFromAssets<T extends { selectionId: string }>(
  items: T[],
  assetsBySelectionId: Map<string, ProductReferenceAssetView>
): T[] {
  return items.map((item) => {
    const asset = assetsBySelectionId.get(item.selectionId);
    if (!asset) return item;
    return {
      ...item,
      referenceQuality: referenceQualityFromDimensions(asset.width, asset.height),
      referenceWidth: asset.width,
      referenceHeight: asset.height,
      referenceSizeBytes: asset.sizeBytes,
      referenceSource: asset.sourceImageUrl,
      exactProductAssociation: true,
    };
  });
}

export function toExpectedRenderInventory(
  references: OrderedRenderReference[]
): ExpectedRenderInventoryItem[] {
  return references.map((item) => ({
    selectionId: item.selection.id,
    requirementId: item.selection.requirementKey,
    productName: item.selection.productTitle,
    merchantName: item.selection.retailerName ?? item.selection.retailerDomain,
    productUrl: item.selection.productUrl,
    price: item.selection.price,
    currency: item.selection.currency,
    referenceAssetId: item.asset.id,
    referenceStatus: "ready",
    referenceImageIndex: item.imageIndex,
    category: snapshotString(item.selection.requirementSnapshot, ["category", "surface"]) ?? item.selection.itemSpec,
    referenceQuality: referenceQualityFromDimensions(item.asset.width, item.asset.height),
    referenceWidth: item.asset.width,
    referenceHeight: item.asset.height,
    referenceSizeBytes: item.asset.sizeBytes,
    referenceSource: item.asset.sourceImageUrl,
    exactProductAssociation: true,
  }));
}

export function buildRenderInventory(
  selections: ProductSelectionView[],
  assetsBySelectionId: Map<string, ProductReferenceAssetView>
): ExpectedRenderInventoryItem[] {
  return toExpectedRenderInventory(orderRenderReferences(selections, assetsBySelectionId).ordered);
}

export function inventorySelectionIds(inventory: ExpectedRenderInventoryItem[]): string[] {
  return inventory.map((item) => item.selectionId);
}

export function inventoryIsSubsetOfShoppingSelections(
  foundSelections: ProductSelectionView[],
  inventory: ExpectedRenderInventoryItem[]
): boolean {
  const foundIds = new Set(foundSelections.map((selection) => selection.id));
  return inventory.every((item) => foundIds.has(item.selectionId) && item.productUrl.length > 0);
}

export function shoppingListEqualsRenderInventory(
  foundSelections: ProductSelectionView[],
  assetsBySelectionId: Map<string, ProductReferenceAssetView>,
  inventory: ExpectedRenderInventoryItem[]
): boolean {
  const fromShopping = buildRenderInventory(foundSelections, assetsBySelectionId);
  const left = inventorySelectionIds(fromShopping).sort((a, b) => a.localeCompare(b));
  const right = inventorySelectionIds(inventory).sort((a, b) => a.localeCompare(b));
  if (left.length !== right.length) return false;
  return left.every((id, index) => id === right[index]) && inventoryIsSubsetOfShoppingSelections(foundSelections, inventory);
}

export function expectedRenderInventoryFromSnapshot(
  promptSnapshot: { expectedRenderInventory?: unknown } | Json | null | undefined
): ExpectedRenderInventoryItem[] {
  if (!promptSnapshot || typeof promptSnapshot !== "object" || Array.isArray(promptSnapshot)) {
    return [];
  }
  const raw = (promptSnapshot as { expectedRenderInventory?: unknown }).expectedRenderInventory;
  if (!Array.isArray(raw)) return [];
  const items: ExpectedRenderInventoryItem[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    if (typeof record.selectionId !== "string" || !record.selectionId) continue;
    if (typeof record.requirementId !== "string") continue;
    if (typeof record.productName !== "string") continue;
    if (typeof record.merchantName !== "string") continue;
    if (typeof record.productUrl !== "string") continue;
    if (typeof record.referenceAssetId !== "string") continue;
    if (record.referenceStatus !== "ready") continue;
    if (typeof record.referenceImageIndex !== "number") continue;
    if (typeof record.category !== "string") continue;
    items.push({
      selectionId: record.selectionId,
      requirementId: record.requirementId,
      productName: record.productName,
      merchantName: record.merchantName,
      productUrl: record.productUrl,
      price: typeof record.price === "number" ? record.price : null,
      currency: record.currency === "EUR" ? "EUR" : null,
      referenceAssetId: record.referenceAssetId,
      referenceStatus: "ready",
      referenceImageIndex: record.referenceImageIndex,
      category: record.category,
      referenceQuality:
        record.referenceQuality === "high" ||
        record.referenceQuality === "medium" ||
        record.referenceQuality === "low"
          ? record.referenceQuality
          : typeof record.referenceWidth === "number" || typeof record.referenceHeight === "number"
            ? referenceQualityFromDimensions(
                typeof record.referenceWidth === "number" ? record.referenceWidth : null,
                typeof record.referenceHeight === "number" ? record.referenceHeight : null
              )
            : null,
      referenceWidth: typeof record.referenceWidth === "number" ? record.referenceWidth : null,
      referenceHeight: typeof record.referenceHeight === "number" ? record.referenceHeight : null,
      referenceSizeBytes: typeof record.referenceSizeBytes === "number" ? record.referenceSizeBytes : null,
      referenceSource: typeof record.referenceSource === "string" ? record.referenceSource : null,
      exactProductAssociation: record.exactProductAssociation !== false,
    });
  }
  return items;
}

export function referenceSnapshotIsReadyOnly(
  snapshot: Json | unknown,
  inventory: ExpectedRenderInventoryItem[]
): boolean {
  if (!Array.isArray(snapshot)) return false;
  const inventoryIds = new Set(inventorySelectionIds(inventory));
  if (snapshot.length !== inventory.length) return false;
  return snapshot.every((item) => {
    if (!item || typeof item !== "object") return false;
    const selectionId = (item as { selectionId?: unknown }).selectionId;
    return typeof selectionId === "string" && inventoryIds.has(selectionId);
  });
}

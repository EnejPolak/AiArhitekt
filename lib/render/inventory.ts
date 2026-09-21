import type { ProductSelectionView } from "@/lib/discovery/types";
import type { ProductReferenceAssetView } from "@/lib/references/types";
import type { Json } from "@/lib/database.types";
import { orderRenderReferences, isValidReferenceForSelection, type OrderedRenderReference } from "./order";
import { snapshotString } from "./productFacts";

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

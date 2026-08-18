import type { ProductSelectionView } from "@/lib/discovery/types";
import type { ProductReferenceAssetView } from "@/lib/references/types";
import { MAX_RENDER_REFERENCE_IMAGES } from "./constants";
import { parseProductReferencePath } from "@/lib/references/path";

const LARGE_FURNITURE = [
  "sofa",
  "couch",
  "sectional",
  "loveseat",
  "bed",
  "mattress",
  "wardrobe",
  "armoire",
  "dresser",
  "cabinet",
  "cupboard",
  "sideboard",
  "buffet",
  "bookshelf",
  "bookcase",
  "dining table",
  "dining-table",
];

const SMALL_TABLE = /\b(coffee|side|end|console|night|bedside)\s*-?\s*table\b/;
const SMALL_SEATING = /\b(chair|stool|ottoman|bench)\b/;

const ACCESSORY = [
  "lamp",
  "lighting",
  "light fixture",
  "rug",
  "carpet",
  "cushion",
  "pillow",
  "throw",
  "vase",
  "plant",
  "art",
  "poster",
  "mirror",
  "curtain",
  "drape",
  "decor",
  "accessory",
  "clock",
  "candle",
];

export type OrderedRenderReference = {
  imageIndex: number;
  selection: ProductSelectionView;
  asset: ProductReferenceAssetView;
  priority: 1 | 2 | 3 | 4;
  originalIndex: number;
};

function categoryText(selection: ProductSelectionView): string {
  const snap = selection.requirementSnapshot as { category?: unknown; surface?: unknown } | null;
  const category = snap && typeof snap.category === "string" ? snap.category : "";
  const surface = snap && typeof snap.surface === "string" ? snap.surface : "";
  return `${selection.requirementType} ${selection.requirementKey} ${selection.itemSpec} ${category} ${surface}`
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function referencePriority(selection: ProductSelectionView): 1 | 2 | 3 | 4 {
  if (selection.requirementType === "material") return 3;
  const text = categoryText(selection);
  if (ACCESSORY.some((token) => text.includes(token))) return 4;
  if (SMALL_TABLE.test(text) || SMALL_SEATING.test(text)) return 2;
  if (LARGE_FURNITURE.some((token) => text.includes(token))) return 1;
  return 2;
}

export function isValidReferenceForSelection(
  selection: ProductSelectionView,
  asset: ProductReferenceAssetView | undefined
): asset is ProductReferenceAssetView {
  if (!asset) return false;
  if (asset.projectId !== selection.projectId) return false;
  if (asset.selectionId !== selection.id) return false;
  if (!/^[a-f0-9]{64}$/.test(asset.sourceHash)) return false;
  const parsed = parseProductReferencePath(asset.storagePath);
  if (!parsed) return false;
  if (parsed.projectId !== selection.projectId) return false;
  if (parsed.selectionId !== selection.id) return false;
  return true;
}

export function orderRenderReferences(
  confirmed: ProductSelectionView[],
  assetsBySelectionId: Map<string, ProductReferenceAssetView>
): {
  ordered: OrderedRenderReference[];
  missing: ProductSelectionView[];
  tooMany: boolean;
} {
  const missing: ProductSelectionView[] = [];
  const ready: Array<{
    selection: ProductSelectionView;
    asset: ProductReferenceAssetView;
    priority: 1 | 2 | 3 | 4;
    originalIndex: number;
  }> = [];

  confirmed.forEach((selection, originalIndex) => {
    const asset = assetsBySelectionId.get(selection.id);
    if (!isValidReferenceForSelection(selection, asset)) {
      missing.push(selection);
      return;
    }
    ready.push({
      selection,
      asset,
      priority: referencePriority(selection),
      originalIndex,
    });
  });

  ready.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    if (a.originalIndex !== b.originalIndex) return a.originalIndex - b.originalIndex;
    return a.selection.requirementKey.localeCompare(b.selection.requirementKey);
  });

  const tooMany = ready.length > MAX_RENDER_REFERENCE_IMAGES;
  return {
    missing,
    tooMany,
    ordered: tooMany
      ? []
      : ready.map((item, index) => ({
          ...item,
          imageIndex: index + 2,
        })),
  };
}

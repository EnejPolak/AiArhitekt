import type { ProductSelectionView } from "@/lib/discovery/types";
import type { ProductReferenceAssetView } from "@/lib/references/types";
import { MAX_RENDER_REFERENCE_IMAGES } from "./constants";
import { parseProductReferencePath } from "@/lib/references/path";

const SOFA_BED = /\b(sofa|couch|sectional|loveseat|bed|mattress)\b/;
const DINING_TABLE = /\bdining\s*-?\s*table\b/;
const STORAGE = /\b(wardrobe|armoire|dresser|cabinet|cupboard|sideboard|buffet|bookshelf|bookcase)\b/;
const RUG = /\b(rug|carpet)\b/;
const SMALL_TABLE = /\b(coffee|side|end|console|night|bedside)\s*-?\s*table\b/;
const SMALL_SEATING = /\b(chair|stool|ottoman|bench)\b/;
const LAMP = /\b(lamp|lighting|light fixture)\b/;
const DECOR = /\b(vase|plant|art|poster|mirror|curtain|drape|decor|accessory|clock|candle|cushion|pillow|throw)\b/;

export type OrderedRenderReference = {
  imageIndex: number;
  selection: ProductSelectionView;
  asset: ProductReferenceAssetView;
  priority: number;
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

export function referencePriority(selection: ProductSelectionView): number {
  const text = categoryText(selection);
  if (SOFA_BED.test(text)) return 1;
  if (DINING_TABLE.test(text)) return 2;
  if (STORAGE.test(text)) return 3;
  if (RUG.test(text)) return 4;
  if (SMALL_TABLE.test(text)) return 5;
  if (SMALL_SEATING.test(text)) return 6;
  if (LAMP.test(text)) return 7;
  if (selection.requirementType === "material") return 8;
  if (DECOR.test(text)) return 9;
  return 6;
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
  selections: ProductSelectionView[],
  assetsBySelectionId: Map<string, ProductReferenceAssetView>
): {
  ordered: OrderedRenderReference[];
  missing: ProductSelectionView[];
  truncated: boolean;
  tooMany: boolean;
} {
  const missing: ProductSelectionView[] = [];
  const ready: Array<{
    selection: ProductSelectionView;
    asset: ProductReferenceAssetView;
    priority: number;
    originalIndex: number;
  }> = [];

  selections.forEach((selection, originalIndex) => {
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

  const truncated = ready.length > MAX_RENDER_REFERENCE_IMAGES;
  const limited = ready.slice(0, MAX_RENDER_REFERENCE_IMAGES);
  return {
    missing,
    truncated,
    tooMany: truncated,
    ordered: limited.map((item, index) => ({
      ...item,
      imageIndex: index + 2,
    })),
  };
}

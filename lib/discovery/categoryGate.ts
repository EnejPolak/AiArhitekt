import type { SearchableRequirement } from "./itemSpecs";
import { isDeskRequirement, isWallPaintMaterial } from "./itemSpecs";
import type { FurnitureNeed, MaterialNeed } from "./itemSpecs";

function normalizeHaystack(value: string): string {
  return value
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const DESK_TITLE =
  /\bdesk\b|\bworkstation\b|pisalna miza|racunalniska miza|ra[cč]unalni[sš]ka miza/i;

const NON_DESK_FURNITURE =
  /\b(chair|stool|sofa|couch|bed|wardrobe|ottoman|armchair)\b/i;

const PAINT_TITLE = /\bpaint\b|\bbarva\b|\bpremaz\b|\bcoating\b|\bplesk/i;

function distinctiveColorTokens(color: string): string[] {
  return color
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.replace(/[^a-z0-9]/g, ""))
    .filter((token) => token.length >= 3)
    .filter((token) => !["interior", "wall", "paint", "colour", "color", "finish"].includes(token));
}

export function candidateMatchesRequirement(
  requirement: SearchableRequirement,
  productTitle: string
): boolean {
  const haystack = normalizeHaystack(productTitle);
  if (!haystack) return false;

  if (requirement.requirementType === "furniture") {
    const snapshot = requirement.snapshot as FurnitureNeed;
    if (isDeskRequirement(snapshot.category, snapshot.constraints)) {
      if (NON_DESK_FURNITURE.test(haystack) && !DESK_TITLE.test(haystack)) return false;
      return DESK_TITLE.test(productTitle) || DESK_TITLE.test(haystack);
    }
    return true;
  }

  const snapshot = requirement.snapshot as MaterialNeed;
  if (isWallPaintMaterial(snapshot)) {
    if (!PAINT_TITLE.test(haystack) && !PAINT_TITLE.test(productTitle)) return false;
    const color = snapshot.finishDirection ?? snapshot.constraints[0] ?? "";
    const colorTokens = distinctiveColorTokens(color);
    if (colorTokens.length === 0) return true;
    const hue = colorTokens[colorTokens.length - 1];
    return haystack.includes(hue);
  }

  return true;
}

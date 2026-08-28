import type { CandidateEvidence } from "../categoryGate";
import { normalizeMatchText } from "@/lib/text/diacritics";

export type ProductKind =
  | "floor_tile"
  | "wall_tile"
  | "floor_and_wall_tile"
  | "stone_flooring"
  | "laminate_flooring"
  | "wood_flooring"
  | "tile_accessory"
  | "tile_spacer"
  | "tile_wedge"
  | "grout"
  | "adhesive"
  | "sealant"
  | "installation_tool"
  | "interior_wall_paint"
  | "exterior_paint"
  | "decorative_effect_paint"
  | "wood_paint"
  | "metal_paint"
  | "primer"
  | "desk"
  | "gaming_chair"
  | "office_chair"
  | "category_listing"
  | "unknown";

function titleSnippetHaystack(evidence: CandidateEvidence): string {
  return normalizeMatchText(`${evidence.title} ${evidence.snippet ?? ""}`);
}

function evidenceHaystack(evidence: CandidateEvidence): string {
  const urlSlug = (evidence.url ?? "")
    .replace(/^https?:\/\//, "")
    .replace(/[?#].*$/, "")
    .replace(/[^a-z0-9]+/gi, " ");
  return normalizeMatchText(`${evidence.title} ${evidence.snippet ?? ""} ${urlSlug}`);
}

function matchesAny(haystack: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(haystack));
}

/** Strong negative: products FOR tiles, not tiles themselves. */
const TILE_ACCESSORY_FOR_PATTERNS: RegExp[] = [
  /\bza ploscic/,
  /\bfor tile/,
  /\bza keramic/,
];

const TILE_WEDGE_PATTERNS: RegExp[] = [/\bzagozd/, /\bwedge\b/, /\bklina\b/];
const TILE_SPACER_PATTERNS: RegExp[] = [/\bdistancnik/, /\bspacer\b/, /\bdistancer\b/];
const GROUT_PATTERNS: RegExp[] = [/\bfugirn/, /\bgrout\b/, /\bfuga\b/, /\bfugiran/];
const ADHESIVE_PATTERNS: RegExp[] = [
  /\blepilo za ploscic/,
  /\btile adhesive/,
  /\bfix za ploscic/,
  /\bce 40\b/,
  /\bsilica active\b/,
];
const SEALANT_PATTERNS: RegExp[] = [/\bsilikon/, /\bsealant\b/, /\btesnil/];
const TOOL_PATTERNS: RegExp[] = [
  /\brezalnik ploscic/,
  /\btile cutter/,
  /\borodje za ploscic/,
  /\bprofil za ploscic/,
];

const WALL_TILE_PATTERNS: RegExp[] = [
  /\bstenska ploscic/,
  /\bstenske ploscic/,
  /\bwall tile/,
  /\bwall tiles/,
];
const FLOOR_TILE_PATTERNS: RegExp[] = [
  /\btalna ploscic/,
  /\bfloor tile/,
  /\btalne ploscice/,
  /\bstone tile/,
];
const FLOOR_AND_WALL_PATTERNS: RegExp[] = [
  /\btalna in stenska/,
  /\bfloor and wall/,
  /\bza tal in stene/,
];

/** Explicit wall-only wording in the product title always wins over snippet/URL floor hints. */
export function titleIsExplicitWallOnlyTile(title: string): boolean {
  const haystack = normalizeMatchText(title);
  if (!haystack) return false;
  if (matchesAny(haystack, FLOOR_AND_WALL_PATTERNS)) return false;
  if (matchesAny(haystack, FLOOR_TILE_PATTERNS)) return false;
  return matchesAny(haystack, WALL_TILE_PATTERNS);
}

const DECORATIVE_PAINT_PATTERNS: RegExp[] = [
  /\bdekorativn/,
  /\bdecorative/,
  /\beffect paint/,
  /\bizgled puscav/,
  /\bdesert/,
  /\bspatula/,
  /\btexture paint/,
];

const EXTERIOR_PAINT_PATTERNS: RegExp[] = [
  /\bfasad/,
  /\bexterior/,
  /\bweather/,
  /\bzunanja barva/,
  /\boutside paint/,
];
const WOOD_PAINT_PATTERNS: RegExp[] = [/\bwood paint/, /\bbarva za les/, /\blak za les/];
const METAL_PAINT_PATTERNS: RegExp[] = [/\bmetal paint/, /\bbarva za kovin/, /\bradiator paint/];
const PRIMER_PATTERNS: RegExp[] = [/\bprimer\b/, /\bimpregnacij/, /\bgrund/];
const INTERIOR_WALL_PAINT_PATTERNS: RegExp[] = [
  /\bnotranja barva/,
  /\bnotranja zidna/,
  /\bnotranja stenska/,
  /\binterior wall paint/,
  /\bwall latex/,
  /\blateks za stene/,
  /\bstenska barva/,
  /\bzidna barva/,
  /\bbarva za stene/,
  /\bbarva za zid/,
];

const CATEGORY_LISTING_PATTERNS: RegExp[] = [
  /\bbarve, laki in pleskarski/,
  /\blaki in pleskarski material/,
  /\bkategorija\b/,
  /\bprikazi vse\b/,
  /\ball products\b/,
  /-c\d{2,}/i,
  /\/c\//,
  /\/kategorija\//,
];

export function classifyCandidateProductKind(evidence: CandidateEvidence): ProductKind {
  const haystack = evidenceHaystack(evidence);
  if (!haystack) return "unknown";

  if (matchesAny(haystack, CATEGORY_LISTING_PATTERNS)) return "category_listing";

  if (matchesAny(haystack, TILE_WEDGE_PATTERNS)) return "tile_wedge";
  if (matchesAny(haystack, TILE_SPACER_PATTERNS)) return "tile_spacer";
  if (matchesAny(haystack, GROUT_PATTERNS)) return "grout";
  if (matchesAny(haystack, ADHESIVE_PATTERNS)) return "adhesive";
  if (matchesAny(haystack, SEALANT_PATTERNS)) return "sealant";
  if (matchesAny(haystack, TOOL_PATTERNS)) return "installation_tool";

  if (matchesAny(haystack, TILE_ACCESSORY_FOR_PATTERNS)) {
    if (matchesAny(haystack, TILE_WEDGE_PATTERNS)) return "tile_wedge";
    if (matchesAny(haystack, TILE_SPACER_PATTERNS)) return "tile_spacer";
    if (matchesAny(haystack, GROUT_PATTERNS)) return "grout";
    if (matchesAny(haystack, ADHESIVE_PATTERNS)) return "adhesive";
    return "tile_accessory";
  }

  const surfaceHaystack = titleSnippetHaystack(evidence);
  if (titleIsExplicitWallOnlyTile(evidence.title)) return "wall_tile";

  // Specific surface role before generic tile/marble inference (title + snippet only).
  if (matchesAny(surfaceHaystack, FLOOR_AND_WALL_PATTERNS)) return "floor_and_wall_tile";
  if (matchesAny(surfaceHaystack, WALL_TILE_PATTERNS)) return "wall_tile";
  if (matchesAny(surfaceHaystack, FLOOR_TILE_PATTERNS)) return "floor_tile";

  if (/\bploscic/.test(surfaceHaystack) && /\bmarmor|\bmarble\b/.test(surfaceHaystack)) {
    if (matchesAny(surfaceHaystack, WALL_TILE_PATTERNS)) return "wall_tile";
    if (matchesAny(surfaceHaystack, FLOOR_TILE_PATTERNS) || /\btaln/.test(surfaceHaystack)) {
      return "floor_tile";
    }
    return "unknown";
  }

  if (/\bmarmorn/.test(haystack) && /\btaln/.test(haystack)) return "stone_flooring";
  if (/\bmarble\b/.test(haystack) && /\bfloor\b/.test(haystack)) return "stone_flooring";
  if (/\blaminat/.test(haystack) && /\btaln|floor/.test(haystack)) return "laminate_flooring";
  if (/\bparket|hardwood|lesena taln/.test(haystack)) return "wood_flooring";

  if (matchesAny(haystack, DECORATIVE_PAINT_PATTERNS)) return "decorative_effect_paint";
  if (matchesAny(haystack, EXTERIOR_PAINT_PATTERNS)) return "exterior_paint";
  if (matchesAny(haystack, WOOD_PAINT_PATTERNS)) return "wood_paint";
  if (matchesAny(haystack, METAL_PAINT_PATTERNS)) return "metal_paint";
  if (matchesAny(haystack, PRIMER_PATTERNS) && !matchesAny(haystack, INTERIOR_WALL_PAINT_PATTERNS)) {
    return "primer";
  }
  if (matchesAny(haystack, INTERIOR_WALL_PAINT_PATTERNS)) return "interior_wall_paint";
  if (/\bpaint\b|\bbarva\b|\bcoating\b|\bplesk/.test(haystack)) return "interior_wall_paint";

  if (/gaming\s+stol|gaming\s+chair|igricarsk|igralni\s+stol/.test(haystack)) return "gaming_chair";
  if (/pisarnisk|office chair|racunalnisk stol/.test(haystack) && /\bstol|\bchair/.test(haystack)) {
    return "office_chair";
  }
  if (/\bdesk\b|workstation|racunalniska miza|pisalna miza|\bmiza\b/.test(haystack)) return "desk";

  return "unknown";
}

/** Floor-covering product kinds suitable for a floor requirement. */
export const FLOOR_COVERING_KINDS = new Set<ProductKind>([
  "floor_tile",
  "floor_and_wall_tile",
  "stone_flooring",
  "laminate_flooring",
  "wood_flooring",
]);

/** Kinds that must never satisfy a floor tile / marble flooring requirement. */
export const TILE_INSTALLATION_KINDS = new Set<ProductKind>([
  "tile_accessory",
  "tile_spacer",
  "tile_wedge",
  "grout",
  "adhesive",
  "sealant",
  "installation_tool",
]);

export const PAINT_SURFACE_KINDS = new Set<ProductKind>(["interior_wall_paint"]);

export const PAINT_CONFLICT_KINDS = new Set<ProductKind>([
  "exterior_paint",
  "decorative_effect_paint",
  "wood_paint",
  "metal_paint",
  "primer",
  "category_listing",
]);

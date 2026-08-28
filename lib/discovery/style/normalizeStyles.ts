import { CANONICAL_STYLE_IDS, type CanonicalStyleId } from "./types";

const STYLE_SET = new Set<string>(CANONICAL_STYLE_IDS);

export function normalizeSelectedStyles(input?: string[] | null): CanonicalStyleId[] {
  if (!input?.length) return [];
  const seen = new Set<CanonicalStyleId>();
  const out: CanonicalStyleId[] = [];
  for (const raw of input) {
    const normalized = raw.normalize("NFC").trim().toLowerCase();
    if (!STYLE_SET.has(normalized)) continue;
    const id = normalized as CanonicalStyleId;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= 3) break;
  }
  return out;
}

export function styleRankingEnabled(
  selectedStyles: CanonicalStyleId[],
  requirementType: "furniture" | "material"
): boolean {
  return requirementType === "furniture" && selectedStyles.length > 0;
}

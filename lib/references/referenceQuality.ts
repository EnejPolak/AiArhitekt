import {
  REFERENCE_QUALITY_HIGH_EDGE,
  REFERENCE_QUALITY_MEDIUM_EDGE,
} from "./constants";
import type { ProductImageEvidence, ProductImageEvidenceSource } from "./imageEvidence";

export const REFERENCE_QUALITY_CLASSES = ["high", "medium", "low"] as const;
export type ReferenceQualityClass = (typeof REFERENCE_QUALITY_CLASSES)[number];

export type DeclaredImageSize = {
  width: number | null;
  height: number | null;
};

const PAGE_SOURCED: ReadonlySet<ProductImageEvidenceSource> = new Set([
  "json_ld_product",
  "open_graph",
  "twitter_card",
  "merchant_gallery",
  "existing_product_image_url",
]);

const SOURCE_RANK: Record<ProductImageEvidenceSource, number> = {
  json_ld_product: 5,
  open_graph: 4,
  merchant_gallery: 3,
  twitter_card: 2,
  existing_product_image_url: 1,
  search_evidence: 0,
};

const CONFIDENCE_RANK = { high: 2, medium: 1, low: 0 } as const;

export function longestEdge(width: number | null | undefined, height: number | null | undefined): number {
  return Math.max(width ?? 0, height ?? 0);
}

export function pixelArea(width: number | null | undefined, height: number | null | undefined): number {
  const w = width ?? 0;
  const h = height ?? 0;
  if (w < 1 || h < 1) return 0;
  return w * h;
}

export function referenceQualityFromDimensions(
  width: number | null | undefined,
  height: number | null | undefined
): ReferenceQualityClass {
  const edge = longestEdge(width, height);
  if (edge >= REFERENCE_QUALITY_HIGH_EDGE) return "high";
  if (edge >= REFERENCE_QUALITY_MEDIUM_EDGE) return "medium";
  return "low";
}

export function parseDeclaredSizeFromUrl(url: string): DeclaredImageSize {
  try {
    const parsed = new URL(url);
    const pathMatch = parsed.pathname.match(/(?:^|\/)(\d{2,4})x(\d{2,4})(?:\/|$)/i);
    if (pathMatch) {
      return { width: Number(pathMatch[1]), height: Number(pathMatch[2]) };
    }
    const widthParam = Number(parsed.searchParams.get("w") ?? parsed.searchParams.get("width") ?? "");
    const heightParam = Number(parsed.searchParams.get("h") ?? parsed.searchParams.get("height") ?? "");
    return {
      width: Number.isFinite(widthParam) && widthParam >= 32 ? widthParam : null,
      height: Number.isFinite(heightParam) && heightParam >= 32 ? heightParam : null,
    };
  } catch {
    return { width: null, height: null };
  }
}

function usefulAspectScore(width: number | null, height: number | null): number {
  if (!width || !height || width < 1 || height < 1) return 0;
  const ratio = width / height;
  if (ratio >= 0.5 && ratio <= 2) return 2;
  if (ratio >= 0.33 && ratio <= 3) return 1;
  return 0;
}

export function isPageSourcedEvidenceSource(source: ProductImageEvidenceSource): boolean {
  return PAGE_SOURCED.has(source);
}

function identityRank(source: ProductImageEvidenceSource): number {
  return isPageSourcedEvidenceSource(source) ? 1 : 0;
}

/** Unknown declared size is treated as HIGH so undeclared CDN originals outrank explicit thumbnails. */
export function rankingEdge(declared: DeclaredImageSize): number {
  const edge = longestEdge(declared.width, declared.height);
  return edge > 0 ? edge : REFERENCE_QUALITY_HIGH_EDGE;
}

export function candidateCouldBeatCurrent(
  declared: DeclaredImageSize,
  current: { width: number | null; height: number | null }
): boolean {
  const currentEdge = longestEdge(current.width, current.height);
  if (currentEdge < 1) return true;
  const declaredEdge = longestEdge(declared.width, declared.height);
  if (declaredEdge > 0) return declaredEdge > currentEdge;
  return referenceQualityFromDimensions(current.width, current.height) !== "high";
}

export function rankExactProductEvidence(
  evidence: ProductImageEvidence[],
  declaredSizeByUrl: Map<string, DeclaredImageSize> = new Map()
): ProductImageEvidence[] {
  return evidence
    .filter((item) => item.exactProductAssociation)
    .map((item, index) => {
      const declared = declaredSizeByUrl.get(item.url) ?? parseDeclaredSizeFromUrl(item.url);
      return { item, index, declared };
    })
    .sort((a, b) => {
      const identity = identityRank(b.item.source) - identityRank(a.item.source);
      if (identity !== 0) return identity;
      const aEdge = rankingEdge(a.declared);
      const bEdge = rankingEdge(b.declared);
      if (bEdge !== aEdge) return bEdge - aEdge;
      const aArea = pixelArea(a.declared.width, a.declared.height);
      const bArea = pixelArea(b.declared.width, b.declared.height);
      if (bArea !== aArea) return bArea - aArea;
      const confidence = CONFIDENCE_RANK[b.item.confidence] - CONFIDENCE_RANK[a.item.confidence];
      if (confidence !== 0) return confidence;
      const source = SOURCE_RANK[b.item.source] - SOURCE_RANK[a.item.source];
      if (source !== 0) return source;
      const aspect =
        usefulAspectScore(b.declared.width, b.declared.height) -
        usefulAspectScore(a.declared.width, a.declared.height);
      if (aspect !== 0) return aspect;
      return a.index - b.index;
    })
    .map((entry) => entry.item);
}

export function formatReferenceQualityLabel(quality: ReferenceQualityClass): string {
  return quality.toUpperCase();
}

export function isHigherQualityReference(
  candidate: { width: number | null; height: number | null; sizeBytes: number },
  current: { width: number | null; height: number | null; sizeBytes: number }
): boolean {
  const candidateEdge = longestEdge(candidate.width, candidate.height);
  const currentEdge = longestEdge(current.width, current.height);
  if (candidateEdge !== currentEdge) return candidateEdge > currentEdge;
  const candidateArea = pixelArea(candidate.width, candidate.height);
  const currentArea = pixelArea(current.width, current.height);
  if (candidateArea !== currentArea) return candidateArea > currentArea;
  return candidate.sizeBytes > current.sizeBytes;
}

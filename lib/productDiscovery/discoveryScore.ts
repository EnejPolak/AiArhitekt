/**
 * Pre-enrichment discovery scoring (ranking which candidates to enrich).
 * NEVER used as acceptance evidence — snippets/titles are discovery hints only.
 */
import { normalizeDomainToRoot } from "@/lib/serp/domains";
import { isChallengeOrBlockedDomainUnsupported } from "./merchantAcquisitionDiagnostics";
import { buildSearchConstraints, type SearchConstraints } from "./searchConstraints";

export type DiscoveryScoreBreakdown = {
  score: number;
  signals: string[];
  /** Explicitly not acceptance evidence. */
  acceptanceEvidence: false;
};

const PRODUCT_PATH_PATTERN =
  /\/(p|product|products|izdelek|artikel|prod|item|sku|trgovina)\/|\/p\/[^/?#]+/i;
const JUNK_PATH_PATTERN =
  /(\.pdf$|\/blog\b|\/news\b|\/inspir|\/clanek|\/search\b|\/kategorij|\/category\b|\/c\/\d|\/media\/|\/datoteke\/|\/wp-content\/)/i;

function pathnameOf(url: string): string {
  try {
    return new URL(url).pathname.toLowerCase();
  } catch {
    return "";
  }
}

function baseProductLikelihood(url: string, title: string | null): number {
  let score = 0;
  const path = pathnameOf(url);
  if (PRODUCT_PATH_PATTERN.test(path) || PRODUCT_PATH_PATTERN.test(url)) score += 35;
  if (/\/p\/[^/?#]+/i.test(path)) score += 15;
  if (JUNK_PATH_PATTERN.test(url) || JUNK_PATH_PATTERN.test(path)) score -= 60;
  if (!path || path === "/") score -= 50;
  if (title && title.trim().length > 3) score += 5;
  return score;
}

function normalizeHay(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function mmForms(valueMm: number): string[] {
  const cm = valueMm % 10 === 0 ? String(valueMm / 10) : String(valueMm / 10);
  return [String(valueMm), `${valueMm} mm`, `${valueMm}mm`, cm, `${cm} cm`, `${cm}cm`];
}

/**
 * Score a search hit for enrichment priority.
 * Ambiguous "800 x 600" scores lower than labeled "width 600" / "širina 600".
 */
export function scoreConstraintAwareDiscovery(input: {
  url: string;
  title: string | null;
  snippet?: string | null;
  requestedItem: string;
  constraints?: SearchConstraints;
}): DiscoveryScoreBreakdown {
  const constraints = input.constraints ?? buildSearchConstraints(input.requestedItem);
  const signals: string[] = [];
  let score = baseProductLikelihood(input.url, input.title);

  const hay = normalizeHay(
    [input.title, input.snippet, input.url].filter(Boolean).join(" ")
  );

  // Category tokens
  for (const token of constraints.categoryTokens.slice(0, 6)) {
    const t = normalizeHay(token);
    if (t.length >= 4 && hay.includes(t)) {
      score += 12;
      signals.push(`category:${token}`);
      break;
    }
  }

  // Hard materials
  for (const mat of constraints.materialsRequired) {
    const t = normalizeHay(mat);
    if (t.length >= 3 && hay.includes(t)) {
      score += 14;
      signals.push(`material:${mat}`);
      break;
    }
  }

  // Budget hint (discovery only)
  if (constraints.priceMaxEur != null) {
    const priceMatch = hay.match(/(\d{2,5})(?:[.,]\d{1,2})?\s*(?:€|eur)/i);
    if (priceMatch?.[1]) {
      const p = Number(priceMatch[1]);
      if (Number.isFinite(p) && p > 0 && p <= constraints.priceMaxEur) {
        score += 8;
        signals.push("price_within_budget_hint");
      } else if (Number.isFinite(p) && p > constraints.priceMaxEur) {
        score -= 18;
        signals.push("price_over_budget_hint");
      }
    }
  }

  const dim = constraints.dimensions[0];
  if (dim) {
    const forms = mmForms(dim.valueMm);
    const hasTargetNumber = forms.some((f) => hay.includes(normalizeHay(f)));
    const labeled =
      dim.productLabels.some((label) => {
        const l = normalizeHay(label);
        return forms.some((f) => {
          const n = normalizeHay(f);
          return (
            hay.includes(`${l} ${n}`) ||
            hay.includes(`${l}: ${n}`) ||
            hay.includes(`${l}:${n}`) ||
            new RegExp(`${l}[^a-z0-9]{0,12}${n.replace(/\s+/g, "\\s*")}`).test(hay)
          );
        });
      }) || /\b(width|sirina|premer|diameter)\b[^.]{0,20}\b(60|600|40|400)\b/.test(hay);

    const ambiguousPair =
      /\b\d{2,4}\s*(?:cm|mm)?\s*[x×]\s*\d{2,4}\s*(?:cm|mm)?\b/.test(hay) ||
      /\b\d{3,4}\s*x\s*\d{3,4}\b/.test(hay);

    const cabinetNiche =
      /(?:minimaln\w*\s+)?(?:sirina|width)\s+(?:omaric|omare|cabinet)/.test(hay) ||
      /cabinet\s+(?:width|sirina)/.test(hay);

    if (cabinetNiche) {
      score -= 25;
      signals.push("penalty:cabinet_niche_width");
    }

    if (labeled && hasTargetNumber) {
      score += constraints.exactDimensions ? 28 : 18;
      signals.push("labeled_target_dimension");
    } else if (hasTargetNumber && !ambiguousPair) {
      score += 10;
      signals.push("target_dimension_token");
    } else if (ambiguousPair && hasTargetNumber) {
      score += 3;
      signals.push("ambiguous_pair_low_confidence");
    }

    // Hard mismatch tokens (e.g. exact 60 request but clear 86 cm width)
    if (constraints.exactDimensions && dim.valueMm === 600) {
      if (/\b(?:sirina|width)[^.]{0,16}(?:50|55|61|62|70|80|86|90|100)\s*cm\b/.test(hay)) {
        score -= 30;
        signals.push("penalty:width_mismatch");
      }
      if (/\b(?:800|860|1200)\s*[x×]\s*600\b/.test(hay) || /\bclassic\s*40\b/.test(hay)) {
        score -= 22;
        signals.push("penalty:classic40_or_800x600");
      }
    }
  }

  // Soft style must not dominate — small optional bump only
  for (const style of constraints.softStyles.slice(0, 1)) {
    if (hay.includes(normalizeHay(style))) {
      score += 2;
      signals.push(`soft:${style}`);
    }
  }

  try {
    const domain = normalizeDomainToRoot(new URL(input.url).hostname);
    if (isChallengeOrBlockedDomainUnsupported(domain)) {
      score -= 20;
      signals.push("penalty:unsupported_enrichment_merchant");
    } else {
      score += 6;
      signals.push("supported_merchant");
    }
  } catch {
    /* ignore */
  }

  // Wrong category light penalty
  if (
    constraints.category?.includes("sink") &&
    /\b(vaza|vase|svetilka|lamp|radiator)\b/.test(hay) &&
    !/\b(korito|sink|pomival)\b/.test(hay)
  ) {
    score -= 20;
    signals.push("penalty:wrong_category");
  }

  return { score, signals, acceptanceEvidence: false };
}

/**
 * Diversify candidates by domain and avoid filling top-k with unsupported merchants.
 */
export function diversifyDiscoveryCandidates<T extends { url: string; domain: string; preRankScore: number }>(
  scored: T[],
  maxCandidates: number,
  options?: { maxPerDomain?: number; maxUnsupported?: number }
): T[] {
  const maxPerDomain = options?.maxPerDomain ?? 2;
  const maxUnsupported = options?.maxUnsupported ?? 2;
  const perDomain = new Map<string, number>();
  let unsupported = 0;
  const out: T[] = [];

  const ordered = [...scored].sort((a, b) => b.preRankScore - a.preRankScore);
  for (const c of ordered) {
    if (out.length >= maxCandidates) break;
    const count = perDomain.get(c.domain) ?? 0;
    if (count >= maxPerDomain) continue;
    const isUnsupported = isChallengeOrBlockedDomainUnsupported(c.domain);
    if (isUnsupported && unsupported >= maxUnsupported) continue;
    perDomain.set(c.domain, count + 1);
    if (isUnsupported) unsupported += 1;
    out.push(c);
  }
  return out;
}

export function discoveryDomainMetrics(
  candidates: Array<{ url: string; domain?: string }>
): {
  total: number;
  supportedMerchantRatio: number;
  unsupportedMerchantRatio: number;
  topDomains: Array<{ domain: string; count: number }>;
  domainConcentration: number;
} {
  const total = candidates.length;
  const counts = new Map<string, number>();
  let unsupported = 0;
  for (const c of candidates) {
    let domain = c.domain;
    if (!domain) {
      try {
        domain = normalizeDomainToRoot(new URL(c.url).hostname);
      } catch {
        domain = "unknown";
      }
    }
    counts.set(domain, (counts.get(domain) ?? 0) + 1);
    if (isChallengeOrBlockedDomainUnsupported(domain)) unsupported += 1;
  }
  const topDomains = [...counts.entries()]
    .map(([domain, count]) => ({ domain, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
  const maxShare = total > 0 ? (topDomains[0]?.count ?? 0) / total : 0;
  return {
    total,
    supportedMerchantRatio: total > 0 ? (total - unsupported) / total : 0,
    unsupportedMerchantRatio: total > 0 ? unsupported / total : 0,
    topDomains,
    domainConcentration: maxShare,
  };
}

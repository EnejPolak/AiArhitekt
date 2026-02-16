/**
 * Production safety filtering: hard reject before GPT. Never pick unsafe candidates.
 */

import type { SearchBundle } from "./searchBundle";
import type { TaxonomyCategory } from "./taxonomy";

const HOME_CATEGORIES = new Set<TaxonomyCategory>([
  "bathroom_plumbing",
  "furniture",
  "decor_textiles",
  "lighting",
  "flooring",
  "paint_walls",
]);

export type CandidateForFilter = {
  title: string;
  url: string;
  domain: string;
  snippet?: string;
  price?: { value: number; currency: string; unit?: string } | null;
  score: number;
  flags: {
    hasToolIntent: boolean;
    hasHomeIntent: boolean;
  };
};

/**
 * Hard reject: tool-intent for home categories (mirror -> ceiling light).
 */
function isToolIntentRejected(itemSpec: string, category: TaxonomyCategory, candidate: CandidateForFilter): boolean {
  if (!HOME_CATEGORIES.has(category)) return false;
  const hasHomeContext = /ogledal|preprog|tepih|zaves|kopal|umival|dekor|mirror|rug|curtain/i.test((itemSpec ?? "").toLowerCase());
  if (!hasHomeContext) return false;
  return candidate.flags.hasToolIntent;
}

/**
 * Hard reject: candidate does not contain any mustToken (when bundle requires them).
 */
function isMissingMustTokens(bundle: SearchBundle, candidate: CandidateForFilter): boolean {
  if (!bundle.mustTokens?.length) return false;
  const text = `${candidate.title ?? ""} ${candidate.snippet ?? ""}`.toLowerCase();
  const hasAny = bundle.mustTokens.some((t) => text.includes(t.toLowerCase()));
  return !hasAny;
}

/**
 * Hard reject: pdf/catalog assets (not product pages).
 */
function isPdfOrCatalog(candidate: CandidateForFilter): boolean {
  const url = (candidate.url ?? "").toLowerCase();
  return /\.pdf(\?|$)/i.test(url) || /\/catalog\/|\/katalog\//i.test(url) || /\/cat\//i.test(url);
}

/**
 * Budget rule: if any candidate is within budget, drop candidates above budget.
 * Assumes price is parsed only when €|EUR present (valid price).
 */
function filterByBudget(candidates: CandidateForFilter[], budget: number | undefined): CandidateForFilter[] {
  if (budget == null || budget <= 0) return candidates;
  const withValidPrice = candidates.filter((c) => c.price != null && typeof c.price.value === "number");
  const withinBudget = withValidPrice.filter((c) => c.price!.value <= budget);
  if (withinBudget.length === 0) return candidates;
  return candidates.filter((c) => {
    if (c.price == null || typeof c.price.value !== "number") return true;
    return c.price.value <= budget;
  });
}

/**
 * Returns only safe candidates: not tool-intent for home, has mustTokens when required, not pdf/catalog.
 * Then applies budget rule. Max count = maxSafe (e.g. 3 for GPT).
 */
export function getSafeCandidates(
  itemSpec: string,
  bundle: SearchBundle,
  candidates: CandidateForFilter[],
  maxSafe: number = 3
): CandidateForFilter[] {
  const afterReject = candidates.filter((c) => {
    if (isToolIntentRejected(itemSpec, bundle.category, c)) return false;
    if (isMissingMustTokens(bundle, c)) return false;
    if (isPdfOrCatalog(c)) return false;
    return true;
  });
  const afterBudget = filterByBudget(afterReject, bundle.budget);
  return afterBudget.slice(0, maxSafe);
}

/**
 * True if candidate would be rejected by safety filter (tool, mustTokens, pdf/catalog). Budget is applied at list level.
 */
export function isUnsafeCandidate(
  itemSpec: string,
  bundle: SearchBundle,
  candidate: CandidateForFilter
): boolean {
  if (isToolIntentRejected(itemSpec, bundle.category, candidate)) return true;
  if (isMissingMustTokens(bundle, candidate)) return true;
  if (isPdfOrCatalog(candidate)) return true;
  return false;
}

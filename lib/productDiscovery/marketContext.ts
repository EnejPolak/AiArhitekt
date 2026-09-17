import { normalizeCountryCode } from "@/lib/project-location/parse";
import { normalizeProductDiscoveryAllowlist } from "./domains";

/**
 * Project-persisted market for Step C web search.
 * Source of truth is project location (not browser locale / UI language).
 */
export type ProductDiscoveryMarketContext = {
  countryCode: string | null;
  formattedLocation: string | null;
  merchantDomains: string[];
};

/**
 * Search-only instruction. Product vocabulary is inferred by the model from
 * country, location, merchant domains, and the semantic requirement — not a
 * maintained country→product dictionary.
 */
export const LOCAL_MARKET_SEARCH_INSTRUCTION = [
  "Search using terminology natural to retailers in the target market described by countryCode, formattedLocation, and merchantDomains.",
  "Prefer the market's local language and localized synonyms where useful.",
  "Keep query expansion small and bounded. Search only within the allowed merchant domains.",
  "Localization is SEARCH-ONLY. requestedItem remains the authoritative semantic requirement for validation.",
  "Preserve the requested product class and function. Do not substitute a related category (a floor/standing lamp must not become a ceiling or pendant lamp; a decorative vase must not become a flower pot; a living-room rug must not become flooring) unless the user explicitly requested that product.",
  "Do not translate brand names, model names, SKUs, or product codes.",
  "If local terminology produces insufficient results, you may add a small number of additional reasonable query variants, including English.",
  "Do not drop the requirement if localization is uncertain.",
].join(" ");

export function normalizeProductDiscoveryMarketContext(
  input?: Partial<ProductDiscoveryMarketContext> | null,
  fallbackMerchantDomains: string[] = []
): ProductDiscoveryMarketContext {
  const formatted = (input?.formattedLocation ?? "").trim();
  const fromInput = Array.isArray(input?.merchantDomains)
    ? input.merchantDomains.filter((d): d is string => typeof d === "string" && d.trim().length > 0)
    : [];
  const merchantDomains = normalizeProductDiscoveryAllowlist(
    fromInput.length > 0 ? fromInput : fallbackMerchantDomains
  );
  return {
    countryCode: normalizeCountryCode(input?.countryCode ?? null),
    formattedLocation: formatted || null,
    merchantDomains,
  };
}

export function marketAwareSearchGuidance(): Record<string, unknown> {
  return {
    useLocalMarketRetailerTerminology: true,
    preferTargetMarketLanguage: true,
    queryExpansionMustStayBounded: true,
    searchOnlyAllowedMerchantDomains: true,
    localizationIsSearchOnly: true,
    originalRequestedItemIsAuthoritativeForAcceptance: true,
    preserveRequestedProductClass: true,
    doNotTranslateBrandModelOrSku: true,
    englishFallbackIfLocalQueriesInsufficient: true,
    doNotDropRequirementIfLocalizationUncertain: true,
    marketContextFromProjectLocation: true,
  };
}

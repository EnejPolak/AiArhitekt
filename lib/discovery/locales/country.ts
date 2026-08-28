import type { SearchLocale } from "./types";

const COUNTRY_TO_LOCALE: Record<string, SearchLocale> = {
  SI: "sl",
};

export function normalizeCountryCode(value: string | null | undefined): string | null {
  const code = (value ?? "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : null;
}

/** SI → sl. Unknown/unsupported country → en. No retailer language map. */
export function searchLocaleFromCountryCode(countryCode: string | null | undefined): SearchLocale {
  const code = normalizeCountryCode(countryCode);
  if (!code) return "en";
  return COUNTRY_TO_LOCALE[code] ?? "en";
}

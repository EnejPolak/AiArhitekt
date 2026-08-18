import {
  renderBedTypeSchema,
  renderFlooringPreferenceSchema,
} from "@/lib/render/preferences";

export const DISCOVERY_PREFERENCE_SCHEMA_VERSION = 1 as const;

export type ShoppingPreferenceInput = {
  selectedStyles?: string[] | null;
  wallMainColor?: string | null;
  wallAccentColor?: string | null;
  flooring?: string | null;
  underfloorHeating?: boolean | null;
  bedType?: string | null;
  keepExistingWalls?: boolean | null;
};

export type ShoppingPreferenceSnapshot = {
  schemaVersion: typeof DISCOVERY_PREFERENCE_SCHEMA_VERSION;
  selectedStyles: string[];
  wallMainColor: string;
  wallAccentColor: string;
  flooring: "keep" | "hardwood" | "laminate" | "tiles" | "marble";
  underfloorHeating: boolean;
  bedType: "none" | "king" | "queen" | "bunk" | "single";
  keepExistingWalls: boolean;
};

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort((a, b) => a.localeCompare(b));
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

export function canonicalShoppingPreferences(
  input?: ShoppingPreferenceInput | null
): ShoppingPreferenceSnapshot {
  const styles = [
    ...new Set(
      (input?.selectedStyles ?? [])
        .map((style) => normalizeText(style))
        .filter(Boolean)
    ),
  ]
    .sort((a, b) => a.localeCompare(b))
    .slice(0, 8);

  const flooringParsed = renderFlooringPreferenceSchema.safeParse(input?.flooring ?? "keep");
  const bedParsed = renderBedTypeSchema.safeParse(input?.bedType ?? "none");

  return {
    schemaVersion: DISCOVERY_PREFERENCE_SCHEMA_VERSION,
    selectedStyles: styles,
    wallMainColor: normalizeText(input?.wallMainColor).slice(0, 80),
    wallAccentColor: normalizeText(input?.wallAccentColor).slice(0, 80),
    flooring: flooringParsed.success ? flooringParsed.data : "keep",
    underfloorHeating: Boolean(input?.underfloorHeating),
    bedType: bedParsed.success ? bedParsed.data : "none",
    keepExistingWalls: Boolean(input?.keepExistingWalls),
  };
}

export function shoppingPreferenceCanonicalJson(
  input?: ShoppingPreferenceInput | null
): string {
  return canonicalJson(canonicalShoppingPreferences(input));
}

export function shoppingPreferencesMatch(stored: unknown, current?: unknown): boolean {
  return (
    shoppingPreferenceCanonicalJson(stored as ShoppingPreferenceInput) ===
    shoppingPreferenceCanonicalJson(current as ShoppingPreferenceInput)
  );
}

export const EMPTY_SHOPPING_PREFERENCE_SNAPSHOT = canonicalShoppingPreferences(null);

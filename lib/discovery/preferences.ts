import {
  renderBedTypeSchema,
  renderFlooringPreferenceSchema,
} from "@/lib/render/preferences";
import { canonicalNoteShoppingIntents } from "./noteIntents";

export const DISCOVERY_PREFERENCE_SCHEMA_VERSION = 2 as const;
export const LEGACY_DISCOVERY_PREFERENCE_SCHEMA_VERSION = 1 as const;

export type ShoppingPreferenceInput = {
  selectedStyles?: string[] | null;
  wallMainColor?: string | null;
  wallAccentColor?: string | null;
  flooring?: string | null;
  underfloorHeating?: boolean | null;
  bedType?: string | null;
  keepExistingWalls?: boolean | null;
  notes?: string | null;
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
  noteShoppingIntents: string[];
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
    noteShoppingIntents: canonicalNoteShoppingIntents(input?.notes ?? ""),
  };
}

export function shoppingPreferenceCanonicalJson(
  input?: ShoppingPreferenceInput | null
): string {
  return canonicalJson(canonicalShoppingPreferences(input));
}

function normalizeStoredSnapshot(stored: unknown): ShoppingPreferenceSnapshot {
  if (!stored || typeof stored !== "object") {
    return canonicalShoppingPreferences(null);
  }
  const record = stored as Partial<Omit<ShoppingPreferenceSnapshot, "schemaVersion">> & {
    schemaVersion?: number;
    notes?: string | null;
  };

  if (record.schemaVersion === DISCOVERY_PREFERENCE_SCHEMA_VERSION) {
    const flooringParsed = renderFlooringPreferenceSchema.safeParse(record.flooring ?? "keep");
    const bedParsed = renderBedTypeSchema.safeParse(record.bedType ?? "none");
    return {
      schemaVersion: DISCOVERY_PREFERENCE_SCHEMA_VERSION,
      selectedStyles: [...(record.selectedStyles ?? [])]
        .map((style) => normalizeText(style))
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b))
        .slice(0, 8),
      wallMainColor: normalizeText(record.wallMainColor).slice(0, 80),
      wallAccentColor: normalizeText(record.wallAccentColor).slice(0, 80),
      flooring: flooringParsed.success ? flooringParsed.data : "keep",
      underfloorHeating: Boolean(record.underfloorHeating),
      bedType: bedParsed.success ? bedParsed.data : "none",
      keepExistingWalls: Boolean(record.keepExistingWalls),
      noteShoppingIntents: Array.isArray(record.noteShoppingIntents)
        ? [...record.noteShoppingIntents].sort((a, b) => a.localeCompare(b))
        : canonicalNoteShoppingIntents(record.notes ?? ""),
    };
  }

  if (record.schemaVersion === LEGACY_DISCOVERY_PREFERENCE_SCHEMA_VERSION) {
    return {
      ...canonicalShoppingPreferences(null),
      ...record,
      schemaVersion: DISCOVERY_PREFERENCE_SCHEMA_VERSION,
      noteShoppingIntents: [],
    };
  }

  return {
    ...canonicalShoppingPreferences(null),
    ...record,
    schemaVersion: DISCOVERY_PREFERENCE_SCHEMA_VERSION,
    noteShoppingIntents: Array.isArray(record.noteShoppingIntents)
      ? [...record.noteShoppingIntents].sort((a, b) => a.localeCompare(b))
      : [],
  };
}

export function loadStoredShoppingPreferenceSnapshot(stored: unknown): ShoppingPreferenceSnapshot {
  return normalizeStoredSnapshot(stored);
}

export function shoppingPreferenceInputFromSnapshot(
  snapshot: ShoppingPreferenceSnapshot
): ShoppingPreferenceInput {
  return {
    selectedStyles: snapshot.selectedStyles,
    wallMainColor: snapshot.wallMainColor,
    wallAccentColor: snapshot.wallAccentColor,
    flooring: snapshot.flooring,
    underfloorHeating: snapshot.underfloorHeating,
    bedType: snapshot.bedType,
    keepExistingWalls: snapshot.keepExistingWalls,
  };
}

export function shoppingPreferencesMatch(stored: unknown, current?: unknown): boolean {
  const storedSnapshot = normalizeStoredSnapshot(stored);
  const currentSnapshot =
    current &&
    typeof current === "object" &&
    "schemaVersion" in (current as Record<string, unknown>)
      ? normalizeStoredSnapshot(current)
      : canonicalShoppingPreferences(current as ShoppingPreferenceInput);
  return canonicalJson(storedSnapshot) === canonicalJson(currentSnapshot);
}

export const EMPTY_SHOPPING_PREFERENCE_SNAPSHOT = canonicalShoppingPreferences(null);

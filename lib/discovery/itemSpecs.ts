import { z } from "zod";
import {
  furnitureNeedSchema,
  materialNeedSchema,
  type DesignRequirements,
} from "@/lib/analysis/schema";
import { MAX_ITEM_SPEC_LENGTH, MAX_PRODUCT_DISCOVERY_ITEMS } from "./constants";
import type { ShoppingPreferenceInput } from "./preferences";
import type { SearchLocale, ProductConcept } from "./locales/types";

export type RequirementSource = "user_structured" | "user_notes" | "analysis";

export type RequirementProvenance = {
  source: RequirementSource;
  concept: ProductConcept;
  sourceField?: string;
  matchedPhrase?: string;
  originalUserValue?: string;
  paintHue?: string;
  paintFinish?: string | null;
  paintRaw?: string;
};

export type FurnitureNeed = z.infer<typeof furnitureNeedSchema>;
export type MaterialNeed = z.infer<typeof materialNeedSchema>;

export type DiscoveryRequirementType = "furniture" | "material";

export type DiscoveryPreferenceOverlay = ShoppingPreferenceInput;

export type SearchableRequirement = {
  requirementType: DiscoveryRequirementType;
  requirementKey: string;
  /** Canonical English requirement description. Not a localized SERP query. */
  itemSpec: string;
  queryPlan: string[];
  snapshot: FurnitureNeed | MaterialNeed;
  searchLocale?: SearchLocale;
  searchCountryCode?: string | null;
  displayLabel?: string;
  provenance?: RequirementProvenance;
  selectedStyles?: string[];
};

function normalizeWhitespace(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

export function slugRequirementPart(value: string): string {
  const slug = normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "item";
}

export function clampItemSpec(value: string): string {
  const normalized = normalizeWhitespace(value);
  if (normalized.length <= MAX_ITEM_SPEC_LENGTH) return normalized;
  return normalized.slice(0, MAX_ITEM_SPEC_LENGTH).trim();
}

function tokens(parts: Array<string | null | undefined>): string[] {
  const out: string[] = [];
  for (const part of parts) {
    if (!part) continue;
    for (const token of normalizeWhitespace(part).split(" ")) {
      if (token) out.push(token);
    }
  }
  return out;
}

export function uniqueQueryPlan(specs: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const spec of specs) {
    const cleaned = clampItemSpec(spec);
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
    if (out.length >= 3) break;
  }
  return out;
}

const INSTRUCTION_LEAD =
  /^(must|should|needs?\s+to|has\s+to|have\s+to|able\s+to|suitable\s+for|designed\s+(for|to))\b/i;

const INSTRUCTION_NOISE =
  /\b(must|should|needs?|support(?:s|ing)?|allow(?:s|ing)?|able|suitable|designed)\b/gi;

function isInstructionalConstraint(constraint: string): boolean {
  const normalized = normalizeWhitespace(constraint);
  if (INSTRUCTION_LEAD.test(normalized)) return true;
  return normalized.split(" ").length >= 5;
}

function usefulConstraintTokens(constraint: string): string[] {
  const keepInstructional =
    /monitor|colour|color|wood|metal|fabric|leather|oak|beige|white|black|green|large|small|modern/i.test(
      constraint
    );
  if (isInstructionalConstraint(constraint) && !keepInstructional) return [];
  let value = normalizeWhitespace(constraint);
  value = value.replace(INSTRUCTION_LEAD, " ");
  value = value.replace(INSTRUCTION_NOISE, " ");
  value = value.replace(/\b(for|with|to|the|a|an|be|that|which)\b/gi, " ");
  return tokens([value]).filter((token) => token.length >= 3);
}

function commerceAdjectives(constraints: string[]): string[] {
  const out: string[] = [];
  for (const constraint of constraints) {
    if (isInstructionalConstraint(constraint)) continue;
    out.push(...tokens([constraint]));
  }
  return out;
}

export function isDeskRequirement(category: string, constraints: string[] = []): boolean {
  const blob = `${category} ${constraints.join(" ")}`.toLowerCase();
  return (
    /\bdesk\b/.test(blob) ||
    /\bworkstation\b/.test(blob) ||
    /pisalna\s+miza/.test(blob) ||
    /ra[cč]unalni[sš]ka\s+miza/.test(blob)
  );
}

function hasMonitorConstraint(category: string, constraints: string[]): boolean {
  return /monitor/i.test(`${category} ${constraints.join(" ")}`);
}

function surfaceSearchTerm(surface: string, category: string): string | null {
  const surfaceNorm = surface.toLowerCase();
  const categoryNorm = category.toLowerCase();
  if (surfaceNorm.includes("floor") && !categoryNorm.includes("floor")) {
    return "flooring";
  }
  if (categoryNorm.includes(surfaceNorm)) return null;
  return surface;
}

export function isWallPaintMaterial(need: MaterialNeed): boolean {
  const surface = need.surface.toLowerCase();
  const category = need.category.toLowerCase();
  const blob = `${surface} ${category} ${need.finishDirection ?? ""}`.toLowerCase();
  const isWall = /\bwall\b/.test(surface) || /\bwall\b/.test(category) || /\bsten/.test(surface);
  const isPaint = /paint|barv|premaz|coating|plesk/.test(blob);
  return isWall && isPaint;
}

export function furnitureQueryPlan(need: FurnitureNeed): string[] {
  const category = normalizeWhitespace(need.category);
  if (isDeskRequirement(category, need.constraints)) {
    if (hasMonitorConstraint(category, need.constraints)) {
      return uniqueQueryPlan([
        "large computer desk multiple monitors",
        "large computer desk",
        "computer desk",
      ]);
    }
    const extras = need.constraints.flatMap(usefulConstraintTokens);
    const deskCategory = /\bdesk\b/i.test(category) ? category : "computer desk";
    return uniqueQueryPlan([
      tokens([deskCategory === "desk" ? "office desk" : deskCategory, ...extras]).join(" "),
      deskCategory === "desk" ? "computer desk" : deskCategory,
      "desk",
    ]);
  }

  const adjectives = commerceAdjectives(need.constraints);
  const useful = need.constraints
    .filter((constraint) => isInstructionalConstraint(constraint))
    .flatMap(usefulConstraintTokens);
  const primary = tokens([...adjectives, category, ...useful]).join(" ");
  const simpler = adjectives[0] ? `${adjectives[0]} ${category}` : category;
  return uniqueQueryPlan([primary, simpler, category]);
}

export function materialQueryPlan(need: MaterialNeed): string[] {
  if (isWallPaintMaterial(need)) {
    const color = normalizeWhitespace(need.finishDirection ?? need.constraints[0] ?? "");
    if (color) {
      return uniqueQueryPlan([
        `interior wall paint ${color}`,
        `wall paint ${color}`,
      ]);
    }
    return uniqueQueryPlan(["interior wall paint"]);
  }

  const primary = materialItemSpec(need);
  const simpler = clampItemSpec(
    tokens([need.finishDirection, need.category, surfaceSearchTerm(need.surface, need.category)]).join(" ")
  );
  const core = clampItemSpec(
    tokens([need.category, surfaceSearchTerm(need.surface, need.category)]).join(" ")
  );
  return uniqueQueryPlan([primary, simpler, core]);
}

export function furnitureItemSpec(need: FurnitureNeed): string {
  return furnitureQueryPlan(need)[0] ?? clampItemSpec(need.category);
}

export function materialItemSpec(need: MaterialNeed): string {
  if (isWallPaintMaterial(need)) {
    return materialQueryPlan(need)[0] ?? clampItemSpec(need.category);
  }
  return clampItemSpec(
    tokens([
      need.finishDirection,
      need.category,
      surfaceSearchTerm(need.surface, need.category),
      ...need.constraints,
    ]).join(" ")
  );
}

export function furnitureRequirementKey(need: FurnitureNeed, index: number): string {
  return `furniture:${slugRequirementPart(need.category)}:${index}`;
}

export function materialRequirementKey(need: MaterialNeed, index: number): string {
  return `material:${slugRequirementPart(need.surface)}:${slugRequirementPart(need.category)}:${index}`;
}

function assertSafeItemSpec(spec: string): string {
  const cleaned = clampItemSpec(spec);
  if (!cleaned) {
    throw new Error("Item spec must not be empty.");
  }
  if (/\bsite\s*:/i.test(cleaned) || /https?:\/\//i.test(cleaned)) {
    throw new Error("Item spec must not include retailer domains or site operators.");
  }
  return cleaned;
}

function toFurnitureRequirement(need: FurnitureNeed, index: number): SearchableRequirement {
  const queryPlan = furnitureQueryPlan(need).map(assertSafeItemSpec);
  return {
    requirementType: "furniture",
    requirementKey: furnitureRequirementKey(need, index),
    itemSpec: queryPlan[0],
    queryPlan,
    snapshot: need,
  };
}

function toMaterialRequirement(
  need: MaterialNeed,
  index: number,
  key = materialRequirementKey(need, index)
): SearchableRequirement {
  const queryPlan = materialQueryPlan(need).map(assertSafeItemSpec);
  return {
    requirementType: "material",
    requirementKey: key,
    itemSpec: queryPlan[0],
    queryPlan,
    snapshot: need,
  };
}

export function explicitWallPaintNeeds(
  preferences?: DiscoveryPreferenceOverlay | null
): MaterialNeed[] {
  if (!preferences || preferences.keepExistingWalls) return [];
  const main = normalizeWhitespace(preferences.wallMainColor ?? "");
  const accent = normalizeWhitespace(preferences.wallAccentColor ?? "");
  const needs: MaterialNeed[] = [];
  if (main) {
    needs.push({
      surface: "wall",
      category: "interior wall paint",
      finishDirection: main,
      constraints: [main, "main wall"],
    });
  }
  if (accent && accent.toLowerCase() !== main.toLowerCase()) {
    needs.push({
      surface: "wall",
      category: "interior wall paint",
      finishDirection: accent,
      constraints: [accent, "accent wall"],
    });
  }
  return needs;
}

export const unmatchedRequirementSchema = z.object({
  requirementKey: z.string().min(1).max(160),
  requirementType: z.enum(["furniture", "material"]),
  itemSpec: z.string().min(1).max(120),
  displayLabel: z.string().min(1).max(120).optional(),
  reason: z.enum(["not_searched", "no_valid_product", "search_interrupted"]),
});

export type UnmatchedRequirement = z.infer<typeof unmatchedRequirementSchema>;

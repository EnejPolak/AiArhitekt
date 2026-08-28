import type { FurnitureNeed, MaterialNeed, SearchableRequirement } from "../itemSpecs";
import { furnitureQueryPlan, materialQueryPlan, uniqueQueryPlan } from "../itemSpecs";
import { resolveProductConcept } from "./concepts";
import { searchLocaleFromCountryCode } from "./country";
import {
  hasErgonomicConstraintText,
  hasLargeConstraintText,
  hasMonitorConstraintText,
} from "./lexicon";
import { slFurnitureQueries, slMaterialQueries } from "./sl";
import type { SearchLocale } from "./types";
import { buildStyleAwareFurnitureQueries, normalizeSelectedStyles } from "../style";

function furnitureContext(need: FurnitureNeed) {
  const blob = `${need.category} ${need.constraints.join(" ")}`;
  return {
    category: need.category,
    constraints: need.constraints,
    monitors: hasMonitorConstraintText(blob),
    ergonomic: hasErgonomicConstraintText(blob),
    large: hasLargeConstraintText(blob),
  };
}

function materialColor(need: MaterialNeed): string {
  return (need.finishDirection ?? need.constraints[0] ?? "").trim();
}

function englishFallback(englishPlan: string[], concept: ReturnType<typeof resolveProductConcept>): string | null {
  if (englishPlan.length === 0) return null;
  if (concept === "wall_paint") return englishPlan[0] ?? null;
  if (concept === "desk") {
    const exact = englishPlan.find((q) => q.trim().toLowerCase() === "computer desk");
    if (exact) return exact;
    return englishPlan.find((q) => /computer desk/i.test(q)) ?? "computer desk";
  }
  if (concept === "gaming_chair") return "gaming chair";
  return englishPlan[englishPlan.length - 1] ?? englishPlan[0] ?? null;
}

export function canonicalEnglishQueryPlan(requirement: SearchableRequirement): string[] {
  if (requirement.requirementType === "furniture") {
    return furnitureQueryPlan(requirement.snapshot as FurnitureNeed);
  }
  return materialQueryPlan(requirement.snapshot as MaterialNeed);
}

/**
 * Locale-specific commerce queries. Canonical requirement (snapshot/itemSpec) stays unchanged.
 * Max 3 levels: localized primary, simpler localized, English fallback last.
 */
export function buildLocalizedQueryPlan(
  requirement: SearchableRequirement,
  locale: SearchLocale
): string[] {
  const english = canonicalEnglishQueryPlan(requirement);
  if (locale !== "sl") return uniqueQueryPlan(english);

  const concept = resolveProductConcept(requirement);
  const selectedStyles = normalizeSelectedStyles(requirement.selectedStyles);
  const localized =
    requirement.requirementType === "furniture"
      ? slFurnitureQueries(concept, {
          concept,
          ...furnitureContext(requirement.snapshot as FurnitureNeed),
        })
      : slMaterialQueries(concept, {
          concept,
          category: (requirement.snapshot as MaterialNeed).category,
          surface: (requirement.snapshot as MaterialNeed).surface,
          finishDirection: (requirement.snapshot as MaterialNeed).finishDirection,
          constraints: (requirement.snapshot as MaterialNeed).constraints,
          color: materialColor(requirement.snapshot as MaterialNeed),
          paintHue: requirement.provenance?.paintHue ?? null,
          paintFinish: requirement.provenance?.paintFinish ?? null,
        });

  const furnitureBase =
    requirement.requirementType === "furniture"
      ? buildStyleAwareFurnitureQueries(localized, selectedStyles, locale, concept)
      : localized;

  const fallback = englishFallback(english, concept);
  const planBase =
    fallback && furnitureBase.length < 3 ? [...furnitureBase, fallback] : furnitureBase;
  return uniqueQueryPlan(planBase);
}

export function withLocalizedQueryPlan(
  requirement: SearchableRequirement,
  locale: SearchLocale,
  countryCode: string | null
): SearchableRequirement {
  return {
    ...requirement,
    queryPlan: buildLocalizedQueryPlan(requirement, locale),
    searchLocale: locale,
    searchCountryCode: countryCode,
  };
}

export function localizeSearchableRequirements(
  requirements: SearchableRequirement[],
  countryCode: string | null | undefined,
  selectedStyles?: string[] | null
): SearchableRequirement[] {
  const locale = searchLocaleFromCountryCode(countryCode);
  const normalizedCountry =
    typeof countryCode === "string" && /^[A-Z]{2}$/i.test(countryCode.trim())
      ? countryCode.trim().toUpperCase()
      : null;
  const styles = normalizeSelectedStyles(selectedStyles);
  return requirements.map((requirement) =>
    withLocalizedQueryPlan(
      {
        ...requirement,
        selectedStyles: styles.length > 0 ? styles : requirement.selectedStyles,
      },
      locale,
      normalizedCountry
    )
  );
}

import type { PlaceResult } from "@/lib/places/placesService";
import type { CanonicalSerpItemResult } from "@/lib/serp/search";
import { evaluateCandidateHardGate, candidateMatchesRequirement } from "../categoryGate";
import { mapTopCandidateToSelection } from "../mapProduct";
import type { SearchableRequirement } from "../itemSpecs";
import type { RequirementFidelity } from "../fidelity/requirementFidelity";
import { resolveProductConcept } from "../locales/concepts";
import { isProductionDeployment } from "@/lib/env/deployment";
import {
  MAX_SERP_SCORE_NORMALIZER,
  MATERIAL_RANKING_WEIGHTS,
  RANKING_WEIGHTS,
} from "./constants";
import { normalizeSelectedStyles, styleRankingEnabled } from "./normalizeStyles";
import { scoreStyleFit } from "./scoreStyleFit";
import type { CanonicalStyleId, RankedProductCandidate, StyleFitResult } from "./types";

export type CandidateRankingOutcome = {
  winner: RankedProductCandidate | null;
  ranked: RankedProductCandidate[];
};

type DiscoveryCandidateTrace = {
  requirementKey: string;
  selectedStyles: CanonicalStyleId[];
  locale: string;
  query: string;
  queryLevel: number;
  candidateTitle: string;
  domain: string;
  hardValid: boolean;
  hardGateReasons: string[];
  productKind: string;
  requirementFidelity: RequirementFidelity | null;
  styleScore: number | null;
  matchedStyleSignals: string[];
  conflicts: string[];
  serpScore: number;
  finalScore: number;
  selected: boolean;
};

function logCandidateRankingTrace(trace: DiscoveryCandidateTrace): void {
  if (isProductionDeployment()) return;
  console.info("[discovery-style]", trace);
}

function normalizeSerpScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(1, score / MAX_SERP_SCORE_NORMALIZER));
}

function computeFinalScore(input: {
  styleEnabled: boolean;
  serpScore: number;
  styleFit: StyleFitResult | null;
  fidelity: RequirementFidelity | null;
  hasReferenceImage: boolean;
}): number {
  const serpNorm = normalizeSerpScore(input.serpScore);

  if (!input.styleEnabled && input.fidelity) {
    const fidelityComponent = input.fidelity.score * MATERIAL_RANKING_WEIGHTS.fidelity;
    const serpComponent = serpNorm * MATERIAL_RANKING_WEIGHTS.serp;
    const referenceBonus = input.hasReferenceImage ? MATERIAL_RANKING_WEIGHTS.referenceImage : 0;
    return fidelityComponent + serpComponent + referenceBonus;
  }

  const serpComponent = serpNorm * RANKING_WEIGHTS.serp;
  const styleComponent = input.styleEnabled
    ? (input.styleFit?.score ?? 0) * RANKING_WEIGHTS.style
    : 0;
  const referenceBonus = input.hasReferenceImage ? RANKING_WEIGHTS.referenceImage : 0;
  return serpComponent + styleComponent + referenceBonus;
}

function candidateSources(result: CanonicalSerpItemResult) {
  const fromTop = (result.topCandidates ?? []).map((candidate) => ({
    title: candidate.title,
    url: candidate.url,
    domain: candidate.domain,
    snippet: candidate.snippet ?? null,
    score: candidate.score,
    image: candidate.image ?? null,
    price: candidate.price?.value ?? null,
    currency: candidate.price?.currency ?? null,
  }));

  if (fromTop.length > 0) return fromTop;

  if (result.picked) {
    return [
      {
        title: result.picked.title,
        url: result.picked.url,
        domain: result.picked.domain,
        snippet: result.picked.snippet,
        score: result.picked.score,
        image: result.picked.image,
        price: result.picked.price,
        currency: result.picked.currency,
      },
    ];
  }

  return [];
}

export function rankRequirementCandidates(input: {
  requirement: SearchableRequirement;
  serpResult: CanonicalSerpItemResult;
  query: string;
  queryLevel: number;
  maxLevel: number;
  stores: PlaceResult[];
}): CandidateRankingOutcome {
  const selectedStyles = normalizeSelectedStyles(input.requirement.selectedStyles);
  const concept = resolveProductConcept(input.requirement);
  const locale = input.requirement.searchLocale ?? "en";
  const styleEnabled = styleRankingEnabled(selectedStyles, input.requirement.requirementType);

  const ranked: RankedProductCandidate[] = [];

  for (const source of candidateSources(input.serpResult)) {
    const product = mapTopCandidateToSelection(source, input.stores);
    if (!product) continue;

    const evidence = {
      title: product.productTitle,
      snippet: product.productSnippet,
      url: product.productUrl,
    };

    const furnitureHardValid =
      input.requirement.requirementType === "furniture"
        ? candidateMatchesRequirement(input.requirement, evidence)
        : false;
    const gate =
      input.requirement.requirementType === "material"
        ? evaluateCandidateHardGate(input.requirement, evidence)
        : {
            hardValid: furnitureHardValid,
            hardGateReasons: furnitureHardValid ? [] : ["furniture_mismatch"],
            fidelity: null,
          };

    if (!gate.hardValid) {
      logCandidateRankingTrace({
        requirementKey: input.requirement.requirementKey,
        selectedStyles,
        locale,
        query: input.query,
        queryLevel: input.queryLevel + 1,
        candidateTitle: product.productTitle,
        domain: product.retailerDomain,
        hardValid: false,
        hardGateReasons: gate.hardGateReasons,
        productKind: gate.fidelity?.productKind ?? "unknown",
        requirementFidelity: gate.fidelity,
        styleScore: null,
        matchedStyleSignals: [],
        conflicts: gate.fidelity?.conflictingSignals ?? gate.hardGateReasons,
        serpScore: source.score,
        finalScore: 0,
        selected: false,
      });
      continue;
    }

    const styleFit = styleEnabled
      ? scoreStyleFit({
          locale,
          selectedStyles,
          concept,
          requirementType: input.requirement.requirementType,
          evidence: {
            title: product.productTitle,
            snippet: product.productSnippet,
            url: product.productUrl,
          },
        })
      : null;

    const fidelity = styleEnabled ? null : gate.fidelity;

    const finalScore = computeFinalScore({
      styleEnabled,
      serpScore: source.score,
      styleFit,
      fidelity,
      hasReferenceImage: product.hasReferenceImage,
    });

    ranked.push({
      product,
      hardValid: true,
      hardGateReasons: [],
      fidelity,
      serpScore: source.score,
      serpConfidence: normalizeSerpScore(source.score),
      styleFit,
      finalScore,
    });
  }

  ranked.sort((a, b) => b.finalScore - a.finalScore);
  const winner = ranked[0] ?? null;

  for (const candidate of ranked) {
    logCandidateRankingTrace({
      requirementKey: input.requirement.requirementKey,
      selectedStyles,
      locale,
      query: input.query,
      queryLevel: input.queryLevel + 1,
      candidateTitle: candidate.product.productTitle,
      domain: candidate.product.retailerDomain,
      hardValid: candidate.hardValid,
      hardGateReasons: candidate.hardGateReasons,
      productKind: candidate.fidelity?.productKind ?? "unknown",
      requirementFidelity: candidate.fidelity,
      styleScore: candidate.styleFit?.score ?? null,
      matchedStyleSignals: candidate.styleFit?.matchedSignals ?? [],
      conflicts: [
        ...(candidate.styleFit?.conflictingSignals ?? []),
        ...(candidate.fidelity?.conflictingSignals ?? []),
      ],
      serpScore: candidate.serpScore,
      finalScore: candidate.finalScore,
      selected: winner?.product.productUrl === candidate.product.productUrl,
    });
  }

  return { winner, ranked };
}

/** Dry-run helper for luxury + minimal desk regression. */
export function debugRankDeskCandidates(
  candidates: Array<{ title: string; snippet?: string | null; url?: string; score?: number }>,
  styles: CanonicalStyleId[] = ["luxury", "minimal"]
): Array<{ title: string; styleScore: number; finalScore: number; matched: string[]; conflicts: string[] }> {
  const requirement: SearchableRequirement = {
    requirementType: "furniture",
    requirementKey: "furniture:desk:debug",
    itemSpec: "computer desk",
    queryPlan: ["računalniška miza"],
    selectedStyles: styles,
    searchLocale: "sl",
    searchCountryCode: "SI",
    snapshot: {
      category: "desk",
      quantity: 1,
      placementNotes: null,
      constraints: ["computer desk"],
    },
    provenance: { source: "analysis", concept: "desk" },
  };

  return candidates
    .map((candidate) => {
      const styleFit = scoreStyleFit({
        locale: "sl",
        selectedStyles: styles,
        concept: "desk",
        requirementType: "furniture",
        evidence: candidate,
      });
      const finalScore = computeFinalScore({
        styleEnabled: true,
        serpScore: candidate.score ?? 40,
        styleFit,
        fidelity: null,
        hasReferenceImage: false,
      });
      return {
        title: candidate.title,
        styleScore: styleFit.score,
        finalScore,
        matched: styleFit.matchedSignals,
        conflicts: styleFit.conflictingSignals,
      };
    })
    .sort((a, b) => b.finalScore - a.finalScore);
}

/** Dry-run material ranking for live regression fixtures. */
export function debugRankMaterialCandidates(
  requirement: SearchableRequirement,
  candidates: Array<{ title: string; snippet?: string | null; url?: string; score?: number }>
): Array<{ title: string; hardValid: boolean; reasons: string[]; fidelityScore: number; finalScore: number }> {
  return candidates
    .map((candidate) => {
      const gate = evaluateCandidateHardGate(requirement, candidate);
      const finalScore = gate.hardValid
        ? computeFinalScore({
            styleEnabled: false,
            serpScore: candidate.score ?? 40,
            styleFit: null,
            fidelity: gate.fidelity,
            hasReferenceImage: false,
          })
        : 0;
      return {
        title: candidate.title,
        hardValid: gate.hardValid,
        reasons: gate.hardGateReasons,
        fidelityScore: gate.fidelity.score,
        finalScore,
      };
    })
    .sort((a, b) => b.finalScore - a.finalScore);
}

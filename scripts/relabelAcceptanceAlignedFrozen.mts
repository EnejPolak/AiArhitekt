
import { readFileSync, writeFileSync } from "node:fs";
import { assessAcceptanceAlignedQualification, isRadiatorPageCandidate, isVasePageCandidate } from "/Users/enejpolak/Projetki /AiArhitekt/lib/productDiscovery/selectionBenchmarkGroundTruth.ts";
import type { RescueCandidate } from "/Users/enejpolak/Projetki /AiArhitekt/lib/productDiscovery/rescueCandidates.ts";

const raw = JSON.parse(readFileSync("/tmp/aiarhitekt-acceptance-aligned-selection.json", "utf8"));

function rate(n: number, d: number): string {
  if (d <= 0) return "n/a";
  return `${Math.round((n / d) * 1000) / 10}%`;
}

const frozenCases = [];
const selectionRows = [];

for (const c of raw.frozenCases) {
  const candidates: RescueCandidate[] = c.candidates.map((x: any) => ({
    id: x.candidateId,
    url: x.url,
    domain: x.domain,
    sourceTitle: x.sourceTitle,
    sourceEvidence: x.sourceEvidence,
    preRankScore: 0,
    enrichment: x.enrichment,
  }));
  const qualifying = candidates.map((cand) => assessAcceptanceAlignedQualification(c.requestedItem, cand));
  const qualifyingIds = qualifying.filter((q) => q.qualifies).map((q) => q.candidateId);
  const nonQualifyingIds = qualifying.filter((q) => !q.qualifies).map((q) => q.candidateId);
  const qualificationReasons: Record<string, string[]> = {};
  for (const q of qualifying) qualificationReasons[q.candidateId] = q.reasons;

  const updated = {
    ...c,
    groundTruth: {
      qualifyingCandidateIds: qualifyingIds,
      nonQualifyingCandidateIds: nonQualifyingIds,
      qualificationReasons,
    },
    diagnostics: {
      anyRadiatorPage: candidates.some((cand) => isRadiatorPageCandidate(cand)),
      anyVasePage: candidates.some((cand) => isVasePageCandidate(cand)),
      qualifyingCount: qualifyingIds.length,
    },
  };
  frozenCases.push(updated);

  // Note: we cannot re-run isolated without API; keep prior selectionRows only for cases still qualifying,
  // and mark selection benchmark empty if no qualifying remain.
}

function summarizeCategory(cat: string) {
  const rows = frozenCases.filter((r: any) => r.category === cat);
  const primaryFound = rows.filter((r: any) => r.originalPrimaryStatus === "found").length;
  const primaryNotFound = rows.filter((r: any) => r.originalPrimaryStatus === "not_found").length;
  const nf = rows.filter((r: any) => r.originalPrimaryStatus === "not_found");
  return {
    runs: rows.length,
    primaryFound,
    primaryNotFound,
    anyRadiatorPage: rows.filter((r: any) => r.diagnostics.anyRadiatorPage).length,
    anyVasePage: rows.filter((r: any) => r.diagnostics.anyVasePage).length,
    runsWithQualifying: rows.filter((r: any) => r.groundTruth.qualifyingCandidateIds.length > 0).length,
    trueSourcePresentMisses: nf.filter((r: any) => r.groundTruth.qualifyingCandidateIds.length > 0).length,
    trueSearchMisses: nf.filter((r: any) => r.groundTruth.qualifyingCandidateIds.length === 0).length,
  };
}

const bathroom = summarizeCategory("bathroom-towel");
const accessory = summarizeCategory("accessory");
const lighting = summarizeCategory("lighting");
const kitchen = summarizeCategory("kitchen-exact");
const allQualified = frozenCases.reduce((n: number, c: any) => n + c.groundTruth.qualifyingCandidateIds.length, 0);
const sourcePresentCases = frozenCases.filter((c: any) => c.groundTruth.qualifyingCandidateIds.length > 0);

const searchMiss = bathroom.trueSearchMisses + accessory.trueSearchMisses + lighting.trueSearchMisses + kitchen.trueSearchMisses;
const modelSelectionMiss = bathroom.trueSourcePresentMisses + accessory.trueSourcePresentMisses + lighting.trueSourcePresentMisses + kitchen.trueSourcePresentMisses;

const summary = {
  frozenRuns: frozenCases.length,
  candidatesPolicyQualified: allQualified,
  byCategory: { bathroom, accessory, lighting, kitchen },
  sourcePresentCases: sourcePresentCases.length,
  sourcePresentCaseIds: sourcePresentCases.map((c: any) => `${c.category}#${c.run}`),
  // Selection metrics require live isolated re-run; leave placeholder when 0 source-present
  current: { note: "recomputed labels only; isolated selector not re-invoked on empty/near-empty source-present set" },
  rootCause: {
    SEARCH_MISS: searchMiss,
    MODEL_SELECTION_MISS: modelSelectionMiss,
  },
  bathroomPrimaryFoundProduct: frozenCases
    .filter((c: any) => c.category === "bathroom-towel" && c.originalPrimaryStatus === "found")
    .map((c: any) => ({ run: c.run, name: c.primaryProductName, url: c.primaryProductUrl, qualifying: c.groundTruth.qualifyingCandidateIds.length })),
  sampleNonQualifyingReasons: Object.fromEntries(
    ["bathroom-towel", "accessory", "lighting", "kitchen-exact"].map((cat) => {
      const reasons: Record<string, number> = {};
      for (const c of frozenCases.filter((x: any) => x.category === cat)) {
        for (const id of c.groundTruth.nonQualifyingCandidateIds) {
          for (const r of c.groundTruth.qualificationReasons[id] || []) {
            const key = r.split(":")[0].slice(0, 60);
            reasons[key] = (reasons[key] || 0) + 1;
          }
        }
      }
      return [cat, Object.entries(reasons).sort((a,b)=>b[1]-a[1]).slice(0, 8)];
    })
  ),
};

writeFileSync("/tmp/aiarhitekt-acceptance-aligned-selection-relabeled.json", JSON.stringify({ ranAt: new Date().toISOString(), summary, frozenCases }, null, 2));
console.log(JSON.stringify(summary, null, 2));

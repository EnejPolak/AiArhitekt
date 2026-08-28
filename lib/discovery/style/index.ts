export type { CanonicalStyleId, StyleFitResult, RankedProductCandidate } from "./types";
export { CANONICAL_STYLE_IDS } from "./types";
export { normalizeSelectedStyles, styleRankingEnabled } from "./normalizeStyles";
export { scoreStyleFit, buildStyleEvidenceText } from "./scoreStyleFit";
export { buildStyleAwareFurnitureQueries, styleQueryModifiers } from "./queryModifiers";
export { rankRequirementCandidates, debugRankDeskCandidates } from "./rankCandidates";
export {
  STYLE_ACCEPTANCE_THRESHOLD,
  STYLE_NEUTRAL_SCORE,
  RANKING_WEIGHTS,
} from "./constants";
export { resolveStyleQueryStopAction } from "./stopPolicy";
export type { StyleQueryStopAction } from "./stopPolicy";
export { STYLE_PROFILES } from "./profiles";

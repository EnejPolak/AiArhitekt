/** Style fit strong enough to stop at the current query level without trying broader queries. */
export const STYLE_ACCEPTANCE_THRESHOLD = 0.4;

/** Neutral baseline when no style vocabulary matched. */
export const STYLE_NEUTRAL_SCORE = 0.34;

export const RANKING_WEIGHTS = {
  serp: 0.5,
  style: 0.45,
  referenceImage: 0.03,
} as const;

/** Materials rank by requirement fidelity before generic SERP quality. */
export const MATERIAL_RANKING_WEIGHTS = {
  fidelity: 0.55,
  serp: 0.25,
  referenceImage: 0.03,
} as const;

export const MAX_SERP_SCORE_NORMALIZER = 80;

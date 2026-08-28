import { STYLE_ACCEPTANCE_THRESHOLD } from "./constants";

export type StyleQueryStopAction = "accept_and_stop" | "continue" | "finalize_cross_level";

/**
 * Deterministic query-level stop policy for style-sensitive furniture.
 *
 * - accept_and_stop: current level winner is selected; no further SERP levels
 * - continue: try the next broader query level
 * - finalize_cross_level: last allowed level; caller picks best valid candidate across levels
 */
export function resolveStyleQueryStopAction(input: {
  styleEnabled: boolean;
  currentStyleScore: number | null;
  queryLevel: number;
  maxLevel: number;
}): StyleQueryStopAction {
  if (!input.styleEnabled) {
    return "accept_and_stop";
  }

  const isFinalLevel = input.queryLevel >= input.maxLevel - 1;
  const styleScore = input.currentStyleScore ?? 0;

  if (styleScore >= STYLE_ACCEPTANCE_THRESHOLD) {
    return "accept_and_stop";
  }

  if (isFinalLevel) {
    return "finalize_cross_level";
  }

  return "continue";
}

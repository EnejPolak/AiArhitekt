import { MVP_PROJECT_TYPE } from "./types";
import { DEFAULT_STEP_KEY } from "./types";

/** Room renovation wizard (flow_version = 1). Keys are stable if steps are reordered. */
export const ROOM_STEP_KEYS = [
  "greeting",
  "room-type",
  "photo-upload",
  "ai-observation",
  "style-selection",
  "budget-signal",
  "design-preferences",
  "location",
  "design-generation",
  "final-design-selection",
  "cost-estimate",
  "budget-split",
  "store-discovery",
  "product-sourcing",
  "shopping-list",
  "contractors",
  "final-report",
] as const;

export type RoomStepKey = (typeof ROOM_STEP_KEYS)[number];

export function stepsForType(type: string): readonly string[] {
  if (type === MVP_PROJECT_TYPE) return ROOM_STEP_KEYS;
  return [];
}

export function isAllowedStepKey(type: string, key: string): boolean {
  return stepsForType(type).includes(key);
}

export function stepIndexFromKey(type: string, key: string): number {
  const index = stepsForType(type).indexOf(key);
  return index >= 0 ? index : 0;
}

export function stepKeyFromIndex(type: string, index: number): string {
  const steps = stepsForType(type);
  if (index < 0 || steps.length === 0) return DEFAULT_STEP_KEY;
  return steps[Math.min(index, steps.length - 1)] ?? DEFAULT_STEP_KEY;
}

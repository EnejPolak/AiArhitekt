import {
  isRequiredUnresolvedReason,
  type UnmatchedRequirement,
} from "./itemSpecs";
import { unmatchedRequirementDisplayLabel } from "./requirementLabels";

export type CompleteRoomGate = {
  requiredSlots: number;
  readySlots: number;
  unresolvedSlots: number;
  allowed: boolean;
  unresolvedLabels: string[];
};

export function isArchitecturalFinishRequirement(item: {
  requirementType: string;
  requirementKey: string;
}): boolean {
  if (item.requirementType !== "material") return false;
  const key = item.requirementKey.toLowerCase();
  return (
    key.includes("material:wall") ||
    key.includes("material:floor") ||
    key.includes("interior-wall-paint") ||
    key.includes("user-flooring")
  );
}

export function completeRoomGate(input: {
  searchedItemCount: number;
  unmatched: UnmatchedRequirement[];
  readyRequirementKeys: string[];
}): CompleteRoomGate {
  const userRemoved = input.unmatched.filter((item) => item.reason === "user_removed");
  const unresolvedFinish = input.unmatched.filter(
    (item) =>
      isRequiredUnresolvedReason(item.reason) &&
      isArchitecturalFinishRequirement(item) &&
      !input.readyRequirementKeys.includes(item.requirementKey)
  );
  const requiredSlots = Math.max(
    0,
    input.searchedItemCount - userRemoved.length - unresolvedFinish.length
  );
  const readyKeys = new Set(input.readyRequirementKeys);
  const readySlots = Math.min(requiredSlots, readyKeys.size);
  const unresolvedSlots = Math.max(0, requiredSlots - readySlots);
  const unresolvedLabels = input.unmatched
    .filter(
      (item) =>
        isRequiredUnresolvedReason(item.reason) &&
        !readyKeys.has(item.requirementKey) &&
        !isArchitecturalFinishRequirement(item)
    )
    .map((item) => unmatchedRequirementDisplayLabel(item));
  return {
    requiredSlots,
    readySlots,
    unresolvedSlots,
    allowed: requiredSlots > 0 && unresolvedSlots === 0,
    unresolvedLabels,
  };
}

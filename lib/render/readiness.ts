import { completeRoomGate, type CompleteRoomGate } from "@/lib/discovery/completeRoomGate";
import type { UnmatchedRequirement } from "@/lib/discovery/itemSpecs";
import { requiredExactFinishSlots } from "./finishes";
import type { RoomRenderPreferences } from "./preferences";

export function evaluateCompleteRoomReadiness(input: {
  searchedItemCount: number;
  unmatched: UnmatchedRequirement[];
  readyRequirementKeys: string[];
  preferences: RoomRenderPreferences;
}): CompleteRoomGate {
  const product = completeRoomGate({
    searchedItemCount: input.searchedItemCount,
    unmatched: input.unmatched,
    readyRequirementKeys: input.readyRequirementKeys,
  });
  const finishSlots = requiredExactFinishSlots({
    preferences: input.preferences,
    readyRequirementKeys: input.readyRequirementKeys,
  });
  const unresolvedFinishes = finishSlots.filter((slot) => !slot.resolved);
  const requiredFinishSlots = finishSlots.length;
  const readyFinishSlots = requiredFinishSlots - unresolvedFinishes.length;
  const finishLabels = unresolvedFinishes.map((slot) =>
    slot.surface === "floor_finish"
      ? "Floor change is unresolved. Retry floor search, change flooring constraints, select another floor product, or switch to Keep existing."
      : "Exact wall paint is unresolved. Retry paint search, change constraints, choose another product, or switch to concept color / Keep existing."
  );
  const requiredSlots = product.requiredSlots + requiredFinishSlots;
  const readySlots = product.readySlots + readyFinishSlots;
  const unresolvedSlots = product.unresolvedSlots + unresolvedFinishes.length;
  return {
    requiredSlots,
    readySlots,
    unresolvedSlots,
    allowed: product.requiredSlots > 0 && unresolvedSlots === 0,
    unresolvedLabels: [...product.unresolvedLabels, ...finishLabels],
  };
}

export function completeRoomBlockMessage(gate: CompleteRoomGate): string {
  if (gate.allowed) return "";
  const details = gate.unresolvedLabels.filter((label) => label.trim().length > 0);
  if (details.length === 0) {
    return `Generate is blocked. Ready ${gate.readySlots}/${gate.requiredSlots} required items.`;
  }
  return `Generate is blocked. ${details.join(" ")}`;
}

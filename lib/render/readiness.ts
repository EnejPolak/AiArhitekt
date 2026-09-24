import { completeRoomGate, type CompleteRoomGate } from "@/lib/discovery/completeRoomGate";
import type { UnmatchedRequirement } from "@/lib/discovery/itemSpecs";
import { isEmptyDesignBrief, type DesignBriefDocument } from "@/lib/design-brief/schema";
import { MAX_RENDER_REFERENCE_IMAGES } from "./constants";
import { requiredExactFinishSlots } from "./finishes";
import type { RoomRenderPreferences } from "./preferences";

export function evaluateCompleteRoomReadiness(input: {
  searchedItemCount: number;
  unmatched: UnmatchedRequirement[];
  readyRequirementKeys: string[];
  preferences: RoomRenderPreferences;
  requiredPlanItems?: Array<{ requirementKey: string; displayLabel: string; concept?: string }>;
  readyPlanConcepts?: string[];
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
  const readyKeys = new Set(input.readyRequirementKeys);
  const readyConcepts = new Set(
    (input.readyPlanConcepts ?? []).filter((concept) => concept && concept !== "other")
  );
  const seenConcepts = new Set<string>();
  const missingPlan = (input.requiredPlanItems ?? []).filter((item) => {
    if (!item.requirementKey || readyKeys.has(item.requirementKey)) return false;
    if (item.concept && item.concept !== "other" && readyConcepts.has(item.concept)) return false;
    const dedupe = item.concept && item.concept !== "other" ? item.concept : item.requirementKey;
    if (seenConcepts.has(dedupe)) return false;
    seenConcepts.add(dedupe);
    return true;
  });
  const planLabels = missingPlan.map(
    (item) =>
      `${item.displayLabel} is required for a complete room. Find products for it before generating.`
  );
  const requiredSlots = product.requiredSlots + requiredFinishSlots + missingPlan.length;
  const readySlots = product.readySlots + readyFinishSlots;
  const unresolvedSlots = product.unresolvedSlots + unresolvedFinishes.length + missingPlan.length;
  return {
    requiredSlots,
    readySlots,
    unresolvedSlots,
    allowed: product.requiredSlots > 0 && unresolvedSlots === 0,
    unresolvedLabels: [...product.unresolvedLabels, ...finishLabels, ...planLabels],
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

export function referenceCapacityGate(candidateCount: number): {
  allowed: boolean;
  capacity: number;
  candidateCount: number;
} {
  return {
    allowed: candidateCount <= MAX_RENDER_REFERENCE_IMAGES,
    capacity: MAX_RENDER_REFERENCE_IMAGES,
    candidateCount,
  };
}

export function tooManyReferencesBlockMessage(candidateCount: number): string {
  return (
    `This design has ${candidateCount} product references, but one visualization supports at most ` +
    `${MAX_RENDER_REFERENCE_IMAGES}. Unconfirm or remove products until ${MAX_RENDER_REFERENCE_IMAGES} ` +
    `or fewer remain approved for the design, then generate again. No required product was silently dropped.`
  );
}

export function productApprovalGate(
  selections: Array<{
    isConfirmed: boolean;
    requirementType: "furniture" | "material";
    referenceStatus?: string;
    productTitle: string;
  }>
): { allowed: boolean; unconfirmedLabels: string[] } {
  const unconfirmed = selections.filter(
    (item) =>
      item.requirementType === "furniture" &&
      item.referenceStatus === "ready" &&
      !item.isConfirmed
  );
  return {
    allowed: unconfirmed.length === 0,
    unconfirmedLabels: unconfirmed.map((item) => item.productTitle),
  };
}

export function productApprovalBlockMessage(gate: {
  allowed: boolean;
  unconfirmedLabels: string[];
}): string {
  if (gate.allowed) return "";
  if (gate.unconfirmedLabels.length === 0) {
    return "Approve each product before generating a design.";
  }
  return `Approve each product before generating a design. Waiting on: ${gate.unconfirmedLabels.join(", ")}.`;
}

export function designBriefGenerateGate(
  doc: DesignBriefDocument,
  options?: { hasSucceededRender?: boolean }
): { allowed: boolean; legacy: boolean } {
  if (doc.completed) return { allowed: true, legacy: false };
  if (isEmptyDesignBrief(doc) && options?.hasSucceededRender) {
    return { allowed: true, legacy: true };
  }
  return { allowed: false, legacy: false };
}

export function designBriefBlockMessage(): string {
  return "Complete Design Brief before generating a design.";
}

import { selectionHasUsableExactProductImage } from "@/lib/references/imageEvidence";
import { selectionConflictsRequirementCategory } from "@/lib/discovery/requirementCategory";
import type { ProductDiscoveryView, ProductSelectionView } from "@/lib/discovery/types";
import { evaluateCompleteRoomReadiness, productApprovalGate } from "./readiness";
import type { RoomRenderPreferences } from "./preferences";
import type { UnmatchedRequirement } from "@/lib/discovery/itemSpecs";

export type FinalReportProjectState =
  | "incomplete_requirements"
  | "waiting_approval"
  | "ready_to_generate"
  | "generating"
  | "generated"
  | "generation_failed";

export function visualizationReadySelections(selections: ProductSelectionView[]): ProductSelectionView[] {
  return selections.filter(
    (item) =>
      item.referenceStatus === "ready" &&
      selectionHasUsableExactProductImage(item) &&
      !selectionConflictsRequirementCategory(item)
  );
}

export function resolveFinalReportProjectState(input: {
  hasSucceededRender: boolean;
  processing: boolean;
  generationFailed: boolean;
  discovery: ProductDiscoveryView | null;
  selections: ProductSelectionView[];
  unmatched: UnmatchedRequirement[];
  preferences: RoomRenderPreferences;
  requiredPlanItems?: Array<{ requirementKey: string; displayLabel: string; concept?: string }>;
}): FinalReportProjectState {
  if (input.processing) return "generating";
  if (input.hasSucceededRender) return "generated";
  if (input.generationFailed) return "generation_failed";
  if (!input.discovery) return "incomplete_requirements";

  const ready = visualizationReadySelections(input.selections);
  const completeRoom = evaluateCompleteRoomReadiness({
    searchedItemCount: input.discovery.searchedItemCount,
    unmatched: input.unmatched,
    readyRequirementKeys: ready.map((item) => item.requirementKey),
    preferences: input.preferences,
    requiredPlanItems: input.requiredPlanItems,
    readyPlanConcepts: ready.map((item) => item.itemSpec),
  });
  if (!completeRoom.allowed) return "incomplete_requirements";
  const approval = productApprovalGate(ready);
  if (!approval.allowed) return "waiting_approval";
  return "ready_to_generate";
}

export function finalReportHeadline(state: FinalReportProjectState): string {
  switch (state) {
    case "generated":
      return "Your renovation project is ready.";
    case "generating":
      return "Generating your room visualization…";
    case "generation_failed":
      return "Visualization failed. Retry generate when you are ready.";
    case "ready_to_generate":
      return "Required products are ready. Generate a visualization to finish.";
    case "waiting_approval":
      return "Approve each product before generating a design.";
    default:
      return "This project is incomplete. Finish required products before a final visualization.";
  }
}

export function unusableReferenceLabels(selections: ProductSelectionView[]): string[] {
  return selections
    .filter(
      (item) => item.referenceStatus === "ready" && !selectionHasUsableExactProductImage(item)
    )
    .map((item) => item.productTitle);
}

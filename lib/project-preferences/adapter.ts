import { canonicalShoppingPreferences, type ShoppingPreferenceInput, type ShoppingPreferenceSnapshot } from "@/lib/discovery/preferences";
import { canonicalFurnishingPlanIdentity } from "@/lib/discovery/furnishingPlan";
import { parseDesignBriefAnswers, designBriefIdentity } from "@/lib/design-brief";
import {
  canonicalRenderPreferences,
  type RoomRenderPreferences,
} from "@/lib/render/preferences";
import { EMPTY_PROJECT_ROOM_PREFERENCES, type ProjectRoomPreferences } from "./types";

export type ProjectRoomPreferenceFields = Omit<
  ProjectRoomPreferences,
  "projectId" | "createdAt" | "updatedAt"
>;

export function projectRoomPreferencesToShoppingPreferences(
  row?: Pick<
    ProjectRoomPreferenceFields,
    | "selectedStyles"
    | "wallMainColor"
    | "wallAccentColor"
    | "flooring"
    | "underfloorHeating"
    | "bedType"
    | "keepExistingWalls"
    | "wallFinishMode"
    | "floorFinishMode"
    | "notes"
    | "furnishingPlan"
    | "designBriefAnswers"
    | "budgetLevel"
  > | null
): ShoppingPreferenceInput {
  const source = row ?? EMPTY_PROJECT_ROOM_PREFERENCES;
  const furnishingPlanIdentity = canonicalFurnishingPlanIdentity(source.furnishingPlan);
  const brief = parseDesignBriefAnswers(source.designBriefAnswers);
  const identity = designBriefIdentity(brief);
  return {
    selectedStyles: source.selectedStyles,
    wallMainColor: source.wallMainColor,
    wallAccentColor: source.wallAccentColor,
    flooring: source.flooring,
    underfloorHeating: source.underfloorHeating,
    bedType: source.bedType,
    keepExistingWalls: source.wallFinishMode === "exact_product" ? false : true,
    notes: source.notes,
    budgetLevel: source.budgetLevel,
    designBrief: brief,
    ...(furnishingPlanIdentity ? { furnishingPlanIdentity } : {}),
    ...(identity ? { designBriefIdentity: identity } : {}),
  };
}

export function canonicalShoppingPreferencesFromProject(
  row?: ProjectRoomPreferenceFields | null
): ShoppingPreferenceSnapshot {
  return canonicalShoppingPreferences(projectRoomPreferencesToShoppingPreferences(row));
}

export function projectRoomPreferencesToRenderPreferences(
  row?: ProjectRoomPreferenceFields | null
): RoomRenderPreferences {
  const source = row ?? EMPTY_PROJECT_ROOM_PREFERENCES;
  return canonicalRenderPreferences({
    selectedStyles: source.selectedStyles,
    budgetLevel: source.budgetLevel,
    wallMainColor: source.wallMainColor,
    wallAccentColor: source.wallAccentColor,
    flooring: source.flooring,
    underfloorHeating: source.underfloorHeating,
    bedType: source.bedType,
    keepExistingWalls: source.keepExistingWalls,
    wallFinishMode: source.wallFinishMode,
    floorFinishMode: source.floorFinishMode,
    notes: source.notes,
  });
}

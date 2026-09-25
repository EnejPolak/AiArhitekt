"use client";

import * as React from "react";
import type { ProductDiscoveryView, ProductSelectionView } from "@/lib/discovery/types";
import type { UnmatchedRequirement } from "@/lib/discovery/itemSpecs";
import type { RoomRenderPreferences } from "@/lib/render/preferences";
import type { RoomAnalysisView } from "@/lib/analysis/types";
import type { ShoppingPreferenceInput } from "@/lib/discovery/preferences";
import type { FurnishingPlanOverrides } from "@/lib/discovery/furnishingPlan";
import type { DesignBriefDocument } from "@/lib/design-brief";
import { FinalRoomRenderPanel } from "../FinalRoomRenderPanel";
import { wizardPanelClass } from "../wizardUi";

export interface Step9bProductSourcingProps {
  projectId: string;
  selections: ProductSelectionView[];
  discovery?: ProductDiscoveryView | null;
  unmatchedRequirements?: UnmatchedRequirement[];
  preferences: RoomRenderPreferences;
  roomPhotoPreviewUrl: string | null;
  analysis?: RoomAnalysisView | null;
  shoppingPreferences?: ShoppingPreferenceInput | null;
  planOverrides?: FurnishingPlanOverrides | null;
  onRetryRequirement?: (requirementKey: string) => void;
  onChangeConstraints?: (requirementKey: string) => void;
  onIncreaseBudget?: (requirementKey: string) => void;
  onRemoveRequirement?: (requirementKey: string) => void;
  onKeepExistingFloor?: () => void;
  onSwitchWallToConceptColor?: () => void;
  onKeepExistingWalls?: () => void;
  retryBusyKey?: string | null;
  onBackToProducts?: () => void;
  onPreviewChange?: (previewUrl: string | null) => void;
  designBrief?: DesignBriefDocument | null;
  onCompleteBrief?: () => void;
}

export const Step9bProductSourcing: React.FC<Step9bProductSourcingProps> = ({
  projectId,
  selections,
  discovery = null,
  unmatchedRequirements = [],
  preferences,
  roomPhotoPreviewUrl,
  analysis = null,
  shoppingPreferences = null,
  planOverrides = null,
  onRetryRequirement,
  onChangeConstraints,
  onIncreaseBudget,
  onRemoveRequirement,
  onKeepExistingFloor,
  onSwitchWallToConceptColor,
  onKeepExistingWalls,
  retryBusyKey,
  onBackToProducts,
  onPreviewChange,
  designBrief = null,
  onCompleteBrief,
}) => {
  return (
    <div className="flex justify-start mb-6">
      <div className={`${wizardPanelClass} space-y-4`}>
        <div className="text-[15px] text-[rgba(255,255,255,0.85)] leading-relaxed">
          Generate a room visualization from your selected products. Ready products with valid
          references are included automatically — revise the selection with Back to products if
          needed.
        </div>
        <FinalRoomRenderPanel
          projectId={projectId}
          selections={selections}
          discovery={discovery}
          unmatchedRequirements={unmatchedRequirements}
          preferences={preferences}
          roomPhotoPreviewUrl={roomPhotoPreviewUrl}
          analysis={analysis}
          shoppingPreferences={shoppingPreferences}
          planOverrides={planOverrides}
          onRetryRequirement={onRetryRequirement}
          onChangeConstraints={onChangeConstraints}
          onIncreaseBudget={onIncreaseBudget}
          onRemoveRequirement={onRemoveRequirement}
          onKeepExistingFloor={onKeepExistingFloor}
          onSwitchWallToConceptColor={onSwitchWallToConceptColor}
          onKeepExistingWalls={onKeepExistingWalls}
          retryBusyKey={retryBusyKey}
          onPreviewChange={onPreviewChange}
          designBrief={designBrief}
          onCompleteBrief={onCompleteBrief}
          onBackToProducts={onBackToProducts}
        />
      </div>
    </div>
  );
};

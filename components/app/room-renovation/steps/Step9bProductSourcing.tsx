"use client";

import * as React from "react";
import type { ProductDiscoveryView, ProductSelectionView } from "@/lib/discovery/types";
import type { UnmatchedRequirement } from "@/lib/discovery/itemSpecs";
import type { RoomRenderPreferences } from "@/lib/render/preferences";
import { FinalRoomRenderPanel } from "../FinalRoomRenderPanel";
import { wizardPanelClass } from "../wizardUi";

export interface Step9bProductSourcingProps {
  projectId: string;
  selections: ProductSelectionView[];
  discovery?: ProductDiscoveryView | null;
  unmatchedRequirements?: UnmatchedRequirement[];
  preferences: RoomRenderPreferences;
  roomPhotoPreviewUrl: string | null;
  onContinue: () => void;
  onRetryRequirement?: (requirementKey: string) => void;
  onChangeConstraints?: (requirementKey: string) => void;
  onIncreaseBudget?: (requirementKey: string) => void;
  onRemoveRequirement?: (requirementKey: string) => void;
  onKeepExistingFloor?: () => void;
  onSwitchWallToConceptColor?: () => void;
  onKeepExistingWalls?: () => void;
  retryBusyKey?: string | null;
}

export const Step9bProductSourcing: React.FC<Step9bProductSourcingProps> = ({
  projectId,
  selections,
  discovery = null,
  unmatchedRequirements = [],
  preferences,
  roomPhotoPreviewUrl,
  onContinue,
  onRetryRequirement,
  onChangeConstraints,
  onIncreaseBudget,
  onRemoveRequirement,
  onKeepExistingFloor,
  onSwitchWallToConceptColor,
  onKeepExistingWalls,
  retryBusyKey,
}) => {
  return (
    <div className="flex justify-start mb-6">
      <div className={`${wizardPanelClass} space-y-4`}>
        <div className="text-[15px] text-[rgba(255,255,255,0.85)] leading-relaxed">
          Generate a room visualization from your selected products. The shopping list stays the real persisted selections — not anything read from the image.
        </div>
        <FinalRoomRenderPanel
          projectId={projectId}
          selections={selections}
          discovery={discovery}
          unmatchedRequirements={unmatchedRequirements}
          preferences={preferences}
          roomPhotoPreviewUrl={roomPhotoPreviewUrl}
          onRetryRequirement={onRetryRequirement}
          onChangeConstraints={onChangeConstraints}
          onIncreaseBudget={onIncreaseBudget}
          onRemoveRequirement={onRemoveRequirement}
          onKeepExistingFloor={onKeepExistingFloor}
          onSwitchWallToConceptColor={onSwitchWallToConceptColor}
          onKeepExistingWalls={onKeepExistingWalls}
          retryBusyKey={retryBusyKey}
        />
        <button
          type="button"
          onClick={onContinue}
          className="text-[14px] text-[rgba(0,230,204,0.85)] hover:text-[rgba(0,230,204,1)]"
        >
          Continue
        </button>
      </div>
    </div>
  );
};

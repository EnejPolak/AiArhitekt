"use client";

import * as React from "react";
import type { ProductSelectionView } from "@/lib/discovery/types";
import type { RoomRenderPreferences } from "@/lib/render/preferences";
import { FinalRoomRenderPanel } from "../FinalRoomRenderPanel";

export interface Step9bProductSourcingProps {
  projectId: string;
  selections: ProductSelectionView[];
  preferences: RoomRenderPreferences;
  roomPhotoPreviewUrl: string | null;
  onContinue: () => void;
}

export const Step9bProductSourcing: React.FC<Step9bProductSourcingProps> = ({
  projectId,
  selections,
  preferences,
  roomPhotoPreviewUrl,
  onContinue,
}) => {
  return (
    <div className="flex justify-start mb-6">
      <div className="max-w-[92%] rounded-[16px] px-6 py-5 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)] space-y-4">
        <div className="text-[15px] text-[rgba(255,255,255,0.85)] leading-relaxed">
          Generate a room visualization from your confirmed products. The shopping list stays the real persisted selections — not anything read from the image.
        </div>
        <FinalRoomRenderPanel
          projectId={projectId}
          selections={selections}
          preferences={preferences}
          roomPhotoPreviewUrl={roomPhotoPreviewUrl}
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

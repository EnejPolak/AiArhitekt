"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { RoomRenovationFlow } from "./room-renovation/RoomRenovationFlow";
import { updateWizardStep } from "@/lib/projects/actions";
import { MVP_PROJECT_TYPE, type ProjectType } from "@/lib/projects/types";
import type { RoomAnalysisView } from "@/lib/analysis/types";
import type { ProductDiscoveryView, ProductSelectionView } from "@/lib/discovery/types";
import type { ProjectRoomPreferences } from "@/lib/project-preferences/types";

export interface WorkspaceAreaProps {
  projectId: string | null;
  projectType?: ProjectType | null;
  currentStepKey?: string;
  roomPhoto?: { previewUrl: string | null; filename: string | null } | null;
  roomAnalysis?: RoomAnalysisView | null;
  productDiscovery?: {
    discovery: ProductDiscoveryView;
    selections: ProductSelectionView[];
  } | null;
  initialRoomPreferences?: ProjectRoomPreferences | null;
  className?: string;
}

export const WorkspaceArea: React.FC<WorkspaceAreaProps> = ({
  projectId,
  projectType,
  currentStepKey,
  roomPhoto,
  roomAnalysis = null,
  productDiscovery = null,
  initialRoomPreferences = null,
  className,
}) => {
  const persistStep = (key: string) => {
    if (!projectId) return;
    void updateWizardStep({
      projectId,
      projectType: MVP_PROJECT_TYPE,
      currentStepKey: key,
    });
  };

  return (
    <div
      className={cn(
        "flex-1 min-h-0 min-w-0 h-full",
        "bg-background",
        "flex flex-col",
        "overflow-hidden",
        className
      )}
    >
      {projectId && projectType === MVP_PROJECT_TYPE ? (
        <RoomRenovationFlow
          projectId={projectId}
          initialStepKey={currentStepKey}
          onStepChange={persistStep}
          roomPhoto={roomPhoto}
          roomAnalysis={roomAnalysis}
          productDiscovery={productDiscovery}
          initialRoomPreferences={initialRoomPreferences}
        />
      ) : projectId ? (
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="text-center">
            <h2 className="text-[20px] font-semibold text-white mb-2">
              Project type not available
            </h2>
            <p className="text-[14px] text-[rgba(255,255,255,0.60)]">
              This MVP supports single-room renovation only.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="text-center">
            <h2 className="text-[20px] font-semibold text-white mb-2">
              No project selected
            </h2>
            <p className="text-[14px] text-[rgba(255,255,255,0.60)]">
              Click &quot;New Project&quot; to get started
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

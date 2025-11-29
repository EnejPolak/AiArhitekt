"use client";

import * as React from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { ChatMessage } from "../ChatMessage";
import { ProjectData } from "../OnboardingFlow";
import { Edit2 } from "lucide-react";

export interface StepReviewProps {
  projectData: ProjectData;
  onComplete: () => void;
  onEdit: (step: number) => void;
}

export const StepReview: React.FC<StepReviewProps> = ({ projectData, onComplete, onEdit }) => {
  const typeLabels: Record<string, string> = {
    "new-build": "New build",
    renovation: "Renovation",
    "interior-only": "Interior only",
  };

  return (
    <div className="space-y-6">
      <ChatMessage
        type="ai"
        content={`**Step 6 — Review your project inputs**

If everything looks correct, I'll generate your 3D concept, cost range, and a basic permit guidance overview.`}
      />
      <div className="flex justify-start">
        <div className="max-w-[85%] rounded-[16px] px-5 py-5 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)]">
          <div className="space-y-4">
            {/* Summary */}
            <div className="space-y-3">
              {projectData.location && (
                <div className="flex items-start justify-between pb-3 border-b border-[rgba(255,255,255,0.08)]">
                  <div>
                    <div className="text-[12px] font-medium text-[rgba(255,255,255,0.50)] mb-1">
                      Location
                    </div>
                    <div className="text-[14px] text-white">
                      {projectData.location.city}, {projectData.location.country}
                      {projectData.location.street && ` • ${projectData.location.street}`}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onEdit(1)}
                    className="flex items-center gap-1 text-[12px] text-[#3B82F6] hover:text-[#2563EB] transition-colors"
                  >
                    <Edit2 className="w-3 h-3" />
                    Edit
                  </button>
                </div>
              )}

              {projectData.plotSize && (
                <div className="flex items-start justify-between pb-3 border-b border-[rgba(255,255,255,0.08)]">
                  <div>
                    <div className="text-[12px] font-medium text-[rgba(255,255,255,0.50)] mb-1">
                      Plot size
                    </div>
                    <div className="text-[14px] text-white">
                      {projectData.plotSize.size}m²
                      {projectData.plotSize.approximate && " (approximate)"}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onEdit(2)}
                    className="flex items-center gap-1 text-[12px] text-[#3B82F6] hover:text-[#2563EB] transition-colors"
                  >
                    <Edit2 className="w-3 h-3" />
                    Edit
                  </button>
                </div>
              )}

              {projectData.projectType && (
                <div className="flex items-start justify-between pb-3 border-b border-[rgba(255,255,255,0.08)]">
                  <div>
                    <div className="text-[12px] font-medium text-[rgba(255,255,255,0.50)] mb-1">
                      Project type
                    </div>
                    <div className="text-[14px] text-white">
                      {typeLabels[projectData.projectType.type || ""] || projectData.projectType.type}
                      {projectData.projectType.livesInBuilding !== null && (
                        <span className="text-[rgba(255,255,255,0.60)]">
                          {" • "}
                          {projectData.projectType.livesInBuilding ? "Lives in building" : "Doesn't live in building"}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onEdit(3)}
                    className="flex items-center gap-1 text-[12px] text-[#3B82F6] hover:text-[#2563EB] transition-colors"
                  >
                    <Edit2 className="w-3 h-3" />
                    Edit
                  </button>
                </div>
              )}

              {projectData.documents && (
                <div className="flex items-start justify-between pb-3 border-b border-[rgba(255,255,255,0.08)]">
                  <div>
                    <div className="text-[12px] font-medium text-[rgba(255,255,255,0.50)] mb-1">
                      Documents you have
                    </div>
                    <div className="text-[14px] text-white">
                      {[
                        projectData.documents.hasOfficialPlans && "Official plans",
                        projectData.documents.hasSketch && "Sketch",
                        projectData.documents.hasNoPlans && "No plans yet",
                        projectData.documents.hasPermitDrawings && "Permit drawings",
                      ]
                        .filter(Boolean)
                        .join(", ")}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onEdit(4)}
                    className="flex items-center gap-1 text-[12px] text-[#3B82F6] hover:text-[#2563EB] transition-colors"
                  >
                    <Edit2 className="w-3 h-3" />
                    Edit
                  </button>
                </div>
              )}

              {projectData.uploads && (
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-[12px] font-medium text-[rgba(255,255,255,0.50)] mb-1">
                      Files uploaded
                    </div>
                    <div className="text-[14px] text-white">
                      {projectData.uploads.files.length} file{projectData.uploads.files.length !== 1 ? "s" : ""}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onEdit(5)}
                    className="flex items-center gap-1 text-[12px] text-[#3B82F6] hover:text-[#2563EB] transition-colors"
                  >
                    <Edit2 className="w-3 h-3" />
                    Edit
                  </button>
                </div>
              )}
            </div>

            {/* Buttons */}
            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                onClick={() => onEdit(1)}
                className={cn(
                  "flex-1 border border-[rgba(255,255,255,0.18)] bg-transparent",
                  "text-[rgba(255,255,255,0.80)] hover:bg-[rgba(255,255,255,0.08)]",
                  "h-[44px] text-[14px] font-medium rounded-[12px]",
                  "transition-all duration-200"
                )}
              >
                Back to edit
              </Button>
              <Button
                type="button"
                onClick={onComplete}
                className={cn(
                  "flex-1 bg-gradient-to-br from-[#3B82F6] to-[#2563EB]",
                  "text-white border-0",
                  "shadow-[0_4px_16px_rgba(59,130,246,0.25)]",
                  "hover:from-[#2563EB] hover:to-[#1D4ED8]",
                  "hover:shadow-[0_4px_16px_rgba(59,130,246,0.30)]",
                  "hover:scale-[1.01]",
                  "active:from-[#1D4ED8] active:to-[#1D4ED8]",
                  "active:scale-[0.99]",
                  "h-[44px] text-[14px] font-medium",
                  "rounded-[12px]",
                  "transition-all duration-200"
                )}
              >
                Looks good — generate 3D
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};



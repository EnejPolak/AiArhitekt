"use client";

import * as React from "react";
import { OnboardingFlow } from "./onboarding/OnboardingFlow";
import { cn } from "@/lib/utils";

export interface WorkspaceAreaProps {
  projectId: string | null;
  className?: string;
}

export const WorkspaceArea: React.FC<WorkspaceAreaProps> = ({
  projectId,
  className,
}) => {
  return (
    <div
      className={cn(
        "flex-1 h-screen",
        "bg-[#0D0D0F]",
        "flex flex-col",
        "overflow-hidden",
        className
      )}
    >
      {projectId ? (
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="text-center">
            <h2 className="text-[20px] font-semibold text-white mb-2">
              Project Workspace
            </h2>
            <p className="text-[14px] text-[rgba(255,255,255,0.60)]">
              Project content will appear here
            </p>
          </div>
        </div>
      ) : (
        <OnboardingFlow />
      )}
    </div>
  );
};

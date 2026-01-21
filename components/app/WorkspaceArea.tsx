"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { RoomRenovationFlow } from "./room-renovation/RoomRenovationFlow";
import { HomeRenovationFlow } from "./home-renovation/HomeRenovationFlow";

export interface WorkspaceAreaProps {
  projectId: string | null;
  projectType?: "room-renovation" | "home-renovation" | "new-construction" | null;
  onProjectComplete?: () => void;
  className?: string;
}

export const WorkspaceArea: React.FC<WorkspaceAreaProps> = ({
  projectId,
  projectType,
  onProjectComplete,
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
      {projectId && projectType === "room-renovation" ? (
        <RoomRenovationFlow 
          projectId={projectId} 
          onComplete={onProjectComplete}
        />
      ) : projectId && projectType === "home-renovation" ? (
        <HomeRenovationFlow 
          projectId={projectId} 
          onComplete={onProjectComplete}
        />
      ) : projectId ? (
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="text-center">
            <h2 className="text-[20px] font-semibold text-white mb-2">
              Project Workspace
            </h2>
            <p className="text-[14px] text-[rgba(255,255,255,0.60)]">
              {projectType === "new-construction" && "New construction flow coming soon"}
              {!projectType && "Project content will appear here"}
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
              Click "New Project" to get started
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

"use client";

import * as React from "react";
import { ProjectsSidebar } from "@/components/app/ProjectsSidebar";
import { WorkspaceArea } from "@/components/app/WorkspaceArea";

export default function AppPage() {
  const [selectedProjectId, setSelectedProjectId] = React.useState<string | null>(null);

  return (
    <div className="flex h-screen bg-[#0D0D0F] overflow-hidden">
      {/* Left Sidebar */}
      <ProjectsSidebar
        selectedProjectId={selectedProjectId}
        onProjectSelect={setSelectedProjectId}
        onNewProject={() => setSelectedProjectId(null)}
      />

      {/* Right Workspace Area */}
      <WorkspaceArea projectId={selectedProjectId} />
    </div>
  );
}

"use client";

import * as React from "react";
import { ProjectsSidebar } from "@/components/app/ProjectsSidebar";
import { WorkspaceArea } from "@/components/app/WorkspaceArea";
import { ProjectTypeSelection } from "@/components/app/ProjectTypeSelection";

export default function AppPage() {
  const [selectedProjectId, setSelectedProjectId] = React.useState<string | null>(null);
  const [selectedProjectType, setSelectedProjectType] = React.useState<"room-renovation" | "home-renovation" | "new-construction" | null>(null);
  const [showProjectSelection, setShowProjectSelection] = React.useState(false);

  const handleNewProject = () => {
    setSelectedProjectId(null);
    setSelectedProjectType(null);
    setShowProjectSelection(true);
  };

  const handleProjectTypeSelect = (type: "room-renovation" | "home-renovation" | "new-construction") => {
    // Generate a new project ID
    const newProjectId = `project-${Date.now()}`;
    
    // TODO: Create project in backend with type
    // For now, just set the project ID and hide selection
    setSelectedProjectId(newProjectId);
    setSelectedProjectType(type);
    setShowProjectSelection(false);
  };

  return (
    <div className="flex h-screen bg-[#0D0D0F] overflow-hidden">
      {/* Left Sidebar */}
      <ProjectsSidebar
        selectedProjectId={selectedProjectId}
        onProjectSelect={(id) => {
          setSelectedProjectId(id);
          setShowProjectSelection(false);
        }}
        onNewProject={handleNewProject}
      />

      {/* Right Workspace Area */}
      {showProjectSelection ? (
        <ProjectTypeSelection onSelect={handleProjectTypeSelect} />
      ) : (
        <WorkspaceArea 
          projectId={selectedProjectId} 
          projectType={selectedProjectType}
          onProjectComplete={() => {
            setSelectedProjectId(null);
            setSelectedProjectType(null);
          }}
        />
      )}
    </div>
  );
}

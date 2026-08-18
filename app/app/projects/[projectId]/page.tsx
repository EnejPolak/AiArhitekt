import { notFound } from "next/navigation";
import { RestoreProjectButton } from "@/components/app/RestoreProjectButton";
import { WorkspaceArea } from "@/components/app/WorkspaceArea";
import { loadOwnedProject } from "@/lib/projects/server";
import { loadRoomPhotoPreview } from "@/lib/uploads/server";
import { loadCurrentRoomAnalysis } from "@/lib/analysis/server";
import { PROJECT_TYPE_LABELS } from "@/lib/projects/types";

export const dynamic = "force-dynamic";

export default async function ProjectWorkspacePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await loadOwnedProject(projectId);

  if (!project) {
    notFound();
  }

  const roomPhoto = await loadRoomPhotoPreview(project.id);
  const roomAnalysis = await loadCurrentRoomAnalysis(project.id);

  if (project.archived_at) {
    return (
      <div className="flex flex-1 items-center justify-center px-6">
        <div className="max-w-md text-center">
          <h2 className="mb-2 text-[20px] font-semibold text-white">
            This project is archived
          </h2>
          <p className="mb-6 text-[14px] text-[rgba(255,255,255,0.60)]">
            {project.name} ({PROJECT_TYPE_LABELS[project.project_type]}) is hidden
            from your active list. Restore it to continue.
          </p>
          <RestoreProjectButton projectId={project.id} />
        </div>
      </div>
    );
  }

  return (
    <WorkspaceArea
      projectId={project.id}
      projectType={project.project_type}
      currentStepKey={project.current_step_key}
      roomPhoto={
        roomPhoto
          ? {
              previewUrl: roomPhoto.previewUrl,
              filename: roomPhoto.upload.original_filename,
            }
          : null
      }
      roomAnalysis={roomAnalysis}
    />
  );
}

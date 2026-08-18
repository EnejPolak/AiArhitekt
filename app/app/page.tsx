import { EmptyState } from "@/components/app/EmptyState";
import { WorkspaceArea } from "@/components/app/WorkspaceArea";
import { loadWorkspaceProjects } from "@/lib/projects/server";

export const dynamic = "force-dynamic";

export default async function AppPage() {
  const { active } = await loadWorkspaceProjects();

  if (active.length === 0) {
    return <EmptyState />;
  }

  return <WorkspaceArea projectId={null} projectType={null} />;
}

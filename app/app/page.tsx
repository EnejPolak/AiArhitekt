import { EmptyState } from "@/components/app/EmptyState";
import { WorkspaceArea } from "@/components/app/WorkspaceArea";
import { loadWorkspaceProjects } from "@/lib/projects/server";

export const dynamic = "force-dynamic";

export default async function AppPage() {
  const { active } = await loadWorkspaceProjects();

  if (active.length === 0) {
    return <EmptyState className="min-h-0 flex-1 overflow-y-auto px-4" />;
  }

  return <WorkspaceArea projectId={null} projectType={null} />;
}

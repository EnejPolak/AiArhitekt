import type { ReactNode } from "react";
import { requireAppUser } from "@/lib/auth/session";
import { ProjectsSidebar } from "@/components/app/ProjectsSidebar";
import { loadWorkspaceProjects } from "@/lib/projects/server";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  await requireAppUser();
  const { active, archived } = await loadWorkspaceProjects();

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <ProjectsSidebar activeProjects={active} archivedProjects={archived} />
      {children}
    </div>
  );
}

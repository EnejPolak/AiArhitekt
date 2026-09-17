import type { ReactNode } from "react";
import { requireAppUser } from "@/lib/auth/session";
import { ProjectsSidebar } from "@/components/app/ProjectsSidebar";
import { AppShell } from "@/components/app/AppShell";
import { loadWorkspaceProjects } from "@/lib/projects/server";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  await requireAppUser();
  const { active, archived } = await loadWorkspaceProjects();

  return (
    <AppShell
      sidebar={<ProjectsSidebar activeProjects={active} archivedProjects={archived} />}
    >
      {children}
    </AppShell>
  );
}

"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search, Settings, CreditCard, LogOut, FilePen, MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { signOut } from "@/lib/auth/actions";
import {
  archiveProject,
  deleteProject,
  renameProject,
  restoreProject,
} from "@/lib/projects/actions";
import { formatRelativeUpdated } from "@/lib/projects/format";
import { PROJECT_TYPE_LABELS, type ProjectRow } from "@/lib/projects/types";
import { cn } from "@/lib/utils";

export interface ProjectsSidebarProps {
  activeProjects: ProjectRow[];
  archivedProjects: ProjectRow[];
  className?: string;
}

export const ProjectsSidebar: React.FC<ProjectsSidebarProps> = ({
  activeProjects,
  archivedProjects,
  className,
}) => {
  const pathname = usePathname();
  const router = useRouter();
  const selectedProjectId = pathname?.startsWith("/app/projects/")
    ? pathname.split("/")[3] ?? null
    : null;

  const [searchQuery, setSearchQuery] = React.useState("");
  const [showArchived, setShowArchived] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [renameId, setRenameId] = React.useState<string | null>(null);
  const [renameValue, setRenameValue] = React.useState("");
  const [deleteId, setDeleteId] = React.useState<string | null>(null);

  const filterList = (list: ProjectRow[]) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (project) =>
        project.name.toLowerCase().includes(q) ||
        PROJECT_TYPE_LABELS[project.project_type].toLowerCase().includes(q)
    );
  };

  const visibleActive = filterList(activeProjects);
  const visibleArchived = filterList(archivedProjects);

  const run = async (projectId: string, fn: () => Promise<{ ok: boolean; message?: string }>) => {
    setBusyId(projectId);
    setError(null);
    const result = await fn();
    setBusyId(null);
    if (!result.ok) {
      setError(result.message ?? "Could not update the project. Try again.");
      return false;
    }
    router.refresh();
    return true;
  };

  const handleSelect = (projectId: string) => {
    router.push(`/app/projects/${projectId}`);
  };

  return (
    <aside
      className={cn(
        "flex h-screen w-[280px] flex-col overflow-hidden bg-background md:w-[320px]",
        className
      )}
    >
      <div className="px-5 pb-4 pt-6">
        <h1 className="mb-1 text-[16px] font-medium text-white">Arhitekt AI</h1>
        <p className="text-[12px] text-[rgba(255,255,255,0.50)]">
          Your Architectural AI Workspace
        </p>
      </div>

      <div className="mb-4 px-5">
        <Link
          href="/app/projects/new"
          className={cn(
            "flex h-[36px] w-full items-center gap-2 px-3",
            "rounded-lg text-[14px] font-normal text-white",
            "transition-colors duration-200 hover:bg-[rgba(255,255,255,0.08)]"
          )}
        >
          <FilePen className="h-4 w-4 text-white" strokeWidth={1.5} />
          <span>New Project</span>
        </Link>
      </div>

      <div className="mb-4 px-5">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgba(255,255,255,0.40)]" />
          <input
            type="text"
            placeholder="Search projects…"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className={cn(
              "h-[36px] w-full rounded-lg border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.05)] pl-9 pr-3",
              "text-[13px] text-white placeholder-[rgba(255,255,255,0.40)]",
              "focus:border-[rgba(255,255,255,0.15)] focus:outline-none"
            )}
          />
        </div>
      </div>

      {error ? (
        <p className="mb-2 px-5 text-[12px] text-[#E5484D]" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex-1 overflow-y-auto px-2">
        {visibleActive.length === 0 && activeProjects.length === 0 ? (
          <p className="px-3 py-4 text-[13px] text-[rgba(255,255,255,0.45)]">
            No projects yet
          </p>
        ) : null}

        <div className="space-y-1">
          {visibleActive.map((project) => {
            const isActive = selectedProjectId === project.id;
            return (
              <div
                key={project.id}
                className={cn(
                  "group rounded-lg",
                  isActive
                    ? "border-l-[3px] border-[#3B82F6] bg-[rgba(59,130,246,0.15)]"
                    : "hover:bg-[rgba(255,255,255,0.06)]"
                )}
              >
                {renameId === project.id ? (
                  <form
                    className="px-3 py-2"
                    onSubmit={async (event) => {
                      event.preventDefault();
                      const ok = await run(project.id, () =>
                        renameProject({ projectId: project.id, name: renameValue })
                      );
                      if (ok) setRenameId(null);
                    }}
                  >
                    <label className="sr-only" htmlFor={`rename-${project.id}`}>
                      Project name
                    </label>
                    <input
                      id={`rename-${project.id}`}
                      value={renameValue}
                      onChange={(event) => setRenameValue(event.target.value)}
                      autoFocus
                      disabled={busyId === project.id}
                      className="h-8 w-full rounded border border-[rgba(255,255,255,0.14)] bg-[rgba(255,255,255,0.04)] px-2 text-[13px] text-white"
                    />
                    <div className="mt-2 flex gap-2">
                      <button
                        type="submit"
                        disabled={busyId === project.id}
                        className="text-[12px] text-[rgba(0,230,204,0.85)]"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setRenameId(null)}
                        className="text-[12px] text-[rgba(255,255,255,0.55)]"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="flex items-start">
                    <button
                      type="button"
                      onClick={() => handleSelect(project.id)}
                      className="flex-1 px-3 py-2.5 text-left"
                    >
                      <div className="mb-0.5 truncate text-[14px] font-medium text-white">
                        {project.name}
                      </div>
                      <div className="truncate text-[12px] text-[rgba(255,255,255,0.50)]">
                        {PROJECT_TYPE_LABELS[project.project_type]} •{" "}
                        {formatRelativeUpdated(project.updated_at)}
                      </div>
                    </button>
                    <details className="relative px-1 pt-2">
                      <summary className="cursor-pointer list-none p-1 text-[rgba(255,255,255,0.45)] hover:text-white">
                        <MoreHorizontal className="h-4 w-4" />
                        <span className="sr-only">Project actions</span>
                      </summary>
                      <div className="absolute right-0 z-20 mt-1 w-40 rounded-lg border border-[rgba(255,255,255,0.10)] bg-[#141416] py-1 text-[12px] shadow-lg">
                        <button
                          type="button"
                          className="block w-full px-3 py-1.5 text-left text-white hover:bg-[rgba(255,255,255,0.06)]"
                          onClick={() => {
                            setRenameId(project.id);
                            setRenameValue(project.name);
                          }}
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          className="block w-full px-3 py-1.5 text-left text-white hover:bg-[rgba(255,255,255,0.06)]"
                          disabled={busyId === project.id}
                          onClick={async () => {
                            const ok = await run(project.id, () =>
                              archiveProject({ projectId: project.id })
                            );
                            if (ok && selectedProjectId === project.id) {
                              router.push("/app");
                            }
                          }}
                        >
                          Archive
                        </button>
                        <button
                          type="button"
                          className="block w-full px-3 py-1.5 text-left text-[#E5484D] hover:bg-[rgba(255,255,255,0.06)]"
                          onClick={() => setDeleteId(project.id)}
                        >
                          Delete…
                        </button>
                      </div>
                    </details>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {archivedProjects.length > 0 ? (
          <div className="mt-6 px-1">
            <button
              type="button"
              onClick={() => setShowArchived((open) => !open)}
              className="px-2 text-[12px] text-[rgba(255,255,255,0.45)] hover:text-white"
            >
              Archived ({archivedProjects.length})
            </button>
            {showArchived
              ? visibleArchived.map((project) => (
                  <div key={project.id} className="mt-1 rounded-lg px-3 py-2 hover:bg-[rgba(255,255,255,0.04)]">
                    <div className="truncate text-[13px] text-[rgba(255,255,255,0.70)]">
                      {project.name}
                    </div>
                    <div className="mt-1 flex gap-3 text-[12px]">
                      <button
                        type="button"
                        disabled={busyId === project.id}
                        className="text-[rgba(0,230,204,0.85)]"
                        onClick={() =>
                          void run(project.id, () =>
                            restoreProject({ projectId: project.id })
                          )
                        }
                      >
                        Restore
                      </button>
                      <button
                        type="button"
                        className="text-[#E5484D]"
                        onClick={() => setDeleteId(project.id)}
                      >
                        Delete…
                      </button>
                    </div>
                  </div>
                ))
              : null}
          </div>
        ) : null}
      </div>

      {deleteId ? (
        <div className="border-t border-[rgba(255,255,255,0.08)] px-5 py-4">
          <p className="mb-3 text-[13px] text-white">
            This permanently deletes the project. This cannot be undone.
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              disabled={busyId === deleteId}
              className="text-[13px] text-[#E5484D]"
              onClick={async () => {
                const id = deleteId;
                const ok = await run(id, () => deleteProject({ projectId: id }));
                if (ok) {
                  setDeleteId(null);
                  if (selectedProjectId === id) router.push("/app");
                }
              }}
            >
              Delete permanently
            </button>
            <button
              type="button"
              className="text-[13px] text-[rgba(255,255,255,0.55)]"
              onClick={() => setDeleteId(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <div className="border-t border-[rgba(255,255,255,0.08)] px-5 py-4">
        <div className="space-y-1">
          <Link
            href="/app/settings"
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] text-[rgba(255,255,255,0.70)] hover:bg-[rgba(255,255,255,0.06)] hover:text-white"
          >
            <Settings className="h-4 w-4" />
            Account Settings
          </Link>
          <Link
            href="/app/billing"
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] text-[rgba(255,255,255,0.70)] hover:bg-[rgba(255,255,255,0.06)] hover:text-white"
          >
            <CreditCard className="h-4 w-4" />
            Billing
          </Link>
          <button
            type="button"
            onClick={() => {
              void signOut();
            }}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[13px] text-[rgba(255,255,255,0.70)] hover:bg-[rgba(255,255,255,0.06)] hover:text-white"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      </div>
    </aside>
  );
};

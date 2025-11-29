"use client";

import * as React from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { Search, Settings, CreditCard, LogOut, FilePen } from "lucide-react";
import Link from "next/link";

export interface Project {
  id: string;
  name: string;
  location: string;
  type: string;
  lastUpdated: string;
}

export interface ProjectsSidebarProps {
  selectedProjectId: string | null;
  onProjectSelect: (projectId: string) => void;
  onNewProject: () => void;
  className?: string;
}

// Mock projects data
const MOCK_PROJECTS: Project[] = [
  {
    id: "1",
    name: "Apartment – 3rd floor",
    location: "Ljubljana, Slovenia",
    type: "Renovation",
    lastUpdated: "2 days ago",
  },
  {
    id: "2",
    name: "Family House Extension",
    location: "Maribor, Slovenia",
    type: "New build",
    lastUpdated: "1 week ago",
  },
  {
    id: "3",
    name: "Kitchen Remodel",
    location: "Koper, Slovenia",
    type: "Interior only",
    lastUpdated: "3 days ago",
  },
];

export const ProjectsSidebar: React.FC<ProjectsSidebarProps> = ({
  selectedProjectId,
  onProjectSelect,
  onNewProject,
  className,
}) => {
  const [searchQuery, setSearchQuery] = React.useState("");
  const [projects] = React.useState<Project[]>(MOCK_PROJECTS);

  const filteredProjects = React.useMemo(() => {
    if (!searchQuery) return projects;
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.type.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [projects, searchQuery]);

  return (
    <aside
      className={cn(
        "w-[280px] md:w-[320px] h-screen",
        "bg-[#0D0D0F]",
        "flex flex-col",
        "overflow-hidden",
        className
      )}
    >
      {/* Brand Header */}
      <div className="px-5 pt-6 pb-4">
        <h1 className="text-[16px] font-medium text-white mb-1">
          Arhitekt AI
        </h1>
        <p className="text-[12px] text-[rgba(255,255,255,0.50)]">
          Your Architectural AI Workspace
        </p>
      </div>

      {/* New Project Button */}
      <div className="px-5 mb-4">
        <button
          onClick={onNewProject}
          className={cn(
            "w-full h-[36px] px-3",
            "flex items-center gap-2",
            "text-white text-[14px] font-normal",
            "rounded-lg",
            "hover:bg-[rgba(255,255,255,0.08)]",
            "transition-colors duration-200"
          )}
        >
          <FilePen className="w-4 h-4 text-white" strokeWidth={1.5} />
          <span>New Project</span>
        </button>
      </div>

      {/* Search Projects Field */}
      <div className="px-5 mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[rgba(255,255,255,0.40)]" />
          <input
            type="text"
            placeholder="Search projects…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={cn(
              "w-full h-[36px] pl-9 pr-3 rounded-lg",
              "bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.08)]",
              "text-[13px] text-white placeholder-[rgba(255,255,255,0.40)]",
              "focus:outline-none focus:border-[rgba(255,255,255,0.15)]",
              "transition-colors"
            )}
          />
        </div>
      </div>

      {/* Projects List */}
      <div className="flex-1 overflow-y-auto px-2">
        <div className="space-y-1">
          {filteredProjects.map((project) => {
            const isActive = selectedProjectId === project.id;
            return (
              <button
                key={project.id}
                onClick={() => onProjectSelect(project.id)}
                className={cn(
                  "w-full text-left px-3 py-2.5 rounded-lg",
                  "transition-all duration-200",
                  "group",
                  isActive
                    ? "bg-[rgba(59,130,246,0.15)] border-l-[3px] border-[#3B82F6]"
                    : "hover:bg-[rgba(255,255,255,0.06)]"
                )}
              >
                <div className="text-[14px] font-medium text-white mb-0.5 truncate">
                  {project.name}
                </div>
                <div className="text-[12px] text-[rgba(255,255,255,0.50)] truncate">
                  {project.location} • {project.type}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Bottom Section */}
      <div className="px-5 py-4 border-t border-[rgba(255,255,255,0.08)]">
        <div className="space-y-1">
          <Link
            href="/app/settings"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] text-[rgba(255,255,255,0.70)] hover:bg-[rgba(255,255,255,0.06)] hover:text-white transition-colors"
          >
            <Settings className="w-4 h-4" />
            Account Settings
          </Link>
          <Link
            href="/app/billing"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] text-[rgba(255,255,255,0.70)] hover:bg-[rgba(255,255,255,0.06)] hover:text-white transition-colors"
          >
            <CreditCard className="w-4 h-4" />
            Billing
          </Link>
          <button className="flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] text-[rgba(255,255,255,0.70)] hover:bg-[rgba(255,255,255,0.06)] hover:text-white transition-colors w-full text-left">
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </div>
    </aside>
  );
};



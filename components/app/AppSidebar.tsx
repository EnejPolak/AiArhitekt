"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  FolderKanban,
  Plus,
  Sparkles,
  FileText,
  Settings,
} from "lucide-react";

export interface AppSidebarProps {
  className?: string;
}

const NAV_ITEMS = [
  {
    id: "dashboard",
    label: "Dashboard",
    href: "/app",
    icon: LayoutDashboard,
  },
  {
    id: "projects",
    label: "My Projects",
    href: "/app/projects",
    icon: FolderKanban,
  },
  {
    id: "new-project",
    label: "New Project",
    href: "/app/projects/new",
    icon: Plus,
  },
  {
    id: "ai-tools",
    label: "AI Tools",
    href: "/app/tools",
    icon: Sparkles,
  },
  {
    id: "reports",
    label: "Reports / Exports",
    href: "/app/reports",
    icon: FileText,
  },
];

export const AppSidebar: React.FC<AppSidebarProps> = ({ className }) => {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 h-screen w-[260px]",
        "bg-[rgba(0,0,0,0.25)] backdrop-blur-[8px]",
        "border-r border-[rgba(255,255,255,0.08)]",
        "flex flex-col",
        className
      )}
    >
      {/* Logo */}
      <div className="px-6 py-6 border-b border-[rgba(255,255,255,0.08)]">
        <Link
          href="/app"
          className="text-lg font-bold text-[#F5F5F5] hover:text-[#4CD4B0] transition-colors"
        >
          Arhitekt AI
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || pathname?.startsWith(item.href + "/");

          return (
            <Link
              key={item.id}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg",
                "text-[14px] font-medium transition-all duration-200",
                "group",
                isActive
                  ? "bg-[rgba(76,212,176,0.12)] text-[#F5F5F5] border-l-2 border-[#4CD4B0]"
                  : "text-[rgba(255,255,255,0.55)] hover:text-[#F5F5F5] hover:bg-[rgba(255,255,255,0.05)]"
              )}
            >
              <Icon
                className={cn(
                  "w-4 h-4 stroke-[1.5]",
                  isActive
                    ? "text-[#4CD4B0]"
                    : "text-[rgba(255,255,255,0.38)] group-hover:text-[rgba(255,255,255,0.55)]"
                )}
              />
              <span>{item.label}</span>
            </Link>
          );
        })}

        {/* Divider */}
        <div className="my-4 h-px bg-[rgba(255,255,255,0.08)]" />

        {/* Account Settings */}
        <Link
          href="/app/settings"
          className={cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-lg",
            "text-[14px] font-medium transition-all duration-200",
            "group",
            pathname === "/app/settings"
              ? "bg-[rgba(76,212,176,0.12)] text-[#F5F5F5] border-l-2 border-[#4CD4B0]"
              : "text-[rgba(255,255,255,0.55)] hover:text-[#F5F5F5] hover:bg-[rgba(255,255,255,0.05)]"
          )}
        >
          <Settings
            className={cn(
              "w-4 h-4 stroke-[1.5]",
              pathname === "/app/settings"
                ? "text-[#4CD4B0]"
                : "text-[rgba(255,255,255,0.38)] group-hover:text-[rgba(255,255,255,0.55)]"
            )}
          />
          <span>Account Settings</span>
        </Link>
      </nav>
    </aside>
  );
};


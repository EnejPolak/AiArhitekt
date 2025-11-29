"use client";

import * as React from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";
import Link from "next/link";

export interface AppHeaderProps {
  title?: string;
  subtitle?: string;
  className?: string;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  title = "Dashboard",
  subtitle = "Start a new project or continue where you left off.",
  className,
}) => {
  const userInitials = "JD"; // TODO: Get from auth context

  return (
    <header
      className={cn(
        "h-[72px] flex items-center justify-between",
        "border-b border-[rgba(255,255,255,0.08)]",
        "bg-[rgba(0,0,0,0.15)] backdrop-blur-[4px]",
        "px-8",
        className
      )}
    >
      {/* Left: Title & Subtitle */}
      <div className="flex flex-col">
        <h1 className="text-[20px] font-semibold text-[#F5F5F5] mb-0.5">{title}</h1>
        <p className="text-[13px] text-[rgba(255,255,255,0.55)]">{subtitle}</p>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-4">
        {/* Project Filter (optional) */}
        <select
          className={cn(
            "px-3 py-1.5 rounded-lg",
            "bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)]",
            "text-[13px] text-[rgba(255,255,255,0.55)]",
            "focus:outline-none focus:border-[#3B82F6]",
            "transition-colors cursor-pointer"
          )}
        >
          <option value="all">All Projects</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
        </select>

        {/* New Project Button */}
        <Link href="/app/projects/new">
          <Button
            className={cn(
              "bg-gradient-to-br from-[#3B82F6] to-[#2563EB]",
              "text-white border-0",
              "shadow-[0_4px_16px_rgba(59,130,246,0.25)]",
              "hover:from-[#2563EB] hover:to-[#1D4ED8]",
              "hover:shadow-[0_4px_16px_rgba(59,130,246,0.30)]",
              "hover:scale-[1.02]",
              "active:from-[#1D4ED8] active:to-[#1D4ED8]",
              "active:scale-[0.98]",
              "h-[48px] px-4 py-2 text-[14px] font-medium",
              "rounded-[12px]",
              "flex items-center gap-2",
              "transition-all duration-200"
            )}
          >
            <Plus className="w-4 h-4" />
            New Project
          </Button>
        </Link>

        {/* User Avatar */}
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#4CD4B0] to-[#38BFA0] flex items-center justify-center cursor-pointer hover:opacity-90 transition-opacity">
          <span className="text-[12px] font-semibold text-white">
            {userInitials}
          </span>
        </div>
      </div>
    </header>
  );
};


"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Calendar, MapPin, Euro, Image as ImageIcon } from "lucide-react";

export interface Project {
  id: string;
  name: string;
  type: "Renovation" | "New build" | "Interior only";
  location: string;
  lastUpdated: string;
  status: "Draft" | "Processing" | "Completed";
  estimatedBudget?: string;
  previewCount?: number;
}

export interface ProjectCardProps {
  project: Project;
  className?: string;
}

const STATUS_COLORS = {
  Draft: "bg-[rgba(216,166,87,0.15)] text-[#D8A657]",
  Processing: "bg-[rgba(74,144,226,0.15)] text-[#4A90E2]",
  Completed: "bg-[rgba(76,175,80,0.15)] text-[#4CAF50]",
};

export const ProjectCard: React.FC<ProjectCardProps> = ({
  project,
  className,
}) => {
  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={{ duration: 0.2 }}
      className={cn(
        "rounded-[20px] p-6",
        "bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)]",
        "hover:bg-[rgba(255,255,255,0.05)] hover:border-[rgba(255,255,255,0.10)]",
        "hover:shadow-[0_8px_32px_rgba(76,212,176,0.08)]",
        "transition-all duration-200 cursor-pointer",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <h3 className="text-[16px] font-semibold text-[#F5F5F5] mb-1.5">
            {project.name}
          </h3>
          <span className="inline-block px-2 py-0.5 rounded-md text-[11px] font-medium text-[rgba(255,255,255,0.55)] bg-[rgba(255,255,255,0.06)]">
            {project.type}
          </span>
        </div>
        <span
          className={cn(
            "px-2.5 py-1 rounded-md text-[11px] font-medium",
            STATUS_COLORS[project.status]
          )}
        >
          {project.status}
        </span>
      </div>

      {/* Location */}
      <div className="flex items-center gap-2 mb-3 text-[13px] text-[rgba(255,255,255,0.55)]">
        <MapPin className="w-3.5 h-3.5" />
        <span>{project.location}</span>
      </div>

      {/* Last Updated */}
      <div className="flex items-center gap-2 mb-4 text-[12px] text-[rgba(255,255,255,0.38)]">
        <Calendar className="w-3.5 h-3.5" />
        <span>Updated {project.lastUpdated}</span>
      </div>

      {/* Footer Info */}
      <div className="flex items-center gap-4 pt-4 border-t border-[rgba(255,255,255,0.08)]">
        {project.estimatedBudget && (
          <div className="flex items-center gap-1.5 text-[12px] text-[rgba(255,255,255,0.55)]">
            <Euro className="w-3.5 h-3.5" />
            <span>{project.estimatedBudget}</span>
          </div>
        )}
        {project.previewCount !== undefined && (
          <div className="flex items-center gap-1.5 text-[12px] text-[rgba(255,255,255,0.55)]">
            <ImageIcon className="w-3.5 h-3.5" />
            <span>{project.previewCount} previews</span>
          </div>
        )}
      </div>
    </motion.div>
  );
};


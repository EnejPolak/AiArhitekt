"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { ProjectCard, Project } from "./ProjectCard";
import { cn } from "@/lib/utils";

export interface RecentProjectsProps {
  projects: Project[];
  className?: string;
}

export const RecentProjects: React.FC<RecentProjectsProps> = ({
  projects,
  className,
}) => {
  if (projects.length === 0) {
    return null;
  }

  return (
    <section className={cn("mb-10", className)}>
      <div className="mb-6">
        <h2 className="text-[20px] font-semibold text-[#F5F5F5] mb-1.5">
          Recent projects
        </h2>
        <p className="text-[14px] text-[rgba(255,255,255,0.55)]">
          Quick access to your latest work.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {projects.map((project, index) => (
          <motion.div
            key={project.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.05 }}
          >
            <ProjectCard project={project} />
          </motion.div>
        ))}
      </div>
    </section>
  );
};


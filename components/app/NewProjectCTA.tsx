"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { Plus, Upload, Settings, Sparkles, Eye } from "lucide-react";
import Link from "next/link";

export interface NewProjectCTAProps {
  className?: string;
}

const STEPS = [
  { icon: Upload, label: "Upload floor plan" },
  { icon: Settings, label: "Set project type & budget" },
  { icon: Sparkles, label: "Run AI" },
  { icon: Eye, label: "View 3D concept & report" },
];

export const NewProjectCTA: React.FC<NewProjectCTAProps> = ({ className }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={cn(
        "rounded-[20px] p-8",
        "bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)]",
        "hover:bg-[rgba(255,255,255,0.05)] hover:border-[rgba(59,130,246,0.20)]",
        "transition-all duration-200",
        className
      )}
    >
      <div className="mb-6">
        <h3 className="text-[18px] font-semibold text-[#F5F5F5] mb-2">
          Start a new project
        </h3>
        <p className="text-[14px] text-[rgba(255,255,255,0.55)] leading-relaxed">
          Upload your floor plan and let Arhitekt AI generate 3D views, cost
          estimate and permit guidance.
        </p>
      </div>

      {/* Step Indicator */}
      <div className="mb-6 space-y-3">
        {STEPS.map((step, index) => {
          const Icon = step.icon;
          return (
            <div
              key={index}
              className="flex items-center gap-3 text-[13px] text-[rgba(255,255,255,0.55)]"
            >
              <div className="w-6 h-6 rounded-full bg-[rgba(59,130,246,0.15)] border border-[rgba(59,130,246,0.25)] flex items-center justify-center flex-shrink-0">
                <Icon className="w-3.5 h-3.5 text-[#3B82F6]" />
              </div>
              <span>{step.label}</span>
            </div>
          );
        })}
      </div>

      <Link href="/app/projects/new">
        <Button
          className={cn(
            "w-full bg-gradient-to-br from-[#3B82F6] to-[#2563EB]",
            "text-white border-0",
            "shadow-[0_4px_16px_rgba(59,130,246,0.25)]",
            "hover:from-[#2563EB] hover:to-[#1D4ED8]",
            "hover:shadow-[0_4px_16px_rgba(59,130,246,0.30)]",
            "hover:scale-[1.02]",
            "active:from-[#1D4ED8] active:to-[#1D4ED8]",
            "active:scale-[0.98]",
            "h-[52px] px-4 py-2.5 text-[14px] font-medium",
            "rounded-[14px]",
            "flex items-center justify-center gap-2",
            "transition-all duration-200"
          )}
        >
          <Plus className="w-4 h-4" />
          New Project
        </Button>
      </Link>
    </motion.div>
  );
};


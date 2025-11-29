"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { Plus, Box } from "lucide-react";
import Link from "next/link";

export interface EmptyStateProps {
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ className }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className={cn(
        "flex flex-col items-center justify-center",
        "min-h-[500px] text-center",
        className
      )}
    >
      {/* Geometric Illustration */}
      <div className="mb-8 relative">
        <div className="w-32 h-32 flex items-center justify-center">
          <div className="relative">
            {/* Simple geometric blocks */}
            <motion.div
              animate={{ rotate: [0, 5, -5, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              className="absolute top-0 left-0 w-12 h-12 bg-[rgba(76,212,176,0.15)] border border-[rgba(76,212,176,0.25)] rounded-lg"
            />
            <motion.div
              animate={{ rotate: [0, -5, 5, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
              className="absolute top-4 left-4 w-16 h-16 bg-[rgba(76,212,176,0.10)] border border-[rgba(76,212,176,0.20)] rounded-lg"
            />
            <motion.div
              animate={{ rotate: [0, 3, -3, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: 1 }}
              className="absolute top-8 left-8 w-10 h-10 bg-[rgba(76,212,176,0.20)] border border-[rgba(76,212,176,0.30)] rounded-lg"
            />
            <Box className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 text-[rgba(76,212,176,0.40)]" />
          </div>
        </div>
      </div>

      {/* Text */}
      <h2 className="text-[24px] font-semibold text-[#F5F5F5] mb-2">
        No projects yet.
      </h2>
      <p className="text-[15px] text-[rgba(255,255,255,0.55)] mb-8 max-w-md">
        Start by uploading your first floor plan.
      </p>

      {/* CTA Button */}
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
            "h-[52px] px-6 py-3 text-[15px] font-medium",
            "rounded-[14px]",
            "flex items-center gap-2",
            "transition-all duration-200"
          )}
        >
          <Plus className="w-5 h-5" />
          Create your first project
        </Button>
      </Link>
    </motion.div>
  );
};


"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  Upload,
  Boxes,
  Calculator,
  FileCheck,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";

export interface AIToolsPanelProps {
  className?: string;
}

const TOOLS = [
  {
    icon: Upload,
    label: "Upload floor plan",
    href: "/app/tools/upload",
  },
  {
    icon: Boxes,
    label: "Generate 3D room preview",
    href: "/app/tools/preview",
  },
  {
    icon: Calculator,
    label: "Estimate renovation cost",
    href: "/app/tools/estimate",
  },
  {
    icon: FileCheck,
    label: "Check permit requirements",
    href: "/app/tools/permits",
  },
];

export const AIToolsPanel: React.FC<AIToolsPanelProps> = ({ className }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1 }}
      className={cn(
        "rounded-[20px] p-6",
        "bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)]",
        className
      )}
    >
      <h3 className="text-[16px] font-semibold text-[#F5F5F5] mb-4">
        AI Tools
      </h3>
      <div className="space-y-2">
        {TOOLS.map((tool, index) => {
          const Icon = tool.icon;
          return (
            <Link
              key={index}
              href={tool.href}
              className={cn(
                "flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg",
                "text-[13px] text-[rgba(255,255,255,0.55)]",
                "hover:bg-[rgba(255,255,255,0.05)] hover:text-[#F5F5F5]",
                "transition-all duration-200 group"
              )}
            >
              <div className="flex items-center gap-3">
                <Icon className="w-4 h-4 text-[rgba(255,255,255,0.38)] group-hover:text-[#3AA7C9] transition-colors" />
                <span>{tool.label}</span>
              </div>
              <ChevronRight className="w-4 h-4 text-[rgba(255,255,255,0.38)] group-hover:text-[rgba(255,255,255,0.55)] transition-colors" />
            </Link>
          );
        })}
      </div>
    </motion.div>
  );
};


"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface ProjectTypeSelectionProps {
  onCreate: () => void;
  creating?: boolean;
}

export const ProjectTypeSelection: React.FC<ProjectTypeSelectionProps> = ({
  onCreate,
  creating = false,
}) => {
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-12 md:px-8 md:py-16">
      <div className="mx-auto w-full max-w-[560px]">
        <div className="mb-10 text-center md:mb-12">
          <h1 className="mb-3 text-[32px] font-medium text-white md:mb-4 md:text-[40px]">
            New Room Project
          </h1>
          <p className="mx-auto max-w-[480px] text-[16px] leading-relaxed text-[rgba(255,255,255,0.60)] md:text-[18px]">
            Redesign a single room. Upload a photo, find real products, then
            generate the final visualization from those selections.
          </p>
        </div>

        <button
          type="button"
          disabled={creating}
          onClick={onCreate}
          className={cn(
            "group relative w-full p-6 text-left md:p-8",
            "rounded-[16px] border border-[rgba(255,255,255,0.08)]",
            "bg-[rgba(255,255,255,0.02)]",
            "transition-all duration-300 ease-out",
            "hover:scale-[1.02] hover:border-[rgba(255,255,255,0.15)]",
            "hover:bg-[rgba(255,255,255,0.04)]",
            "active:scale-[0.98]",
            "disabled:pointer-events-none disabled:opacity-60"
          )}
        >
          <div className="mb-4 text-[rgba(255,255,255,0.50)] transition-colors duration-300 group-hover:text-[rgba(255,255,255,0.80)] md:mb-6">
            <svg
              viewBox="0 0 64 64"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="h-12 w-12"
            >
              <rect
                x="8"
                y="12"
                width="48"
                height="40"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
              <line
                x1="8"
                y1="24"
                x2="56"
                y2="24"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <rect
                x="16"
                y="28"
                width="12"
                height="12"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
              <circle
                cx="44"
                cy="34"
                r="3"
                stroke="currentColor"
                strokeWidth="1.5"
                fill="none"
              />
              <line
                x1="44"
                y1="37"
                x2="44"
                y2="48"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <line
                x1="40"
                y1="44"
                x2="48"
                y2="44"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <h3 className="mb-2 text-[20px] font-medium text-white md:mb-3 md:text-[22px]">
            {creating ? "Creating project…" : "Create room renovation"}
          </h3>
          <p className="text-[14px] leading-relaxed text-[rgba(255,255,255,0.60)] group-hover:text-[rgba(255,255,255,0.70)] md:text-[15px]">
            Kitchen, bathroom, bedroom, or living room. One room per project.
          </p>
        </button>
      </div>
    </div>
  );
};

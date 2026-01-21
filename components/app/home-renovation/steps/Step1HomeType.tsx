"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface Step1HomeTypeProps {
  selectedHomeType: "apartment" | "house" | "townhouse" | "other" | null;
  onSelect: (type: "apartment" | "house" | "townhouse" | "other") => void;
}

const homeOptions = [
  {
    id: "apartment" as const,
    label: "Apartment",
    icon: (
      <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-8 h-8">
        <rect x="12" y="20" width="40" height="36" />
        <line x1="12" y1="32" x2="52" y2="32" />
        <line x1="32" y1="20" x2="32" y2="56" />
        <rect x="16" y="36" width="12" height="12" />
        <rect x="36" y="36" width="12" height="12" />
      </svg>
    ),
  },
  {
    id: "house" as const,
    label: "House",
    icon: (
      <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-8 h-8">
        <path d="M 32 8 L 8 24 L 8 56 L 56 56 L 56 24 Z" />
        <path d="M 32 8 L 32 56" />
        <path d="M 8 24 L 32 8 L 56 24" />
        <rect x="20" y="36" width="8" height="12" />
        <rect x="36" y="36" width="8" height="12" />
      </svg>
    ),
  },
  {
    id: "townhouse" as const,
    label: "Townhouse",
    icon: (
      <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-8 h-8">
        <rect x="8" y="20" width="48" height="36" />
        <line x1="20" y1="20" x2="20" y2="56" />
        <line x1="44" y1="20" x2="44" y2="56" />
        <rect x="12" y="36" width="6" height="12" />
        <rect x="26" y="36" width="6" height="12" />
        <rect x="46" y="36" width="6" height="12" />
      </svg>
    ),
  },
  {
    id: "other" as const,
    label: "Other",
    icon: (
      <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-8 h-8">
        <rect x="12" y="16" width="40" height="40" />
        <circle cx="32" cy="36" r="8" />
        <line x1="32" y1="44" x2="32" y2="56" />
      </svg>
    ),
  },
];

export const Step1HomeType: React.FC<Step1HomeTypeProps> = ({
  selectedHomeType,
  onSelect,
}) => {
  return (
    <div className="mt-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {homeOptions.map((option) => (
          <button
            key={option.id}
            onClick={() => onSelect(option.id)}
            className={cn(
              "group relative",
              "p-6",
              "bg-[rgba(255,255,255,0.02)]",
              "border rounded-[16px]",
              "text-left",
              "transition-all duration-300",
              "hover:bg-[rgba(255,255,255,0.04)]",
              "hover:scale-[1.02]",
              "active:scale-[0.98]",
              selectedHomeType === option.id
                ? "border-[#3B82F6] bg-[rgba(59,130,246,0.10)]"
                : "border-[rgba(255,255,255,0.08)] hover:border-[rgba(255,255,255,0.15)]"
            )}
          >
            <div
              className={cn(
                "mb-4",
                "transition-colors duration-300",
                selectedHomeType === option.id
                  ? "text-[#3B82F6]"
                  : "text-[rgba(255,255,255,0.50)] group-hover:text-[rgba(255,255,255,0.80)]"
              )}
            >
              {option.icon}
            </div>
            <div
              className={cn(
                "text-[16px] font-medium",
                selectedHomeType === option.id ? "text-white" : "text-[rgba(255,255,255,0.85)]"
              )}
            >
              {option.label}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

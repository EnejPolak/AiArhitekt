"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

// Reuse SVG icons from room renovation
const ModernIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 120 80" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
    <rect x="10" y="10" width="100" height="60" />
    <rect x="20" y="25" width="30" height="20" />
    <rect x="60" y="45" width="25" height="15" />
    <line x1="70" y1="20" x2="70" y2="35" />
    <line x1="75" y1="20" x2="75" y2="35" />
  </svg>
);

const ScandinavianIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 120 80" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
    <rect x="10" y="10" width="100" height="60" />
    <rect x="25" y="30" width="25" height="18" />
    <circle cx="50" cy="20" r="8" />
    <line x1="65" y1="25" x2="85" y2="25" />
    <line x1="65" y1="30" x2="85" y2="30" />
    <line x1="65" y1="35" x2="85" y2="35" />
  </svg>
);

const LuxuryIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 120 80" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
    <rect x="10" y="10" width="100" height="60" />
    <path d="M 25 30 Q 30 25, 35 30 L 35 45 Q 30 50, 25 45 Z" />
    <path d="M 60 20 Q 65 15, 70 20 Q 75 25, 70 30 Q 65 35, 60 30 Q 55 25, 60 20" />
    <line x1="80" y1="15" x2="95" y2="15" strokeLinecap="round" />
    <line x1="80" y1="20" x2="95" y2="20" strokeLinecap="round" />
    <line x1="80" y1="25" x2="95" y2="25" strokeLinecap="round" />
  </svg>
);

const MinimalIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 120 80" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
    <rect x="10" y="10" width="100" height="60" />
    <line x1="30" y1="40" x2="50" y2="40" />
    <line x1="70" y1="30" x2="90" y2="30" />
    <line x1="70" y1="50" x2="90" y2="50" />
  </svg>
);

const TimelessIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 120 80" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
    <rect x="10" y="10" width="100" height="60" />
    <rect x="20" y="25" width="35" height="25" />
    <line x1="65" y1="20" x2="85" y2="20" />
    <line x1="65" y1="30" x2="85" y2="30" />
    <line x1="65" y1="40" x2="85" y2="40" />
    <line x1="65" y1="50" x2="85" y2="50" />
  </svg>
);

const styleOptions = [
  {
    id: "modern",
    label: "Modern",
    descriptor: "Clean lines · Neutral tones",
    icon: ModernIcon,
  },
  {
    id: "scandinavian",
    label: "Scandinavian",
    descriptor: "Light woods · Cozy minimalism",
    icon: ScandinavianIcon,
  },
  {
    id: "luxury",
    label: "Luxury",
    descriptor: "Rich materials · Elegant details",
    icon: LuxuryIcon,
  },
  {
    id: "minimal",
    label: "Minimal",
    descriptor: "Essential only · Maximum space",
    icon: MinimalIcon,
  },
  {
    id: "timeless",
    label: "Timeless",
    descriptor: "Classic elements · Enduring style",
    icon: TimelessIcon,
  },
];

export interface Step5StyleDirectionProps {
  selectedStyles: string[];
  onStylesChange: (styles: string[]) => void;
  onContinue: () => void;
}

export const Step5StyleDirection: React.FC<Step5StyleDirectionProps> = ({
  selectedStyles,
  onStylesChange,
  onContinue,
}) => {
  const toggleStyle = (styleId: string) => {
    if (selectedStyles.includes(styleId)) {
      onStylesChange(selectedStyles.filter((s) => s !== styleId));
    } else if (selectedStyles.length < 3) {
      onStylesChange([...selectedStyles, styleId]);
    }
  };

  return (
    <div className="mt-8 space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {styleOptions.map((style) => {
          const isSelected = selectedStyles.includes(style.id);
          return (
            <button
              key={style.id}
              onClick={() => toggleStyle(style.id)}
              disabled={!isSelected && selectedStyles.length >= 3}
              className={cn(
                "relative group",
                "p-6 rounded-[16px]",
                "border-2 transition-all duration-300",
                "hover:scale-[1.02] active:scale-[0.98]",
                isSelected
                  ? "border-[#3B82F6] bg-[rgba(59,130,246,0.10)]"
                  : selectedStyles.length >= 3
                  ? "border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.01)] opacity-50 cursor-not-allowed"
                  : "border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] hover:border-[rgba(255,255,255,0.15)]"
              )}
            >
              <div
                className={cn(
                  "w-full h-24 rounded-lg mb-4",
                  "flex items-center justify-center",
                  "border border-[rgba(255,255,255,0.1)]",
                  "bg-[rgba(255,255,255,0.02)]",
                  isSelected && "bg-[rgba(59,130,246,0.05)]"
                )}
              >
                <style.icon
                  className={cn(
                    "w-20 h-14",
                    isSelected
                      ? "text-[#3B82F6]"
                      : "text-[rgba(255,255,255,0.40)] group-hover:text-[rgba(255,255,255,0.60)]"
                  )}
                />
              </div>
              
              <div
                className={cn(
                  "text-[16px] font-medium mb-1",
                  isSelected ? "text-white" : "text-[rgba(255,255,255,0.85)]"
                )}
              >
                {style.label}
              </div>
              
              <div
                className={cn(
                  "text-[12px]",
                  isSelected
                    ? "text-[rgba(255,255,255,0.60)]"
                    : "text-[rgba(255,255,255,0.45)]"
                )}
              >
                {style.descriptor}
              </div>
              
              {isSelected && (
                <div className="absolute top-2 right-2 w-5 h-5 bg-[#3B82F6] rounded-full flex items-center justify-center">
                  <svg
                    className="w-3 h-3 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={3}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {selectedStyles.length > 0 && (
        <div className="text-[13px] text-[rgba(255,255,255,0.50)] mt-2">
          {selectedStyles.length} of 3 styles selected
        </div>
      )}

      {selectedStyles.length > 0 && (
        <div className="flex justify-start mt-6">
          <button
            onClick={onContinue}
            className="px-6 py-3 rounded-lg bg-[#3B82F6] text-white text-[14px] font-medium hover:bg-[#2563EB] transition-colors"
          >
            Continue
          </button>
        </div>
      )}
    </div>
  );
};

"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface Step8ConceptSelectionProps {
  concepts: Array<{ id: string; url: string; area: string }>;
  selectedConcept: string | null;
  onSelect: (conceptId: string) => void;
}

export const Step8ConceptSelection: React.FC<Step8ConceptSelectionProps> = ({
  concepts,
  selectedConcept,
  onSelect,
}) => {
  if (concepts.length === 0) {
    return (
      <div className="mt-8 text-[14px] text-[rgba(255,255,255,0.60)]">
        No concepts available
      </div>
    );
  }

  return (
    <div className="mt-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {concepts.map((concept) => {
          const isSelected = selectedConcept === concept.id;
          return (
            <button
              key={concept.id}
              onClick={() => onSelect(concept.id)}
              className={cn(
                "relative group",
                "rounded-[16px]",
                "border-2 transition-all duration-300",
                "overflow-hidden",
                "hover:scale-[1.02] active:scale-[0.98]",
                isSelected
                  ? "border-[#3B82F6]"
                  : "border-[rgba(255,255,255,0.08)] hover:border-[rgba(255,255,255,0.15)]"
              )}
            >
              {concept.url ? (
                <img
                  src={concept.url}
                  alt={concept.area}
                  className="w-full h-64 object-cover"
                />
              ) : (
                <div className="w-full h-64 bg-[rgba(255,255,255,0.02)] flex items-center justify-center">
                  <div className="text-[14px] text-[rgba(255,255,255,0.50)]">
                    {concept.area}
                  </div>
                </div>
              )}
              <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
                <div className="text-[15px] font-medium text-white">
                  {concept.area}
                </div>
              </div>
              {isSelected && (
                <div className="absolute top-4 right-4 w-6 h-6 bg-[#3B82F6] rounded-full flex items-center justify-center">
                  <svg
                    className="w-4 h-4 text-white"
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
    </div>
  );
};

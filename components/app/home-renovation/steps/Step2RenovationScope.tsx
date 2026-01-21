"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface Step2RenovationScopeProps {
  selectedScope: string[];
  onScopeChange: (scope: string[]) => void;
  onContinue: () => void;
}

const scopeOptions = [
  { id: "kitchen", label: "Kitchen" },
  { id: "bathrooms", label: "Bathroom(s)" },
  { id: "bedrooms", label: "Bedrooms" },
  { id: "living-areas", label: "Living areas" },
  { id: "floors-throughout", label: "Floors throughout" },
  { id: "electrical-lighting", label: "Electrical / lighting" },
  { id: "other", label: "Other" },
];

export const Step2RenovationScope: React.FC<Step2RenovationScopeProps> = ({
  selectedScope,
  onScopeChange,
  onContinue,
}) => {
  const toggleScope = (scopeId: string) => {
    if (selectedScope.includes(scopeId)) {
      onScopeChange(selectedScope.filter((s) => s !== scopeId));
    } else {
      onScopeChange([...selectedScope, scopeId]);
    }
  };

  return (
    <div className="mt-8 space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {scopeOptions.map((option) => {
          const isSelected = selectedScope.includes(option.id);
          return (
            <button
              key={option.id}
              onClick={() => toggleScope(option.id)}
              className={cn(
                "relative group",
                "p-5 rounded-[16px]",
                "border-2 transition-all duration-300",
                "hover:scale-[1.02] active:scale-[0.98]",
                isSelected
                  ? "border-[#3B82F6] bg-[rgba(59,130,246,0.10)]"
                  : "border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] hover:border-[rgba(255,255,255,0.15)]"
              )}
            >
              <div
                className={cn(
                  "text-[15px] font-medium",
                  isSelected ? "text-white" : "text-[rgba(255,255,255,0.85)]"
                )}
              >
                {option.label}
              </div>
              {isSelected && (
                <div className="absolute top-3 right-3 w-5 h-5 bg-[#3B82F6] rounded-full flex items-center justify-center">
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

      {selectedScope.length > 0 && (
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

"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface Step6BudgetLevelProps {
  selectedBudget: "essential" | "balanced" | "high-end" | "not-sure" | null;
  onSelect: (budget: "essential" | "balanced" | "high-end" | "not-sure") => void;
}

const budgetOptions = [
  {
    id: "essential" as const,
    label: "Essential renovation",
    description: "Basic updates and improvements",
  },
  {
    id: "balanced" as const,
    label: "Balanced renovation",
    description: "Good quality and value",
  },
  {
    id: "high-end" as const,
    label: "High-end renovation",
    description: "Premium materials and finishes",
  },
  {
    id: "not-sure" as const,
    label: "Not sure yet",
    description: "Show me options",
  },
];

export const Step6BudgetLevel: React.FC<Step6BudgetLevelProps> = ({
  selectedBudget,
  onSelect,
}) => {
  return (
    <div className="mt-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {budgetOptions.map((option) => (
          <button
            key={option.id}
            onClick={() => onSelect(option.id)}
            className={cn(
              "p-6 rounded-[16px]",
              "border-2 transition-all duration-300",
              "text-left",
              "hover:scale-[1.02] active:scale-[0.98]",
              selectedBudget === option.id
                ? "border-[#3B82F6] bg-[rgba(59,130,246,0.10)]"
                : "border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] hover:border-[rgba(255,255,255,0.15)]"
            )}
          >
            <div
              className={cn(
                "text-[18px] font-medium mb-2",
                selectedBudget === option.id ? "text-white" : "text-[rgba(255,255,255,0.85)]"
              )}
            >
              {option.label}
            </div>
            <div className="text-[14px] text-[rgba(255,255,255,0.60)]">
              {option.description}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

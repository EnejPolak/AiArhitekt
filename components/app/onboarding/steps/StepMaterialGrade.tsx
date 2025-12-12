"use client";

import * as React from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { ChatMessage } from "../ChatMessage";

export interface StepMaterialGradeProps {
  data: "budget" | "mid-range" | "premium" | null;
  onComplete: (data: "budget" | "mid-range" | "premium") => void;
}

const GRADE_OPTIONS = [
  { id: "budget", label: "Budget", description: "Cost-effective materials" },
  { id: "mid-range", label: "Mid-range", description: "Good quality, balanced" },
  { id: "premium", label: "Premium", description: "High-end materials" },
] as const;

export const StepMaterialGrade: React.FC<StepMaterialGradeProps> = ({ data, onComplete }) => {
  const [selectedGrade, setSelectedGrade] = React.useState<typeof GRADE_OPTIONS[number]["id"] | null>(data || null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedGrade) {
      onComplete(selectedGrade);
    }
  };

  return (
    <div className="space-y-6">
      <ChatMessage
        type="ai"
        content={`**Step 8 — Material Grade**

This affects flooring, colors, kitchen, bathroom, and furniture choices.`}
      />
      <div className="flex justify-start">
        <div className="max-w-[85%] rounded-[16px] px-5 py-5 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)]">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-3">
              {GRADE_OPTIONS.map((grade) => (
                <button
                  key={grade.id}
                  type="button"
                  onClick={() => setSelectedGrade(grade.id)}
                  className={cn(
                    "text-left p-4 rounded-lg border-2 transition-all",
                    selectedGrade === grade.id
                      ? "bg-[rgba(59,130,246,0.10)] border-[#3B82F6] shadow-[0_0_16px_rgba(59,130,246,0.20)]"
                      : "bg-[rgba(255,255,255,0.03)] border-[rgba(255,255,255,0.10)] hover:border-[rgba(255,255,255,0.15)]"
                  )}
                >
                  <div className="font-semibold text-white mb-1">{grade.label}</div>
                  <div className="text-[13px] text-[rgba(255,255,255,0.60)]">{grade.description}</div>
                </button>
              ))}
            </div>

            <Button
              type="submit"
              disabled={!selectedGrade}
              className={cn(
                "w-full bg-gradient-to-br from-[#3B82F6] to-[#2563EB]",
                "text-white border-0",
                "shadow-[0_4px_16px_rgba(59,130,246,0.25)]",
                "hover:from-[#2563EB] hover:to-[#1D4ED8]",
                "hover:shadow-[0_4px_16px_rgba(59,130,246,0.30)]",
                "hover:scale-[1.01]",
                "active:from-[#1D4ED8] active:to-[#1D4ED8]",
                "active:scale-[0.99]",
                "h-[44px] text-[14px] font-medium",
                "rounded-[12px]",
                "transition-all duration-200",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              Continue
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};

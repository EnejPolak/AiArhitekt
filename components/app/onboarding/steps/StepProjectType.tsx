"use client";

import * as React from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { ChatMessage } from "../ChatMessage";

export interface StepProjectTypeProps {
  data: { type: "new-construction" | "renovation" | "extension" | null; renovationCondition?: "poor" | "medium" | "good" | null } | null;
  onComplete: (data: { type: "new-construction" | "renovation" | "extension"; renovationCondition?: "poor" | "medium" | "good" | null }) => void;
}

const PROJECT_TYPES = [
  {
    id: "new-construction",
    label: "New Construction",
    description: "Building from scratch on an empty plot.",
  },
  {
    id: "renovation",
    label: "Renovation",
    description: "Updating or improving an existing building.",
  },
  {
    id: "extension",
    label: "Extension",
    description: "Adding space to an existing building.",
  },
];

const RENOVATION_CONDITIONS = [
  { id: "poor", label: "Poor", description: "Full reconstruction needed" },
  { id: "medium", label: "Medium", description: "Partial renovation required" },
  { id: "good", label: "Good", description: "Mostly cosmetic changes" },
];

export const StepProjectType: React.FC<StepProjectTypeProps> = ({ data, onComplete }) => {
  const [selectedType, setSelectedType] = React.useState<"new-construction" | "renovation" | "extension" | null>(data?.type || null);
  const [renovationCondition, setRenovationCondition] = React.useState<"poor" | "medium" | "good" | null>(data?.renovationCondition || null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedType) {
      onComplete({
        type: selectedType,
        renovationCondition: selectedType === "renovation" ? renovationCondition : null,
      });
    }
  };

  return (
    <div className="space-y-6">
      <ChatMessage
        type="ai"
        content={`**Step 2 — Project Type**

What kind of project are you planning?`}
      />
      <div className="flex justify-start">
        <div className="max-w-[85%] rounded-[16px] px-5 py-5 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)]">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-3">
              {PROJECT_TYPES.map((type) => (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => setSelectedType(type.id as any)}
                  className={cn(
                    "text-left p-4 rounded-lg border-2 transition-all",
                    selectedType === type.id
                      ? "bg-[rgba(59,130,246,0.10)] border-[#3B82F6] shadow-[0_0_16px_rgba(59,130,246,0.20)]"
                      : "bg-[rgba(255,255,255,0.03)] border-[rgba(255,255,255,0.10)] hover:border-[rgba(255,255,255,0.15)]"
                  )}
                >
                  <div className="font-semibold text-white mb-1">{type.label}</div>
                  <div className="text-[13px] text-[rgba(255,255,255,0.60)]">{type.description}</div>
                </button>
              ))}
            </div>

            {selectedType === "renovation" && (
              <div className="pt-2 border-t border-[rgba(255,255,255,0.08)]">
                <label className="block text-[13px] font-medium text-[rgba(255,255,255,0.70)] mb-3">
                  Renovation condition
                </label>
                <div className="grid grid-cols-1 gap-2">
                  {RENOVATION_CONDITIONS.map((condition) => (
                    <button
                      key={condition.id}
                      type="button"
                      onClick={() => setRenovationCondition(condition.id as any)}
                      className={cn(
                        "text-left p-3 rounded-lg border-2 transition-all",
                        renovationCondition === condition.id
                          ? "bg-[rgba(59,130,246,0.10)] border-[#3B82F6]"
                          : "bg-[rgba(255,255,255,0.03)] border-[rgba(255,255,255,0.10)] hover:border-[rgba(255,255,255,0.15)]"
                      )}
                    >
                      <div className="font-medium text-white text-[13px] mb-0.5">{condition.label}</div>
                      <div className="text-[12px] text-[rgba(255,255,255,0.60)]">{condition.description}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <Button
              type="submit"
              disabled={!selectedType || (selectedType === "renovation" && !renovationCondition)}
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

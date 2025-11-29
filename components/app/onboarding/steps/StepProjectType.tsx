"use client";

import * as React from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { ChatMessage } from "../ChatMessage";

export interface StepProjectTypeProps {
  data: { type: "new-build" | "renovation" | "interior-only" | null; livesInBuilding: boolean | null } | null;
  onComplete: (data: { type: "new-build" | "renovation" | "interior-only"; livesInBuilding: boolean | null }) => void;
}

const PROJECT_TYPES = [
  {
    id: "new-build",
    label: "New build",
    description: "From empty plot to full new house.",
  },
  {
    id: "renovation",
    label: "Renovation",
    description: "Updating or expanding an existing building.",
  },
  {
    id: "interior-only",
    label: "Interior only",
    description: "Focus on layout and interior design.",
  },
];

export const StepProjectType: React.FC<StepProjectTypeProps> = ({ data, onComplete }) => {
  const [selectedType, setSelectedType] = React.useState<"new-build" | "renovation" | "interior-only" | null>(data?.type || null);
  const [livesInBuilding, setLivesInBuilding] = React.useState<boolean | null>(data?.livesInBuilding ?? null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedType) {
      onComplete({
        type: selectedType,
        livesInBuilding: selectedType !== "new-build" ? livesInBuilding : null,
      });
    }
  };

  return (
    <div className="space-y-6">
      <ChatMessage
        type="ai"
        content={`**Step 3 — Project type**

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

            {(selectedType === "renovation" || selectedType === "interior-only") && (
              <div>
                <label className="block text-[13px] font-medium text-[rgba(255,255,255,0.70)] mb-3">
                  Do you already live in this building?
                </label>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setLivesInBuilding(true)}
                    className={cn(
                      "flex-1 px-4 py-2 rounded-lg text-[13px] font-medium transition-all",
                      livesInBuilding === true
                        ? "bg-[rgba(59,130,246,0.15)] border border-[#3B82F6] text-white"
                        : "bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.10)] text-[rgba(255,255,255,0.70)] hover:border-[rgba(255,255,255,0.15)]"
                    )}
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    onClick={() => setLivesInBuilding(false)}
                    className={cn(
                      "flex-1 px-4 py-2 rounded-lg text-[13px] font-medium transition-all",
                      livesInBuilding === false
                        ? "bg-[rgba(59,130,246,0.15)] border border-[#3B82F6] text-white"
                        : "bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.10)] text-[rgba(255,255,255,0.70)] hover:border-[rgba(255,255,255,0.15)]"
                    )}
                  >
                    No
                  </button>
                </div>
              </div>
            )}

            <Button
              type="submit"
              disabled={!selectedType || (selectedType !== "new-build" && livesInBuilding === null)}
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



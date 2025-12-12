"use client";

import * as React from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { ChatMessage } from "../ChatMessage";

export interface StepFurnitureStyleProps {
  data: "minimalist" | "cozy" | "luxury" | "functional" | "scandinavian" | "industrial" | null;
  onComplete: (data: "minimalist" | "cozy" | "luxury" | "functional" | "scandinavian" | "industrial") => void;
}

const FURNITURE_STYLES = [
  { id: "minimalist", label: "Minimalist" },
  { id: "cozy", label: "Cozy / Warm" },
  { id: "luxury", label: "Luxury" },
  { id: "functional", label: "Functional" },
  { id: "scandinavian", label: "Scandinavian" },
  { id: "industrial", label: "Industrial" },
] as const;

export const StepFurnitureStyle: React.FC<StepFurnitureStyleProps> = ({ data, onComplete }) => {
  const [selectedStyle, setSelectedStyle] = React.useState<typeof FURNITURE_STYLES[number]["id"] | null>(data || null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedStyle) {
      onComplete(selectedStyle);
    }
  };

  return (
    <div className="space-y-6">
      <ChatMessage
        type="ai"
        content={`**Step 9 — Furniture Style**

What furniture style do you prefer?`}
      />
      <div className="flex justify-start">
        <div className="max-w-[85%] rounded-[16px] px-5 py-5 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)]">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {FURNITURE_STYLES.map((style) => (
                <button
                  key={style.id}
                  type="button"
                  onClick={() => setSelectedStyle(style.id)}
                  className={cn(
                    "p-4 rounded-lg border-2 transition-all text-center",
                    selectedStyle === style.id
                      ? "bg-[rgba(59,130,246,0.10)] border-[#3B82F6] shadow-[0_0_16px_rgba(59,130,246,0.20)]"
                      : "bg-[rgba(255,255,255,0.03)] border-[rgba(255,255,255,0.10)] hover:border-[rgba(255,255,255,0.15)]"
                  )}
                >
                  <div className="font-semibold text-white text-[14px]">{style.label}</div>
                </button>
              ))}
            </div>

            <Button
              type="submit"
              disabled={!selectedStyle}
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

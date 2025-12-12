"use client";

import * as React from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { ChatMessage } from "../ChatMessage";

export interface StepRenderAngleProps {
  data: "eye-level" | "bird-eye" | "corner-view" | "straight-perspective" | "isometric" | null;
  onComplete: (data: "eye-level" | "bird-eye" | "corner-view" | "straight-perspective" | "isometric") => void;
}

const RENDER_ANGLES = [
  { id: "eye-level", label: "Eye-level", description: "Most realistic" },
  { id: "bird-eye", label: "Bird's eye", description: "Top-down view" },
  { id: "corner-view", label: "Corner view", description: "Diagonal perspective" },
  { id: "straight-perspective", label: "Straight perspective", description: "Front-facing" },
  { id: "isometric", label: "Isometric", description: "Technical view" },
] as const;

export const StepRenderAngle: React.FC<StepRenderAngleProps> = ({ data, onComplete }) => {
  const [selectedAngle, setSelectedAngle] = React.useState<typeof RENDER_ANGLES[number]["id"] | null>(data || null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedAngle) {
      onComplete(selectedAngle);
    }
  };

  return (
    <div className="space-y-6">
      <ChatMessage
        type="ai"
        content={`**Step 11 — Render Angle**

Choose the viewing angle for your 3D render. This goes directly into the AI prompt.`}
      />
      <div className="flex justify-start">
        <div className="max-w-[85%] rounded-[16px] px-5 py-5 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)]">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-3">
              {RENDER_ANGLES.map((angle) => (
                <button
                  key={angle.id}
                  type="button"
                  onClick={() => setSelectedAngle(angle.id)}
                  className={cn(
                    "text-left p-4 rounded-lg border-2 transition-all",
                    selectedAngle === angle.id
                      ? "bg-[rgba(59,130,246,0.10)] border-[#3B82F6] shadow-[0_0_16px_rgba(59,130,246,0.20)]"
                      : "bg-[rgba(255,255,255,0.03)] border-[rgba(255,255,255,0.10)] hover:border-[rgba(255,255,255,0.15)]"
                  )}
                >
                  <div className="font-semibold text-white mb-1">{angle.label}</div>
                  <div className="text-[13px] text-[rgba(255,255,255,0.60)]">{angle.description}</div>
                </button>
              ))}
            </div>

            <Button
              type="submit"
              disabled={!selectedAngle}
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

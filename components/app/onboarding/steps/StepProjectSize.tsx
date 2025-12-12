"use client";

import * as React from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { ChatMessage } from "../ChatMessage";

export interface StepProjectSizeProps {
  data: { size: number | null; rooms: number | null; ceilingHeight: "standard" | "high" | null } | null;
  onComplete: (data: { size: number; rooms: number; ceilingHeight: "standard" | "high" }) => void;
}

const CEILING_HEIGHTS = [
  { id: "standard", label: "Standard" },
  { id: "high", label: "High" },
];

export const StepProjectSize: React.FC<StepProjectSizeProps> = ({ data, onComplete }) => {
  const [size, setSize] = React.useState<string>(data?.size?.toString() || "");
  const [rooms, setRooms] = React.useState<string>(data?.rooms?.toString() || "");
  const [ceilingHeight, setCeilingHeight] = React.useState<"standard" | "high" | null>(data?.ceilingHeight || null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const sizeNum = parseFloat(size);
    const roomsNum = parseInt(rooms);
    if (sizeNum > 0 && roomsNum > 0 && ceilingHeight) {
      onComplete({
        size: sizeNum,
        rooms: roomsNum,
        ceilingHeight,
      });
    }
  };

  return (
    <div className="space-y-6">
      <ChatMessage
        type="ai"
        content={`**Step 4 — Project Size**

Tell us about the size and layout of your project.`}
      />
      <div className="flex justify-start">
        <div className="max-w-[85%] rounded-[16px] px-5 py-5 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)]">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[13px] font-medium text-[rgba(255,255,255,0.70)] mb-2">
                Project size (m²)
              </label>
              <input
                type="number"
                value={size}
                onChange={(e) => setSize(e.target.value)}
                placeholder="150"
                min="1"
                step="1"
                required
                className={cn(
                  "w-full h-[40px] px-3 rounded-lg",
                  "bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.10)]",
                  "text-[14px] text-white placeholder-[rgba(255,255,255,0.40)]",
                  "focus:outline-none focus:border-[rgba(59,130,246,0.40)]",
                  "transition-colors"
                )}
              />
            </div>

            <div>
              <label className="block text-[13px] font-medium text-[rgba(255,255,255,0.70)] mb-2">
                Number of rooms
              </label>
              <input
                type="number"
                value={rooms}
                onChange={(e) => setRooms(e.target.value)}
                placeholder="4"
                min="1"
                step="1"
                required
                className={cn(
                  "w-full h-[40px] px-3 rounded-lg",
                  "bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.10)]",
                  "text-[14px] text-white placeholder-[rgba(255,255,255,0.40)]",
                  "focus:outline-none focus:border-[rgba(59,130,246,0.40)]",
                  "transition-colors"
                )}
              />
            </div>

            <div>
              <label className="block text-[13px] font-medium text-[rgba(255,255,255,0.70)] mb-2">
                Ceiling height
              </label>
              <div className="grid grid-cols-2 gap-2">
                {CEILING_HEIGHTS.map((height) => (
                  <button
                    key={height.id}
                    type="button"
                    onClick={() => setCeilingHeight(height.id as any)}
                    className={cn(
                      "px-4 py-2 rounded-lg text-[13px] font-medium transition-all",
                      ceilingHeight === height.id
                        ? "bg-[rgba(59,130,246,0.15)] border border-[#3B82F6] text-white"
                        : "bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.10)] text-[rgba(255,255,255,0.70)] hover:border-[rgba(255,255,255,0.15)]"
                    )}
                  >
                    {height.label}
                  </button>
                ))}
              </div>
            </div>

            <Button
              type="submit"
              disabled={!size || parseFloat(size) <= 0 || !rooms || parseInt(rooms) <= 0 || !ceilingHeight}
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

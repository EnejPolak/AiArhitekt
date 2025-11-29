"use client";

import * as React from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { ChatMessage } from "../ChatMessage";

export interface StepPlotSizeProps {
  data: { size: number | null; approximate: boolean } | null;
  onComplete: (data: { size: number; approximate: boolean }) => void;
}

export const StepPlotSize: React.FC<StepPlotSizeProps> = ({ data, onComplete }) => {
  const [size, setSize] = React.useState<string>(data?.size?.toString() || "");
  const [approximate, setApproximate] = React.useState(data?.approximate || false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const sizeNum = parseFloat(size);
    if (sizeNum > 0) {
      onComplete({ size: sizeNum, approximate });
    }
  };

  return (
    <div className="space-y-6">
      <ChatMessage
        type="ai"
        content={`**Step 2 — Plot size**

Rough size of the land helps us estimate volume, scale and possible layouts.`}
      />
      <div className="flex justify-start">
        <div className="max-w-[85%] rounded-[16px] px-5 py-5 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)]">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[13px] font-medium text-[rgba(255,255,255,0.70)] mb-2">
                Plot size (m²)
              </label>
              <input
                type="number"
                value={size}
                onChange={(e) => setSize(e.target.value)}
                placeholder="500"
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
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={approximate}
                onChange={(e) => setApproximate(e.target.checked)}
                className="w-4 h-4 rounded border-[rgba(255,255,255,0.18)] bg-[rgba(255,255,255,0.04)] text-[#3B82F6] focus:ring-[rgba(59,130,246,0.3)] focus:ring-offset-0"
              />
              <span className="text-[13px] text-[rgba(255,255,255,0.70)]">
                I'm not sure — approximate only
              </span>
            </label>
            <Button
              type="submit"
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
                "transition-all duration-200"
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



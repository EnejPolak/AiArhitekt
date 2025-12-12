"use client";

import * as React from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { ChatMessage } from "../ChatMessage";

export interface StepBudgetRangeProps {
  data: { min: number; max: number; strictness: "strict" | "flexible" | null } | null;
  onComplete: (data: { min: number; max: number; strictness: "strict" | "flexible" }) => void;
}

const MIN_BUDGET = 5000;
const MAX_BUDGET = 100000;

export const StepBudgetRange: React.FC<StepBudgetRangeProps> = ({ data, onComplete }) => {
  const [min, setMin] = React.useState<number>(data?.min || 5000);
  const [max, setMax] = React.useState<number>(data?.max || 50000);
  const [strictness, setStrictness] = React.useState<"strict" | "flexible" | null>(data?.strictness || null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (strictness) {
      onComplete({ min, max, strictness });
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
    }).format(value);
  };

  return (
    <div className="space-y-6">
      <ChatMessage
        type="ai"
        content={`**Step 12 — Budget Range**

Set your budget range. The AI will consider this in the cost estimate.`}
      />
      <div className="flex justify-start">
        <div className="max-w-[85%] rounded-[16px] px-5 py-5 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)]">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[13px] font-medium text-[rgba(255,255,255,0.70)] mb-2">
                Budget range
              </label>
              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[12px] text-[rgba(255,255,255,0.60)]">Min: {formatCurrency(min)}</span>
                    <span className="text-[12px] text-[rgba(255,255,255,0.60)]">Max: {formatCurrency(max)}</span>
                  </div>
                  <div className="space-y-2">
                    <input
                      type="range"
                      min={MIN_BUDGET}
                      max={MAX_BUDGET}
                      value={min}
                      onChange={(e) => {
                        const newMin = parseInt(e.target.value);
                        setMin(Math.min(newMin, max - 1000));
                      }}
                      className="w-full"
                    />
                    <input
                      type="range"
                      min={MIN_BUDGET}
                      max={MAX_BUDGET}
                      value={max}
                      onChange={(e) => {
                        const newMax = parseInt(e.target.value);
                        setMax(Math.max(newMax, min + 1000));
                      }}
                      className="w-full"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-[13px] font-medium text-[rgba(255,255,255,0.70)] mb-2">
                Budget strictness
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setStrictness("strict")}
                  className={cn(
                    "px-4 py-2 rounded-lg text-[13px] font-medium transition-all",
                    strictness === "strict"
                      ? "bg-[rgba(59,130,246,0.15)] border border-[#3B82F6] text-white"
                      : "bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.10)] text-[rgba(255,255,255,0.70)] hover:border-[rgba(255,255,255,0.15)]"
                  )}
                >
                  Strict
                </button>
                <button
                  type="button"
                  onClick={() => setStrictness("flexible")}
                  className={cn(
                    "px-4 py-2 rounded-lg text-[13px] font-medium transition-all",
                    strictness === "flexible"
                      ? "bg-[rgba(59,130,246,0.15)] border border-[#3B82F6] text-white"
                      : "bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.10)] text-[rgba(255,255,255,0.70)] hover:border-[rgba(255,255,255,0.15)]"
                  )}
                >
                  Flexible
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={!strictness}
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

"use client";

import * as React from "react";

export interface Step8bBudgetSplitProps {
  roomType: string;
  budgetLevel: string;
  totalBudget: { min: number; max: number };
  preferences: any;
  onBudgetPlanComplete: (plan: {
    caps: Record<string, { max: number; qty: number }>;
    reservedBufferRatio: number;
    totalBudget: number;
  }) => void;
}

export const Step8bBudgetSplit: React.FC<Step8bBudgetSplitProps> = ({
  roomType,
  budgetLevel,
  totalBudget,
  preferences,
  onBudgetPlanComplete,
}) => {
  const [budgetPlan, setBudgetPlan] = React.useState<{
    caps: Record<string, { max: number; qty: number }>;
    reservedBufferRatio: number;
    totalBudget: number;
  } | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const lastRunKeyRef = React.useRef<string>("");

  React.useEffect(() => {
    const runKey = `${roomType}|${budgetLevel}|${totalBudget.max}`;
    if (lastRunKeyRef.current === runKey) return;
    lastRunKeyRef.current = runKey;

    const generateBudgetPlan = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/budget-plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roomType,
            budgetLevel,
            totalBudget,
            preferences,
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to generate budget plan");
        }

        const data = await response.json();
        setBudgetPlan(data);
        onBudgetPlanComplete(data);
      } catch (err: any) {
        console.error("Error generating budget plan:", err);
        setError(err.message || "Failed to generate budget plan");
        // Fallback: use average of min/max
        const avgBudget = Math.round((totalBudget.min + totalBudget.max) / 2);
        const fallbackPlan = {
          caps: {
            "Paint & Wall Finishes": { max: Math.round(avgBudget * 0.15), qty: 1 },
            "Flooring": { max: Math.round(avgBudget * 0.25), qty: 1 },
            "Furniture": { max: Math.round(avgBudget * 0.35), qty: 1 },
            "Lighting": { max: Math.round(avgBudget * 0.10), qty: 1 },
            "Decor & Accessories": { max: Math.round(avgBudget * 0.10), qty: 1 },
          },
          reservedBufferRatio: 0.05,
          totalBudget: avgBudget,
        };
        setBudgetPlan(fallbackPlan);
        onBudgetPlanComplete(fallbackPlan);
      } finally {
        setIsLoading(false);
      }
    };

    generateBudgetPlan();
  }, [roomType, budgetLevel, totalBudget, preferences, onBudgetPlanComplete]);

  if (isLoading) {
    return (
      <div className="flex justify-start mb-6">
        <div className="max-w-[85%] rounded-[16px] px-6 py-5 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)]">
          <div className="text-[15px] text-[rgba(255,255,255,0.85)] leading-relaxed">
            Allocating budget into category caps…
          </div>
        </div>
      </div>
    );
  }

  if (error && !budgetPlan) {
    return (
      <div className="flex justify-start mb-6">
        <div className="max-w-[85%] rounded-[16px] px-6 py-5 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)]">
          <div className="text-[15px] text-[rgba(255,255,255,0.85)] leading-relaxed">
            {error}
          </div>
        </div>
      </div>
    );
  }

  // Budget plan will be shown in conversation timeline
  return null;
};

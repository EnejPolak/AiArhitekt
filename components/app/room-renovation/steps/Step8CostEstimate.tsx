"use client";

import * as React from "react";

export interface Step8CostEstimateProps {
  roomType: string;
  budget: string;
  onEstimateComplete: (estimate: {
    materials: { min: number; max: number };
    furniture: { min: number; max: number };
    labor: { min: number; max: number };
    total: { min: number; max: number };
  }) => void;
}

export const Step8CostEstimate: React.FC<Step8CostEstimateProps> = ({
  roomType,
  budget,
  onEstimateComplete,
}) => {
  const [estimate, setEstimate] = React.useState<{
    materials: { min: number; max: number };
    furniture: { min: number; max: number };
    labor: { min: number; max: number };
    total: { min: number; max: number };
  } | null>(null);
  const lastRunKeyRef = React.useRef<string>("");

  React.useEffect(() => {
    const runKey = `${roomType}|${budget}`;
    // Prevent double-run in React StrictMode for same inputs
    if (lastRunKeyRef.current === runKey) return;
    lastRunKeyRef.current = runKey;

    // Calculate estimate based on room type and budget
    const baseMultiplier = {
      "budget-friendly": 0.7,
      balanced: 1.0,
      premium: 1.5,
      "not-sure": 1.0,
    }[budget] || 1.0;

    const roomBase = {
      kitchen: 15000,
      bathroom: 8000,
      bedroom: 5000,
      "living-room": 7000,
      other: 6000,
    }[roomType] || 6000;

    const materials = {
      min: Math.round(roomBase * baseMultiplier * 0.4),
      max: Math.round(roomBase * baseMultiplier * 0.5),
    };

    const furniture = {
      min: Math.round(roomBase * baseMultiplier * 0.3),
      max: Math.round(roomBase * baseMultiplier * 0.4),
    };

    const labor = {
      min: Math.round(roomBase * baseMultiplier * 0.2),
      max: Math.round(roomBase * baseMultiplier * 0.3),
    };

    const total = {
      min: materials.min + furniture.min + labor.min,
      max: materials.max + furniture.max + labor.max,
    };

    const calculatedEstimate = { materials, furniture, labor, total };
    setEstimate(calculatedEstimate);
    onEstimateComplete(calculatedEstimate);
  }, [roomType, budget, onEstimateComplete]);

  if (!estimate) {
    return (
      <div className="flex justify-start mb-6">
        <div className="max-w-[85%] rounded-[16px] px-6 py-5 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)]">
          <div className="text-[15px] text-[rgba(255,255,255,0.85)] leading-relaxed">
            Calculating estimate...
          </div>
        </div>
      </div>
    );
  }

  // Cost breakdown will be shown in conversation timeline
  return null;
};

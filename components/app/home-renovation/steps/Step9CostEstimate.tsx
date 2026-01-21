"use client";

import * as React from "react";

export interface Step9CostEstimateProps {
  homeType: "apartment" | "house" | "townhouse" | "other";
  renovationScope: string[];
  budget: "essential" | "balanced" | "high-end" | "not-sure";
  onEstimateComplete: (estimate: {
    rooms: Array<{ name: string; min: number; max: number }>;
    systems: Array<{ name: string; min: number; max: number }>;
    labor: { min: number; max: number };
    materials: { min: number; max: number };
    total: { min: number; max: number };
  }) => void;
}

export const Step9CostEstimate: React.FC<Step9CostEstimateProps> = ({
  homeType,
  renovationScope,
  budget,
  onEstimateComplete,
}) => {
  React.useEffect(() => {
    // Calculate estimate based on inputs
    // This is a placeholder - in production, this would call an API
    const calculateEstimate = () => {
      const baseMultiplier = {
        essential: 1,
        balanced: 1.5,
        "high-end": 2.5,
        "not-sure": 1.5,
      }[budget];

      const roomCosts = renovationScope
        .filter((s) => !s.includes("floors") && !s.includes("electrical"))
        .map((room) => ({
          name: room.charAt(0).toUpperCase() + room.slice(1),
          min: Math.round(5000 * baseMultiplier),
          max: Math.round(15000 * baseMultiplier),
        }));

      const systemCosts = renovationScope
        .filter((s) => s.includes("floors") || s.includes("electrical"))
        .map((system) => ({
          name: system.charAt(0).toUpperCase() + system.slice(1),
          min: Math.round(3000 * baseMultiplier),
          max: Math.round(8000 * baseMultiplier),
        }));

      const laborMin = roomCosts.length * 2000 * baseMultiplier;
      const laborMax = roomCosts.length * 5000 * baseMultiplier;

      const materialsMin = roomCosts.reduce((sum, r) => sum + r.min, 0) * 0.6;
      const materialsMax = roomCosts.reduce((sum, r) => sum + r.max, 0) * 0.6;

      const totalMin = laborMin + materialsMin + systemCosts.reduce((sum, s) => sum + s.min, 0);
      const totalMax = laborMax + materialsMax + systemCosts.reduce((sum, s) => sum + s.max, 0);

      onEstimateComplete({
        rooms: roomCosts,
        systems: systemCosts,
        labor: { min: Math.round(laborMin), max: Math.round(laborMax) },
        materials: { min: Math.round(materialsMin), max: Math.round(materialsMax) },
        total: { min: Math.round(totalMin), max: Math.round(totalMax) },
      });
    };

    calculateEstimate();
  }, [homeType, renovationScope, budget, onEstimateComplete]);

  // AI message and cost breakdown will be shown in conversation
  return null;
};

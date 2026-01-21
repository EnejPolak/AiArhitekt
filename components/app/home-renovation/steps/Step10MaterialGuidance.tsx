"use client";

import * as React from "react";

export interface Step10MaterialGuidanceProps {
  styles: string[];
  scope: string[];
  onGuidanceComplete: (guidance: Array<{
    category: string;
    items: Array<{ name: string; description: string }>;
  }>) => void;
}

export const Step10MaterialGuidance: React.FC<Step10MaterialGuidanceProps> = ({
  styles,
  scope,
  onGuidanceComplete,
}) => {
  React.useEffect(() => {
    // Generate material guidance based on styles and scope
    // This is a placeholder - in production, this would call an API
    const generateGuidance = () => {
      const guidance = [
        {
          category: "Flooring",
          items: [
            { name: "Engineered hardwood", description: "Durable and warm, suitable for most areas" },
            { name: "Porcelain tiles", description: "Water-resistant, ideal for kitchens and bathrooms" },
          ],
        },
        {
          category: "Wall finishes",
          items: [
            { name: "Premium paint", description: "Low-VOC, washable finish" },
            { name: "Wallpaper accents", description: "Feature walls in key areas" },
          ],
        },
        {
          category: "Lighting",
          items: [
            { name: "LED downlights", description: "Energy-efficient ambient lighting" },
            { name: "Task lighting", description: "Focused illumination for work areas" },
          ],
        },
        {
          category: "Fixtures",
          items: [
            { name: "Modern faucets", description: "Water-efficient, contemporary design" },
            { name: "Cabinet hardware", description: "Soft-close mechanisms, premium finishes" },
          ],
        },
      ];

      onGuidanceComplete(guidance);
    };

    generateGuidance();
  }, [styles, scope, onGuidanceComplete]);

  // AI message and material guidance will be shown in conversation
  return null;
};

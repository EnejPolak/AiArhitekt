"use client";

import * as React from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { ChatMessage } from "../ChatMessage";

export interface StepSpecialRequirementsProps {
  data: {
    heating?: string;
    flooring?: string;
    colors?: string;
    furnitureMustHave?: string;
    kitchenBathroomNeeds?: string;
  } | null;
  onComplete: (data: {
    heating?: string;
    flooring?: string;
    colors?: string;
    furnitureMustHave?: string;
    kitchenBathroomNeeds?: string;
  }) => void;
}

const InputField = React.memo(({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) => (
  <div>
    <label className="block text-[13px] font-medium text-[rgba(255,255,255,0.70)] mb-2">
      {label} <span className="text-[rgba(255,255,255,0.40)]">(optional)</span>
    </label>
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn(
        "w-full h-[40px] px-3 rounded-lg",
        "bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.10)]",
        "text-[14px] text-white placeholder-[rgba(255,255,255,0.40)]",
        "focus:outline-none focus:border-[rgba(59,130,246,0.40)]",
        "transition-colors"
      )}
    />
  </div>
));

InputField.displayName = "InputField";

export const StepSpecialRequirements: React.FC<StepSpecialRequirementsProps> = ({ data, onComplete }) => {
  const [heating, setHeating] = React.useState(data?.heating || "");
  const [flooring, setFlooring] = React.useState(data?.flooring || "");
  const [colors, setColors] = React.useState(data?.colors || "");
  const [furnitureMustHave, setFurnitureMustHave] = React.useState(data?.furnitureMustHave || "");
  const [kitchenBathroomNeeds, setKitchenBathroomNeeds] = React.useState(data?.kitchenBathroomNeeds || "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onComplete({
      heating: heating.trim() || undefined,
      flooring: flooring.trim() || undefined,
      colors: colors.trim() || undefined,
      furnitureMustHave: furnitureMustHave.trim() || undefined,
      kitchenBathroomNeeds: kitchenBathroomNeeds.trim() || undefined,
    });
  };

  return (
    <div className="space-y-6">
      <ChatMessage
        type="ai"
        content={`**Step 13 — Special Requirements**

Any special preferences or requirements? This is optional but helps us customize your project better.`}
      />
      <div className="flex justify-start">
        <div className="max-w-[85%] rounded-[16px] px-5 py-5 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)]">
          <form onSubmit={handleSubmit} className="space-y-4">
            <InputField
              label="Heating preferences"
              value={heating}
              onChange={setHeating}
              placeholder="e.g., Underfloor heating, radiators"
            />
            <InputField
              label="Flooring preferences"
              value={flooring}
              onChange={setFlooring}
              placeholder="e.g., Hardwood, tiles, carpet"
            />
            <InputField
              label="Colors you like"
              value={colors}
              onChange={setColors}
              placeholder="e.g., Warm neutrals, blue accents"
            />
            <InputField
              label="Furniture must-have items"
              value={furnitureMustHave}
              onChange={setFurnitureMustHave}
              placeholder="e.g., Large dining table, reading nook"
            />
            <InputField
              label="Kitchen/bathroom special needs"
              value={kitchenBathroomNeeds}
              onChange={setKitchenBathroomNeeds}
              placeholder="e.g., Double sink, walk-in shower"
            />

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

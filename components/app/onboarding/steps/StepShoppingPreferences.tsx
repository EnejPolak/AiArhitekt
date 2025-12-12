"use client";

import * as React from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { ChatMessage } from "../ChatMessage";

export interface StepShoppingPreferencesProps {
  data: {
    flooring?: "local" | "online" | "mixed" | "inspiration_only";
    paint?: "local" | "online" | "mixed" | "inspiration_only";
    lighting?: "local" | "online" | "mixed" | "inspiration_only";
    kitchen?: "local" | "online" | "mixed" | "inspiration_only";
    bathroom?: "local" | "online" | "mixed" | "inspiration_only";
    furniture?: "local" | "online" | "mixed" | "inspiration_only";
    decor?: "local" | "online" | "mixed" | "inspiration_only";
  } | null;
  onComplete: (data: {
    flooring: "local" | "online" | "mixed" | "inspiration_only";
    paint: "local" | "online" | "mixed" | "inspiration_only";
    lighting: "local" | "online" | "mixed" | "inspiration_only";
    kitchen: "local" | "online" | "mixed" | "inspiration_only";
    bathroom: "local" | "online" | "mixed" | "inspiration_only";
    furniture: "local" | "online" | "mixed" | "inspiration_only";
    decor: "local" | "online" | "mixed" | "inspiration_only";
  }) => void;
}

const PREFERENCE_OPTIONS = [
  { id: "local", label: "Local", description: "Stores within radius" },
  { id: "online", label: "Online", description: "EU stores (delivery to Slovenia)" },
  { id: "mixed", label: "Mixed", description: "AI chooses best option" },
  { id: "inspiration_only", label: "Inspiration only", description: "Style only, no pricing" },
] as const;

const PRODUCT_CATEGORIES = [
  { id: "flooring", label: "Flooring" },
  { id: "paint", label: "Paint" },
  { id: "lighting", label: "Lighting" },
  { id: "kitchen", label: "Kitchen" },
  { id: "bathroom", label: "Bathroom" },
  { id: "furniture", label: "Furniture" },
  { id: "decor", label: "Decor" },
] as const;

export const StepShoppingPreferences: React.FC<StepShoppingPreferencesProps> = ({ data, onComplete }) => {
  const [preferences, setPreferences] = React.useState<Record<string, "local" | "online" | "mixed" | "inspiration_only">>({
    flooring: data?.flooring || "mixed",
    paint: data?.paint || "mixed",
    lighting: data?.lighting || "mixed",
    kitchen: data?.kitchen || "mixed",
    bathroom: data?.bathroom || "mixed",
    furniture: data?.furniture || "mixed",
    decor: data?.decor || "mixed",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onComplete({
      flooring: preferences.flooring || "mixed",
      paint: preferences.paint || "mixed",
      lighting: preferences.lighting || "mixed",
      kitchen: preferences.kitchen || "mixed",
      bathroom: preferences.bathroom || "mixed",
      furniture: preferences.furniture || "mixed",
      decor: preferences.decor || "mixed",
    });
  };

  const setPreference = (category: string, value: "local" | "online" | "mixed" | "inspiration_only") => {
    setPreferences((prev) => ({ ...prev, [category]: value }));
  };

  return (
    <div className="space-y-6">
      <ChatMessage
        type="ai"
        content={`**Step 10 — Shopping Preferences**

Choose where each product category should be sourced. This affects store selection, pricing, and product recommendations.`}
      />
      <div className="flex justify-start">
        <div className="max-w-[95%] rounded-[16px] px-5 py-5 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)]">
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-3 gap-4">
              {PRODUCT_CATEGORIES.map((category) => (
                <div key={category.id} className="space-y-2">
                  <label className="block text-[13px] font-semibold text-white mb-1.5">
                    {category.label}
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {PREFERENCE_OPTIONS.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setPreference(category.id, option.id)}
                        className={cn(
                          "text-center p-2 rounded-lg border-2 transition-all",
                          preferences[category.id] === option.id
                            ? "bg-[rgba(59,130,246,0.10)] border-[#3B82F6] shadow-[0_0_8px_rgba(59,130,246,0.20)]"
                            : "bg-[rgba(255,255,255,0.03)] border-[rgba(255,255,255,0.10)] hover:border-[rgba(255,255,255,0.15)]"
                        )}
                      >
                        <div className="font-medium text-white text-[11px] mb-0.5">{option.label}</div>
                        <div className="text-[9px] text-[rgba(255,255,255,0.60)] leading-tight">{option.description}</div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

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

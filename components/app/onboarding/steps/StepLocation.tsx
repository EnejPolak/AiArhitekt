"use client";

import * as React from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { ChatMessage } from "../ChatMessage";

export interface StepLocationProps {
  data: { country: string; city: string; street?: string } | null;
  onComplete: (data: { country: string; city: string; street?: string }) => void;
}

export const StepLocation: React.FC<StepLocationProps> = ({ data, onComplete }) => {
  const [country, setCountry] = React.useState(data?.country || "");
  const [city, setCity] = React.useState(data?.city || "");
  const [street, setStreet] = React.useState(data?.street || "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (country && city) {
      onComplete({ country, city, street: street || undefined });
    }
  };

  return (
    <div className="space-y-6">
      <ChatMessage
        type="ai"
        content={`**Step 1 — Location**

Let's start with where your project is located. This helps us understand building style and potential regulations.`}
      />
      <div className="flex justify-start">
        <div className="max-w-[85%] rounded-[16px] px-5 py-5 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)]">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[13px] font-medium text-[rgba(255,255,255,0.70)] mb-2">
                Country
              </label>
              <input
                type="text"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder="Slovenia"
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
                City / Town
              </label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Ljubljana"
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
                Street / Plot reference <span className="text-[rgba(255,255,255,0.40)]">(optional)</span>
              </label>
              <input
                type="text"
                value={street}
                onChange={(e) => setStreet(e.target.value)}
                placeholder="Street name or plot number"
                className={cn(
                  "w-full h-[40px] px-3 rounded-lg",
                  "bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.10)]",
                  "text-[14px] text-white placeholder-[rgba(255,255,255,0.40)]",
                  "focus:outline-none focus:border-[rgba(59,130,246,0.40)]",
                  "transition-colors"
                )}
              />
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



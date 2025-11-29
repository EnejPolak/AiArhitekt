"use client";

import * as React from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { ChatMessage } from "../ChatMessage";

export interface StepDocumentsProps {
  data: {
    hasOfficialPlans: boolean;
    hasSketch: boolean;
    hasNoPlans: boolean;
    hasPermitDrawings: boolean;
  } | null;
  onComplete: (data: {
    hasOfficialPlans: boolean;
    hasSketch: boolean;
    hasNoPlans: boolean;
    hasPermitDrawings: boolean;
  }) => void;
}

export const StepDocuments: React.FC<StepDocumentsProps> = ({ data, onComplete }) => {
  const [hasOfficialPlans, setHasOfficialPlans] = React.useState(data?.hasOfficialPlans || false);
  const [hasSketch, setHasSketch] = React.useState(data?.hasSketch || false);
  const [hasNoPlans, setHasNoPlans] = React.useState(data?.hasNoPlans || false);
  const [hasPermitDrawings, setHasPermitDrawings] = React.useState(data?.hasPermitDrawings || false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onComplete({
      hasOfficialPlans,
      hasSketch,
      hasNoPlans,
      hasPermitDrawings,
    });
  };

  return (
    <div className="space-y-6">
      <ChatMessage
        type="ai"
        content={`**Step 4 — Documents & permits**

Tell me what kind of documentation you already have. This affects how detailed the analysis can be.`}
      />
      <div className="flex justify-start">
        <div className="max-w-[85%] rounded-[16px] px-5 py-5 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)]">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasOfficialPlans}
                  onChange={(e) => {
                    setHasOfficialPlans(e.target.checked);
                    if (e.target.checked) {
                      setHasNoPlans(false);
                    }
                  }}
                  className="w-4 h-4 rounded border-[rgba(255,255,255,0.18)] bg-[rgba(255,255,255,0.04)] text-[#3B82F6] focus:ring-[rgba(59,130,246,0.3)] focus:ring-offset-0"
                />
                <span className="text-[14px] text-[rgba(255,255,255,0.85)]">
                  I have official floor plans (PDF or DWG exported as PDF)
                </span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasSketch}
                  onChange={(e) => {
                    setHasSketch(e.target.checked);
                    if (e.target.checked) {
                      setHasNoPlans(false);
                    }
                  }}
                  className="w-4 h-4 rounded border-[rgba(255,255,255,0.18)] bg-[rgba(255,255,255,0.04)] text-[#3B82F6] focus:ring-[rgba(59,130,246,0.3)] focus:ring-offset-0"
                />
                <span className="text-[14px] text-[rgba(255,255,255,0.85)]">
                  I only have a sketch / hand drawing
                </span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasNoPlans}
                  onChange={(e) => {
                    setHasNoPlans(e.target.checked);
                    if (e.target.checked) {
                      setHasOfficialPlans(false);
                      setHasSketch(false);
                    }
                  }}
                  className="w-4 h-4 rounded border-[rgba(255,255,255,0.18)] bg-[rgba(255,255,255,0.04)] text-[#3B82F6] focus:ring-[rgba(59,130,246,0.3)] focus:ring-offset-0"
                />
                <span className="text-[14px] text-[rgba(255,255,255,0.85)]">
                  I have no plans yet, just an idea
                </span>
              </label>
            </div>

            <div className="pt-2 border-t border-[rgba(255,255,255,0.08)]">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasPermitDrawings}
                  onChange={(e) => setHasPermitDrawings(e.target.checked)}
                  className="w-4 h-4 rounded border-[rgba(255,255,255,0.18)] bg-[rgba(255,255,255,0.04)] text-[#3B82F6] focus:ring-[rgba(59,130,246,0.3)] focus:ring-offset-0"
                />
                <span className="text-[14px] text-[rgba(255,255,255,0.85)]">
                  I already have some permit drawings or a project file
                </span>
              </label>
              {hasPermitDrawings && (
                <p className="mt-2 text-[12px] text-[rgba(255,255,255,0.60)] ml-7">
                  Later you'll be able to upload permit documents so we can highlight potential issues.
                </p>
              )}
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



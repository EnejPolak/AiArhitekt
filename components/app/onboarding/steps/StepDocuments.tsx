"use client";

import * as React from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { ChatMessage } from "../ChatMessage";

export interface StepDocumentsProps {
  data: {
    hasNoDocuments: boolean;
    hasFloorPlan: boolean;
    hasMeasurements: boolean;
    hasPhotos: boolean;
    needsPermitHelp: boolean;
  } | null;
  onComplete: (data: {
    hasNoDocuments: boolean;
    hasFloorPlan: boolean;
    hasMeasurements: boolean;
    hasPhotos: boolean;
    needsPermitHelp: boolean;
  }) => void;
}

export const StepDocuments: React.FC<StepDocumentsProps> = ({ data, onComplete }) => {
  const [hasNoDocuments, setHasNoDocuments] = React.useState(data?.hasNoDocuments || false);
  const [hasFloorPlan, setHasFloorPlan] = React.useState(data?.hasFloorPlan || false);
  const [hasMeasurements, setHasMeasurements] = React.useState(data?.hasMeasurements || false);
  const [hasPhotos, setHasPhotos] = React.useState(data?.hasPhotos || false);
  const [needsPermitHelp, setNeedsPermitHelp] = React.useState(data?.needsPermitHelp || false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onComplete({
      hasNoDocuments,
      hasFloorPlan,
      hasMeasurements,
      hasPhotos,
      needsPermitHelp,
    });
  };

  return (
    <div className="space-y-6">
      <ChatMessage
        type="ai"
        content={`**Step 5 — Documents & Permits**

What documentation do you already have?`}
      />
      <div className="flex justify-start">
        <div className="max-w-[85%] rounded-[16px] px-5 py-5 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)]">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasNoDocuments}
                  onChange={(e) => {
                    setHasNoDocuments(e.target.checked);
                    if (e.target.checked) {
                      setHasFloorPlan(false);
                      setHasMeasurements(false);
                      setHasPhotos(false);
                    }
                  }}
                  className="w-4 h-4 rounded border-[rgba(255,255,255,0.18)] bg-[rgba(255,255,255,0.04)] text-[#3B82F6] focus:ring-[rgba(59,130,246,0.3)] focus:ring-offset-0"
                />
                <span className="text-[14px] text-[rgba(255,255,255,0.85)]">
                  I have no documents
                </span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasFloorPlan}
                  onChange={(e) => {
                    setHasFloorPlan(e.target.checked);
                    if (e.target.checked) {
                      setHasNoDocuments(false);
                    }
                  }}
                  className="w-4 h-4 rounded border-[rgba(255,255,255,0.18)] bg-[rgba(255,255,255,0.04)] text-[#3B82F6] focus:ring-[rgba(59,130,246,0.3)] focus:ring-offset-0"
                />
                <span className="text-[14px] text-[rgba(255,255,255,0.85)]">
                  I have a floor plan
                </span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasMeasurements}
                  onChange={(e) => {
                    setHasMeasurements(e.target.checked);
                    if (e.target.checked) {
                      setHasNoDocuments(false);
                    }
                  }}
                  className="w-4 h-4 rounded border-[rgba(255,255,255,0.18)] bg-[rgba(255,255,255,0.04)] text-[#3B82F6] focus:ring-[rgba(59,130,246,0.3)] focus:ring-offset-0"
                />
                <span className="text-[14px] text-[rgba(255,255,255,0.85)]">
                  I have measurements
                </span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasPhotos}
                  onChange={(e) => {
                    setHasPhotos(e.target.checked);
                    if (e.target.checked) {
                      setHasNoDocuments(false);
                    }
                  }}
                  className="w-4 h-4 rounded border-[rgba(255,255,255,0.18)] bg-[rgba(255,255,255,0.04)] text-[#3B82F6] focus:ring-[rgba(59,130,246,0.3)] focus:ring-offset-0"
                />
                <span className="text-[14px] text-[rgba(255,255,255,0.85)]">
                  I have photos
                </span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={needsPermitHelp}
                  onChange={(e) => setNeedsPermitHelp(e.target.checked)}
                  className="w-4 h-4 rounded border-[rgba(255,255,255,0.18)] bg-[rgba(255,255,255,0.04)] text-[#3B82F6] focus:ring-[rgba(59,130,246,0.3)] focus:ring-offset-0"
                />
                <span className="text-[14px] text-[rgba(255,255,255,0.85)]">
                  I need help finding out what permits I need
                </span>
              </label>
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

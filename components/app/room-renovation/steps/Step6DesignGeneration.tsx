"use client";

import * as React from "react";

export interface Step6DesignGenerationProps {
  roomType: string;
  photos: File[];
  styles: string[];
  budget: string;
  preferences?: unknown;
  observation?: string | null;
  onDesignsGenerated: (designs: string[]) => void;
  onContinueWithoutRender?: () => void;
}

export const Step6DesignGeneration: React.FC<Step6DesignGenerationProps> = ({
  roomType,
  onContinueWithoutRender,
  onDesignsGenerated,
}) => {
  return (
    <div className="flex justify-start mb-6">
      <div className="max-w-[85%] rounded-[16px] px-6 py-5 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)] space-y-4">
        <div className="text-[15px] text-[rgba(255,255,255,0.85)] leading-relaxed">
          The {roomType} visualization is generated after real products are selected. Find products next — this step does not create a render.
        </div>
        <button
          type="button"
          onClick={() => {
            if (onContinueWithoutRender) {
              onContinueWithoutRender();
              return;
            }
            onDesignsGenerated([]);
          }}
          className="text-[14px] text-[rgba(0,230,204,0.85)] hover:text-[rgba(0,230,204,1)]"
        >
          Continue
        </button>
      </div>
    </div>
  );
};

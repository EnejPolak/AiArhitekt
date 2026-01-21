"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface Step7FinalDesignSelectionProps {
  designs: string[];
  selectedDesign: string | null;
  onSelect: (design: string) => void;
}

export const Step7FinalDesignSelection: React.FC<Step7FinalDesignSelectionProps> = ({
  designs,
  selectedDesign,
  onSelect,
}) => {
  const [preview, setPreview] = React.useState<string | null>(null);

  return (
    <div className="space-y-6">
      {/* Design Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
        {designs.map((design, index) => (
          <button
            key={index}
            onClick={() => setPreview(design)}
            className={cn(
              "relative group",
              "rounded-[16px] overflow-hidden",
              "border-2 transition-all duration-300",
              "hover:scale-[1.02] active:scale-[0.98]",
              selectedDesign === design
                ? "border-[#3B82F6] ring-2 ring-[#3B82F6] ring-opacity-50"
                : "border-[rgba(255,255,255,0.08)] hover:border-[rgba(255,255,255,0.15)]"
            )}
          >
            <img
              src={design}
              alt={`Design ${index + 1}`}
              className="w-full h-64 object-cover"
            />

            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors" />
            <div className="absolute bottom-3 left-3 text-xs text-white bg-black/50 px-2 py-1 rounded-md">
              Click to preview
            </div>
          </button>
        ))}
      </div>

      {/* Preview Modal */}
      {preview && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={() => setPreview(null)}
        >
          <div
            className="w-full max-w-5xl max-h-[88vh] bg-[#0D0D0F] rounded-[16px] border border-[rgba(255,255,255,0.12)] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-[rgba(255,255,255,0.10)]">
              <div className="text-sm font-medium text-white">Preview</div>
              <button
                onClick={() => setPreview(null)}
                className="text-sm text-[rgba(255,255,255,0.70)] hover:text-white"
              >
                Close
              </button>
            </div>
            <div className="p-4 overflow-auto">
              <img
                src={preview}
                alt="Preview"
                className="w-full h-auto max-h-[62vh] object-contain rounded-[12px] border border-[rgba(255,255,255,0.10)]"
              />
              <div className="flex items-center justify-end gap-3 mt-4">
                <button
                  onClick={() => setPreview(null)}
                  className="px-5 py-2.5 rounded-lg border border-[rgba(255,255,255,0.15)] text-white text-sm hover:bg-[rgba(255,255,255,0.05)] transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={() => {
                    onSelect(preview);
                    setPreview(null);
                  }}
                  className="px-5 py-2.5 rounded-lg bg-[#3B82F6] text-white text-sm font-medium hover:bg-[#2563EB] transition-colors"
                >
                  Use this design
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

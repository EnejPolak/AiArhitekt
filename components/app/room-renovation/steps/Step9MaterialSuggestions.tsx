"use client";

import * as React from "react";

export interface Step9MaterialSuggestionsProps {
  roomType: string;
  style: string;
  onSuggestionsComplete: (suggestions: Array<{
    category: string;
    productType: string;
    brandOrStore: string;
  }>) => void;
}

export const Step9MaterialSuggestions: React.FC<Step9MaterialSuggestionsProps> = ({
  roomType,
  style,
  onSuggestionsComplete,
}) => {
  const [suggestions, setSuggestions] = React.useState<Array<{
    category: string;
    productType: string;
    brandOrStore: string;
  }> | null>(null);
  const lastRunKeyRef = React.useRef<string>("");

  React.useEffect(() => {
    const runKey = `${roomType}|${style}`;
    // Prevent double-run in React StrictMode for same inputs
    if (lastRunKeyRef.current === runKey) return;
    lastRunKeyRef.current = runKey;

    // TODO: Call API to get material suggestions based on room type and style
    // For now, use placeholder data
    const defaultSuggestions = [
      { category: "Flooring", productType: "Vinyl plank", brandOrStore: "Merkur" },
      { category: "Paint", productType: "Interior wall paint", brandOrStore: "Bauhaus" },
      { category: "Lighting", productType: "LED ceiling lights", brandOrStore: "JYSK" },
    ];

    setSuggestions(defaultSuggestions);
    onSuggestionsComplete(defaultSuggestions);
  }, [roomType, style, onSuggestionsComplete]);

  if (!suggestions) {
    return (
      <div className="flex justify-start mb-6">
        <div className="max-w-[85%] rounded-[16px] px-6 py-5 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)]">
          <div className="text-[15px] text-[rgba(255,255,255,0.85)] leading-relaxed">
            Loading suggestions...
          </div>
        </div>
      </div>
    );
  }

  // Suggestions will be shown in conversation
  return null;
};

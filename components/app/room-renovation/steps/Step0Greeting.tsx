"use client";

import * as React from "react";
import { wizardPanelClass } from "../wizardUi";

export interface Step0GreetingProps {
  onContinue: () => void;
}

export const Step0Greeting: React.FC<Step0GreetingProps> = ({ onContinue }) => {
  const [greeting, setGreeting] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    const generateGreeting = async () => {
      try {
        const response = await fetch("/api/generate-greeting", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          throw new Error("Failed to generate greeting");
        }

        const data = await response.json();
        setGreeting(data.greeting);
      } catch (error) {
        console.error("Error generating greeting:", error);
        setGreeting(
          "Hello 👋\n\nI'll help you redesign your space step by step.\n\nLet's start simple.\nWhich room would you like to renovate today?"
        );
      } finally {
        setIsLoading(false);
      }
    };

    generateGreeting();
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-[rgba(255,255,255,0.60)]">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* AI Message */}
      <div className="flex justify-start">
        <div className={wizardPanelClass}>
          <div className="text-[15px] text-[rgba(255,255,255,0.85)] leading-relaxed whitespace-pre-wrap">
            {greeting}
          </div>
        </div>
      </div>

      {/* Continue Button */}
      <div className="flex justify-start mt-6">
        <button
          onClick={onContinue}
          className="px-6 py-3 rounded-lg bg-[#3B82F6] text-white text-[14px] font-medium hover:bg-[#2563EB] transition-colors"
        >
          Continue
        </button>
      </div>
    </div>
  );
};

"use client";

import * as React from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { ChatMessage } from "../ChatMessage";
import { ProjectData } from "../OnboardingFlow";
import { Check, Loader2 } from "lucide-react";

export interface StepGenerateProps {
  projectData: ProjectData;
  onComplete: () => void;
}

const GENERATION_STEPS = [
  "Reading your floor plan…",
  "Building the 3D volume…",
  "Estimating cost range…",
  "Checking basic permit constraints…",
];

export const StepGenerate: React.FC<StepGenerateProps> = ({ projectData, onComplete }) => {
  const [currentStep, setCurrentStep] = React.useState(0);
  const [isComplete, setIsComplete] = React.useState(false);

  React.useEffect(() => {
    if (isComplete) return;

    const interval = setInterval(() => {
      setCurrentStep((prev) => {
        if (prev < GENERATION_STEPS.length - 1) {
          return prev + 1;
        } else {
          setIsComplete(true);
          return prev;
        }
      });
    }, 2000);

    return () => clearInterval(interval);
  }, [isComplete]);

  React.useEffect(() => {
    if (isComplete) {
      // Call onComplete after a short delay to show the final results
      setTimeout(() => {
        onComplete();
      }, 1000);
    }
  }, [isComplete, onComplete]);

  return (
    <div className="space-y-6">
      {!isComplete ? (
        <>
          <ChatMessage
            type="ai"
            content={`**Step 7 — Generate 3D**

Generating your project preview...`}
          />
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-[16px] px-5 py-5 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)]">
              <div className="space-y-3">
                {GENERATION_STEPS.map((step, index) => (
                  <div key={index} className="flex items-center gap-3">
                    {index < currentStep ? (
                      <Check className="w-5 h-5 text-[#4CAF50] flex-shrink-0" />
                    ) : index === currentStep ? (
                      <Loader2 className="w-5 h-5 text-[#3B82F6] animate-spin flex-shrink-0" />
                    ) : (
                      <div className="w-5 h-5 rounded-full border-2 border-[rgba(255,255,255,0.20)] flex-shrink-0" />
                    )}
                    <span
                      className={cn(
                        "text-[14px]",
                        index < currentStep
                          ? "text-[rgba(255,255,255,0.60)]"
                          : index === currentStep
                          ? "text-white"
                          : "text-[rgba(255,255,255,0.40)]"
                      )}
                    >
                      {step}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          <ChatMessage
            type="ai"
            content={`**3D Concept Preview**

Your project has been generated! Here's what I've created for you.`}
          />
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-[16px] px-5 py-5 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)] space-y-6">
              {/* 3D Preview */}
              <div>
                <h3 className="text-[16px] font-semibold text-white mb-3">3D Concept Preview</h3>
                <div className="w-full h-[300px] rounded-lg bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.10)] flex items-center justify-center mb-3">
                  <p className="text-[14px] text-[rgba(255,255,255,0.50)]">3D Preview Placeholder</p>
                </div>
                <Button
                  className={cn(
                    "w-full bg-gradient-to-br from-[#3B82F6] to-[#2563EB]",
                    "text-white border-0",
                    "shadow-[0_4px_16px_rgba(59,130,246,0.25)]",
                    "hover:from-[#2563EB] hover:to-[#1D4ED8]",
                    "h-[44px] text-[14px] font-medium rounded-[12px]",
                    "transition-all duration-200"
                  )}
                >
                  Open in 3D viewer
                </Button>
              </div>

              {/* Cost Estimate */}
              <div>
                <h3 className="text-[16px] font-semibold text-white mb-3">Cost Estimate</h3>
                <div className="rounded-lg bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.10)] overflow-hidden">
                  <table className="w-full">
                    <tbody>
                      <tr className="border-b border-[rgba(255,255,255,0.08)]">
                        <td className="px-4 py-3 text-[14px] text-[rgba(255,255,255,0.70)]">Construction</td>
                        <td className="px-4 py-3 text-[14px] text-white text-right">€80,000 - €120,000</td>
                      </tr>
                      <tr className="border-b border-[rgba(255,255,255,0.08)]">
                        <td className="px-4 py-3 text-[14px] text-[rgba(255,255,255,0.70)]">Materials</td>
                        <td className="px-4 py-3 text-[14px] text-white text-right">€25,000 - €35,000</td>
                      </tr>
                      <tr className="border-b border-[rgba(255,255,255,0.08)]">
                        <td className="px-4 py-3 text-[14px] text-[rgba(255,255,255,0.70)]">Permits & Fees</td>
                        <td className="px-4 py-3 text-[14px] text-white text-right">€5,000 - €8,000</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3 text-[14px] font-semibold text-white">Total Range</td>
                        <td className="px-4 py-3 text-[14px] font-semibold text-white text-right">€110,000 - €163,000</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Permit Notes */}
              <div>
                <h3 className="text-[16px] font-semibold text-white mb-3">Permit Notes</h3>
                <div className="rounded-lg bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.10)] p-4">
                  <ul className="space-y-2 text-[14px] text-[rgba(255,255,255,0.85)]">
                    <li className="flex items-start gap-2">
                      <span className="text-[#3B82F6] mt-0.5">•</span>
                      <span>Check height limits in your municipality</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-[#3B82F6] mt-0.5">•</span>
                      <span>Verify distances to property boundary</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-[#3B82F6] mt-0.5">•</span>
                      <span>Confirm building permit requirements with local authority</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-[#3B82F6] mt-0.5">•</span>
                      <span>Review zoning regulations for your area</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};



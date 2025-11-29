"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

export interface Step {
  id: number;
  label: string;
}

export interface OnboardingStepperProps {
  steps: Step[];
  currentStep: number;
  className?: string;
}

export const OnboardingStepper: React.FC<OnboardingStepperProps> = ({
  steps,
  currentStep,
  className,
}) => {
  return (
    <div className={cn("flex items-center gap-2 overflow-x-auto pb-2", className)}>
      {steps.map((step, index) => {
        const isCompleted = step.id < currentStep;
        const isActive = step.id === currentStep;
        const isUpcoming = step.id > currentStep;

        return (
          <React.Fragment key={step.id}>
            <div
              className={cn(
                "flex items-center gap-2 flex-shrink-0",
                isUpcoming && "opacity-40"
              )}
            >
              <div
                className={cn(
                  "flex items-center justify-center min-w-[32px] h-8 px-3 rounded-full text-[12px] font-medium transition-all",
                  isCompleted &&
                    "bg-[rgba(59,130,246,0.15)] border border-[rgba(59,130,246,0.25)] text-[#3B82F6]",
                  isActive &&
                    "bg-[rgba(59,130,246,0.20)] border-2 border-[#3B82F6] text-white",
                  !isCompleted &&
                    !isActive &&
                    "bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.10)] text-[rgba(255,255,255,0.50)]"
                )}
              >
                {isCompleted ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <span>{step.id}</span>
                )}
              </div>
              <span
                className={cn(
                  "text-[12px] font-medium whitespace-nowrap",
                  isActive ? "text-white" : "text-[rgba(255,255,255,0.60)]"
                )}
              >
                {step.label}
              </span>
            </div>
            {index < steps.length - 1 && (
              <div
                className={cn(
                  "h-px w-8 flex-shrink-0",
                  isCompleted
                    ? "bg-[rgba(59,130,246,0.30)]"
                    : "bg-[rgba(255,255,255,0.10)]"
                )}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};



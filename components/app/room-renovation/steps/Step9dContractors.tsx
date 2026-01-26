"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface Step9dContractorsProps {
  location: { lat: number; lng: number; label: string };
  radiusKm: number;
  roomType: string;
  preferences: any;
  onContractorsFound: (contractors: Record<string, Array<{
    name: string;
    address: string;
    phone: string | null;
    website: string | null;
    rating: number | null;
    reviewsCount: number | null;
    placeId: string;
  }>>) => void;
  onSkip: () => void;
}

export const Step9dContractors: React.FC<Step9dContractorsProps> = ({
  location,
  radiusKm,
  roomType,
  preferences,
  onContractorsFound,
  onSkip,
}) => {
  const [wantsContractors, setWantsContractors] = React.useState<boolean | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleFindContractors = async () => {
    setWantsContractors(true);
    setIsLoading(true);
    setError(null);

    try {
      // Determine needed trades based on room type and preferences
      const neededTrades: string[] = [];
      
      if (preferences?.flooring && preferences.flooring !== "keep") {
        neededTrades.push("flooring");
      }
      
      neededTrades.push("painter"); // Always need painters
      
      if (roomType === "kitchen" || roomType === "bathroom") {
        neededTrades.push("plumber");
      }
      
      if (roomType === "kitchen") {
        neededTrades.push("electrician");
      }

      const response = await fetch("/api/places-contractors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          location: { lat: location.lat, lng: location.lng },
          radiusKm,
          neededTrades,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to find contractors");
      }

      const data = await response.json();
      onContractorsFound(data.contractorsByTrade || {});
    } catch (err: any) {
      console.error("Error finding contractors:", err);
      setError(err.message || "Failed to find contractors");
      onContractorsFound({});
    } finally {
      setIsLoading(false);
    }
  };

  const handleSkip = () => {
    setWantsContractors(false);
    onSkip();
  };

  if (wantsContractors === null) {
    return (
      <div className="space-y-4 mt-8">
        <div className="text-[15px] text-[rgba(255,255,255,0.80)] leading-relaxed">
          Do you want me to find local contractors (painters, flooring, assembly) within {radiusKm} km?
        </div>

        <div className="flex gap-4">
          <button
            onClick={handleFindContractors}
            className={cn(
              "flex-1 px-6 py-3 rounded-lg text-center",
              "bg-[#3B82F6] text-white text-[14px] font-medium",
              "hover:bg-[#2563EB] transition-colors"
            )}
          >
            Yes, find contractors
          </button>
          <button
            onClick={handleSkip}
            className={cn(
              "flex-1 px-6 py-3 rounded-lg text-center border",
              "border-[rgba(255,255,255,0.15)] text-white text-[14px] font-medium",
              "hover:bg-[rgba(255,255,255,0.05)] transition-colors"
            )}
          >
            No, skip
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex justify-start mb-6">
        <div className="max-w-[85%] rounded-[16px] px-6 py-5 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)]">
          <div className="text-[15px] text-[rgba(255,255,255,0.85)] leading-relaxed">
            Finding local contractors…
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-start mb-6">
        <div className="max-w-[85%] rounded-[16px] px-6 py-5 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)]">
          <div className="text-[15px] text-[rgba(255,255,255,0.85)] leading-relaxed">
            {error}
          </div>
        </div>
      </div>
    );
  }

  // Contractors will be shown in conversation timeline
  return null;
};

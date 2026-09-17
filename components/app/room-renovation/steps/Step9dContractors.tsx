"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { contractorCustomerMessage, networkCustomerMessage } from "@/lib/ui/customerCopy";
import { wizardPanelClass } from "../wizardUi";

type Contractor = {
  name: string;
  address: string;
  phone: string | null;
  website: string | null;
  rating: number | null;
  reviewsCount: number | null;
  placeId: string;
};

export interface Step9dContractorsProps {
  location: { lat: number; lng: number; label: string } | null;
  radiusKm: number;
  roomType: string;
  preferences: any;
  onContractorsFound: (contractors: Record<string, Contractor[]>) => void;
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
  const [phase, setPhase] = React.useState<"ask" | "loading" | "empty" | "error">("ask");
  const [error, setError] = React.useState<string | null>(null);
  const inFlight = React.useRef(false);

  const handleFindContractors = async () => {
    if (inFlight.current) return;
    if (!location) {
      setError(contractorCustomerMessage("location"));
      setPhase("error");
      return;
    }
    inFlight.current = true;
    setPhase("loading");
    setError(null);

    try {
      const neededTrades: string[] = [];
      if (preferences?.flooring && preferences.flooring !== "keep") {
        neededTrades.push("flooring");
      }
      neededTrades.push("painter");
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
        console.error("[contractors]", { status: response.status });
        setError(contractorCustomerMessage("provider"));
        setPhase("error");
        return;
      }

      const data = await response.json().catch(() => null);
      const byTrade: Record<string, Contractor[]> = data?.contractorsByTrade || {};
      const total = Object.values(byTrade).reduce((sum, list) => sum + list.length, 0);
      if (total === 0) {
        setPhase("empty");
        return;
      }
      onContractorsFound(byTrade);
    } catch (err: unknown) {
      console.error("[contractors]", err instanceof Error ? err.name : "unknown");
      setError(networkCustomerMessage(err));
      setPhase("error");
    } finally {
      inFlight.current = false;
    }
  };

  if (phase === "loading") {
    return (
      <div className="flex justify-start mb-6">
        <div className={wizardPanelClass}>
          <div className="text-[15px] text-[rgba(255,255,255,0.85)] leading-relaxed" aria-live="polite">
            Finding local contractors…
          </div>
        </div>
      </div>
    );
  }

  if (phase === "empty") {
    return (
      <div className="flex justify-start mb-6">
        <div className={`${wizardPanelClass} space-y-4`}>
          <p className="text-[15px] text-[rgba(255,255,255,0.85)] leading-relaxed" role="status">
            {contractorCustomerMessage("empty")}
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => onContractorsFound({})}
              className="text-[14px] text-[rgba(0,230,204,0.85)] hover:text-[rgba(0,230,204,1)]"
            >
              Continue
            </button>
            <button
              type="button"
              onClick={() => void handleFindContractors()}
              className="text-[14px] text-[rgba(255,255,255,0.70)] hover:text-white"
            >
              Search again
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="flex justify-start mb-6">
        <div className={`${wizardPanelClass} space-y-4`}>
          <p className="text-[15px] text-[#FCA5A5] leading-relaxed" role="alert">
            {error ?? contractorCustomerMessage("provider")}
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={!location}
              onClick={() => void handleFindContractors()}
              className="text-[14px] text-[rgba(0,230,204,0.85)] hover:text-[rgba(0,230,204,1)] disabled:opacity-40"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={onSkip}
              className="text-[14px] text-[rgba(255,255,255,0.70)] hover:text-white"
            >
              Skip
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 mt-8">
      <div className="text-[15px] text-[rgba(255,255,255,0.80)] leading-relaxed break-words">
        Do you want me to find local contractors (painters, flooring, assembly)
        {location ? ` within ${radiusKm} km of ${location.label}` : ""}?
      </div>

      {!location ? (
        <p className="text-[13px] text-[rgba(255,255,255,0.55)]">
          Save a search location first. Contractor search uses the same saved coordinates.
        </p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={() => void handleFindContractors()}
          disabled={!location}
          className={cn(
            "flex-1 px-6 py-3 rounded-lg text-center",
            "bg-[#3B82F6] text-white text-[14px] font-medium",
            "hover:bg-[#2563EB] transition-colors",
            "disabled:opacity-40 disabled:cursor-not-allowed"
          )}
        >
          Yes, find contractors
        </button>
        <button
          type="button"
          onClick={onSkip}
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
};

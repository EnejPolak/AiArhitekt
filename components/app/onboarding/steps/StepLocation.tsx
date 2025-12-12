"use client";

import * as React from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { ChatMessage } from "../ChatMessage";
import { MapPin } from "lucide-react";

export interface StepLocationProps {
  data: { address: string; radius: number; useGeolocation: boolean } | null;
  onComplete: (data: { address: string; radius: number; useGeolocation: boolean }) => void;
}

const RADIUS_OPTIONS = [30, 50, 100];

export const StepLocation: React.FC<StepLocationProps> = ({ data, onComplete }) => {
  const [address, setAddress] = React.useState(data?.address || "");
  const [radius, setRadius] = React.useState<number>(data?.radius || 50);
  const [useGeolocation, setUseGeolocation] = React.useState(data?.useGeolocation || false);
  const [isDetecting, setIsDetecting] = React.useState(false);

  const handleGeolocation = async () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser.");
      return;
    }

    setIsDetecting(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          // Reverse geocoding to get address
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${position.coords.latitude}&lon=${position.coords.longitude}`
          );
          const data = await response.json();
          const detectedAddress = data.display_name || `${position.coords.latitude}, ${position.coords.longitude}`;
          setAddress(detectedAddress);
          setUseGeolocation(true);
        } catch (error) {
          console.error("Geocoding error:", error);
          setAddress(`${position.coords.latitude}, ${position.coords.longitude}`);
          setUseGeolocation(true);
        } finally {
          setIsDetecting(false);
        }
      },
      (error) => {
        console.error("Geolocation error:", error);
        alert("Could not detect your location. Please enter it manually.");
        setIsDetecting(false);
      }
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (address.trim()) {
      onComplete({ address: address.trim(), radius, useGeolocation });
    }
  };

  return (
    <div className="space-y-6">
      <ChatMessage
        type="ai"
        content={`**Step 1 — Location**

Where is your project located? This helps us find nearby stores, prices, documents, and delivery times.`}
      />
      <div className="flex justify-start">
        <div className="max-w-[85%] rounded-[16px] px-5 py-5 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)]">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[13px] font-medium text-[rgba(255,255,255,0.70)] mb-2">
                Your location
              </label>
              <input
                type="text"
                value={address}
                onChange={(e) => {
                  setAddress(e.target.value);
                  setUseGeolocation(false);
                }}
                placeholder="Enter your address or location"
                required
                className={cn(
                  "w-full h-[40px] px-3 rounded-lg",
                  "bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.10)]",
                  "text-[14px] text-white placeholder-[rgba(255,255,255,0.40)]",
                  "focus:outline-none focus:border-[rgba(59,130,246,0.40)]",
                  "transition-colors"
                )}
              />
            </div>

            <button
              type="button"
              onClick={handleGeolocation}
              disabled={isDetecting}
              className={cn(
                "w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg",
                "bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.10)]",
                "text-[13px] text-[rgba(255,255,255,0.70)]",
                "hover:bg-[rgba(255,255,255,0.08)] transition-colors",
                isDetecting && "opacity-50 cursor-not-allowed"
              )}
            >
              <MapPin className="w-4 h-4" />
              {isDetecting ? "Detecting location..." : "Detect automatically"}
            </button>

            <div>
              <label className="block text-[13px] font-medium text-[rgba(255,255,255,0.70)] mb-2">
                Search radius
              </label>
              <div className="flex gap-2">
                {RADIUS_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setRadius(option)}
                    className={cn(
                      "flex-1 px-4 py-2 rounded-lg text-[13px] font-medium transition-all",
                      radius === option
                        ? "bg-[rgba(59,130,246,0.15)] border border-[#3B82F6] text-white"
                        : "bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.10)] text-[rgba(255,255,255,0.70)] hover:border-[rgba(255,255,255,0.15)]"
                    )}
                  >
                    {option} km
                  </button>
                ))}
              </div>
            </div>

            <Button
              type="submit"
              disabled={!address.trim()}
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
                "transition-all duration-200",
                "disabled:opacity-50 disabled:cursor-not-allowed"
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

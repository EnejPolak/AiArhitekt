"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface Step6bLocationProps {
  location: { lat: number; lng: number; label: string } | null;
  radiusKm: number;
  onLocationSet: (location: { lat: number; lng: number; label: string }, radiusKm: number) => void;
}

export const Step6bLocation: React.FC<Step6bLocationProps> = ({
  location,
  radiusKm,
  onLocationSet,
}) => {
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [addressInput, setAddressInput] = React.useState("");
  const [radiusInput, setRadiusInput] = React.useState(radiusKm.toString());

  const handleUseCurrentLocation = async () => {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser");
      return;
    }

    setIsLoading(true);
    setError(null);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          
          // Reverse geocode to get address
          const response = await fetch("/api/geocode", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              lat: latitude,
              lng: longitude,
            }),
          });

          if (!response.ok) {
            throw new Error("Failed to get address");
          }

          const data = await response.json();
          const label = data.address || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
          
          onLocationSet(
            { lat: latitude, lng: longitude, label },
            parseInt(radiusInput) || 50
          );
        } catch (err: any) {
          setError(err.message || "Failed to get location");
        } finally {
          setIsLoading(false);
        }
      },
      (err) => {
        setError("Failed to get your location. Please enter an address manually.");
        setIsLoading(false);
      }
    );
  };

  const handleAddressSubmit = async () => {
    if (!addressInput.trim()) {
      setError("Please enter an address");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: addressInput.trim(),
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to geocode address");
      }

      const data = await response.json();
      
      onLocationSet(
        { lat: data.lat, lng: data.lng, label: addressInput.trim() },
        parseInt(radiusInput) || 50
      );
    } catch (err: any) {
      setError(err.message || "Failed to find location");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6 mt-8">
      <div className="text-[15px] text-[rgba(255,255,255,0.80)] leading-relaxed">
        Share your location so I can find products in local stores near you.
      </div>

      <div className="space-y-4">
        <button
          onClick={handleUseCurrentLocation}
          disabled={isLoading}
          className={cn(
            "w-full px-6 py-3 rounded-lg text-left border transition-all",
            "bg-[rgba(255,255,255,0.02)] border-[rgba(255,255,255,0.08)]",
            "hover:border-[rgba(255,255,255,0.15)] hover:bg-[rgba(255,255,255,0.04)]",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        >
          <div className="flex items-center gap-3">
            <div className="text-2xl">📍</div>
            <div>
              <div className="text-[15px] font-medium text-white">
                Use my current location
              </div>
              <div className="text-[12px] text-[rgba(255,255,255,0.60)] mt-1">
                Automatically detect your location
              </div>
            </div>
          </div>
        </button>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-[rgba(255,255,255,0.10)]"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-[#0D0D0F] text-[rgba(255,255,255,0.50)]">or</span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-white mb-2">
            Enter address or city
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={addressInput}
              onChange={(e) => setAddressInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleAddressSubmit();
                }
              }}
              placeholder="e.g. Ljubljana, Slovenia"
              disabled={isLoading}
              className={cn(
                "flex-1 px-4 py-3 rounded-lg",
                "bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.08)]",
                "text-white text-sm focus:outline-none focus:border-[#3B82F6]",
                "disabled:opacity-50"
              )}
            />
            <button
              onClick={handleAddressSubmit}
              disabled={isLoading || !addressInput.trim()}
              className={cn(
                "px-6 py-3 rounded-lg bg-[#3B82F6] text-white text-[14px] font-medium",
                "hover:bg-[#2563EB] transition-colors",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              Find
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-white mb-2">
            Search radius (km)
          </label>
          <input
            type="number"
            value={radiusInput}
            onChange={(e) => setRadiusInput(e.target.value)}
            min="10"
            max="100"
            disabled={isLoading}
            className={cn(
              "w-full px-4 py-3 rounded-lg",
              "bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.08)]",
              "text-white text-sm focus:outline-none focus:border-[#3B82F6]",
              "disabled:opacity-50"
            )}
          />
        </div>

        {error && (
          <div className="px-4 py-3 rounded-lg bg-[rgba(239,68,68,0.10)] border border-[rgba(239,68,68,0.20)]">
            <div className="text-[14px] text-[#EF4444]">{error}</div>
          </div>
        )}

        {location && (
          <div className="px-4 py-3 rounded-lg bg-[rgba(59,130,246,0.10)] border border-[rgba(59,130,246,0.20)]">
            <div className="text-[14px] text-white">
              <span className="font-medium">Location set:</span> {location.label}
            </div>
            <div className="text-[12px] text-[rgba(255,255,255,0.60)] mt-1">
              Radius: {radiusInput} km
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { locationLabelFromGeocode } from "@/lib/geocode/locationLabel";
import { saveProjectLocationAction } from "@/lib/project-preferences/actions";
import { MAX_DISCOVERY_RADIUS_KM, MIN_DISCOVERY_RADIUS_KM } from "@/lib/discovery/constants";
import { clampSearchRadiusKm, type ProjectLocation } from "@/lib/project-location/parse";
import type { ProjectRoomPreferences } from "@/lib/project-preferences/types";
import { geocodeCustomerMessage, networkCustomerMessage } from "@/lib/ui/customerCopy";

export interface Step6bLocationProps {
  projectId: string;
  location: { lat: number; lng: number; label: string } | null;
  radiusKm: number;
  onLocationSaved: (location: ProjectLocation, preferences: ProjectRoomPreferences) => void;
}

export const Step6bLocation: React.FC<Step6bLocationProps> = ({
  projectId,
  location,
  radiusKm,
  onLocationSaved,
}) => {
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [addressInput, setAddressInput] = React.useState(location?.label ?? "");
  const [radiusInput, setRadiusInput] = React.useState(
    String(clampSearchRadiusKm(radiusKm))
  );
  const inFlight = React.useRef(false);

  const persistAndContinue = async (input: {
    locationInput: string;
    formattedAddress?: string | null;
    latitude: number;
    longitude: number;
    radiusKm: number;
    countryCode?: string | null;
  }) => {
    const saved = await saveProjectLocationAction({
      projectId,
      locationInput: input.locationInput,
      formattedAddress: input.formattedAddress ?? null,
      latitude: input.latitude,
      longitude: input.longitude,
      radiusKm: clampSearchRadiusKm(input.radiusKm),
      countryCode: input.countryCode ?? null,
    });
    if (!saved.ok) {
      setError(saved.message);
      return false;
    }
    onLocationSaved(saved.location, saved.preferences);
    return true;
  };

  const handleUseCurrentLocation = async () => {
    if (inFlight.current) return;
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser");
      return;
    }

    inFlight.current = true;
    setIsLoading(true);
    setError(null);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          const response = await fetch("/api/geocode", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              lat: latitude,
              lng: longitude,
            }),
          });
          const data = await response.json().catch(() => null);
          if (data?.ok !== true) {
            setError(geocodeCustomerMessage(typeof data?.code === "string" ? data.code : undefined));
            return;
          }
          const label =
            locationLabelFromGeocode(data, { latitude, longitude }) ??
            `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;

          await persistAndContinue({
            locationInput: label,
            formattedAddress: typeof data.formattedAddress === "string" ? data.formattedAddress : label,
            latitude,
            longitude,
            radiusKm: Number(radiusInput),
            countryCode: typeof data.countryCode === "string" ? data.countryCode : null,
          });
        } catch (err: unknown) {
          setError(networkCustomerMessage(err));
        } finally {
          inFlight.current = false;
          setIsLoading(false);
        }
      },
      () => {
        setError("Could not read your current location. Enter an address instead.");
        inFlight.current = false;
        setIsLoading(false);
      }
    );
  };

  const handleAddressSubmit = async () => {
    if (inFlight.current) return;
    if (!addressInput.trim()) {
      setError("Please enter an address");
      return;
    }

    inFlight.current = true;
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
      const data = await response.json().catch(() => null);
      if (data?.ok !== true || typeof data.lat !== "number" || typeof data.lng !== "number") {
        setError(geocodeCustomerMessage(typeof data?.code === "string" ? data.code : undefined));
        return;
      }
      const label = locationLabelFromGeocode(data) ?? addressInput.trim();

      await persistAndContinue({
        locationInput: addressInput.trim(),
        formattedAddress: typeof data.formattedAddress === "string" ? data.formattedAddress : label,
        latitude: data.lat,
        longitude: data.lng,
        radiusKm: Number(radiusInput),
        countryCode: typeof data.countryCode === "string" ? data.countryCode : null,
      });
    } catch (err: unknown) {
      setError(networkCustomerMessage(err));
    } finally {
      inFlight.current = false;
      setIsLoading(false);
    }
  };

  const handleContinueSaved = async () => {
    if (!location || inFlight.current) return;
    inFlight.current = true;
    setIsLoading(true);
    setError(null);
    try {
      await persistAndContinue({
        locationInput: location.label,
        formattedAddress: location.label,
        latitude: location.lat,
        longitude: location.lng,
        radiusKm: Number(radiusInput),
      });
    } catch (err: unknown) {
      setError(networkCustomerMessage(err));
    } finally {
      inFlight.current = false;
      setIsLoading(false);
    }
  };

  const addressDirty =
    Boolean(location) &&
    addressInput.trim().length > 0 &&
    addressInput.trim() !== location?.label;

  return (
    <div className="space-y-6 mt-8">
      <div className="text-[15px] text-[rgba(255,255,255,0.80)] leading-relaxed">
        Share your location so I can find products in local stores near you.
      </div>

      <div className="space-y-4">
        <button
          onClick={() => void handleUseCurrentLocation()}
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
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={addressInput}
              onChange={(e) => setAddressInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  void handleAddressSubmit();
                }
              }}
              placeholder="e.g. Ljubljana, Slovenia"
              disabled={isLoading}
              className={cn(
                "min-w-0 flex-1 px-4 py-3 rounded-lg",
                "bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.08)]",
                "text-white text-sm focus:outline-none focus:border-[#3B82F6]",
                "disabled:opacity-50"
              )}
            />
            <button
              onClick={() => void handleAddressSubmit()}
              disabled={isLoading || !addressInput.trim()}
              className={cn(
                "shrink-0 px-6 py-3 rounded-lg bg-[#3B82F6] text-white text-[14px] font-medium",
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
            Search radius ({MIN_DISCOVERY_RADIUS_KM}–{MAX_DISCOVERY_RADIUS_KM} km)
          </label>
          <input
            type="number"
            value={radiusInput}
            onChange={(e) => setRadiusInput(e.target.value)}
            min={MIN_DISCOVERY_RADIUS_KM}
            max={MAX_DISCOVERY_RADIUS_KM}
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
          <div
            className="px-4 py-3 rounded-lg bg-[rgba(239,68,68,0.10)] border border-[rgba(239,68,68,0.20)]"
            role="alert"
          >
            <div className="text-[14px] text-[#EF4444]">{error}</div>
          </div>
        )}

        {location && (
          <div className="px-4 py-3 rounded-lg bg-[rgba(59,130,246,0.10)] border border-[rgba(59,130,246,0.20)]">
            <div className="text-[14px] text-white">
              <span className="font-medium">Saved location:</span> {location.label}
            </div>
            <div className="text-[12px] text-[rgba(255,255,255,0.60)] mt-1">
              Radius: {clampSearchRadiusKm(Number(radiusInput) || radiusKm)} km
            </div>
            <button
              type="button"
              disabled={isLoading || addressDirty}
              onClick={() => void handleContinueSaved()}
              className="mt-3 text-[14px] text-[rgba(0,230,204,0.85)] hover:text-[rgba(0,230,204,1)] disabled:opacity-40"
            >
              Continue
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

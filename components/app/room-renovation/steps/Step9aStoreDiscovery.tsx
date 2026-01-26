"use client";

import * as React from "react";

export interface Step9aStoreDiscoveryProps {
  location: { lat: number; lng: number; label: string };
  radiusKm: number;
  roomType: string;
  onStoresFound: (stores: Array<{
    name: string;
    address: string;
    website: string | null;
    placeId: string;
    categoriesHint: string[];
  }>) => void;
}

export const Step9aStoreDiscovery: React.FC<Step9aStoreDiscoveryProps> = ({
  location,
  radiusKm,
  roomType,
  onStoresFound,
}) => {
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const lastRunKeyRef = React.useRef<string>("");

  React.useEffect(() => {
    const runKey = `${location.lat}|${location.lng}|${radiusKm}|${roomType}`;
    if (lastRunKeyRef.current === runKey) return;
    lastRunKeyRef.current = runKey;

    const discoverStores = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/places-stores", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            location: { lat: location.lat, lng: location.lng },
            radiusKm,
            roomType,
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to discover stores");
        }

        const data = await response.json();
        onStoresFound(data.stores || []);
      } catch (err: any) {
        console.error("Error discovering stores:", err);
        setError(err.message || "Failed to discover stores");
        // Continue with empty array
        onStoresFound([]);
      } finally {
        setIsLoading(false);
      }
    };

    discoverStores();
  }, [location, radiusKm, roomType, onStoresFound]);

  if (isLoading) {
    return (
      <div className="flex justify-start mb-6">
        <div className="max-w-[85%] rounded-[16px] px-6 py-5 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)]">
          <div className="text-[15px] text-[rgba(255,255,255,0.85)] leading-relaxed">
            Finding local stores within {radiusKm} km that match your needs…
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

  return null;
};

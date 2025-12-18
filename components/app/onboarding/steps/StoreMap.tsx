"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { MapPin } from "lucide-react";

interface StoreLocation {
  name: string;
  city: string;
  lat: string | number;
  lon: string | number;
  distance_km?: string | number;
  link?: string;
}

interface StoreMapProps {
  stores: StoreLocation[];
  userLocation?: { address: string; radius: number } | null;
}

export const StoreMap: React.FC<StoreMapProps> = ({ stores, userLocation }) => {
  const [mapLoaded, setMapLoaded] = React.useState(false);
  const mapRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const mapEl = mapRef.current;
    if (!mapEl || stores.length === 0) return;

    // Dynamically load Leaflet CSS and JS
    const loadLeaflet = async () => {
      // Load CSS
      if (!document.querySelector('link[href*="leaflet"]')) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        link.integrity = "sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=";
        link.crossOrigin = "";
        document.head.appendChild(link);
      }

      // Load JS
      if (!(window as any).L) {
        await new Promise<void>((resolve) => {
          const script = document.createElement("script");
          script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
          script.integrity = "sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=";
          script.crossOrigin = "";
          script.onload = () => resolve();
          document.body.appendChild(script);
        });
      }

      const L = (window as any).L;
      if (!L || !mapEl) return;

      // Parse coordinates
      const validStores = stores.filter(
        (store) => store.lat && store.lon && !isNaN(Number(store.lat)) && !isNaN(Number(store.lon))
      );

      if (validStores.length === 0) return;

      // Calculate center (average of all stores or first store)
      const centerLat =
        validStores.reduce((sum, s) => sum + Number(s.lat), 0) / validStores.length;
      const centerLon =
        validStores.reduce((sum, s) => sum + Number(s.lon), 0) / validStores.length;

      // Initialize map
      const map = L.map(mapEl).setView([centerLat, centerLon], 11);

      // Add tile layer
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      // Add markers for each store
      validStores.forEach((store) => {
        const lat = Number(store.lat);
        const lon = Number(store.lon);
        const distance = store.distance_km ? `${store.distance_km} km` : "";

        const marker = L.marker([lat, lon]).addTo(map);
        marker.bindPopup(
          `<div style="font-family: system-ui; padding: 4px;">
            <strong>${store.name}</strong><br/>
            ${store.city}${distance ? `<br/>${distance}` : ""}
          </div>`
        );
      });

      // Add user location circle if radius is available
      if (userLocation?.radius && validStores.length > 0) {
        const userLat = centerLat; // Approximate - in real app, get from geocoding
        const userLon = centerLon;
        L.circle([userLat, userLon], {
          radius: userLocation.radius * 1000, // Convert km to meters
          fillColor: "#3B82F6",
          fillOpacity: 0.1,
          color: "#3B82F6",
          weight: 2,
        }).addTo(map);
      }

      setMapLoaded(true);
    };

    loadLeaflet();

    return () => {
      // Cleanup
      mapEl.innerHTML = "";
    };
  }, [stores, userLocation]);

  if (stores.length === 0) return null;

  return (
    <div className="w-full space-y-3">
      <h3 className="text-[16px] font-semibold text-white">🗺️ Store Locations Map</h3>
      <div
        ref={mapRef}
        className="w-full h-[400px] rounded-lg bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.10)]"
        style={{ zIndex: 0 }}
      />
      {!mapLoaded && (
        <div className="flex items-center justify-center h-[400px] text-[rgba(255,255,255,0.60)] text-[14px]">
          Loading map...
        </div>
      )}
    </div>
  );
};

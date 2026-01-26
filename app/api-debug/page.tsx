"use client";

import * as React from "react";

interface GeocodeResult {
  formattedAddress?: string;
  lat?: number;
  lng?: number;
  error?: string;
  status?: number;
}

interface PlaceStore {
  placeId: string;
  name: string;
  vicinity: string;
  rating: number | null;
  userRatingsTotal: number | null;
  lat: number;
  lng: number;
  googleMapsUrl: string;
}

interface PlacesResult {
  stores?: PlaceStore[];
  error?: string;
  status?: number;
}

interface SerpResult {
  dryRun?: boolean;
  plannedQueries?: string[];
  executedCount?: number;
  dailyUsed?: number;
  dailyRemaining?: number;
  resultsByQuery?: Record<string, { organic: Array<{ title: string; link: string; snippet: string }> }>;
  error?: string;
  status?: number;
}

export default function APIDebugPage() {
  // Geocode state
  const [geocodeAddress, setGeocodeAddress] = React.useState("");
  const [geocodeResult, setGeocodeResult] = React.useState<GeocodeResult | null>(null);
  const [geocodeLoading, setGeocodeLoading] = React.useState(false);
  const [geocodeTime, setGeocodeTime] = React.useState<number | null>(null);

  // Places state
  const [placesLat, setPlacesLat] = React.useState("");
  const [placesLng, setPlacesLng] = React.useState("");
  const [placesRadiusKm, setPlacesRadiusKm] = React.useState("10");
  const [placesKeyword, setPlacesKeyword] = React.useState("pohištvo");
  const [placesResult, setPlacesResult] = React.useState<PlacesResult | null>(null);
  const [placesLoading, setPlacesLoading] = React.useState(false);
  const [placesTime, setPlacesTime] = React.useState<number | null>(null);

  // SERP state
  const [serpQueries, setSerpQueries] = React.useState("xxxlesnina bež stol za kuhinjo\nharveynorman jedilni stol\nmömax miza in stoli\nlesnina kuhinjska miza 120cm\nbauhaus barvna stena\nmerkur talna obloga");
  const [serpMaxRequests, setSerpMaxRequests] = React.useState("4");
  const [serpDryRun, setSerpDryRun] = React.useState(false);
  const [serpResult, setSerpResult] = React.useState<SerpResult | null>(null);
  const [serpLoading, setSerpLoading] = React.useState(false);
  const [serpTime, setSerpTime] = React.useState<number | null>(null);

  // Use last geocode result for places
  React.useEffect(() => {
    if (geocodeResult?.lat && geocodeResult?.lng) {
      setPlacesLat(geocodeResult.lat.toString());
      setPlacesLng(geocodeResult.lng.toString());
    }
  }, [geocodeResult]);

  const handleGeocode = async () => {
    if (!geocodeAddress.trim()) return;

    setGeocodeLoading(true);
    setGeocodeResult(null);
    setGeocodeTime(null);

    const startTime = Date.now();

    try {
      const response = await fetch(
        `/api/geocode?address=${encodeURIComponent(geocodeAddress.trim())}`
      );
      const data = await response.json();
      const elapsed = Date.now() - startTime;

      setGeocodeResult({ ...data, status: response.status });
      setGeocodeTime(elapsed);
    } catch (error: any) {
      const elapsed = Date.now() - startTime;
      setGeocodeResult({ error: error.message, status: 500 });
      setGeocodeTime(elapsed);
    } finally {
      setGeocodeLoading(false);
    }
  };

  const handlePlaces = async () => {
    const lat = parseFloat(placesLat);
    const lng = parseFloat(placesLng);

    if (isNaN(lat) || isNaN(lng)) {
      alert("Please enter valid lat and lng");
      return;
    }

    setPlacesLoading(true);
    setPlacesResult(null);
    setPlacesTime(null);

    const startTime = Date.now();

    try {
      const params = new URLSearchParams({
        lat: lat.toString(),
        lng: lng.toString(),
        radiusKm: placesRadiusKm,
      });
      if (placesKeyword.trim()) {
        params.append("keyword", placesKeyword.trim());
      }

      const response = await fetch(`/api/places-stores?${params.toString()}`);
      const data = await response.json();
      const elapsed = Date.now() - startTime;

      setPlacesResult({ ...data, status: response.status });
      setPlacesTime(elapsed);
    } catch (error: any) {
      const elapsed = Date.now() - startTime;
      setPlacesResult({ error: error.message, status: 500 });
      setPlacesTime(elapsed);
    } finally {
      setPlacesLoading(false);
    }
  };

  const handleSerp = async () => {
    const queries = serpQueries
      .split("\n")
      .map((q) => q.trim())
      .filter((q) => q.length > 0);

    if (queries.length === 0) {
      alert("Please enter at least one query");
      return;
    }

    setSerpLoading(true);
    setSerpResult(null);
    setSerpTime(null);

    const startTime = Date.now();

    try {
      const response = await fetch("/api/serp/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          queries,
          maxRequests: parseInt(serpMaxRequests) || 8,
          dryRun: serpDryRun,
        }),
      });
      const data = await response.json();
      const elapsed = Date.now() - startTime;

      setSerpResult({ ...data, status: response.status });
      setSerpTime(elapsed);
    } catch (error: any) {
      const elapsed = Date.now() - startTime;
      setSerpResult({ error: error.message, status: 500 });
      setSerpTime(elapsed);
    } finally {
      setSerpLoading(false);
    }
  };

  const setPresetKeyword = (keyword: string) => {
    setPlacesKeyword(keyword);
  };

  return (
    <div className="min-h-screen bg-[#0D0D0F] text-white p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <h1 className="text-3xl font-bold mb-8">API Debug Page</h1>

        {/* Geocode Section */}
        <section className="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)] rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">A) Geocode Test</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Address</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={geocodeAddress}
                  onChange={(e) => setGeocodeAddress(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleGeocode();
                  }}
                  placeholder="e.g. Ljubljana, Slovenia"
                  className="flex-1 px-4 py-2 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.08)] text-white focus:outline-none focus:border-[#3B82F6]"
                />
                <button
                  onClick={handleGeocode}
                  disabled={geocodeLoading}
                  className="px-6 py-2 rounded-lg bg-[#3B82F6] text-white font-medium hover:bg-[#2563EB] transition-colors disabled:opacity-50"
                >
                  {geocodeLoading ? "Loading..." : "Geocode"}
                </button>
              </div>
            </div>
            {geocodeResult && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm text-[rgba(255,255,255,0.60)]">
                    Status: {geocodeResult.status}
                  </span>
                  {geocodeTime !== null && (
                    <span className="text-sm text-[rgba(255,255,255,0.60)]">
                      · {geocodeTime}ms
                    </span>
                  )}
                </div>
                <pre className="bg-[rgba(0,0,0,0.3)] p-4 rounded-lg overflow-auto text-sm">
                  {JSON.stringify(geocodeResult, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </section>

        {/* Places Section */}
        <section className="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)] rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">B) Places Test</h2>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Latitude</label>
                <input
                  type="number"
                  value={placesLat}
                  onChange={(e) => setPlacesLat(e.target.value)}
                  step="any"
                  placeholder="46.0569"
                  className="w-full px-4 py-2 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.08)] text-white focus:outline-none focus:border-[#3B82F6]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Longitude</label>
                <input
                  type="number"
                  value={placesLng}
                  onChange={(e) => setPlacesLng(e.target.value)}
                  step="any"
                  placeholder="14.5058"
                  className="w-full px-4 py-2 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.08)] text-white focus:outline-none focus:border-[#3B82F6]"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Radius (km, 1-50)</label>
                <input
                  type="number"
                  value={placesRadiusKm}
                  onChange={(e) => setPlacesRadiusKm(e.target.value)}
                  min="1"
                  max="50"
                  className="w-full px-4 py-2 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.08)] text-white focus:outline-none focus:border-[#3B82F6]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Keyword (optional)</label>
                <input
                  type="text"
                  value={placesKeyword}
                  onChange={(e) => setPlacesKeyword(e.target.value)}
                  placeholder="furniture"
                  className="w-full px-4 py-2 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.08)] text-white focus:outline-none focus:border-[#3B82F6]"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Quick Presets (Slovenian stores)</label>
              <div className="flex flex-wrap gap-2">
                {["mömax", "lesnina", "merkur", "bauhaus", "harveynorman"].map((store) => (
                  <button
                    key={store}
                    onClick={() => setPresetKeyword(store)}
                    className="px-3 py-1 rounded bg-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,255,255,0.10)] transition-colors text-sm"
                  >
                    {store}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={handlePlaces}
              disabled={placesLoading}
              className="w-full px-6 py-2 rounded-lg bg-[#3B82F6] text-white font-medium hover:bg-[#2563EB] transition-colors disabled:opacity-50"
            >
              {placesLoading ? "Loading..." : "Search Places"}
            </button>
            {placesResult && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm text-[rgba(255,255,255,0.60)]">
                    Status: {placesResult.status}
                  </span>
                  {placesTime !== null && (
                    <span className="text-sm text-[rgba(255,255,255,0.60)]">
                      · {placesTime}ms
                    </span>
                  )}
                  {placesResult.stores && (
                    <span className="text-sm text-[rgba(255,255,255,0.60)]">
                      · {placesResult.stores.length} results
                    </span>
                  )}
                </div>
                <pre className="bg-[rgba(0,0,0,0.3)] p-4 rounded-lg overflow-auto text-sm max-h-96">
                  {JSON.stringify(placesResult, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </section>

        {/* SERP Section */}
        <section className="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)] rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">C) SERP Test</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Queries (one per line)
              </label>
              <textarea
                value={serpQueries}
                onChange={(e) => setSerpQueries(e.target.value)}
                rows={6}
                placeholder="mömax furniture&#10;lesnina kitchen"
                className="w-full px-4 py-2 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.08)] text-white focus:outline-none focus:border-[#3B82F6] resize-none font-mono text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Max Requests (1-10)</label>
                <input
                  type="number"
                  value={serpMaxRequests}
                  onChange={(e) => setSerpMaxRequests(e.target.value)}
                  min="1"
                  max="10"
                  className="w-full px-4 py-2 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.08)] text-white focus:outline-none focus:border-[#3B82F6]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Options</label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={serpDryRun}
                    onChange={(e) => setSerpDryRun(e.target.checked)}
                    className="accent-[#3B82F6]"
                  />
                  <span className="text-sm">Dry Run (default: true)</span>
                </label>
              </div>
            </div>
            <button
              onClick={handleSerp}
              disabled={serpLoading}
              className="w-full px-6 py-2 rounded-lg bg-[#3B82F6] text-white font-medium hover:bg-[#2563EB] transition-colors disabled:opacity-50"
            >
              {serpLoading ? "Loading..." : "Search SERP"}
            </button>
            {serpResult && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm text-[rgba(255,255,255,0.60)]">
                    Status: {serpResult.status}
                  </span>
                  {serpTime !== null && (
                    <span className="text-sm text-[rgba(255,255,255,0.60)]">
                      · {serpTime}ms
                    </span>
                  )}
                  {serpResult.dailyUsed !== undefined && (
                    <span className="text-sm text-[rgba(255,255,255,0.60)]">
                      · Daily: {serpResult.dailyUsed} used, {serpResult.dailyRemaining} remaining
                    </span>
                  )}
                </div>
                <pre className="bg-[rgba(0,0,0,0.3)] p-4 rounded-lg overflow-auto text-sm max-h-96">
                  {JSON.stringify(serpResult, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

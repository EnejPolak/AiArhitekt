"use client";

import * as React from "react";

interface GeocodeResult {
  formattedAddress?: string;
  lat?: number;
  lng?: number;
  error?: string;
  status?: number;
}

interface SerpPicked {
  title: string;
  url: string;
  price: number | null;
  currency: "EUR" | null;
  image: string | null;
  domain: string;
  confidence: number;
  reasons: string[];
}

interface SerpResult {
  dryRun?: boolean;
  plannedQueries?: Array<{ item: string; queries: string[] }>;
  executedCount?: number;
  dailyUsed?: number;
  dailyRemaining?: number;
  results?: Array<{
    item: string;
    picked: SerpPicked | null;
    topCandidates?: Array<{ title: string; url: string; snippet: string; score: number }>;
  }>;
  error?: string;
  status?: number;
}

export default function APIDebugPage() {
  // Geocode state
  const [geocodeAddress, setGeocodeAddress] = React.useState("");
  const [geocodeResult, setGeocodeResult] = React.useState<GeocodeResult | null>(null);
  const [geocodeLoading, setGeocodeLoading] = React.useState(false);
  const [geocodeTime, setGeocodeTime] = React.useState<number | null>(null);

  // SERP state
  const [serpItems, setSerpItems] = React.useState(
    "Beige upholstered dining chair, black legs, max €120\nMatte black kitchen faucet, single lever, max €150"
  );
  const [serpMaxRequests, setSerpMaxRequests] = React.useState("6");
  const [serpDryRun, setSerpDryRun] = React.useState(false);
  const [serpResult, setSerpResult] = React.useState<SerpResult | null>(null);
  const [serpLoading, setSerpLoading] = React.useState(false);
  const [serpTime, setSerpTime] = React.useState<number | null>(null);

  // D) Places state (retailer discovery: lat/lng from A, stores + domains)
  const [placesSearchLat, setPlacesSearchLat] = React.useState("");
  const [placesSearchLng, setPlacesSearchLng] = React.useState("");
  const [placesSearchRadiusKm, setPlacesSearchRadiusKm] = React.useState("10");
  const [placesSearchMode, setPlacesSearchMode] = React.useState<"category" | "brand">("category");
  const [placesSearchBrandKeywords, setPlacesSearchBrandKeywords] = React.useState("Merkur, Lesnina, JYSK");
  const [placesSearchDryRun, setPlacesSearchDryRun] = React.useState(false);
  const [placesSearchOnlyWithWebsite, setPlacesSearchOnlyWithWebsite] = React.useState(true);
  const [placesSearchResult, setPlacesSearchResult] = React.useState<any>(null);
  const [placesSearchLoading, setPlacesSearchLoading] = React.useState(false);
  const [placesSearchTime, setPlacesSearchTime] = React.useState<number | null>(null);
  const [allowlistDomainsStores, setAllowlistDomainsStores] = React.useState<string[]>([]);
  const [allowlistDomainsContractors, setAllowlistDomainsContractors] = React.useState<string[]>([]);
  const [allowedDomains, setAllowedDomains] = React.useState<string[]>([]);

  // A done → pre-fill D with lat/lng
  React.useEffect(() => {
    if (geocodeResult?.lat != null && geocodeResult?.lng != null) {
      setPlacesSearchLat(String(geocodeResult.lat));
      setPlacesSearchLng(String(geocodeResult.lng));
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

  const handleSerp = async () => {
    const items = serpItems
      .split("\n")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);

    if (items.length === 0) {
      alert("Please enter at least one item spec");
      return;
    }

    if (!serpDryRun && allowedDomains.length === 0) {
      alert("No store domains provided. Run D) first.");
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
          items,
          maxRequests: parseInt(serpMaxRequests) || 6,
          dryRun: serpDryRun,
          allowlistDomains: allowedDomains.length > 0 ? allowedDomains : undefined,
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

  const handlePlacesSearch = async () => {
    const latStr = placesSearchLat.trim();
    const lngStr = placesSearchLng.trim();

    if (!latStr || !lngStr) {
      alert("Please enter valid lat and lng");
      return;
    }

    const lat = parseFloat(latStr);
    const lng = parseFloat(lngStr);

    if (isNaN(lat) || isNaN(lng)) {
      alert("Please enter valid numeric lat and lng");
      return;
    }

    // Validate range
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      alert("Latitude must be between -90 and 90, Longitude between -180 and 180");
      return;
    }

    setPlacesSearchLoading(true);
    setPlacesSearchResult(null);
    setPlacesSearchTime(null);
    setAllowlistDomainsStores([]);
    setAllowlistDomainsContractors([]);
    setAllowedDomains([]);

    const startTime = Date.now();

    try {
      const body: any = {
        lat,
        lng,
        radiusKm: parseFloat(placesSearchRadiusKm) || 10,
        mode: placesSearchMode,
        dryRun: placesSearchDryRun,
        onlyWithWebsite: placesSearchOnlyWithWebsite,
      };

      if (placesSearchMode === "brand") {
        const brandKeywords = placesSearchBrandKeywords
          .split(",")
          .map((b) => b.trim())
          .filter((b) => b.length > 0);
        if (brandKeywords.length > 0) {
          body.brandKeywords = brandKeywords;
        }
      }

      const response = await fetch("/api/places/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      const elapsed = Date.now() - startTime;

      setPlacesSearchResult({ ...data, status: response.status });
      setPlacesSearchTime(elapsed);

      const storeDomains: string[] = data.allowlistDomainsStores ?? [];
      const contractorDomains: string[] = data.allowlistDomainsContractors ?? [];
      setAllowlistDomainsStores(storeDomains);
      setAllowlistDomainsContractors(contractorDomains);
      setAllowedDomains(storeDomains);
    } catch (error: any) {
      const elapsed = Date.now() - startTime;
      setPlacesSearchResult({ error: error.message, status: 500 });
      setPlacesSearchTime(elapsed);
      setAllowlistDomainsStores([]);
      setAllowlistDomainsContractors([]);
      setAllowedDomains([]);
    } finally {
      setPlacesSearchLoading(false);
    }
  };

  const dEnabled = geocodeResult?.lat != null && geocodeResult?.lng != null;
  const cEnabled = allowedDomains.length > 0;

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

        {/* D) Places (discover stores + domains) — enabled after A has lat/lng */}
        <section className="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)] rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">D) Places (discover stores + domains)</h2>
          {!dEnabled && (
            <p className="text-sm text-[rgba(255,255,255,0.6)] mb-4">
              Run A) Geocode first to get lat/lng.
            </p>
          )}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Latitude</label>
                <input
                  type="number"
                  value={placesSearchLat}
                  onChange={(e) => setPlacesSearchLat(e.target.value)}
                  step="any"
                  placeholder="e.g. 46.0569 (from A)"
                  className="w-full px-4 py-2 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.08)] text-white focus:outline-none focus:border-[#3B82F6]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Longitude</label>
                <input
                  type="number"
                  value={placesSearchLng}
                  onChange={(e) => setPlacesSearchLng(e.target.value)}
                  step="any"
                  placeholder="e.g. 14.5058 (from A)"
                  className="w-full px-4 py-2 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.08)] text-white focus:outline-none focus:border-[#3B82F6]"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Radius (km, 1-50)</label>
                <input
                  type="number"
                  value={placesSearchRadiusKm}
                  onChange={(e) => setPlacesSearchRadiusKm(e.target.value)}
                  min="1"
                  max="50"
                  className="w-full px-4 py-2 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.08)] text-white focus:outline-none focus:border-[#3B82F6]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Mode</label>
                <select
                  value={placesSearchMode}
                  onChange={(e) => setPlacesSearchMode(e.target.value as "category" | "brand")}
                  className="w-full px-4 py-2 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.08)] text-white focus:outline-none focus:border-[#3B82F6]"
                >
                  <option value="category">Category (pohištvo, keramika, železnina)</option>
                  <option value="brand">Brand (custom keywords)</option>
                </select>
              </div>
            </div>
            {placesSearchMode === "brand" && (
              <div>
                <label className="block text-sm font-medium mb-2">Brand Keywords (comma-separated)</label>
                <input
                  type="text"
                  value={placesSearchBrandKeywords}
                  onChange={(e) => setPlacesSearchBrandKeywords(e.target.value)}
                  placeholder="Merkur, Lesnina, JYSK"
                  className="w-full px-4 py-2 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.08)] text-white focus:outline-none focus:border-[#3B82F6]"
                />
              </div>
            )}
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={placesSearchDryRun}
                  onChange={(e) => setPlacesSearchDryRun(e.target.checked)}
                  className="accent-[#3B82F6]"
                />
                <span className="text-sm">Dry Run (no API calls)</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={placesSearchOnlyWithWebsite}
                  onChange={(e) => setPlacesSearchOnlyWithWebsite(e.target.checked)}
                  className="accent-[#3B82F6]"
                />
                <span className="text-sm">Only with website</span>
              </label>
            </div>
            <button
              onClick={handlePlacesSearch}
              disabled={!dEnabled || placesSearchLoading}
              className="w-full px-6 py-2 rounded-lg bg-[#3B82F6] text-white font-medium hover:bg-[#2563EB] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {placesSearchLoading ? "Loading..." : "Search Places (D)"}
            </button>
            {placesSearchResult && (
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="text-sm text-[rgba(255,255,255,0.60)]">
                    Status: {placesSearchResult.status}
                  </span>
                  {placesSearchTime != null && (
                    <span className="text-sm text-[rgba(255,255,255,0.60)]">
                      · {placesSearchTime}ms
                    </span>
                  )}
                  {placesSearchResult.stores?.length != null && (
                    <span className="text-sm text-[rgba(255,255,255,0.60)]">
                      · Stores: {placesSearchResult.stores.length}
                    </span>
                  )}
                  {placesSearchResult.contractors?.length != null && (
                    <span className="text-sm text-[rgba(255,255,255,0.60)]">
                      · Contractors: {placesSearchResult.contractors.length}
                    </span>
                  )}
                  {allowlistDomainsStores.length > 0 && (
                    <span className="text-sm text-[rgba(255,255,255,0.60)]">
                      · Domains (stores): {allowlistDomainsStores.length}
                    </span>
                  )}
                  {allowlistDomainsContractors.length > 0 && (
                    <span className="text-sm text-[rgba(255,255,255,0.60)]">
                      · Domains (contractors): {allowlistDomainsContractors.length}
                    </span>
                  )}
                </div>

                {allowlistDomainsStores.length > 0 && (
                  <div className="mb-3 p-3 bg-[rgba(0,0,0,0.2)] rounded-lg">
                    <div className="text-sm font-medium mb-2">Extracted domains for C) stores (product search)</div>
                    <div className="flex flex-wrap gap-2 text-sm text-[rgba(255,255,255,0.8)]">
                      {allowlistDomainsStores.map((d) => (
                        <span key={d} className="px-2 py-1 rounded bg-[rgba(255,255,255,0.06)]">
                          {d}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {allowlistDomainsContractors.length > 0 && (
                  <div className="mb-3 p-3 bg-[rgba(0,0,0,0.2)] rounded-lg">
                    <div className="text-sm font-medium mb-2">Extracted domains for C) contractors (service search)</div>
                    <div className="flex flex-wrap gap-2 text-sm text-[rgba(255,255,255,0.8)]">
                      {allowlistDomainsContractors.map((d) => (
                        <span key={d} className="px-2 py-1 rounded bg-[rgba(255,255,255,0.06)]">
                          {d}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {placesSearchResult.stores?.length > 0 && (
                  <div className="mb-3 p-3 bg-[rgba(0,0,0,0.2)] rounded-lg max-h-48 overflow-auto">
                    <div className="text-sm font-medium mb-2">Stores (Retail)</div>
                    <ul className="text-sm space-y-1 text-[rgba(255,255,255,0.8)]">
                      {placesSearchResult.stores.slice(0, 15).map((s: any) => (
                        <li key={s.place_id ?? s.name}>
                          {s.name}
                          {s.rating != null && ` · ${s.rating}`}
                          {s.websiteDomain && ` · ${s.websiteDomain}`}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {placesSearchResult.contractors?.length > 0 && (
                  <div className="mb-3 p-3 bg-[rgba(0,0,0,0.2)] rounded-lg max-h-48 overflow-auto">
                    <div className="text-sm font-medium mb-2">Contractors (Services)</div>
                    <ul className="text-sm space-y-1 text-[rgba(255,255,255,0.8)]">
                      {placesSearchResult.contractors.slice(0, 15).map((c: any) => (
                        <li key={c.place_id ?? c.name}>
                          {c.name}
                          {c.rating != null && ` · ${c.rating}`}
                          {c.websiteDomain && ` · ${c.websiteDomain}`}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <pre className="bg-[rgba(0,0,0,0.3)] p-4 rounded-lg overflow-auto text-sm max-h-64">
                  {JSON.stringify(placesSearchResult, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </section>

        {/* C) SERP (search products using domains) — enabled after D has allowlist */}
        <section className="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)] rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">C) SERP (search products using domains)</h2>
          {!cEnabled && !serpDryRun && (
            <p className="text-sm text-amber-400/90 mb-4">
              Run D) Places first to get store domains (allowlist). Or enable Dry Run to plan queries only.
            </p>
          )}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Item specs (one per line)
              </label>
              <textarea
                value={serpItems}
                onChange={(e) => setSerpItems(e.target.value)}
                rows={6}
                placeholder="Beige upholstered dining chair, black legs, max €120"
                className="w-full px-4 py-2 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.08)] text-white focus:outline-none focus:border-[#3B82F6] resize-none font-mono text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Max Requests (1-20)</label>
                <input
                  type="number"
                  value={serpMaxRequests}
                  onChange={(e) => setSerpMaxRequests(e.target.value)}
                  min="1"
                  max="20"
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
                  <span className="text-sm">Dry Run (no external calls)</span>
                </label>
              </div>
            </div>
            <button
              onClick={handleSerp}
              disabled={serpLoading || (!cEnabled && !serpDryRun)}
              className="w-full px-6 py-2 rounded-lg bg-[#3B82F6] text-white font-medium hover:bg-[#2563EB] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {serpLoading ? "Loading..." : !cEnabled && !serpDryRun ? "Run D) Places first" : "Search SERP (C)"}
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
                {serpResult.results && serpResult.results.length > 0 && (
                  <div className="mb-4 space-y-3">
                    {serpResult.results.map((r) => (
                      <div
                        key={r.item}
                        className="bg-[rgba(0,0,0,0.2)] border border-[rgba(255,255,255,0.06)] rounded-lg p-3"
                      >
                        <div className="text-xs text-[rgba(255,255,255,0.5)] mb-1">Item: {r.item}</div>
                        {r.picked ? (
                          <div className="text-sm">
                            <a
                              href={r.picked.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[#3B82F6] hover:underline font-medium"
                            >
                              {r.picked.title}
                            </a>
                            {r.picked.domain && (
                              <span className="text-[rgba(255,255,255,0.5)] ml-2">
                                ({r.picked.domain})
                              </span>
                            )}
                            {r.picked.price != null && (
                              <span className="ml-2 text-[rgba(255,255,255,0.8)]">
                                {r.picked.currency ? `${r.picked.price} ${r.picked.currency}` : r.picked.price}
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="text-sm text-[rgba(255,255,255,0.6)]">
                            No product match found
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
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

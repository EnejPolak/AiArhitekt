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
  score?: number;
  confidence: number;
  reasons: string[];
}

type TopCandidateApi = {
  title: string;
  url: string;
  domain: string;
  snippet?: string;
  price?: { value: number; currency: "EUR" } | null;
  image?: string | null;
  score: number;
  flags: {
    isProductLikeUrl: boolean;
    isCategoryLikeUrl: boolean;
    hasToolIntent: boolean;
    hasHomeIntent: boolean;
  };
};

type SerpResultItem = {
  item: string;
  category?: string;
  topCandidates: TopCandidateApi[];
  picked?: SerpPicked | null;
};

interface SerpResult {
  dryRun?: boolean;
  plannedQueries?: Record<string, string[]> | Array<{ item: string; queries: string[] }>;
  plannedTotalQueries?: number;
  effectiveMaxRequests?: number;
  domainsPerItemUsed?: number;
  variantsUsed?: string;
  executedCount?: number;
  dailyUsed?: number;
  dailyRemaining?: number;
  results?: SerpResultItem[];
  error?: string;
  status?: number;
}

type GptPick = {
  item: string;
  pickedUrl: string | null;
  pickedTitle?: string;
  pickedPrice?: { value: number; currency: "EUR"; unit?: "item" | "m2" | "from" | "set" } | null;
  confidence: "high" | "medium" | "low";
  reason: string;
  selectionSource?: "gpt" | "fallback" | "legacy";
};

/** Safe minimal markdown renderer: headings, bold, links. No script/HTML from content. */
function SummaryMarkdown({ content }: { content: string }) {
  const lines = content.split("\n");
  return (
    <div className="space-y-2">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <br key={i} />;
        if (trimmed.startsWith("### ")) {
          return (
            <h3 key={i} className="text-lg font-semibold mt-4 mb-2">
              {renderInline(trimmed.slice(4))}
            </h3>
          );
        }
        if (trimmed.startsWith("## ")) {
          return (
            <h2 key={i} className="text-xl font-semibold mt-4 mb-2">
              {renderInline(trimmed.slice(3))}
            </h2>
          );
        }
        if (trimmed.startsWith("# ")) {
          return (
            <h1 key={i} className="text-2xl font-bold mt-4 mb-2">
              {renderInline(trimmed.slice(2))}
            </h1>
          );
        }
        return (
          <p key={i} className="leading-relaxed">
            {renderInline(trimmed)}
          </p>
        );
      })}
    </div>
  );
}

/** Render inline: [text](url) -> <a>, **text** -> <strong>. Escapes HTML. */
function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    const linkMatch = remaining.match(/^\[([^\]]*)\]\((https?:\/\/[^)]+)\)/);
    const boldMatch = remaining.match(/^\*\*([^*]+)\*\*/);
    if (linkMatch) {
      const [, label, href] = linkMatch;
      parts.push(
        <a
          key={parts.length}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#3B82F6] hover:underline"
        >
          {label}
        </a>
      );
      remaining = remaining.slice(linkMatch[0].length);
    } else if (boldMatch) {
      parts.push(<strong key={parts.length}>{boldMatch[1]}</strong>);
      remaining = remaining.slice(boldMatch[0].length);
    } else {
      const nextLink = remaining.search(/\[([^\]]*)\]\((https?:\/\/[^)]+)\)/);
      const nextBold = remaining.search(/\*\*[^*]+\*\*/);
      const next = [nextLink, nextBold].filter((n) => n >= 0);
      const slice = next.length ? Math.min(...next) : remaining.length;
      const chunk = remaining.slice(0, slice);
      parts.push(chunk.replace(/</g, "&lt;"));
      remaining = remaining.slice(slice);
    }
  }
  return <>{parts}</>;
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
  const [serpFastMode, setSerpFastMode] = React.useState(true);
  const [serpPreferredDomains, setSerpPreferredDomains] = React.useState("");
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
  const [domainCategoryMapStores, setDomainCategoryMapStores] = React.useState<Record<string, string[]>>({});

  // B) Generate item specs (LLM)
  const ROOM_OPTIONS = [
    { value: "bathroom", label: "Bathroom" },
    { value: "kitchen", label: "Kitchen" },
    { value: "living_room", label: "Living room" },
    { value: "bedroom", label: "Bedroom" },
    { value: "hallway", label: "Hallway" },
    { value: "whole_home", label: "Whole home" },
  ] as const;
  const [rooms, setRooms] = React.useState<string[]>([]);
  const [scope, setScope] = React.useState<"materials" | "contractors" | "both">("materials");
  const [style, setStyle] = React.useState("");
  const [colorsInput, setColorsInput] = React.useState("");
  const [budgetMaxInput, setBudgetMaxInput] = React.useState("");
  const [generateItemsResult, setGenerateItemsResult] = React.useState<{
    items: string[];
    laborSpecs?: string[];
    notes?: string[];
  } | null>(null);
  const [generatedItemsText, setGeneratedItemsText] = React.useState("");
  const [generateItemsLoading, setGenerateItemsLoading] = React.useState(false);
  const [generateItemsRawJson, setGenerateItemsRawJson] = React.useState("");

  // GPT Pick (from topCandidates)
  const [picksFromGpt, setPicksFromGpt] = React.useState<GptPick[]>([]);
  const [pickGptLoading, setPickGptLoading] = React.useState(false);

  // E) Summarize (LLM)
  const [summaryMarkdown, setSummaryMarkdown] = React.useState("");
  const [summaryTotals, setSummaryTotals] = React.useState<{
    knownItemsTotal?: number;
    unknownPriceCount: number;
    unitCostsOrRanges?: Array<{ item: string; value: number; unit: string }>;
  } | null>(null);
  const [summaryLoading, setSummaryLoading] = React.useState(false);

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
          fastMode: serpFastMode,
          allowlistDomains: allowedDomains.length > 0 ? allowedDomains : undefined,
          domainCategoryMap: Object.keys(domainCategoryMapStores).length > 0 ? domainCategoryMapStores : undefined,
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
    setDomainCategoryMapStores({});

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

      const storeDomains: string[] = data.domains?.stores ?? data.allowlistDomainsStores ?? [];
      const contractorDomains: string[] = data.domains?.contractors ?? data.allowlistDomainsContractors ?? [];
      const categoryMap = data.domainCategoryMapStores && typeof data.domainCategoryMapStores === "object" ? data.domainCategoryMapStores : {};
      setAllowlistDomainsStores(storeDomains);
      setAllowlistDomainsContractors(contractorDomains);
      setAllowedDomains(storeDomains);
      setDomainCategoryMapStores(categoryMap);
    } catch (error: any) {
      const elapsed = Date.now() - startTime;
      setPlacesSearchResult({ error: error.message, status: 500 });
      setPlacesSearchTime(elapsed);
      setAllowlistDomainsStores([]);
      setAllowlistDomainsContractors([]);
      setAllowedDomains([]);
      setDomainCategoryMapStores({});
    } finally {
      setPlacesSearchLoading(false);
    }
  };

  const handleGenerateItems = async () => {
    if (allowedDomains.length === 0) {
      alert("Run D) Places first to get store domains.");
      return;
    }
    setGenerateItemsLoading(true);
    setGenerateItemsResult(null);
    setGenerateItemsRawJson("");
    setGeneratedItemsText("");
    try {
      const colors = colorsInput
        .split(/[,;]/)
        .map((c) => c.trim())
        .filter(Boolean);
      const budgetMax = budgetMaxInput.trim() ? parseFloat(budgetMaxInput) : undefined;
      const res = await fetch("/api/orchestrator/generate-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          location: {
            formattedAddress: geocodeResult?.formattedAddress ?? "",
            lat: geocodeResult?.lat,
            lng: geocodeResult?.lng,
            radiusKm: parseFloat(placesSearchRadiusKm) || 10,
          },
          rooms: rooms.length > 0 ? rooms : ["whole_home"],
          scope,
          style: style.trim() || undefined,
          colors: colors.length > 0 ? colors : undefined,
          budgetMax: Number.isFinite(budgetMax) ? budgetMax : undefined,
          allowlistStoreDomains: allowlistDomainsStores,
          domainCategoryMapStores: Object.keys(domainCategoryMapStores).length > 0 ? domainCategoryMapStores : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setGenerateItemsResult(null);
        setGenerateItemsRawJson(JSON.stringify({ error: data.error || res.statusText }, null, 2));
        return;
      }
      const items = Array.isArray(data.items) ? data.items : [];
      setGenerateItemsResult({
        items,
        laborSpecs: data.laborSpecs,
        notes: data.notes,
      });
      setGeneratedItemsText(items.join("\n"));
      setGenerateItemsRawJson(JSON.stringify(data, null, 2));
    } catch (e: any) {
      setGenerateItemsRawJson(JSON.stringify({ error: e.message }, null, 2));
    } finally {
      setGenerateItemsLoading(false);
    }
  };

  const handleUseGeneratedItemsInSerp = () => {
    if (generatedItemsText.trim()) {
      setSerpItems(generatedItemsText.trim());
    }
  };

  const handlePickCandidates = async () => {
    if (!serpResult?.results?.length) {
      alert("Run C) SERP first to get TopCandidates.");
      return;
    }
    setPickGptLoading(true);
    setPicksFromGpt([]);
    try {
      const res = await fetch("/api/orchestrator/pick-candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: serpResult.results.map((r) => ({
            item: r.item,
            category: r.category,
            topCandidates: r.topCandidates ?? [],
            legacyPicked: r.picked
              ? {
                  url: r.picked.url,
                  link: r.picked.url,
                  title: r.picked.title,
                  price: r.picked.price != null ? String(r.picked.price) : undefined,
                  currency: r.picked.currency ?? undefined,
                }
              : null,
          })),
        }),
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data.picks)) {
        setPicksFromGpt(data.picks);
      }
    } catch (e: any) {
      console.error(e);
    } finally {
      setPickGptLoading(false);
    }
  };

  const handleSummarize = async () => {
    const itemsList = generatedItemsText.split("\n").map((i) => i.trim()).filter(Boolean);
    const havePicks = picksFromGpt.length > 0;
    if (!havePicks && !serpResult?.results?.length) {
      alert("Run C) SERP and optionally E) Pick best (GPT) first.");
      return;
    }
    setSummaryLoading(true);
    setSummaryMarkdown("");
    setSummaryTotals(null);
    try {
      const colors = colorsInput
        .split(/[,;]/)
        .map((c) => c.trim())
        .filter(Boolean);
      const body: Record<string, unknown> = {
        rooms: rooms.length > 0 ? rooms : ["whole_home"],
        scope,
        style: style.trim() || undefined,
        colors: colors.length > 0 ? colors : undefined,
        budgetMax: budgetMaxInput.trim() ? parseFloat(budgetMaxInput) : undefined,
        items: itemsList.length > 0 ? itemsList : serpResult?.results?.map((r) => r.item) ?? [],
      };
      if (havePicks) {
        body.picks = picksFromGpt;
      } else {
        body.serpResult = serpResult;
        body.generatedItems = itemsList;
      }
      const res = await fetch("/api/orchestrator/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok && typeof data.markdown === "string") {
        setSummaryMarkdown(data.markdown);
        setSummaryTotals(data.totals ?? null);
      } else {
        setSummaryMarkdown(`Error: ${data.error ?? res.statusText}`);
      }
    } catch (e: any) {
      setSummaryMarkdown(`Error: ${e.message}`);
    } finally {
      setSummaryLoading(false);
    }
  };

  const dEnabled = geocodeResult?.lat != null && geocodeResult?.lng != null;
  const bEnabled = dEnabled && allowedDomains.length > 0;
  const cEnabled = allowedDomains.length > 0;

  return (
    <div className="min-h-screen bg-background text-foreground p-8">
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
                  <span className="text-sm text-[rgba(255,255,255,0.60)]">
                    · Stores: {placesSearchResult.stores?.length ?? 0}
                  </span>
                  <span className="text-sm text-[rgba(255,255,255,0.60)]">
                    · Contractors: {placesSearchResult.contractors?.length ?? 0}
                  </span>
                  <span className="text-sm text-[rgba(255,255,255,0.60)]">
                    · Domains(stores): {allowlistDomainsStores.length}
                  </span>
                  <span className="text-sm text-[rgba(255,255,255,0.60)]">
                    · Domains(contractors): {allowlistDomainsContractors.length}
                  </span>
                  {placesSearchResult.meta?.requestsMade != null && (
                    <span className="text-sm text-[rgba(255,255,255,0.60)]">
                      · Requests: {placesSearchResult.meta.requestsMade}
                    </span>
                  )}
                </div>

                {(placesSearchResult.meta?.plannedQueries?.length > 0 || placesSearchResult.meta?.plannedTypes?.length > 0) && (
                  <div className="mb-3 p-3 bg-[rgba(0,0,0,0.2)] rounded-lg">
                    <div className="text-sm font-medium mb-2">Planned (dry run)</div>
                    {placesSearchResult.meta.plannedQueries?.length > 0 && (
                      <div className="text-xs text-[rgba(255,255,255,0.7)] mb-2">
                        Queries: {placesSearchResult.meta.plannedQueries.join(" | ")}
                      </div>
                    )}
                    {placesSearchResult.meta.plannedTypes?.length > 0 && (
                      <div className="text-xs text-[rgba(255,255,255,0.7)]">
                        Types: {placesSearchResult.meta.plannedTypes.join(", ")}
                      </div>
                    )}
                  </div>
                )}

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
                    <div className="text-sm font-medium mb-2">Extracted domains for service search (contractors)</div>
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

        {/* B) Generate item specs (ChatGPT) — enabled after D has allowlist */}
        <section className="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)] rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">B) Generate item specs (ChatGPT)</h2>
          {!bEnabled && (
            <p className="text-sm text-[rgba(255,255,255,0.6)] mb-4">
              Run A) and D) first to get location and store domains.
            </p>
          )}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Rooms</label>
              <div className="flex flex-wrap gap-2">
                {ROOM_OPTIONS.map(({ value, label }) => (
                  <label key={value} className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={rooms.includes(value)}
                      onChange={(e) => {
                        if (e.target.checked) setRooms((r) => [...r, value]);
                        else setRooms((r) => r.filter((x) => x !== value));
                      }}
                      className="accent-[#3B82F6]"
                    />
                    <span className="text-sm">{label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Scope</label>
                <select
                  value={scope}
                  onChange={(e) => setScope(e.target.value as "materials" | "contractors" | "both")}
                  className="w-full px-4 py-2 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.08)] text-white focus:outline-none focus:border-[#3B82F6]"
                >
                  <option value="materials">Materials</option>
                  <option value="contractors">Contractors</option>
                  <option value="both">Both</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Style (optional)</label>
                <input
                  type="text"
                  value={style}
                  onChange={(e) => setStyle(e.target.value)}
                  placeholder="e.g. modern, Scandinavian"
                  className="w-full px-4 py-2 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.08)] text-white focus:outline-none focus:border-[#3B82F6]"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Colors (comma-separated, optional)</label>
                <input
                  type="text"
                  value={colorsInput}
                  onChange={(e) => setColorsInput(e.target.value)}
                  placeholder="e.g. white, wood"
                  className="w-full px-4 py-2 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.08)] text-white focus:outline-none focus:border-[#3B82F6]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Budget max EUR (optional)</label>
                <input
                  type="number"
                  value={budgetMaxInput}
                  onChange={(e) => setBudgetMaxInput(e.target.value)}
                  placeholder="e.g. 2000"
                  min={0}
                  className="w-full px-4 py-2 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.08)] text-white focus:outline-none focus:border-[#3B82F6]"
                />
              </div>
            </div>
            <button
              onClick={handleGenerateItems}
              disabled={!bEnabled || generateItemsLoading}
              className="w-full px-6 py-2 rounded-lg bg-[#3B82F6] text-white font-medium hover:bg-[#2563EB] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {generateItemsLoading ? "Generating..." : "Generate items"}
            </button>
            {(generateItemsResult || generateItemsRawJson) && (
              <div className="space-y-3">
                {generateItemsResult && (
                  <>
                    <div>
                      <label className="block text-sm font-medium mb-2">Generated items (editable)</label>
                      <textarea
                        value={generatedItemsText}
                        onChange={(e) => setGeneratedItemsText(e.target.value)}
                        rows={8}
                        className="w-full px-4 py-2 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.08)] text-white focus:outline-none focus:border-[#3B82F6] resize-none font-mono text-sm"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleUseGeneratedItemsInSerp}
                      className="px-4 py-2 rounded-lg bg-[#2563EB] text-white text-sm font-medium hover:bg-[#1d4ed8]"
                    >
                      Use generated items in SERP
                    </button>
                    {(generateItemsResult.laborSpecs?.length ?? 0) > 0 && (
                      <div className="p-3 bg-[rgba(0,0,0,0.2)] rounded-lg">
                        <div className="text-sm font-medium mb-2">Labor specs (for contractors)</div>
                        <ul className="text-sm text-[rgba(255,255,255,0.8)] space-y-1 list-disc list-inside">
                          {generateItemsResult.laborSpecs!.map((s, i) => (
                            <li key={i}>{s}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {generateItemsResult.notes && generateItemsResult.notes.length > 0 && (
                      <div className="text-xs text-[rgba(255,255,255,0.6)]">
                        Notes: {generateItemsResult.notes.join(" ")}
                      </div>
                    )}
                  </>
                )}
                {generateItemsRawJson && (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-[rgba(255,255,255,0.5)]">Raw JSON</span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(generateItemsRawJson);
                        }}
                        className="px-2 py-1 rounded bg-[rgba(255,255,255,0.08)] text-xs hover:bg-[rgba(255,255,255,0.12)]"
                      >
                        Copy
                      </button>
                    </div>
                    <pre className="bg-[rgba(0,0,0,0.3)] p-4 rounded-lg overflow-auto text-xs max-h-48">
                      {generateItemsRawJson}
                    </pre>
                  </>
                )}
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
            <div>
              <label className="block text-sm font-medium mb-2">
                Preferred domains (one per line)
              </label>
              <textarea
                value={serpPreferredDomains}
                onChange={(e) => setSerpPreferredDomains(e.target.value)}
                rows={2}
                placeholder="e.g. example.com (one domain per line)"
                className="w-full px-4 py-2 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.08)] text-white focus:outline-none focus:border-[#3B82F6] resize-none font-mono text-sm"
              />
              <p className="text-xs text-[rgba(255,255,255,0.5)] mt-1">
                Optional. Matched domains appear first per item; remaining slots filled by hash-ordered candidates.
              </p>
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
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={serpFastMode}
                      onChange={(e) => setSerpFastMode(e.target.checked)}
                      className="accent-[#3B82F6]"
                    />
                    <span className="text-sm">Fast mode (~30–45s, cap 50 requests)</span>
                  </label>
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
            </div>
            <button
              onClick={handleSerp}
              disabled={serpLoading || (!cEnabled && !serpDryRun)}
              className="w-full px-6 py-2 rounded-lg bg-[#3B82F6] text-white font-medium hover:bg-[#2563EB] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {serpLoading ? "Loading..." : !cEnabled && !serpDryRun ? "Run D) Places first" : "Run SERP (TopCandidates)"}
            </button>
            <button
              type="button"
              onClick={handlePickCandidates}
              disabled={!serpResult?.results?.length || pickGptLoading}
              className="w-full px-6 py-2 rounded-lg bg-[#2563EB] text-white font-medium hover:bg-[#1d4ed8] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {pickGptLoading ? "Picking..." : "Pick best (GPT)"}
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
                  {serpResult.plannedTotalQueries != null && (
                    <span className="text-sm text-[rgba(255,255,255,0.60)]">
                      · Planned: {serpResult.plannedTotalQueries}
                    </span>
                  )}
                  {serpResult.effectiveMaxRequests != null && (
                    <span className="text-sm text-[rgba(255,255,255,0.60)]">
                      · Effective max: {serpResult.effectiveMaxRequests}
                    </span>
                  )}
                  {serpResult.domainsPerItemUsed != null && (
                    <span className="text-sm text-[rgba(255,255,255,0.60)]">
                      · Domains/item: {serpResult.domainsPerItemUsed}
                    </span>
                  )}
                  {serpResult.variantsUsed && (
                    <span className="text-sm text-[rgba(255,255,255,0.60)]">
                      · Variants: {serpResult.variantsUsed}
                    </span>
                  )}
                  {serpResult.dailyUsed !== undefined && (
                    <span className="text-sm text-[rgba(255,255,255,0.60)]">
                      · Daily: {serpResult.dailyUsed} used, {serpResult.dailyRemaining} remaining
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const res = await fetch("/api/serp/reset-usage", { method: "POST" });
                            const data = await res.json();
                            if (res.ok && data.ok) {
                              setSerpResult((prev) =>
                                prev
                                  ? { ...prev, dailyUsed: 0, dailyRemaining: data.remaining ?? 100 }
                                  : null
                              );
                            } else {
                              alert(data.error ?? "Reset failed");
                            }
                          } catch (e: any) {
                            alert(e?.message ?? "Reset failed");
                          }
                        }}
                        className="ml-2 px-2 py-0.5 rounded text-xs bg-amber-600/80 hover:bg-amber-500 text-black"
                      >
                        Ponastavi na 0
                      </button>
                    </span>
                  )}
                </div>
                {serpResult.results && serpResult.results.length > 0 && (
                  <div className="mb-4 space-y-3">
                    {serpResult.results.map((r) => {
                      const gptPick = picksFromGpt.find((p) => p.item === r.item);
                      const topCandidates = r.topCandidates ?? [];
                      return (
                        <div
                          key={r.item}
                          className="bg-[rgba(0,0,0,0.2)] border border-[rgba(255,255,255,0.06)] rounded-lg p-3"
                        >
                          <div className="text-xs text-[rgba(255,255,255,0.5)] mb-1">
                            Item: {r.item}
                            {r.category && (
                              <span className="ml-2 text-[rgba(255,255,255,0.4)]">· {r.category}</span>
                            )}
                          </div>
                          {gptPick?.pickedUrl ? (
                            <div className="text-sm mb-2">
                              <span className="text-[rgba(255,255,255,0.5)]">Chosen: </span>
                              <span
                                className="ml-1 px-1.5 py-0.5 rounded text-xs font-medium bg-[rgba(255,255,255,0.1)]"
                                title={gptPick.selectionSource}
                              >
                                {gptPick.selectionSource ?? "gpt"}
                              </span>
                              <a
                                href={gptPick.pickedUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="ml-2 text-[#3B82F6] hover:underline font-medium"
                              >
                                {gptPick.pickedTitle ?? gptPick.pickedUrl}
                              </a>
                              {gptPick.pickedPrice != null && (
                                <span className="ml-2 text-[rgba(255,255,255,0.8)]">
                                  {gptPick.pickedPrice.value} {gptPick.pickedPrice.currency}
                                  {gptPick.pickedPrice.unit && gptPick.pickedPrice.unit !== "item" && (
                                    <span className="text-[rgba(255,255,255,0.5)]">/{gptPick.pickedPrice.unit}</span>
                                  )}
                                </span>
                              )}
                              <span className="ml-2 text-[rgba(255,255,255,0.45)]">
                                ({gptPick.confidence}) {gptPick.reason?.slice(0, 60)}
                              </span>
                            </div>
                          ) : r.picked ? (
                            <div className="text-sm mb-2">
                              <a
                                href={r.picked.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[#3B82F6] hover:underline font-medium"
                              >
                                {r.picked.title}
                              </a>
                              {r.picked.domain && (
                                <span className="text-[rgba(255,255,255,0.5)] ml-2">({r.picked.domain})</span>
                              )}
                              {r.picked.price != null && (
                                <span className="ml-2 text-[rgba(255,255,255,0.8)]">
                                  {r.picked.currency ? `${r.picked.price} ${r.picked.currency}` : r.picked.price}
                                </span>
                              )}
                            </div>
                          ) : (
                            <div className="text-sm text-[rgba(255,255,255,0.6)] mb-2">
                              No product match found
                            </div>
                          )}
                          {topCandidates.length > 0 && (
                            <details className="mt-2 text-xs">
                              <summary className="cursor-pointer text-[rgba(255,255,255,0.5)] hover:text-[rgba(255,255,255,0.7)]">
                                TopCandidates ({topCandidates.length})
                              </summary>
                              <ul className="mt-2 space-y-1 pl-4 list-disc text-[rgba(255,255,255,0.75)]">
                                {topCandidates.map((c, i) => (
                                  <li key={i}>
                                    <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-[#3B82F6] hover:underline">
                                      {c.title}
                                    </a>
                                    {c.price != null && (
                                      <span className="ml-2">{c.price.value} {c.price.currency}</span>
                                    )}
                                    <span className="ml-2 text-[rgba(255,255,255,0.45)]">
                                      score {c.score} · productLike {String(c.flags?.isProductLikeUrl)} · toolIntent {String(c.flags?.hasToolIntent)}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </details>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                <pre className="bg-[rgba(0,0,0,0.3)] p-4 rounded-lg overflow-auto text-sm max-h-96">
                  {JSON.stringify(serpResult, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </section>

        {/* E) Summarize (LLM) — room-by-room with links */}
        <section className="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)] rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">E) Summarize results (ChatGPT)</h2>
          <p className="text-sm text-[rgba(255,255,255,0.6)] mb-4">
            Run C) SERP, then optionally Pick best (GPT). Summary uses picks or SERP data; no invented prices. Every item includes its URL.
          </p>
          <button
            onClick={handleSummarize}
            disabled={(!serpResult?.results?.length && !picksFromGpt.length) || summaryLoading}
            className="w-full px-6 py-2 rounded-lg bg-[#3B82F6] text-white font-medium hover:bg-[#2563EB] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {summaryLoading ? "Summarizing..." : "Summarize (GPT)"}
          </button>
          {summaryTotals && (
            <div className="mt-2 text-sm text-[rgba(255,255,255,0.6)] space-y-1">
              {summaryTotals.knownItemsTotal != null && (
                <div>Total (per-item prices): {summaryTotals.knownItemsTotal} EUR</div>
              )}
              {summaryTotals.unknownPriceCount > 0 && (
                <div>{summaryTotals.unknownPriceCount} items without price</div>
              )}
              {summaryTotals.unitCostsOrRanges && summaryTotals.unitCostsOrRanges.length > 0 && (
                <div>
                  Unit costs / ranges:{" "}
                  {summaryTotals.unitCostsOrRanges.map((u) => `${u.item}: ${u.value} EUR/${u.unit}`).join("; ")}
                </div>
              )}
            </div>
          )}
          {summaryMarkdown && (
            <div className="mt-4 p-4 rounded-lg bg-[rgba(0,0,0,0.3)] overflow-auto text-sm text-[rgba(255,255,255,0.9)] summary-markdown">
              <SummaryMarkdown content={summaryMarkdown} />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

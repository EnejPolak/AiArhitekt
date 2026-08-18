"use client";

import * as React from "react";
import {
  discoverProjectProductsAction,
  setProductConfirmed,
} from "@/lib/discovery/actions";
import type { ProductDiscoveryView, ProductSelectionView } from "@/lib/discovery/types";
import {
  discoveryMatchesShoppingSource,
} from "@/lib/discovery/stale";
import type { ShoppingPreferenceInput } from "@/lib/discovery/preferences";

export interface Step9aStoreDiscoveryProps {
  projectId: string;
  location: { lat: number; lng: number; label: string } | null;
  radiusKm: number;
  initialDiscovery: ProductDiscoveryView | null;
  initialSelections: ProductSelectionView[];
  shoppingPreferences?: ShoppingPreferenceInput;
  onComplete: (state: {
    discovery: ProductDiscoveryView;
    selections: ProductSelectionView[];
  }) => void;
}

type Phase = "ready" | "finding_stores" | "searching_products" | "results" | "error";

function requirementLabel(selection: ProductSelectionView): string {
  const snap = selection.requirementSnapshot as { category?: unknown; surface?: unknown } | null;
  if (snap && typeof snap.category === "string") {
    if (selection.requirementType === "material" && typeof snap.surface === "string") {
      return `${snap.surface}: ${snap.category}`;
    }
    return snap.category;
  }
  return selection.itemSpec;
}

function formatPrice(price: number | null, currency: "EUR" | null): string {
  if (price == null) return "Price unavailable";
  try {
    return new Intl.NumberFormat("sl-SI", {
      style: "currency",
      currency: currency ?? "EUR",
      minimumFractionDigits: 2,
    }).format(price);
  } catch {
    return "Price unavailable";
  }
}

export const Step9aStoreDiscovery: React.FC<Step9aStoreDiscoveryProps> = ({
  projectId,
  location,
  radiusKm,
  initialDiscovery,
  initialSelections,
  shoppingPreferences,
  onComplete,
}) => {
  const [discovery, setDiscovery] = React.useState<ProductDiscoveryView | null>(initialDiscovery);
  const [selections, setSelections] = React.useState<ProductSelectionView[]>(initialSelections);
  const [address, setAddress] = React.useState(
    location?.label ?? initialDiscovery?.locationInput ?? ""
  );
  const [phase, setPhase] = React.useState<Phase>(() => {
    if (!initialDiscovery) return "ready";
    const loc = location?.label ?? initialDiscovery.locationInput ?? "";
    return discoveryMatchesShoppingSource(initialDiscovery, {
      locationInput: loc,
      preferences: shoppingPreferences,
    })
      ? "results"
      : "ready";
  });
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const inFlight = React.useRef(false);

  const locationInput = address.trim() || location?.label || discovery?.locationInput || "";
  const shoppingCurrent = Boolean(
    discovery &&
      discoveryMatchesShoppingSource(discovery, {
        locationInput,
        preferences: shoppingPreferences,
      })
  );
  const isStale = Boolean(discovery) && !shoppingCurrent;
  const showResults =
    Boolean(discovery) &&
    shoppingCurrent &&
    phase !== "finding_stores" &&
    phase !== "searching_products";

  const runDiscovery = async (refresh: boolean) => {
    if (inFlight.current) return;
    if (!locationInput) {
      setError("Enter an address so I can search nearby stores.");
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setPhase("finding_stores");

    const searchingTimer = window.setTimeout(() => {
      setPhase("searching_products");
    }, 900);

    try {
      const result = await discoverProjectProductsAction({
        projectId,
        locationInput,
        radiusKm,
        refresh,
        wallMainColor: shoppingPreferences?.wallMainColor ?? undefined,
        wallAccentColor: shoppingPreferences?.wallAccentColor ?? undefined,
        keepExistingWalls: shoppingPreferences?.keepExistingWalls ?? undefined,
        flooring: shoppingPreferences?.flooring as
          | "keep"
          | "hardwood"
          | "laminate"
          | "tiles"
          | "marble"
          | undefined,
        underfloorHeating: shoppingPreferences?.underfloorHeating ?? undefined,
        bedType: shoppingPreferences?.bedType as
          | "none"
          | "king"
          | "queen"
          | "bunk"
          | "single"
          | undefined,
        selectedStyles: shoppingPreferences?.selectedStyles ?? undefined,
      });
      if (!result.ok) {
        setPhase(shoppingCurrent ? "results" : "error");
        setError(result.message);
        return;
      }
      setDiscovery(result.discovery);
      setSelections(result.selections);
      setPhase("results");
    } catch {
      setPhase(shoppingCurrent ? "results" : "error");
      setError("Could not find products. Try again.");
    } finally {
      window.clearTimeout(searchingTimer);
      inFlight.current = false;
      setBusy(false);
    }
  };

  const toggleConfirm = async (selection: ProductSelectionView) => {
    const next = !selection.isConfirmed;
    const result = await setProductConfirmed({
      selectionId: selection.id,
      confirmed: next,
    });
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setSelections((prev) =>
      prev.map((item) => (item.id === result.selection.id ? result.selection : item))
    );
  };

  const unmatchedNotFound = discovery?.unmatchedRequirements.filter((item) => item.reason === "no_valid_product") ?? [];
  const unmatchedNotSearched = discovery?.unmatchedRequirements.filter((item) => item.reason === "not_searched") ?? [];

  if (phase === "finding_stores" || phase === "searching_products") {
    return (
      <div className="flex justify-start mb-6">
        <div className="max-w-[85%] rounded-[16px] px-6 py-5 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)]">
          <div className="text-[15px] text-[rgba(255,255,255,0.85)] leading-relaxed mb-3">
            {phase === "finding_stores"
              ? "Finding local stores…"
              : "Searching products in nearby stores…"}
          </div>
          <div className="flex items-center justify-center">
            <div className="w-12 h-12 border-4 border-[rgba(255,255,255,0.1)] border-t-[#3B82F6] rounded-full animate-spin" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start mb-6">
      <div className="max-w-[85%] rounded-[16px] px-6 py-5 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)] space-y-5">
        <div className="text-[15px] text-[rgba(255,255,255,0.85)] leading-relaxed">
          I will search nearby stores for real furniture and materials from the room analysis.
          This does not generate a render.
        </div>

        {isStale ? (
          <p className="text-[14px] text-[rgba(255,255,255,0.80)]" role="status">
            Your preferences changed. Find products again.
          </p>
        ) : null}

        {!showResults ? (
          <div>
            <label className="block text-sm font-medium text-white mb-2">Search near</label>
            <input
              type="text"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="Address or city"
              className="w-full px-4 py-3 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.08)] text-white text-sm focus:outline-none focus:border-[#3B82F6]"
            />
          </div>
        ) : (
          <div className="text-[13px] text-[rgba(255,255,255,0.60)]">
            Searched near {discovery?.locationInput}
          </div>
        )}

        {error ? (
          <p className="text-[13px] text-[#E5484D]" role="alert">
            {error}
          </p>
        ) : null}

        {showResults && selections.length === 0 && unmatchedNotFound.length === 0 ? (
          <p className="text-[14px] text-[rgba(255,255,255,0.70)]">
            No products were found for the current requirements.
          </p>
        ) : null}

        {showResults && selections.length > 0 && unmatchedNotFound.length > 0 ? (
          <p className="text-[13px] text-[rgba(255,255,255,0.55)]">
            Partial results: {selections.length} product{selections.length === 1 ? "" : "s"} found,
            {` ${unmatchedNotFound.length} not found.`}
          </p>
        ) : null}

        {showResults ? (
        <div className="space-y-4">
          {selections.map((selection) => (
            <div
              key={selection.id}
              className="rounded-[12px] border border-[rgba(255,255,255,0.10)] p-4"
            >
              <div className="text-[12px] uppercase tracking-[0.08em] text-[rgba(255,255,255,0.45)] mb-2">
                AI Architect found this product for: {requirementLabel(selection)}
              </div>
              <div className="flex gap-4">
                {selection.productImageUrl ? (
                  <img
                    src={selection.productImageUrl}
                    alt=""
                    className="w-20 h-20 object-cover rounded-md border border-[rgba(255,255,255,0.08)]"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-md border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] flex items-center justify-center text-[11px] text-[rgba(255,255,255,0.45)] text-center px-1">
                    No image
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-medium text-white">{selection.productTitle}</div>
                  <div className="text-[13px] text-[rgba(255,255,255,0.65)] mt-1">
                    {formatPrice(selection.price, selection.currency)}
                  </div>
                  <div className="text-[12px] text-[rgba(255,255,255,0.50)] mt-1">
                    {selection.retailerName ?? selection.retailerDomain}
                  </div>
                  {!selection.hasReferenceImage ? (
                    <div className="text-[11px] text-[rgba(255,255,255,0.40)] mt-1">
                      Not yet reference-ready for the future render
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-3 mt-3">
                    <a
                      href={selection.productUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[13px] text-[#3B82F6] hover:underline"
                    >
                      Open product
                    </a>
                    <button
                      type="button"
                      onClick={() => void toggleConfirm(selection)}
                      className="text-[13px] text-[rgba(0,230,204,0.85)] hover:text-[rgba(0,230,204,1)]"
                    >
                      {selection.isConfirmed ? "Selected for design" : "Use in design"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
        ) : null}

        {showResults && unmatchedNotFound.length > 0 ? (
          <div className="text-[13px] text-[rgba(255,255,255,0.55)]">
            No valid product for:{" "}
            {unmatchedNotFound.map((item) => item.itemSpec).join(", ")}
          </div>
        ) : null}

        {showResults && unmatchedNotSearched.length > 0 ? (
          <div className="text-[13px] text-[rgba(255,255,255,0.45)]">
            {unmatchedNotSearched.length} additional requirement
            {unmatchedNotSearched.length === 1 ? "" : "s"} were not searched (limit 10 per run).
          </div>
        ) : null}

        <div className="flex flex-wrap gap-3 pt-1">
          {!showResults ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void runDiscovery(false)}
              className="text-[14px] text-[rgba(0,230,204,0.85)] hover:text-[rgba(0,230,204,1)] disabled:opacity-40"
            >
              Find products
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => discovery && onComplete({ discovery, selections })}
                className="text-[14px] text-[rgba(0,230,204,0.85)] hover:text-[rgba(0,230,204,1)]"
              >
                Continue
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void runDiscovery(true)}
                className="text-[14px] text-[rgba(255,255,255,0.70)] hover:text-white disabled:opacity-40"
              >
                Refresh products
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

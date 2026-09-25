"use client";

import * as React from "react";
import {
  discoverProjectProductsAction,
} from "@/lib/discovery/actions";
import type { ProductDiscoveryView, ProductSelectionView } from "@/lib/discovery/types";
import {
  discoveryMatchesShoppingSource,
} from "@/lib/discovery/stale";
import {
  loadStoredShoppingPreferenceSnapshot,
  shoppingPreferenceInputFromSnapshot,
  type ShoppingPreferenceInput,
} from "@/lib/discovery/preferences";
import {
  resolvedRequirementUiLabel,
  unmatchedRequirementDisplayLabel,
} from "@/lib/discovery/requirementLabels";
import {
  discoveryCustomerMessage,
  discoveryLoadingStage,
  discoveryRetryLabel,
  discoveryUiKind,
  networkCustomerMessage,
} from "@/lib/ui/customerCopy";
import { wizardPanelClass } from "../wizardUi";
import { FurnishingPlanReview } from "../FurnishingPlanReview";
import type { RoomAnalysisView } from "@/lib/analysis/types";
import type { FurnishingPlanOverrides } from "@/lib/discovery/furnishingPlan";
import { EMPTY_FURNISHING_PLAN_OVERRIDES } from "@/lib/discovery/furnishingPlan";
import { SHOPPING_RETRYABLE_REASONS } from "@/lib/discovery/shoppingState";

export interface Step9aStoreDiscoveryProps {
  projectId: string;
  location: { lat: number; lng: number; label: string } | null;
  radiusKm: number;
  initialDiscovery: ProductDiscoveryView | null;
  initialSelections: ProductSelectionView[];
  shoppingPreferences?: ShoppingPreferenceInput;
  analysis?: RoomAnalysisView | null;
  furnishingPlan?: FurnishingPlanOverrides;
  onFurnishingPlanChange?: (next: FurnishingPlanOverrides) => void;
  onComplete: (state: {
    discovery: ProductDiscoveryView;
    selections: ProductSelectionView[];
  }) => void;
  onDiscoveryUpdated?: (state: {
    discovery: ProductDiscoveryView;
    selections: ProductSelectionView[];
  }) => void;
  onRetryRequirement?: (requirementKey: string) => void;
  onChangeConstraints?: (requirementKey: string) => void;
  onIncreaseBudget?: (requirementKey: string) => void;
  onRemoveRequirement?: (requirementKey: string) => void;
  retryBusyKey?: string | null;
}

type Phase = "ready" | "searching" | "results" | "error";

function requirementLabel(selection: ProductSelectionView): string {
  return resolvedRequirementUiLabel({
    itemSpec: selection.itemSpec,
    requirementSnapshot: selection.requirementSnapshot,
  });
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
  analysis,
  furnishingPlan,
  onFurnishingPlanChange,
  onComplete,
  onDiscoveryUpdated,
  onRetryRequirement,
  onChangeConstraints,
  onIncreaseBudget,
  onRemoveRequirement,
  retryBusyKey,
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
      latitude: location?.lat,
      longitude: location?.lng,
      radiusKm,
      preferences: shoppingPreferences,
    })
      ? "results"
      : "ready";
  });
  const [error, setError] = React.useState<string | null>(null);
  const [errorCode, setErrorCode] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [elapsedMs, setElapsedMs] = React.useState(0);
  const inFlight = React.useRef(false);

  React.useEffect(() => {
    if (!busy) {
      setElapsedMs(0);
      return;
    }
    const started = Date.now();
    const timer = window.setInterval(() => {
      setElapsedMs(Date.now() - started);
    }, 400);
    return () => window.clearInterval(timer);
  }, [busy]);

  const effectiveShoppingPreferences = React.useMemo(
    () =>
      shoppingPreferences ??
      (discovery?.sourcePreferences
        ? shoppingPreferenceInputFromSnapshot(
            loadStoredShoppingPreferenceSnapshot(discovery.sourcePreferences)
          )
        : undefined),
    [shoppingPreferences, discovery?.sourcePreferences]
  );

  const locationInput = address.trim() || location?.label || discovery?.locationInput || "";
  const shoppingCurrent = Boolean(
    discovery &&
      effectiveShoppingPreferences &&
      discoveryMatchesShoppingSource(discovery, {
        locationInput,
        latitude: location?.lat,
        longitude: location?.lng,
        radiusKm,
        preferences: effectiveShoppingPreferences,
      })
  );
  const isStale = Boolean(discovery) && !shoppingCurrent;
  const showResults =
    Boolean(discovery) &&
    shoppingCurrent &&
    phase !== "searching";

  const runDiscovery = async (refresh: boolean) => {
    if (inFlight.current) return;
    if (!locationInput) {
      setErrorCode("location_required");
      setError(discoveryCustomerMessage("location_required"));
      setPhase("error");
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setErrorCode(null);
    setPhase("searching");

    const attemptId = crypto.randomUUID();
    const clientStarted = Date.now();

    if (process.env.NODE_ENV !== "production") {
      console.info("[discovery-client]", {
        attemptId,
        phase: "started",
        refresh,
        startedAt: new Date(clientStarted).toISOString(),
      });
    }

    try {
      const result = await discoverProjectProductsAction({
        projectId,
        locationInput,
        radiusKm,
        refresh,
        attemptId,
      });
      const elapsed = Date.now() - clientStarted;
      if (!result.ok) {
        if (process.env.NODE_ENV !== "production") {
          console.error("[discovery-client]", {
            attemptId,
            phase: "resolved_error",
            code: result.code,
            elapsedMs: elapsed,
          });
        }
        setErrorCode(result.code);
        setError(discoveryCustomerMessage(result.code));
        setPhase(shoppingCurrent ? "results" : "error");
        return;
      }
      if (process.env.NODE_ENV !== "production") {
        console.info("[discovery-client]", {
          attemptId,
          phase: "resolved_ok",
          reused: result.reused,
          elapsedMs: elapsed,
        });
      }
      setDiscovery(result.discovery);
      setSelections(result.selections);
      onDiscoveryUpdated?.({ discovery: result.discovery, selections: result.selections });
      setPhase("results");
    } catch (caught) {
      const elapsed = Date.now() - clientStarted;
      if (process.env.NODE_ENV !== "production") {
        console.error("[discovery-client]", {
          attemptId,
          phase: "rejected",
          errorName: caught instanceof Error ? caught.name : "unknown",
          elapsedMs: elapsed,
        });
      }
      setErrorCode("failed");
      setError(networkCustomerMessage(caught));
      setPhase(shoppingCurrent ? "results" : "error");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const unmatchedNotFound =
    discovery?.unmatchedRequirements.filter(
      (item) => item.reason === "no_valid_product" || item.reason === "search_interrupted"
    ) ?? [];
  const unmatchedNotSearched = discovery?.unmatchedRequirements.filter((item) => item.reason === "not_searched") ?? [];
  const allNotFound = showResults && selections.length === 0;
  const uiKind = discoveryUiKind(errorCode);
  const retryLabel = discoveryRetryLabel(errorCode);

  if (phase === "searching") {
    const stage = discoveryLoadingStage(elapsedMs);
    return (
      <div className="flex justify-start mb-6">
        <div className={wizardPanelClass}>
          <div className="text-[15px] text-[rgba(255,255,255,0.85)] leading-relaxed mb-2" aria-live="polite">
            {stage}…
          </div>
          <p className="text-[13px] text-[rgba(255,255,255,0.55)] mb-4">
            This can take up to a minute. Stay on this page — your project stays saved.
          </p>
          <div className="flex items-center justify-center">
            <div
              className="w-12 h-12 border-4 border-[rgba(255,255,255,0.1)] border-t-[#3B82F6] rounded-full animate-spin"
              role="status"
              aria-label={stage}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start mb-6">
      <div className={`${wizardPanelClass} space-y-5`}>
        <div className="text-[15px] text-[rgba(255,255,255,0.85)] leading-relaxed">
          I will search nearby stores for the furnishing categories the design plan requires. You approve or replace individual products afterward. This does not generate a render.
        </div>

        <FurnishingPlanReview
          analysis={analysis ?? null}
          shoppingPreferences={effectiveShoppingPreferences}
          planOverrides={furnishingPlan ?? EMPTY_FURNISHING_PLAN_OVERRIDES}
          onPlanChange={(next) => onFurnishingPlanChange?.(next)}
          disabled={busy}
        />

        {isStale ? (
          <p className="text-[14px] text-[rgba(255,255,255,0.80)]" role="status">
            Your preferences changed. Find products again.
          </p>
        ) : null}

        {!showResults ? (
          location ? (
            <div className="text-[13px] text-[rgba(255,255,255,0.60)] break-words">
              Search near {location.label} ({radiusKm} km)
            </div>
          ) : (
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
          )
        ) : (
          <div className="text-[13px] text-[rgba(255,255,255,0.60)] break-words">
            Searched near {discovery?.locationInput}
            {discovery?.radiusKm != null ? ` · ${discovery.radiusKm} km` : ""}
          </div>
        )}

        {error ? (
          <div
            className={
              uiKind === "retryable"
                ? "rounded-lg border border-[rgba(239,68,68,0.25)] bg-[rgba(239,68,68,0.08)] px-4 py-3"
                : "rounded-lg border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.03)] px-4 py-3"
            }
            role="alert"
          >
            <p
              className={
                uiKind === "retryable"
                  ? "text-[14px] text-[#FCA5A5]"
                  : "text-[14px] text-[rgba(255,255,255,0.80)]"
              }
            >
              {error}
            </p>
          </div>
        ) : null}

        {allNotFound ? (
          <div className="rounded-lg border border-[rgba(255,255,255,0.10)] px-4 py-3" role="status">
            <p className="text-[14px] text-[rgba(255,255,255,0.80)]">
              No matching products were found for the current requirements. This is a complete
              search result, not a system error.
            </p>
            {unmatchedNotFound.length > 0 ? (
              <ul className="mt-2 space-y-3 text-[13px] text-[rgba(255,255,255,0.60)]">
                {unmatchedNotFound.map((item) => (
                  <li key={item.requirementKey} className="space-y-2">
                    <div>{unmatchedRequirementDisplayLabel(item)}</div>
                    {onRetryRequirement || onChangeConstraints || onRemoveRequirement ? (
                      <div className="flex flex-wrap gap-2">
                        {onRetryRequirement && SHOPPING_RETRYABLE_REASONS.has(item.reason) ? (
                          <button
                            type="button"
                            disabled={retryBusyKey === item.requirementKey}
                            onClick={() => onRetryRequirement(item.requirementKey)}
                            className="text-[12px] text-[#3B82F6] hover:underline disabled:opacity-40"
                          >
                            {retryBusyKey === item.requirementKey ? "Retrying…" : "Retry this item"}
                          </button>
                        ) : null}
                        {onChangeConstraints ? (
                          <button
                            type="button"
                            onClick={() => onChangeConstraints(item.requirementKey)}
                            className="text-[12px] text-[#3B82F6] hover:underline"
                          >
                            Change constraints
                          </button>
                        ) : null}
                        {onRemoveRequirement ? (
                          <button
                            type="button"
                            onClick={() => onRemoveRequirement(item.requirementKey)}
                            className="text-[12px] text-[rgba(255,255,255,0.70)] hover:underline"
                          >
                            Remove item from design
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {showResults && selections.length > 0 && unmatchedNotFound.length > 0 ? (
          <p className="text-[13px] text-[rgba(255,255,255,0.55)]" role="status">
            Partial results: {selections.length} product{selections.length === 1 ? "" : "s"} found,
            {` ${unmatchedNotFound.length} unresolved.`}
          </p>
        ) : null}

        {showResults && selections.length > 0 ? (
          <div className="space-y-3">
            <h3 className="text-[13px] font-medium text-white">Found products</h3>
            <div className="space-y-4">
              {selections.map((selection) => (
                <div
                  key={selection.id}
                  className="rounded-[12px] border border-[rgba(255,255,255,0.10)] p-4 min-w-0"
                >
                  <div className="text-[12px] uppercase tracking-[0.08em] text-[rgba(255,255,255,0.45)] mb-2 break-words">
                    AI Architect found this product for: {requirementLabel(selection)}
                  </div>
                  <div className="flex gap-4 min-w-0">
                    {selection.productImageUrl ? (
                      <img
                        src={selection.productImageUrl}
                        alt=""
                        className="w-20 h-20 shrink-0 object-cover rounded-md border border-[rgba(255,255,255,0.08)]"
                      />
                    ) : (
                      <div className="w-20 h-20 shrink-0 rounded-md border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] flex items-center justify-center text-[11px] text-[rgba(255,255,255,0.45)] text-center px-1">
                        No image
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-[14px] font-medium text-white break-words">
                        {selection.productTitle}
                      </div>
                      <div className="text-[13px] text-[rgba(255,255,255,0.65)] mt-1">
                        {formatPrice(selection.price, selection.currency)}
                      </div>
                      <div className="text-[12px] text-[rgba(255,255,255,0.50)] mt-1 break-words">
                        {selection.retailerName ?? selection.retailerDomain}
                      </div>
                      {selection.referenceStatus === "ready" ? (
                        <div className="text-[11px] text-[rgba(255,255,255,0.40)] mt-1">
                          Ready product reference
                        </div>
                      ) : (
                        <div className="text-[11px] text-[rgba(255,255,255,0.40)] mt-1">
                          Waiting for a verified merchant reference.
                        </div>
                      )}
                      <div className="flex flex-wrap gap-3 mt-3">
                        <a
                          href={selection.productUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[13px] text-[#3B82F6] hover:underline break-all"
                        >
                          Open product
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {showResults && unmatchedNotFound.length > 0 && selections.length > 0 ? (
          <div>
            <h3 className="text-[13px] font-medium text-[rgba(255,255,255,0.80)] mb-2">
              Unresolved items
            </h3>
            <ul className="space-y-3 text-[13px] text-[rgba(255,255,255,0.55)]">
              {unmatchedNotFound.map((item) => (
                <li key={item.requirementKey} className="space-y-2">
                  <div>{unmatchedRequirementDisplayLabel(item)}</div>
                  {onRetryRequirement || onChangeConstraints || onIncreaseBudget || onRemoveRequirement ? (
                    <div className="flex flex-wrap gap-2">
                      {onRetryRequirement && SHOPPING_RETRYABLE_REASONS.has(item.reason) ? (
                        <button
                          type="button"
                          disabled={retryBusyKey === item.requirementKey}
                          onClick={() => onRetryRequirement(item.requirementKey)}
                          className="text-[12px] text-[#3B82F6] hover:underline disabled:opacity-40"
                        >
                          {retryBusyKey === item.requirementKey ? "Retrying…" : "Retry this item"}
                        </button>
                      ) : null}
                      {onChangeConstraints ? (
                        <button
                          type="button"
                          onClick={() => onChangeConstraints(item.requirementKey)}
                          className="text-[12px] text-[#3B82F6] hover:underline"
                        >
                          Change constraints
                        </button>
                      ) : null}
                      {onIncreaseBudget ? (
                        <button
                          type="button"
                          onClick={() => onIncreaseBudget(item.requirementKey)}
                          className="text-[12px] text-[#3B82F6] hover:underline"
                        >
                          Increase budget
                        </button>
                      ) : null}
                      {onRemoveRequirement ? (
                        <button
                          type="button"
                          onClick={() => onRemoveRequirement(item.requirementKey)}
                          className="text-[12px] text-[rgba(255,255,255,0.70)] hover:underline"
                        >
                          Remove item from design
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {showResults && unmatchedNotSearched.length > 0 ? (
          <div className="space-y-2">
            <div className="text-[13px] text-[rgba(255,255,255,0.45)]">
              {unmatchedNotSearched.length} additional requirement
              {unmatchedNotSearched.length === 1 ? "" : "s"} were not searched (limit 10 per run).
            </div>
            <ul className="space-y-3 text-[13px] text-[rgba(255,255,255,0.55)]">
              {unmatchedNotSearched.map((item) => (
                <li key={item.requirementKey} className="space-y-2">
                  <div>{unmatchedRequirementDisplayLabel(item)}</div>
                  {onChangeConstraints || onRemoveRequirement ? (
                    <div className="flex flex-wrap gap-2">
                      {onChangeConstraints ? (
                        <button
                          type="button"
                          onClick={() => onChangeConstraints(item.requirementKey)}
                          className="text-[12px] text-[#3B82F6] hover:underline"
                        >
                          Change constraints
                        </button>
                      ) : null}
                      {onRemoveRequirement ? (
                        <button
                          type="button"
                          onClick={() => onRemoveRequirement(item.requirementKey)}
                          className="text-[12px] text-[rgba(255,255,255,0.70)] hover:underline"
                        >
                          Remove item from design
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-3 pt-1">
          {!showResults ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => void runDiscovery(false)}
                className="text-[14px] text-[rgba(0,230,204,0.85)] hover:text-[rgba(0,230,204,1)] disabled:opacity-40"
              >
                {retryLabel ?? "Find products"}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => discovery && onComplete({ discovery, selections })}
                className="text-[14px] text-[rgba(0,230,204,0.85)] hover:text-[rgba(0,230,204,1)] disabled:opacity-40"
              >
                Continue
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void runDiscovery(true)}
                className="text-[14px] text-[rgba(255,255,255,0.70)] hover:text-white disabled:opacity-40"
              >
                {error && retryLabel ? retryLabel : "Refresh products"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

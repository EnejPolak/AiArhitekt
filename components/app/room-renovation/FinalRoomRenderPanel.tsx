"use client";

import * as React from "react";
import {
  generateRoomRenderAction,
  loadRoomRenderState,
} from "@/lib/render/actions";
import { PRODUCT_FIDELITY_DISCLAIMER } from "@/lib/render/constants";
import { groundedSelectionIdsFromSnapshot } from "@/lib/render/types";
import type { RoomRenderPreferences } from "@/lib/render/preferences";
import type { ProductSelectionView } from "@/lib/discovery/types";
import type { UnmatchedRequirement } from "@/lib/discovery/itemSpecs";
import {
  formatVerifiedProductPrice,
  toProjectProductShoppingState,
} from "@/lib/discovery/shoppingState";

export interface FinalRoomRenderPanelProps {
  projectId: string;
  selections: ProductSelectionView[];
  unmatchedRequirements?: UnmatchedRequirement[];
  preferences: RoomRenderPreferences;
  roomPhotoPreviewUrl: string | null;
}

function statusLabel(args: {
  grounded: boolean;
  referenceStatus?: ProductSelectionView["referenceStatus"];
}): string {
  if (args.grounded) return "Used as visual reference";
  if (args.referenceStatus === "ready") return "Eligible for exact-product visualization";
  if (args.referenceStatus === "unavailable") {
    return "Found product — visualization reference unavailable";
  }
  return "Found product";
}

export const FinalRoomRenderPanel: React.FC<FinalRoomRenderPanelProps> = ({
  projectId,
  selections,
  unmatchedRequirements = [],
  preferences: _preferences,
  roomPhotoPreviewUrl,
}) => {
  const shopping = toProjectProductShoppingState(
    {
      id: "local",
      projectId,
      sourceAnalysisId: "",
      sourceAnalysisUpdatedAt: "",
      locationInput: "",
      latitude: 0,
      longitude: 0,
      radiusKm: 0,
      searchedItemCount: selections.length,
      notSearchedCount: 0,
      allowlistDomains: [],
      unmatchedRequirements,
      sourcePreferences: {},
      sourcePreferencesHash: "",
      createdAt: "",
      updatedAt: "",
    },
    selections
  );
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [missing, setMissing] = React.useState<Array<{ selectionId: string; productTitle: string }>>(
    []
  );
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [stale, setStale] = React.useState(false);
  const [processing, setProcessing] = React.useState(false);
  const [readinessMessage, setReadinessMessage] = React.useState<string | null>(null);
  const [hasCurrent, setHasCurrent] = React.useState(false);
  const [groundedIds, setGroundedIds] = React.useState<Set<string>>(new Set());
  const inFlight = React.useRef(false);
  const missingIds = new Set(missing.map((item) => item.selectionId));

  const refresh = React.useCallback(async () => {
    const result = await loadRoomRenderState({ projectId });
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setError(null);
    setMissing(result.missingReferences);
    setPreviewUrl(result.previewUrl);
    setStale(result.stale);
    setProcessing(Boolean(result.processing));
    setReadinessMessage(result.readinessMessage);
    setHasCurrent(Boolean(result.currentRender));
    setGroundedIds(groundedSelectionIdsFromSnapshot(result.currentRender?.referenceSnapshot));
  }, [projectId]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const generate = async (force: boolean) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await generateRoomRenderAction({
        projectId,
        force,
      });
      if (!result.ok) {
        setError(result.message);
        setMissing(result.missingReferences ?? []);
        return;
      }
      setPreviewUrl(result.previewUrl);
      setStale(false);
      setHasCurrent(true);
      setProcessing(result.render.status === "processing");
      setReadinessMessage(null);
      setGroundedIds(groundedSelectionIdsFromSnapshot(result.render.referenceSnapshot));
      if (result.render.status === "processing") {
        await refresh();
      }
    } catch {
      setError("Could not generate the room visualization. Try again.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const buttonLabel = hasCurrent && !stale ? "Regenerate design" : "Generate design";
  const canGenerate = selections.length > 0;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <div className="text-[12px] uppercase tracking-wide text-[rgba(255,255,255,0.45)] mb-2">
            Original room
          </div>
          {roomPhotoPreviewUrl ? (
            <img
              src={roomPhotoPreviewUrl}
              alt="Original room"
              className="w-full h-56 object-cover rounded-[12px] border border-[rgba(255,255,255,0.08)]"
            />
          ) : (
            <div className="w-full h-56 rounded-[12px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)]" />
          )}
        </div>
        <div>
          <div className="text-[12px] uppercase tracking-wide text-[rgba(255,255,255,0.45)] mb-2">
            Visualization
          </div>
          {previewUrl && (hasCurrent || stale) ? (
            <img
              src={previewUrl}
              alt="Room visualization"
              className="w-full h-56 object-cover rounded-[12px] border border-[rgba(255,255,255,0.08)]"
            />
          ) : processing ? (
            <div className="w-full h-56 rounded-[12px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] flex items-center justify-center text-[13px] text-[rgba(255,255,255,0.55)]">
              Generating design…
            </div>
          ) : (
            <div className="w-full h-56 rounded-[12px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] flex items-center justify-center text-[13px] text-[rgba(255,255,255,0.55)]">
              No visualization yet
            </div>
          )}
        </div>
      </div>

      <p className="text-[13px] text-[rgba(255,255,255,0.55)]">{PRODUCT_FIDELITY_DISCLAIMER}</p>

      {stale ? (
        <p className="text-[13px] text-[rgba(255,210,80,0.85)]">
          Your room or selected products changed. Generate an updated design.
        </p>
      ) : null}

      {readinessMessage ? (
        <p className="text-[13px] text-[rgba(255,255,255,0.65)]">{readinessMessage}</p>
      ) : null}

      {error ? <p className="text-[13px] text-[rgba(255,140,140,0.9)]">{error}</p> : null}

      <button
        type="button"
        disabled={busy || !canGenerate}
        onClick={() => void generate(hasCurrent && !stale)}
        className="text-[14px] text-[rgba(0,230,204,0.85)] hover:text-[rgba(0,230,204,1)] disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {busy ? "Working…" : buttonLabel}
      </button>

      <div className="space-y-3">
        <div className="text-[13px] text-[rgba(255,255,255,0.55)]">Used in this design</div>
        {shopping.foundSelections.length === 0 && shopping.missingRequirements.length === 0 ? (
          <p className="text-[13px] text-[rgba(255,255,255,0.45)]">
            Find products first. The visualization uses the same persisted selections as the shopping list.
          </p>
        ) : (
          <>
            {shopping.foundSelections.map((item) => {
              const grounded = groundedIds.has(item.id) && !missingIds.has(item.id);
              return (
                <div
                  key={item.id}
                  className="flex gap-3 rounded-[12px] border border-[rgba(255,255,255,0.08)] p-3"
                >
                  {item.productImageUrl ? (
                    <img
                      src={item.productImageUrl}
                      alt=""
                      className="w-16 h-16 object-cover rounded-md bg-[rgba(255,255,255,0.04)]"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-md bg-[rgba(255,255,255,0.04)]" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] text-white break-words">{item.productTitle}</div>
                    <div className="text-[12px] text-[rgba(255,255,255,0.55)] break-words">
                      {formatVerifiedProductPrice(item.price, item.currency)} ·{" "}
                      {item.retailerName ?? item.retailerDomain}
                    </div>
                    <div className="text-[12px] text-[rgba(255,255,255,0.45)]">
                      {statusLabel({
                        grounded,
                        referenceStatus: item.referenceStatus,
                      })}
                    </div>
                    <a
                      href={item.productUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[12px] text-[rgba(0,230,204,0.85)]"
                    >
                      Open product
                    </a>
                  </div>
                </div>
              );
            })}
            {shopping.missingRequirements.map((item) => (
              <div
                key={item.requirementKey}
                className="rounded-[12px] border border-[rgba(255,255,255,0.08)] p-3"
              >
                <div className="text-[14px] text-white break-words">{item.label}</div>
                <div className="text-[12px] text-[rgba(255,255,255,0.45)]">Not found</div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
};

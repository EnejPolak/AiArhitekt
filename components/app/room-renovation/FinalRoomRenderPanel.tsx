"use client";

import * as React from "react";
import {
  generateRoomRenderAction,
  loadRoomRenderState,
} from "@/lib/render/actions";
import { PRODUCT_FIDELITY_DISCLAIMER } from "@/lib/render/constants";
import {
  expectedRenderInventoryFromSnapshot,
  type ExpectedRenderInventoryItem,
} from "@/lib/render/inventory";
import { groundedSelectionIdsFromSnapshot } from "@/lib/render/types";
import type { RoomRenderPreferences } from "@/lib/render/preferences";
import type { ProductDiscoveryView, ProductSelectionView } from "@/lib/discovery/types";
import type { UnmatchedRequirement } from "@/lib/discovery/itemSpecs";
import { isRequiredUnresolvedReason } from "@/lib/discovery/itemSpecs";
import { formatVerifiedProductPrice, toProjectProductShoppingState } from "@/lib/discovery/shoppingState";
import { ProductShoppingSections } from "./ProductShoppingSections";

export interface FinalRoomRenderPanelProps {
  projectId: string;
  selections: ProductSelectionView[];
  discovery?: ProductDiscoveryView | null;
  unmatchedRequirements?: UnmatchedRequirement[];
  preferences: RoomRenderPreferences;
  roomPhotoPreviewUrl: string | null;
  onRetryRequirement?: (requirementKey: string) => void;
  onChangeConstraints?: (requirementKey: string) => void;
  onIncreaseBudget?: (requirementKey: string) => void;
  onRemoveRequirement?: (requirementKey: string) => void;
  retryBusyKey?: string | null;
}

export const FinalRoomRenderPanel: React.FC<FinalRoomRenderPanelProps> = ({
  projectId,
  selections,
  discovery = null,
  unmatchedRequirements = [],
  preferences: _preferences,
  roomPhotoPreviewUrl,
  onRetryRequirement,
  onChangeConstraints,
  onIncreaseBudget,
  onRemoveRequirement,
  retryBusyKey,
}) => {
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
  const [usedInventory, setUsedInventory] = React.useState<ExpectedRenderInventoryItem[]>([]);
  const inFlight = React.useRef(false);
  const visualizationItems = React.useMemo(() => {
    if (usedInventory.length > 0) {
      const byId = new Map(selections.map((item) => [item.id, item]));
      return usedInventory.map((item) => ({
        inventory: item,
        selection: byId.get(item.selectionId) ?? null,
      }));
    }
    return selections
      .filter((item) => groundedIds.has(item.id) && item.referenceStatus !== "unavailable")
      .map((item) => ({
        inventory: {
          selectionId: item.id,
          requirementId: item.requirementKey,
          productName: item.productTitle,
          merchantName: item.retailerName ?? item.retailerDomain,
          productUrl: item.productUrl,
          price: item.price,
          currency: item.currency,
          referenceAssetId: "",
          referenceStatus: "ready" as const,
          referenceImageIndex: 0,
          category: item.itemSpec,
        },
        selection: item,
      }));
  }, [usedInventory, selections, groundedIds]);

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
    setUsedInventory(expectedRenderInventoryFromSnapshot(result.currentRender?.promptSnapshot));
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
      setUsedInventory(expectedRenderInventoryFromSnapshot(result.render.promptSnapshot));
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

  const unresolved = unmatchedRequirements.filter((item) => isRequiredUnresolvedReason(item.reason));
  const shoppingState = React.useMemo(
    () => toProjectProductShoppingState(discovery, selections),
    [discovery, selections]
  );
  const buttonLabel = hasCurrent && !stale ? "Regenerate design" : "Generate design";
  const canGenerate = selections.length > 0 && unresolved.length === 0;

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

      {unresolved.length > 0 ? (
        <ProductShoppingSections
          state={shoppingState}
          onRetryRequirement={onRetryRequirement}
          onChangeConstraints={onChangeConstraints}
          onIncreaseBudget={onIncreaseBudget}
          onRemoveRequirement={onRemoveRequirement}
          retryBusyKey={retryBusyKey}
        />
      ) : null}

      <button
        type="button"
        disabled={busy || !canGenerate}
        onClick={() => void generate(hasCurrent && !stale)}
        className="text-[14px] text-[rgba(0,230,204,0.85)] hover:text-[rgba(0,230,204,1)] disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {busy ? "Working…" : buttonLabel}
      </button>

      <div className="space-y-3">
        <div className="text-[13px] text-[rgba(255,255,255,0.55)]">
          Products used in this visualization
        </div>
        {visualizationItems.length === 0 ? (
          <p className="text-[13px] text-[rgba(255,255,255,0.45)]">
            Only ready merchant products with a cached reference image appear here. If a product
            was not found or has no usable image, that space stays empty.
          </p>
        ) : (
          visualizationItems.map(({ inventory, selection }) => {
            const imageUrl = selection?.productImageUrl ?? null;
            const price = selection?.price ?? inventory.price;
            const currency = selection?.currency ?? inventory.currency;
            return (
              <div
                key={inventory.selectionId}
                className="flex gap-3 rounded-[12px] border border-[rgba(255,255,255,0.08)] p-3"
              >
                {imageUrl ? (
                  <img
                    src={imageUrl}
                    alt=""
                    className="w-16 h-16 object-cover rounded-md bg-[rgba(255,255,255,0.04)]"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-md bg-[rgba(255,255,255,0.04)]" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] text-white break-words">{inventory.productName}</div>
                  <div className="text-[12px] text-[rgba(255,255,255,0.55)] break-words">
                    {formatVerifiedProductPrice(price, currency)} · {inventory.merchantName}
                  </div>
                  <div className="text-[12px] text-[rgba(0,230,204,0.75)]">Visual reference</div>
                  {inventory.productUrl ? (
                    <a
                      href={inventory.productUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[12px] text-[rgba(0,230,204,0.85)]"
                    >
                      Poglej izdelek
                    </a>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

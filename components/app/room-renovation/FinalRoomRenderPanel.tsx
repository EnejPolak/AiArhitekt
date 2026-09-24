"use client";

import * as React from "react";
import {
  generateRoomRenderAction,
  loadRoomRenderState,
} from "@/lib/render/actions";
import { PRODUCT_FIDELITY_DISCLAIMER, PHYSICAL_FIT_DISCLAIMER } from "@/lib/render/constants";
import {
  completeRoomBlockMessage,
  designBriefBlockMessage,
  designBriefGenerateGate,
  evaluateCompleteRoomReadiness,
  productApprovalBlockMessage,
  productApprovalGate,
  referenceCapacityGate,
  tooManyReferencesBlockMessage,
} from "@/lib/render/readiness";
import { EMPTY_DESIGN_BRIEF, type DesignBriefDocument } from "@/lib/design-brief";
import {
  expectedRenderInventoryFromSnapshot,
  selectionsForRenderInventory,
  type ExpectedRenderInventoryItem,
} from "@/lib/render/inventory";
import { renderHonestyReportFromSnapshot, referenceQualityDiagnostic, type RenderHonestyReport } from "@/lib/render/report";
import { groundedSelectionIdsFromSnapshot } from "@/lib/render/types";
import type { RoomRenderPreferences } from "@/lib/render/preferences";
import {
  isFloorFinishRequirementKey,
  isWallFinishRequirementKey,
  requestedFloorFinishMode,
  requestedWallFinishMode,
} from "@/lib/render/finishes";
import type { RoomAnalysisView } from "@/lib/analysis/types";
import { normalizeFurnishingPlan, type FurnishingPlanOverrides } from "@/lib/discovery/furnishingPlan";
import { inferFurnitureConceptFromText } from "@/lib/discovery/locales/concepts";
import type { ShoppingPreferenceInput } from "@/lib/discovery/preferences";
import type { ProductDiscoveryView, ProductSelectionView } from "@/lib/discovery/types";
import type { UnmatchedRequirement } from "@/lib/discovery/itemSpecs";
import {
  formatVerifiedProductPrice,
  toProjectProductShoppingState,
} from "@/lib/discovery/shoppingState";
import {
  unusableReferenceLabels,
  visualizationReadySelections,
} from "@/lib/render/finalReportState";
import { ProductShoppingSections } from "./ProductShoppingSections";

export interface FinalRoomRenderPanelProps {
  projectId: string;
  selections: ProductSelectionView[];
  discovery?: ProductDiscoveryView | null;
  unmatchedRequirements?: UnmatchedRequirement[];
  preferences: RoomRenderPreferences;
  roomPhotoPreviewUrl: string | null;
  analysis?: RoomAnalysisView | null;
  shoppingPreferences?: ShoppingPreferenceInput | null;
  planOverrides?: FurnishingPlanOverrides | null;
  onRetryRequirement?: (requirementKey: string) => void;
  onChangeConstraints?: (requirementKey: string) => void;
  onIncreaseBudget?: (requirementKey: string) => void;
  onRemoveRequirement?: (requirementKey: string) => void;
  onKeepExistingFloor?: () => void;
  onSwitchWallToConceptColor?: () => void;
  onKeepExistingWalls?: () => void;
  retryBusyKey?: string | null;
  onToggleConfirmed?: (selection: ProductSelectionView) => void;
  confirmBusyId?: string | null;
  onPreviewChange?: (previewUrl: string | null) => void;
  designBrief?: DesignBriefDocument | null;
  onCompleteBrief?: () => void;
}

export const FinalRoomRenderPanel: React.FC<FinalRoomRenderPanelProps> = ({
  projectId,
  selections,
  discovery = null,
  unmatchedRequirements = [],
  preferences,
  roomPhotoPreviewUrl,
  analysis = null,
  shoppingPreferences = null,
  planOverrides = null,
  onRetryRequirement,
  onChangeConstraints,
  onIncreaseBudget,
  onRemoveRequirement,
  onKeepExistingFloor,
  onSwitchWallToConceptColor,
  onKeepExistingWalls,
  retryBusyKey,
  onToggleConfirmed,
  confirmBusyId,
  onPreviewChange,
  designBrief = null,
  onCompleteBrief,
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
  const [honestyReport, setHonestyReport] = React.useState<RenderHonestyReport | null>(null);
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
          referenceQuality: null,
          referenceWidth: null,
          referenceHeight: null,
          referenceSizeBytes: null,
          referenceSource: item.productImageUrl,
          exactProductAssociation: true,
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
    const displaySnapshot =
      result.currentRender?.promptSnapshot ?? result.latestSucceeded?.promptSnapshot;
    const displayReferences =
      result.currentRender?.referenceSnapshot ?? result.latestSucceeded?.referenceSnapshot;
    setGroundedIds(groundedSelectionIdsFromSnapshot(displayReferences));
    setUsedInventory(expectedRenderInventoryFromSnapshot(displaySnapshot));
    setHonestyReport(renderHonestyReportFromSnapshot(displaySnapshot));
  }, [projectId]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  React.useEffect(() => {
    onPreviewChange?.(previewUrl);
  }, [previewUrl]); // eslint-disable-line react-hooks/exhaustive-deps

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
      setHonestyReport(renderHonestyReportFromSnapshot(result.render.promptSnapshot));
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

  const completeRoom = React.useMemo(() => {
    if (!discovery) return null;
    const plan = analysis
      ? normalizeFurnishingPlan({
          analysisRequirements: analysis.designRequirements,
          observation: analysis.analysis,
          analysisId: analysis.id,
          preferences: shoppingPreferences,
          planOverrides,
        })
      : null;
    const requiredKeys = plan?.required.map((item) => item.requirementKey) ?? [];
    const inventoryReady = visualizationReadySelections(
      selectionsForRenderInventory(selections, requiredKeys, []).included
    );
    return evaluateCompleteRoomReadiness({
      searchedItemCount: discovery.searchedItemCount,
      unmatched: unmatchedRequirements,
      readyRequirementKeys: inventoryReady.map((item) => item.requirementKey),
      preferences,
      requiredPlanItems: plan?.required.map((item) => ({
        requirementKey: item.requirementKey,
        displayLabel: item.displayLabel,
        concept: item.concept,
      })),
      readyPlanConcepts: inventoryReady.map((item) =>
        inferFurnitureConceptFromText(item.itemSpec)
      ),
    });
  }, [discovery, selections, unmatchedRequirements, preferences, analysis, shoppingPreferences, planOverrides]);
  const inventorySelections = React.useMemo(() => {
    const plan = analysis
      ? normalizeFurnishingPlan({
          analysisRequirements: analysis.designRequirements,
          observation: analysis.analysis,
          analysisId: analysis.id,
          preferences: shoppingPreferences,
          planOverrides,
        })
      : null;
    const requiredKeys = plan?.required.map((item) => item.requirementKey) ?? [];
    return selectionsForRenderInventory(selections, requiredKeys, []).included;
  }, [analysis, shoppingPreferences, planOverrides, selections]);
  const approval = React.useMemo(
    () => productApprovalGate(visualizationReadySelections(inventorySelections)),
    [inventorySelections]
  );
  const capacity = React.useMemo(() => {
    const readyCount = visualizationReadySelections(inventorySelections).length;
    return referenceCapacityGate(readyCount);
  }, [inventorySelections]);
  const briefGate = React.useMemo(
    () =>
      designBriefGenerateGate(designBrief ?? EMPTY_DESIGN_BRIEF, {
        hasSucceededRender: Boolean(hasCurrent) || Boolean(previewUrl),
      }),
    [designBrief, hasCurrent, previewUrl]
  );
  const floorReady = selections.find(
    (item) => item.referenceStatus === "ready" && isFloorFinishRequirementKey(item.requirementKey)
  );
  const wallPaintReady = selections.find(
    (item) => item.referenceStatus === "ready" && isWallFinishRequirementKey(item.requirementKey)
  );
  const floorKey =
    unmatchedRequirements.find((item) => isFloorFinishRequirementKey(item.requirementKey))?.requirementKey ??
    floorReady?.requirementKey;
  const wallPaintKey =
    unmatchedRequirements.find((item) => isWallFinishRequirementKey(item.requirementKey))?.requirementKey ??
    wallPaintReady?.requirementKey;
  const changeFloorRequested = requestedFloorFinishMode(preferences) === "exact_product";
  const exactWallRequested = requestedWallFinishMode(preferences) === "exact_product";
  const shoppingState = React.useMemo(
    () => toProjectProductShoppingState(discovery, selections),
    [discovery, selections]
  );
  const buttonLabel = hasCurrent && !stale ? "Regenerate design" : "Generate design";
  const unusableLabels = unusableReferenceLabels(inventorySelections);
  const canGenerate =
    Boolean(completeRoom?.allowed) &&
    approval.allowed &&
    briefGate.allowed &&
    capacity.allowed;
  const blockMessage = !briefGate.allowed
    ? designBriefBlockMessage()
    : !approval.allowed
      ? productApprovalBlockMessage(approval)
      : !capacity.allowed
        ? tooManyReferencesBlockMessage(capacity.candidateCount)
      : completeRoom && !completeRoom.allowed
        ? completeRoomBlockMessage({
            ...completeRoom,
            unresolvedLabels: [
              ...completeRoom.unresolvedLabels,
              ...unusableLabels.map(
                (label) => `${label} needs a usable exact-product photo before it can be visualized.`
              ),
            ],
          })
        : unusableLabels.length > 0
          ? `${unusableLabels.join(", ")} need a usable exact-product photo before Generate.`
          : null;

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
      <p className="text-[12px] text-[rgba(255,255,255,0.45)]">{PHYSICAL_FIT_DISCLAIMER}</p>

      {stale ? (
        <p className="text-[13px] text-[rgba(255,210,80,0.85)]">
          Your room or selected products changed. Generate an updated design.
        </p>
      ) : null}

      {readinessMessage ? (
        <p className="text-[13px] text-[rgba(255,255,255,0.65)]">{readinessMessage}</p>
      ) : null}

      {blockMessage ? (
        <p className="text-[13px] text-[rgba(255,210,80,0.85)]" role="status">
          {blockMessage}
        </p>
      ) : null}

      {!briefGate.allowed && onCompleteBrief ? (
        <button
          type="button"
          data-testid="complete-design-brief"
          onClick={onCompleteBrief}
          className="text-[14px] text-[rgba(0,230,204,0.85)] hover:text-[rgba(0,230,204,1)]"
        >
          Complete Design Brief
        </button>
      ) : null}

      {error ? <p className="text-[13px] text-[rgba(255,140,140,0.9)]">{error}</p> : null}

      {changeFloorRequested ? (
        <div className="space-y-2 rounded-[12px] border border-[rgba(255,255,255,0.08)] p-3">
          <div className="text-[13px] font-medium text-white">Floor change</div>
          {floorReady ? (
            <p className="text-[13px] text-white">Selected floor: {floorReady.productTitle} · READY</p>
          ) : (
            <>
              <p className="text-[13px] text-[rgba(255,210,80,0.85)]">Floor change is unresolved.</p>
              <div className="flex flex-wrap gap-3">
                {onRetryRequirement && floorKey ? (
                  <button
                    type="button"
                    disabled={retryBusyKey === floorKey}
                    onClick={() => onRetryRequirement(floorKey)}
                    className="text-[12px] text-[#3B82F6] hover:underline disabled:opacity-40"
                  >
                    {retryBusyKey === floorKey ? "Retrying…" : "Retry"}
                  </button>
                ) : null}
                {onChangeConstraints && floorKey ? (
                  <button
                    type="button"
                    onClick={() => onChangeConstraints(floorKey)}
                    className="text-[12px] text-[#3B82F6] hover:underline"
                  >
                    Change constraints
                  </button>
                ) : null}
                {onKeepExistingFloor ? (
                  <button
                    type="button"
                    onClick={onKeepExistingFloor}
                    className="text-[12px] text-[#3B82F6] hover:underline"
                  >
                    Keep existing
                  </button>
                ) : null}
              </div>
            </>
          )}
        </div>
      ) : null}

      {exactWallRequested ? (
        <div className="space-y-2 rounded-[12px] border border-[rgba(255,255,255,0.08)] p-3">
          <div className="text-[13px] font-medium text-white">Exact wall paint</div>
          {wallPaintReady ? (
            <p className="text-[13px] text-white">Selected paint: {wallPaintReady.productTitle} · READY</p>
          ) : (
            <>
              <p className="text-[13px] text-[rgba(255,210,80,0.85)]">Exact wall paint is unresolved.</p>
              <div className="flex flex-wrap gap-3">
                {onRetryRequirement && wallPaintKey ? (
                  <button
                    type="button"
                    disabled={retryBusyKey === wallPaintKey}
                    onClick={() => onRetryRequirement(wallPaintKey)}
                    className="text-[12px] text-[#3B82F6] hover:underline disabled:opacity-40"
                  >
                    {retryBusyKey === wallPaintKey ? "Retrying…" : "Retry"}
                  </button>
                ) : null}
                {onChangeConstraints && wallPaintKey ? (
                  <button
                    type="button"
                    onClick={() => onChangeConstraints(wallPaintKey)}
                    className="text-[12px] text-[#3B82F6] hover:underline"
                  >
                    Change constraints
                  </button>
                ) : null}
                {onSwitchWallToConceptColor ? (
                  <button
                    type="button"
                    onClick={onSwitchWallToConceptColor}
                    className="text-[12px] text-[#3B82F6] hover:underline"
                  >
                    Switch to concept color
                  </button>
                ) : null}
                {onKeepExistingWalls ? (
                  <button
                    type="button"
                    onClick={onKeepExistingWalls}
                    className="text-[12px] text-[#3B82F6] hover:underline"
                  >
                    Keep existing
                  </button>
                ) : null}
              </div>
            </>
          )}
        </div>
      ) : null}

      {shoppingState.hasDiscovery ? (
        <ProductShoppingSections
          state={shoppingState}
          onRetryRequirement={onRetryRequirement}
          onChangeConstraints={onChangeConstraints}
          onIncreaseBudget={onIncreaseBudget}
          onRemoveRequirement={onRemoveRequirement}
          onToggleConfirmed={onToggleConfirmed}
          confirmBusyId={confirmBusyId}
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

      {honestyReport ? (
        <div className="space-y-5">
          <ReportBlock title="Products to buy">
            {honestyReport.productsToBuy.length === 0 ? (
              <p className="text-[13px] text-[rgba(255,255,255,0.45)]">
                No shoppable merchant products were used in this visualization.
              </p>
            ) : (
              honestyReport.productsToBuy.map((item) => {
                const selection = selections.find((row) => row.id === item.selectionId) ?? null;
                return (
                  <ProductRow
                    key={item.selectionId}
                    name={item.productName}
                    merchant={item.merchantName}
                    url={item.productUrl}
                    imageUrl={selection?.productImageUrl ?? null}
                    price={selection?.price ?? item.price}
                    currency={selection?.currency ?? item.currency}
                    note="Shoppable product"
                  />
                );
              })
            )}
          </ReportBlock>

          <ReportBlock title="Finish decisions">
            <p className="text-[13px] text-white">
              Walls requested: {honestyReport.finishIntent.wall_finish.requestedLabel}
            </p>
            <p className="text-[13px] text-white">
              Walls resolved: {honestyReport.finishIntent.wall_finish.resolvedLabel}
              {honestyReport.finishDecisions.wall_finish.resolvedMode === "concept_color"
                ? ` (${honestyReport.finishDecisions.wall_finish.colorDirection || "color direction"}, not shoppable)`
                : ""}
            </p>
            <p className="text-[13px] text-white">
              Floor requested: {honestyReport.finishIntent.floor_finish.requestedLabel}
            </p>
            <p className="text-[13px] text-white">
              Floor resolved: {honestyReport.finishIntent.floor_finish.resolvedLabel}
            </p>
          </ReportBlock>

          <ReportBlock title="Exact visualized items">
            {honestyReport.exactVisualizedItems.length === 0 ? (
              <p className="text-[13px] text-[rgba(255,255,255,0.45)]">
                No exact merchant products were visualized.
              </p>
            ) : (
              honestyReport.exactVisualizedItems.map((item) => {
                const diagnostics = referenceQualityDiagnostic(item);
                return (
                  <div key={`${item.kind}-${item.selectionId}`} className="space-y-0.5">
                    <p className="text-[13px] text-white">
                      {item.productName}
                      <span className="text-[rgba(255,255,255,0.55)]">
                        {" "}
                        · {item.kind === "exact_finish" ? "exact finish" : "shoppable product"}
                      </span>
                    </p>
                    {diagnostics.map((line) => (
                      <p key={line} className="text-[13px] text-[rgba(255,255,255,0.7)]">
                        {line}
                      </p>
                    ))}
                  </div>
                );
              })
            )}
          </ReportBlock>

          <ReportBlock title="Concept-only finish choices">
            {honestyReport.conceptOnlyFinishChoices.length === 0 ? (
              <p className="text-[13px] text-[rgba(255,255,255,0.45)]">
                No concept-only finishes. Wall color is either kept or an exact product.
              </p>
            ) : (
              honestyReport.conceptOnlyFinishChoices.map((item) => (
                <p key={`${item.surface}-${item.colorDirection}`} className="text-[13px] text-white">
                  Walls: {item.colorDirection || "color direction"}
                  {item.accentColorDirection ? ` / accent ${item.accentColorDirection}` : ""}
                  <span className="text-[rgba(255,255,255,0.55)]"> · not a shoppable product</span>
                </p>
              ))
            )}
          </ReportBlock>
        </div>
      ) : (
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
            visualizationItems.map(({ inventory, selection }) => (
              <ProductRow
                key={inventory.selectionId}
                name={inventory.productName}
                merchant={inventory.merchantName}
                url={inventory.productUrl}
                imageUrl={selection?.productImageUrl ?? null}
                price={selection?.price ?? inventory.price}
                currency={selection?.currency ?? inventory.currency}
                note="Visual reference"
              />
            ))
          )}
        </div>
      )}
    </div>
  );
};

function ReportBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-[13px] text-[rgba(255,255,255,0.55)]">{title}</div>
      {children}
    </div>
  );
}

function ProductRow({
  name,
  merchant,
  url,
  imageUrl,
  price,
  currency,
  note,
}: {
  name: string;
  merchant: string;
  url: string;
  imageUrl: string | null;
  price: number | null;
  currency: "EUR" | null;
  note: string;
}) {
  return (
    <div className="flex gap-3 rounded-[12px] border border-[rgba(255,255,255,0.08)] p-3">
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
        <div className="text-[14px] text-white break-words">{name}</div>
        <div className="text-[12px] text-[rgba(255,255,255,0.55)] break-words">
          {formatVerifiedProductPrice(price, currency)} · {merchant}
        </div>
        <div className="text-[12px] text-[rgba(0,230,204,0.75)]">{note}</div>
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="text-[12px] text-[rgba(0,230,204,0.85)]"
          >
            Open product
          </a>
        ) : null}
      </div>
    </div>
  );
}

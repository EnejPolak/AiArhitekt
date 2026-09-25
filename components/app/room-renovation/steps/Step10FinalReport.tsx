"use client";

import * as React from "react";
import { RoomRenovationData } from "../RoomRenovationFlow";
import { ProductShoppingSections } from "../ProductShoppingSections";
import type { ProjectProductShoppingState } from "@/lib/discovery/shoppingState";
import { formatVerifiedProductPrice } from "@/lib/discovery/shoppingState";
import type { UnmatchedRequirement } from "@/lib/discovery/itemSpecs";
import type { ProductDiscoveryView, ProductSelectionView } from "@/lib/discovery/types";
import { loadRoomRenderState } from "@/lib/render/actions";
import { PHYSICAL_FIT_DISCLAIMER, PRODUCT_FIDELITY_DISCLAIMER } from "@/lib/render/constants";
import {
  finalReportHeadline,
  resolveFinalReportProjectState,
  type FinalReportProjectState,
} from "@/lib/render/finalReportState";
import type { RoomRenderPreferences } from "@/lib/render/preferences";
import { renderHonestyReportFromSnapshot, type RenderHonestyReport } from "@/lib/render/report";

export interface Step10FinalReportProps {
  projectId: string;
  data: RoomRenovationData;
  shoppingState: ProjectProductShoppingState;
  discovery: ProductDiscoveryView | null;
  selections: ProductSelectionView[];
  unmatched: UnmatchedRequirement[];
  preferences: RoomRenderPreferences;
  requiredPlanItems?: Array<{ requirementKey: string; displayLabel: string; concept?: string }>;
  onStartAnother: () => void;
  onBack?: () => void;
}

export const Step10FinalReport: React.FC<Step10FinalReportProps> = ({
  projectId,
  data,
  shoppingState,
  discovery,
  selections,
  unmatched,
  preferences,
  requiredPlanItems,
  onStartAnother,
  onBack,
}) => {
  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("sl-SI", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 0,
    }).format(amount);

  const [previewUrl, setPreviewUrl] = React.useState<string | null>(data.selectedDesign);
  const [honestyReport, setHonestyReport] = React.useState<RenderHonestyReport | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [processing, setProcessing] = React.useState(false);
  const [generationFailed, setGenerationFailed] = React.useState(false);
  const [hasSucceededRender, setHasSucceededRender] = React.useState(Boolean(data.selectedDesign));

  React.useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const result = await loadRoomRenderState({ projectId });
      if (cancelled) return;
      if (!result.ok) {
        setLoadError(result.message);
        return;
      }
      setLoadError(null);
      if (result.previewUrl) setPreviewUrl(result.previewUrl);
      setProcessing(Boolean(result.processing));
      setHasSucceededRender(Boolean(result.previewUrl || result.latestSucceeded));
      setGenerationFailed(
        Boolean(
          (result.renders ?? []).some((row) => row.status === "failed") &&
            !result.latestSucceeded &&
            !result.previewUrl
        )
      );
      const snapshot =
        result.currentRender?.promptSnapshot ?? result.latestSucceeded?.promptSnapshot ?? null;
      setHonestyReport(renderHonestyReportFromSnapshot(snapshot));
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const projectState: FinalReportProjectState = resolveFinalReportProjectState({
    hasSucceededRender,
    processing,
    generationFailed,
    discovery,
    selections,
    unmatched,
    preferences,
    requiredPlanItems,
  });
  const headline = finalReportHeadline(projectState);
  const needsProductWork =
    !hasSucceededRender &&
    (projectState === "incomplete_requirements" ||
      projectState === "waiting_approval" ||
      projectState === "ready_to_generate" ||
      projectState === "generation_failed");

  return (
    <div className="space-y-6 mt-8">
      <div className="rounded-[16px] px-4 py-4 sm:px-6 sm:py-5 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)] min-w-0">
        <p className="text-[14px] text-white mb-3" data-testid="final-report-headline">
          {headline}
        </p>
        <h3 className="text-[16px] font-medium text-white mb-3">Selected Design</h3>
        {previewUrl ? (
          <img
            src={previewUrl}
            alt="Selected design"
            className="w-full max-w-[600px] h-auto rounded-lg"
          />
        ) : (
          <p className="text-[13px] text-[rgba(255,255,255,0.55)]">No visualization yet.</p>
        )}
        <p className="text-[12px] text-[rgba(255,255,255,0.55)] mt-3">{PRODUCT_FIDELITY_DISCLAIMER}</p>
        <p className="text-[12px] text-[rgba(255,255,255,0.45)] mt-1">{PHYSICAL_FIT_DISCLAIMER}</p>
        {loadError ? (
          <p className="text-[12px] text-[rgba(255,140,140,0.9)] mt-2">{loadError}</p>
        ) : null}
        {needsProductWork && onBack ? (
          <button
            type="button"
            data-testid="complete-required-products"
            onClick={onBack}
            className="mt-4 px-4 py-2 rounded-lg border border-[rgba(0,230,204,0.35)] text-[rgba(0,230,204,0.95)] text-[13px] font-medium hover:bg-[rgba(0,230,204,0.08)] transition-colors"
          >
            {projectState === "incomplete_requirements"
              ? "Complete required products"
              : "Back to product review"}
          </button>
        ) : null}
      </div>

      {honestyReport ? (
        <div className="rounded-[16px] px-4 py-4 sm:px-6 sm:py-5 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)] min-w-0 space-y-4">
          <h3 className="text-[16px] font-medium text-white">Finish decisions</h3>
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
          {honestyReport.conceptOnlyFinishChoices.length > 0 ? (
            <div className="space-y-1">
              <h4 className="text-[13px] font-medium text-white">Concept-only finish choices</h4>
              {honestyReport.conceptOnlyFinishChoices.map((item) => (
                <p key={`${item.surface}-${item.colorDirection}`} className="text-[13px] text-white">
                  Walls: {item.colorDirection || "color direction"}
                  {item.accentColorDirection ? ` / accent ${item.accentColorDirection}` : ""}
                  <span className="text-[rgba(255,255,255,0.55)]"> · not a shoppable product</span>
                </p>
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-[rgba(255,255,255,0.45)]">
              No concept-only finishes. Wall color is either kept or an exact product.
            </p>
          )}
          {honestyReport.productsToBuy.length > 0 ? (
            <div className="space-y-2">
              <h4 className="text-[13px] font-medium text-white">Exact visualized items</h4>
              {honestyReport.productsToBuy.map((item) => (
                <div key={item.selectionId} className="text-[13px] text-white">
                  <div>{item.productName}</div>
                  <div className="text-[12px] text-[rgba(255,255,255,0.55)]">
                    {formatVerifiedProductPrice(item.price, item.currency)} · {item.merchantName}
                  </div>
                  {item.productUrl ? (
                    <a
                      href={item.productUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[12px] text-[#3B82F6] hover:underline"
                    >
                      Open product
                    </a>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {data.costEstimate && (
        <div className="rounded-[16px] px-4 py-4 sm:px-6 sm:py-5 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)] min-w-0">
          <h3 className="text-[16px] font-medium text-white mb-1">Estimated renovation cost</h3>
          <p className="text-[12px] text-[rgba(255,255,255,0.55)] mb-4">
            These figures are estimates, not verified live product prices.
          </p>
          <div className="space-y-2">
            <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-[14px]">
              <span className="min-w-0 text-[rgba(255,255,255,0.70)]">Materials (estimate):</span>
              <span className="shrink-0 text-white">
                {formatCurrency(data.costEstimate.materials.min)} -{" "}
                {formatCurrency(data.costEstimate.materials.max)}
              </span>
            </div>
            <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-[14px]">
              <span className="min-w-0 text-[rgba(255,255,255,0.70)]">Furniture (estimate):</span>
              <span className="shrink-0 text-white">
                {formatCurrency(data.costEstimate.furniture.min)} -{" "}
                {formatCurrency(data.costEstimate.furniture.max)}
              </span>
            </div>
            <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-[14px]">
              <span className="min-w-0 text-[rgba(255,255,255,0.70)]">Labor (estimate):</span>
              <span className="shrink-0 text-white">
                {formatCurrency(data.costEstimate.labor.min)} - {formatCurrency(data.costEstimate.labor.max)}
              </span>
            </div>
            <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-[16px] font-medium pt-2 border-t border-[rgba(255,255,255,0.1)]">
              <span className="min-w-0 text-white">Estimated total:</span>
              <span className="shrink-0 text-white">
                {formatCurrency(data.costEstimate.total.min)} - {formatCurrency(data.costEstimate.total.max)}
              </span>
            </div>
          </div>
        </div>
      )}

      {data.budgetPlan && (
        <div className="rounded-[16px] px-4 py-4 sm:px-6 sm:py-5 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)] min-w-0">
          <h3 className="text-[16px] font-medium text-white mb-4">Budget Allocation</h3>
          <div className="space-y-2">
            {Object.entries(data.budgetPlan.caps).map(([category, cap]) => (
              <div key={category} className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-[14px]">
                <span className="min-w-0 break-words text-[rgba(255,255,255,0.85)]">{category}:</span>
                <span className="shrink-0 text-white">
                  {formatCurrency(cap.max)} (qty: {cap.qty})
                </span>
              </div>
            ))}
            <div className="flex justify-between text-[16px] font-medium pt-2 border-t border-[rgba(255,255,255,0.1)]">
              <span className="text-white">Total Budget:</span>
              <span className="text-white">{formatCurrency(data.budgetPlan.totalBudget)}</span>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-[16px] px-6 py-5 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)]">
        <h3 className="text-[16px] font-medium text-white mb-1">Products</h3>
        <p className="text-[12px] text-[rgba(255,255,255,0.55)] mb-4">
          {shoppingState.foundSelections.length} found
          {shoppingState.missingRequirements.length > 0
            ? `, ${shoppingState.missingRequirements.length} unresolved`
            : ""}
          . From the saved product search, not a complete catalog.
        </p>
        <ProductShoppingSections state={shoppingState} />
      </div>

      {data.contractors && Object.keys(data.contractors).length > 0 && (
        <div className="rounded-[16px] px-4 py-4 sm:px-6 sm:py-5 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)] min-w-0">
          <h3 className="text-[16px] font-medium text-white mb-4">Local Contractors</h3>
          <div className="space-y-4">
            {Object.entries(data.contractors).map(([trade, contractors]) => (
              <div key={trade}>
                <h4 className="text-[14px] font-medium text-white mb-2 capitalize">{trade}</h4>
                <div className="space-y-2">
                  {contractors.map((contractor, idx) => (
                    <div key={idx} className="border border-[rgba(255,255,255,0.10)] rounded-lg p-3">
                      <div className="text-[14px] font-medium text-white break-words">{contractor.name}</div>
                      <div className="text-[12px] text-[rgba(255,255,255,0.60)] mt-1 break-words">
                        {contractor.address}
                      </div>
                      {contractor.rating && (
                        <div className="text-[12px] text-[rgba(255,255,255,0.60)] mt-1">
                          ⭐ {contractor.rating.toFixed(1)}
                          {contractor.reviewsCount && ` (${contractor.reviewsCount} reviews)`}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-3 mt-2">
                        {contractor.phone && (
                          <a
                            href={`tel:${contractor.phone}`}
                            className="text-[12px] text-[#3B82F6] hover:underline"
                          >
                            📞 {contractor.phone}
                          </a>
                        )}
                        {contractor.website && (
                          <a
                            href={contractor.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[12px] text-[#3B82F6] hover:underline"
                          >
                            Website →
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-4 mt-8">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="px-6 py-3 rounded-lg border border-[rgba(255,255,255,0.15)] text-white text-[14px] font-medium hover:bg-[rgba(255,255,255,0.05)] transition-colors"
          >
            {needsProductWork ? "Back to product review" : "Back to visualization"}
          </button>
        ) : null}
        <p className="px-6 py-3 text-[13px] text-[rgba(255,255,255,0.55)]">
          PDF export is not available yet. Use this page to review the visualization and shopping links.
        </p>
        <button
          type="button"
          onClick={onStartAnother}
          className="px-6 py-3 rounded-lg border border-[rgba(255,255,255,0.15)] text-white text-[14px] font-medium hover:bg-[rgba(255,255,255,0.05)] transition-colors"
        >
          Start another project
        </button>
      </div>
    </div>
  );
};

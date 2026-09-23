"use client";

import * as React from "react";
import type { RoomAnalysisView } from "@/lib/analysis/types";
import type { ShoppingPreferenceInput } from "@/lib/discovery/preferences";
import {
  EMPTY_FURNISHING_PLAN_OVERRIDES,
  normalizeFurnishingPlan,
  parseFurnishingPlanOverrides,
  stableFurnitureRequirementKey,
  type FurnishingPlanOverrides,
  type PlannedFurnishingItem,
} from "@/lib/discovery/furnishingPlan";
import { slugRequirementPart } from "@/lib/discovery/itemSpecs";
import { MAX_PRODUCT_DISCOVERY_ITEMS } from "@/lib/discovery/constants";
import { buildInteriorDesignBrief } from "@/lib/design/brief";
import { briefPlannerIntent } from "@/lib/design-brief";

export function FurnishingPlanReview({
  analysis,
  shoppingPreferences,
  planOverrides,
  onPlanChange,
  disabled,
}: {
  analysis: RoomAnalysisView | null;
  shoppingPreferences?: ShoppingPreferenceInput;
  planOverrides: FurnishingPlanOverrides;
  onPlanChange: (next: FurnishingPlanOverrides) => void;
  disabled?: boolean;
}) {
  const [addText, setAddText] = React.useState("");
  const [editingKey, setEditingKey] = React.useState<string | null>(null);
  const [editDraft, setEditDraft] = React.useState("");

  const plan = React.useMemo(() => {
    if (!analysis) return null;
    return normalizeFurnishingPlan({
      analysisRequirements: analysis.designRequirements,
      observation: analysis.analysis,
      preferences: shoppingPreferences,
      planOverrides,
      analysisId: analysis.id,
    });
  }, [analysis, shoppingPreferences, planOverrides]);

  const brief = React.useMemo(() => {
    if (!analysis || !plan) return null;
    return buildInteriorDesignBrief({
      observation: analysis.analysis,
      requirements: analysis.designRequirements,
      plannedConcepts: [...plan.required, ...plan.suggested].map((item) => item.concept),
      selectedStyles: shoppingPreferences?.selectedStyles ?? undefined,
      userNotes: shoppingPreferences?.notes,
      brief: shoppingPreferences?.designBrief
        ? briefPlannerIntent(shoppingPreferences.designBrief)
        : null,
    });
  }, [analysis, plan, shoppingPreferences]);

  if (!analysis || !plan) return null;

  const withSource = (next: Partial<FurnishingPlanOverrides>): FurnishingPlanOverrides => ({
    ...EMPTY_FURNISHING_PLAN_OVERRIDES,
    ...planOverrides,
    ...next,
    schemaVersion: 1,
    sourceAnalysisId: analysis.id,
  });

  const removeItem = (item: PlannedFurnishingItem) => {
    if (item.source === "user_structured") {
      onPlanChange(
        withSource({
          addedRequirements: planOverrides.addedRequirements.filter((row) => row.key !== item.requirementKey),
          removedRequirementKeys: planOverrides.removedRequirementKeys.filter(
            (key) => key !== item.requirementKey
          ),
        })
      );
      return;
    }
    onPlanChange(
      withSource({
        removedRequirementKeys: [...new Set([...planOverrides.removedRequirementKeys, item.requirementKey])],
        acceptedSuggestionKeys: planOverrides.acceptedSuggestionKeys.filter(
          (key) => key !== item.requirementKey
        ),
      })
    );
  };

  const acceptSuggestion = (item: PlannedFurnishingItem) => {
    onPlanChange(
      withSource({
        acceptedSuggestionKeys: [...new Set([...planOverrides.acceptedSuggestionKeys, item.requirementKey])],
        removedRequirementKeys: planOverrides.removedRequirementKeys.filter(
          (key) => key !== item.requirementKey
        ),
      })
    );
  };

  const addItem = () => {
    const category = addText.replace(/\s+/g, " ").trim();
    if (!category) return;
    const used = new Set([
      ...plan.required.map((item) => item.requirementKey),
      ...plan.suggested.map((item) => item.requirementKey),
    ]);
    let occurrence = 0;
    let key = stableFurnitureRequirementKey(`user-${slugRequirementPart(category)}`, occurrence);
    while (used.has(key)) {
      occurrence += 1;
      key = stableFurnitureRequirementKey(`user-${slugRequirementPart(category)}`, occurrence);
    }
    onPlanChange(
      withSource({
        addedRequirements: [
          ...planOverrides.addedRequirements,
          {
            key,
            category,
            quantity: 1,
            placementNotes: null,
            constraints: [],
            rationale: "Added by you.",
          },
        ],
      })
    );
    setAddText("");
  };

  const saveEdit = (item: PlannedFurnishingItem) => {
    const next = editDraft.replace(/\s+/g, " ").trim();
    setEditingKey(null);
    if (!next) return;
    onPlanChange(
      withSource({
        editedRequirements: {
          ...planOverrides.editedRequirements,
          [item.requirementKey]: {
            ...planOverrides.editedRequirements[item.requirementKey],
            category: next,
          },
        },
      })
    );
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-[15px] font-medium text-white">Interior design plan</h3>
        <p className="text-[13px] text-[rgba(255,255,255,0.55)] mt-1">
          The AI chose the necessary furnishing categories and will search stores for those items. You approve or replace individual products later — not each category.
        </p>
      </div>

      {brief ? (
        <div className="rounded-[12px] border border-[rgba(255,255,255,0.08)] p-3 space-y-3">
          <p className="text-[13px] text-[rgba(255,255,255,0.80)]">{brief.concept.character}</p>
          <div>
            <h4 className="text-[12px] uppercase tracking-[0.08em] text-[rgba(255,255,255,0.45)]">Layout</h4>
            <p className="text-[13px] text-[rgba(255,255,255,0.75)] mt-1">
              {brief.layout.options.find((item) => item.selected)?.title}
            </p>
            <p className="text-[12px] text-[rgba(255,255,255,0.55)] mt-1">{brief.layout.selectedRationale}</p>
            <p className="text-[12px] text-[rgba(255,255,255,0.50)] mt-1">
              {brief.layout.options.find((item) => item.selected)?.sofaOrientation}
            </p>
            <p className="text-[12px] text-[rgba(255,255,255,0.50)] mt-1">
              Media wall: {brief.layout.mediaWall.glare}
            </p>
            <p className="text-[12px] text-[rgba(255,255,255,0.50)] mt-1">
              {brief.layout.mediaWall.electrical}
            </p>
          </div>
          {brief.exactDimensionsKnown ? null : (
            <p className="text-[12px] text-[rgba(255,255,255,0.50)]">
              Physical fit is not verified. Exact room dimensions are unknown; no measurements were invented.
            </p>
          )}
          {brief.completeness.filter((item) => item.decision === "needs_preference").length > 0 ? (
            <div>
              <h4 className="text-[12px] uppercase tracking-[0.08em] text-[rgba(255,255,255,0.45)]">
                Needs a preference
              </h4>
              <ul className="mt-1 space-y-1">
                {brief.completeness
                  .filter((item) => item.decision === "needs_preference")
                  .map((item) => (
                    <li key={item.concept} className="text-[12px] text-[rgba(255,255,255,0.50)]">
                      {item.category}: {item.rationale}
                    </li>
                  ))}
              </ul>
            </div>
          ) : null}
          {brief.completeness.filter((item) => item.decision === "design_proposal").length > 0 ? (
            <div>
              <h4 className="text-[12px] uppercase tracking-[0.08em] text-[rgba(255,255,255,0.45)]">
                Design recommendations
              </h4>
              <ul className="mt-1 space-y-1">
                {brief.completeness
                  .filter((item) => item.decision === "design_proposal")
                  .map((item) => (
                    <li key={item.category} className="text-[12px] text-[rgba(255,255,255,0.50)]">
                      {item.category}: {item.rationale}
                    </li>
                  ))}
              </ul>
            </div>
          ) : null}
          {brief.completeness.filter((item) => item.decision === "not_appropriate").length > 0 ? (
            <div>
              <h4 className="text-[12px] uppercase tracking-[0.08em] text-[rgba(255,255,255,0.45)]">
                Not used in this room
              </h4>
              <ul className="mt-1 space-y-1">
                {brief.completeness
                  .filter((item) => item.decision === "not_appropriate")
                  .map((item) => (
                    <li key={item.concept} className="text-[12px] text-[rgba(255,255,255,0.50)]">
                      {item.category}: {item.rationale}
                    </li>
                  ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {plan.required.length === 0 ? (
        <p className="text-[13px] text-[rgba(255,255,255,0.55)]">
          No required furniture yet. Add an item if this room still needs something.
        </p>
      ) : (
        <ul className="space-y-3">
          {plan.required.map((item) => (
            <li
              key={item.requirementKey}
              className="rounded-[12px] border border-[rgba(255,255,255,0.10)] p-3 space-y-2"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[14px] font-medium text-white">{item.displayLabel}</span>
                <span className="text-[10px] uppercase tracking-[0.08em] rounded-full border border-[rgba(0,230,204,0.35)] text-[rgba(0,230,204,0.90)] px-2 py-0.5">
                  Required
                </span>
                {item.quantity && item.quantity > 1 ? (
                  <span className="text-[12px] text-[rgba(255,255,255,0.50)]">× {item.quantity}</span>
                ) : null}
              </div>
              {item.rationale ? (
                <p className="text-[13px] text-[rgba(255,255,255,0.65)]">{item.rationale}</p>
              ) : null}
              {item.placementNotes ? (
                <p className="text-[12px] text-[rgba(255,255,255,0.50)]">Placement: {item.placementNotes}</p>
              ) : null}
              {item.constraints.length > 0 ? (
                <p className="text-[12px] text-[rgba(255,255,255,0.50)]">
                  Constraints: {item.constraints.join(", ")}
                </p>
              ) : null}
              {editingKey === item.requirementKey ? (
                <div className="flex flex-wrap gap-2">
                  <input
                    value={editDraft}
                    onChange={(event) => setEditDraft(event.target.value)}
                    className="flex-1 min-w-[12rem] px-3 py-2 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.08)] text-white text-sm"
                    placeholder="Product, e.g. Floor lamp"
                    disabled={disabled}
                  />
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => saveEdit(item)}
                    className="text-[13px] text-[rgba(0,230,204,0.85)]"
                  >
                    Save
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      setEditingKey(item.requirementKey);
                      setEditDraft(item.category);
                    }}
                    className="text-[13px] text-[rgba(255,255,255,0.70)] hover:text-white disabled:opacity-40"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => removeItem(item)}
                    className="text-[13px] text-[#FCA5A5] hover:text-[#FECACA] disabled:opacity-40"
                  >
                    Remove
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {plan.required.length > MAX_PRODUCT_DISCOVERY_ITEMS ? (
        <p className="text-[12px] text-[rgba(255,210,80,0.85)]">
          This search can resolve {MAX_PRODUCT_DISCOVERY_ITEMS} required items at a time. The first{" "}
          {MAX_PRODUCT_DISCOVERY_ITEMS} will be searched now; the rest stay listed and can be searched
          in a later pass without replacing approved products.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <input
          value={addText}
          onChange={(event) => setAddText(event.target.value)}
          placeholder="Add item, e.g. reading chair"
          className="flex-1 min-w-[12rem] px-3 py-2 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.08)] text-white text-sm"
          disabled={disabled}
        />
        <button
          type="button"
          disabled={disabled || !addText.trim()}
          onClick={addItem}
          className="text-[13px] text-[rgba(0,230,204,0.85)] hover:text-[rgba(0,230,204,1)] disabled:opacity-40"
        >
          Add item
        </button>
      </div>

      {plan.suggested.length > 0 ? (
        <div className="space-y-2">
          <h4 className="text-[13px] font-medium text-[rgba(255,255,255,0.80)]">Optional ideas</h4>
          <p className="text-[12px] text-[rgba(255,255,255,0.50)]">
            These optional items are not searched unless you add them. Decorative extras stay here so they do not appear as invented products.
          </p>
          <ul className="space-y-2">
            {plan.suggested.map((item) => (
              <li
                key={item.requirementKey}
                className="flex flex-wrap items-center justify-between gap-2 rounded-[12px] border border-[rgba(255,255,255,0.08)] px-3 py-2"
              >
                <span className="text-[13px] text-[rgba(255,255,255,0.75)]">{item.displayLabel}</span>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => acceptSuggestion(item)}
                  className="text-[13px] text-[rgba(0,230,204,0.85)] disabled:opacity-40"
                >
                  Make required
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function parseStoredFurnishingPlan(raw: unknown): FurnishingPlanOverrides {
  return parseFurnishingPlanOverrides(raw);
}

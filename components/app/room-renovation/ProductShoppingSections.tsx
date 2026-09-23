"use client";

import * as React from "react";
import type { ProductSelectionView } from "@/lib/discovery/types";
import {
  formatVerifiedProductPrice,
  SHOPPING_RETRYABLE_REASONS,
  type ProjectProductShoppingState,
} from "@/lib/discovery/shoppingState";

export function ProductShoppingSections({
  state,
  emptyMessage = "No verified products were found for these requirements.",
  onRetryRequirement,
  onChangeConstraints,
  onIncreaseBudget,
  onRemoveRequirement,
  onToggleConfirmed,
  confirmBusyId,
  retryBusyKey,
}: {
  state: ProjectProductShoppingState;
  emptyMessage?: string;
  onRetryRequirement?: (requirementKey: string) => void;
  onChangeConstraints?: (requirementKey: string) => void;
  onIncreaseBudget?: (requirementKey: string) => void;
  onRemoveRequirement?: (requirementKey: string) => void;
  onToggleConfirmed?: (selection: ProductSelectionView) => void;
  confirmBusyId?: string | null;
  retryBusyKey?: string | null;
}) {
  if (!state.hasDiscovery) {
    return (
      <p className="text-[14px] text-[rgba(255,255,255,0.70)]">
        No saved product search for this project yet.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {state.allNotFound ? (
        <p className="text-[14px] text-[rgba(255,255,255,0.80)]" role="status">
          {emptyMessage}
        </p>
      ) : null}

      {state.foundSelections.length > 0 ? (
        <div className="space-y-3">
          <h4 className="text-[13px] font-medium text-white">Found products</h4>
          {state.foundSelections.map((selection) => (
            <div
              key={selection.id}
              className="border border-[rgba(255,255,255,0.10)] rounded-lg p-3"
            >
              <div className="flex items-start gap-3">
                {selection.productImageUrl ? (
                  <img
                    src={selection.productImageUrl}
                    alt=""
                    className="w-16 h-16 shrink-0 object-cover rounded"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-md border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] flex items-center justify-center text-[11px] text-[rgba(255,255,255,0.45)] text-center px-1">
                    No image
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-medium text-white break-words">
                    {selection.productTitle}
                  </div>
                  <div className="text-[12px] text-[rgba(255,255,255,0.60)] mt-1 break-words">
                    {selection.retailerName ?? selection.retailerDomain}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
                    <span className="text-[14px] text-white font-medium">
                      {formatVerifiedProductPrice(selection.price, selection.currency)}
                    </span>
                    {selection.productUrl ? (
                      <a
                        href={selection.productUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[12px] text-[#3B82F6] hover:underline"
                      >
                        Open product
                      </a>
                    ) : null}
                  </div>
                  {onToggleConfirmed && selection.referenceStatus === "ready" ? (
                    <form
                      className="mt-2"
                      onSubmit={(event) => {
                        event.preventDefault();
                        onToggleConfirmed(selection);
                      }}
                    >
                      <button
                        type="submit"
                        data-testid="use-in-design"
                        aria-pressed={selection.isConfirmed}
                        disabled={confirmBusyId === selection.id}
                        className="text-[13px] text-[rgba(0,230,204,0.85)] hover:underline disabled:opacity-40"
                      >
                        {confirmBusyId === selection.id
                          ? "Saving…"
                          : selection.isConfirmed
                            ? "Selected for design"
                            : "Use in design"}
                      </button>
                    </form>
                  ) : null}
                  {selection.referenceStatus === "ready" && !selection.isConfirmed ? (
                    <div className="text-[11px] text-[rgba(255,255,255,0.40)] mt-1">
                      Ready reference — approve to use it in the design.
                    </div>
                  ) : selection.referenceStatus === "ready" && selection.isConfirmed ? (
                    <div className="text-[11px] text-[rgba(0,230,204,0.75)] mt-1">
                      Visual reference · approved for visualization
                    </div>
                  ) : selection.referenceStatus === "unavailable" ? (
                    <div className="text-[11px] text-[rgba(255,255,255,0.40)] mt-1">
                      Found product · visualization reference unavailable
                    </div>
                  ) : selection.isConfirmed ? (
                    <div className="text-[11px] text-[rgba(0,230,204,0.75)] mt-1">
                      Selected for design
                    </div>
                  ) : (
                    <div className="text-[11px] text-[rgba(255,255,255,0.40)] mt-1">
                      Found product · not marked for design
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {state.missingRequirements.length > 0 ? (
        <div>
          <h4 className="text-[13px] font-medium text-[rgba(255,255,255,0.80)] mb-2">
            Unresolved requirements
          </h4>
          <ul className="space-y-3 text-[13px] text-[rgba(255,255,255,0.55)]">
            {state.missingRequirements.map((item) => (
              <li key={item.requirementKey} className="space-y-2">
                <div>We couldn&apos;t yet find a verified product for: {item.label}</div>
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

      {state.notSearchedCount > 0 ? (
        <p className="text-[12px] text-[rgba(255,255,255,0.45)]">
          {state.notSearchedCount} additional requirement
          {state.notSearchedCount === 1 ? "" : "s"} were not searched (limit 10 per run).
        </p>
      ) : null}

      {state.knownProductTotal != null ? (
        <div className="pt-3 border-t border-[rgba(255,255,255,0.1)]">
          <div className="flex justify-between text-[16px] font-medium">
            <span className="text-white">Known product total</span>
            <span className="text-white">
              {formatVerifiedProductPrice(state.knownProductTotal, "EUR")}
            </span>
          </div>
          {state.knownProductTotalIsPartial ? (
            <p className="text-[12px] text-[rgba(255,255,255,0.55)] mt-1">
              Partial: {state.unpricedCount} product
              {state.unpricedCount === 1 ? " has" : "s have"} no verified price. This is not a
              complete project total.
            </p>
          ) : (
            <p className="text-[12px] text-[rgba(255,255,255,0.45)] mt-1">
              Sum of verified product prices only. Not a complete project total.
            </p>
          )}
        </div>
      ) : state.foundSelections.length > 0 ? (
        <p className="text-[13px] text-[rgba(255,255,255,0.55)]">
          Product prices are unavailable for the found items.
        </p>
      ) : null}
    </div>
  );
}
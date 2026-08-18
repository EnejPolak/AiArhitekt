"use client";

import * as React from "react";
import {
  generateRoomRenderAction,
  loadRoomRenderState,
} from "@/lib/render/actions";
import { PRODUCT_FIDELITY_DISCLAIMER } from "@/lib/render/constants";
import type { RoomRenderPreferences } from "@/lib/render/preferences";
import type { ProductSelectionView } from "@/lib/discovery/types";

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

export interface FinalRoomRenderPanelProps {
  projectId: string;
  selections: ProductSelectionView[];
  preferences: RoomRenderPreferences;
  roomPhotoPreviewUrl: string | null;
}

export const FinalRoomRenderPanel: React.FC<FinalRoomRenderPanelProps> = ({
  projectId,
  selections,
  preferences,
  roomPhotoPreviewUrl,
}) => {
  const confirmed = selections.filter((item) => item.isConfirmed);
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
  const inFlight = React.useRef(false);
  const missingIds = new Set(missing.map((item) => item.selectionId));

  const refresh = React.useCallback(async () => {
    const result = await loadRoomRenderState({ projectId, preferences });
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
  }, [projectId, preferences]);

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
        preferences,
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

      {missing.length > 0 ? (
        <div className="text-[13px] text-[rgba(255,140,140,0.9)] space-y-1">
          <div>Not render-ready:</div>
          <ul className="list-disc pl-5">
            {missing.map((item) => (
              <li key={item.selectionId}>{item.productTitle}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {error ? <p className="text-[13px] text-[rgba(255,140,140,0.9)]">{error}</p> : null}

      <button
        type="button"
        disabled={busy || confirmed.length === 0}
        onClick={() => void generate(hasCurrent && !stale)}
        className="text-[14px] text-[rgba(0,230,204,0.85)] hover:text-[rgba(0,230,204,1)] disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {busy ? "Working…" : buttonLabel}
      </button>

      <div className="space-y-3">
        <div className="text-[13px] text-[rgba(255,255,255,0.55)]">
          Confirmed products used for this visualization
        </div>
        {confirmed.length === 0 ? (
          <p className="text-[13px] text-[rgba(255,255,255,0.45)]">
            Confirm products first. The visualization uses only persisted selections.
          </p>
        ) : (
          confirmed.map((item) => (
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
                <div className="text-[14px] text-white truncate">{item.productTitle}</div>
                <div className="text-[12px] text-[rgba(255,255,255,0.55)]">
                  {formatPrice(item.price, item.currency)} · {item.retailerName ?? item.retailerDomain}
                </div>
                <div className="text-[12px] text-[rgba(255,255,255,0.45)]">
                  {missingIds.has(item.id) ? "Not render-ready" : "Reference ready"}
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
          ))
        )}
      </div>
    </div>
  );
};

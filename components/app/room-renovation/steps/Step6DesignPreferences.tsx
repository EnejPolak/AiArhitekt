"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import type { FloorFinishMode, WallFinishMode } from "@/lib/render/preferences";
import { keepExistingWallsFromWallFinishMode } from "@/lib/render/preferences";

export type RoomDesignPreferences = {
  wallMainColor: string;
  wallAccentColor: string;
  flooring: "keep" | "hardwood" | "laminate" | "tiles" | "marble";
  underfloorHeating: boolean;
  bedType: "none" | "king" | "queen" | "bunk" | "single";
  notes: string;
  keepExistingWalls: boolean;
  wallFinishMode: WallFinishMode;
  floorFinishMode: FloorFinishMode;
};

export interface Step6DesignPreferencesProps {
  roomType: string;
  value: RoomDesignPreferences;
  onChange: (value: RoomDesignPreferences) => void;
  onContinue: () => void;
  floorProductName?: string | null;
  floorUnresolved?: boolean;
  wallPaintProductName?: string | null;
  wallPaintUnresolved?: boolean;
  onRetryFloor?: () => void;
  onRetryWallPaint?: () => void;
}

const flooringOptions: Array<{ id: RoomDesignPreferences["flooring"]; label: string; desc: string }> = [
  { id: "keep", label: "Keep existing", desc: "No floor change" },
  { id: "hardwood", label: "Hardwood", desc: "Warm natural wood" },
  { id: "laminate", label: "Laminate", desc: "Durable and affordable" },
  { id: "tiles", label: "Tiles", desc: "Clean, modern, easy to maintain" },
  { id: "marble", label: "Marble", desc: "Luxury stone look" },
];

const bedOptions: Array<{ id: RoomDesignPreferences["bedType"]; label: string; desc: string }> = [
  { id: "king", label: "King size", desc: "Wide and comfortable" },
  { id: "queen", label: "Queen size", desc: "Balanced choice" },
  { id: "bunk", label: "Bunk bed", desc: "Great for kids/space saving" },
  { id: "single", label: "Single", desc: "Compact" },
  { id: "none", label: "Not applicable", desc: "No bed needed" },
];

function ChoiceButton({
  selected,
  title,
  description,
  onClick,
}: {
  selected: boolean;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "p-4 rounded-[14px] text-left border transition-all",
        selected
          ? "border-[#3B82F6] bg-[rgba(59,130,246,0.10)]"
          : "border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] hover:border-[rgba(255,255,255,0.15)]"
      )}
    >
      <div className="text-[15px] font-medium text-white">{title}</div>
      <div className="text-[12px] text-[rgba(255,255,255,0.60)] mt-1">{description}</div>
    </button>
  );
}

export const Step6DesignPreferences: React.FC<Step6DesignPreferencesProps> = ({
  roomType,
  value,
  onChange,
  onContinue,
  floorProductName = null,
  floorUnresolved = false,
  wallPaintProductName = null,
  wallPaintUnresolved = false,
  onRetryFloor,
  onRetryWallPaint,
}) => {
  const isBedroom = roomType === "bedroom";
  const wallFinishMode = value.wallFinishMode ?? (value.keepExistingWalls ? "keep_existing" : "concept_color");

  const set = (patch: Partial<RoomDesignPreferences>) => onChange({ ...value, ...patch });
  const setWallFinish = (mode: WallFinishMode) =>
    set({
      wallFinishMode: mode,
      keepExistingWalls: keepExistingWallsFromWallFinishMode(mode),
    });

  return (
    <div className="space-y-6 mt-8">
      <div className="text-[15px] text-[rgba(255,255,255,0.80)] leading-relaxed">
        Choose wall and floor intent explicitly. Changing the floor or requesting an exact paint
        product requires a grounded product before Generate can run.
      </div>

      <div>
        <div className="text-sm font-medium text-white mb-2">Walls</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <ChoiceButton
            selected={wallFinishMode === "keep_existing"}
            title="Keep existing"
            description="Preserve the photographed walls"
            onClick={() => setWallFinish("keep_existing")}
          />
          <ChoiceButton
            selected={wallFinishMode === "concept_color"}
            title="Choose color"
            description="Concept color — not shoppable"
            onClick={() => setWallFinish("concept_color")}
          />
          <ChoiceButton
            selected={wallFinishMode === "exact_product"}
            title="Choose exact paint product"
            description="Requires a grounded paint SKU"
            onClick={() => setWallFinish("exact_product")}
          />
        </div>
      </div>

      {wallFinishMode === "concept_color" || wallFinishMode === "exact_product" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-white mb-2">Wall color (main)</label>
            <input
              value={value.wallMainColor}
              onChange={(e) => set({ wallMainColor: e.target.value })}
              placeholder="e.g. warm greige"
              className={cn(
                "w-full px-4 py-3 rounded-lg",
                "bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.08)]",
                "text-white text-sm focus:outline-none focus:border-[#3B82F6]"
              )}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-white mb-2">Wall color (accent)</label>
            <input
              value={value.wallAccentColor}
              onChange={(e) => set({ wallAccentColor: e.target.value })}
              placeholder="e.g. olive green"
              className={cn(
                "w-full px-4 py-3 rounded-lg",
                "bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.08)]",
                "text-white text-sm focus:outline-none focus:border-[#3B82F6]"
              )}
            />
          </div>
          {wallFinishMode === "concept_color" ? (
            <p className="md:col-span-2 text-[12px] text-[rgba(255,255,255,0.55)]">
              This is a concept finish. Generate is allowed without a merchant paint product. It is
              not shoppable.
            </p>
          ) : (
            <div className="md:col-span-2 space-y-2">
              {wallPaintProductName ? (
                <p className="text-[13px] text-white">Selected paint: {wallPaintProductName} · READY</p>
              ) : wallPaintUnresolved ? (
                <p className="text-[13px] text-[rgba(255,210,80,0.85)]">
                  Exact wall paint is unresolved. Generate is blocked until a grounded paint product
                  is READY, or you switch to Choose color / Keep existing.
                </p>
              ) : (
                <p className="text-[12px] text-[rgba(255,255,255,0.55)]">
                  Exact paint product required. Generate is blocked until a grounded paint product is
                  READY.
                </p>
              )}
              {wallPaintUnresolved ? (
                <div className="flex flex-wrap gap-3">
                  {onRetryWallPaint ? (
                    <button type="button" onClick={onRetryWallPaint} className="text-[12px] text-[#3B82F6] hover:underline">
                      Retry
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setWallFinish("concept_color")}
                    className="text-[12px] text-[#3B82F6] hover:underline"
                  >
                    Switch to concept color
                  </button>
                  <button
                    type="button"
                    onClick={() => setWallFinish("keep_existing")}
                    className="text-[12px] text-[#3B82F6] hover:underline"
                  >
                    Keep existing
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </div>
      ) : null}

      <div>
        <div className="text-sm font-medium text-white mb-2">Floor</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <ChoiceButton
            selected={value.floorFinishMode === "keep_existing" || value.flooring === "keep"}
            title="Keep existing"
            description="Preserve the photographed floor"
            onClick={() => set({ flooring: "keep", floorFinishMode: "keep_existing" })}
          />
          <ChoiceButton
            selected={value.floorFinishMode === "exact_product" || value.flooring !== "keep"}
            title="Change floor"
            description="Exact product required — never invented"
            onClick={() => {
              if (value.flooring === "keep") {
                set({ flooring: "hardwood", floorFinishMode: "exact_product" });
              }
            }}
          />
        </div>
        {value.flooring !== "keep" || value.floorFinishMode === "exact_product" ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {flooringOptions
                .filter((o) => o.id !== "keep")
                .map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => set({ flooring: o.id, floorFinishMode: "exact_product" })}
                    className={cn(
                      "p-4 rounded-[14px] text-left border transition-all",
                      value.flooring === o.id
                        ? "border-[#3B82F6] bg-[rgba(59,130,246,0.10)]"
                        : "border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] hover:border-[rgba(255,255,255,0.15)]"
                    )}
                  >
                    <div className="text-[15px] font-medium text-white">{o.label}</div>
                    <div className="text-[12px] text-[rgba(255,255,255,0.55)] mt-1">{o.desc}</div>
                  </button>
                ))}
            </div>
            <div className="mt-3 space-y-2">
              {floorProductName ? (
                <p className="text-[13px] text-white">Selected floor: {floorProductName} · READY</p>
              ) : floorUnresolved ? (
                <p className="text-[13px] text-[rgba(255,210,80,0.85)]">
                  Floor change is unresolved. Generate is blocked. Retry search, change flooring
                  constraints, select another floor product, or explicitly Keep existing.
                </p>
              ) : (
                <p className="text-[12px] text-[rgba(255,255,255,0.55)]">
                  Floor change requires a grounded exact product. Generate is blocked until one is
                  READY, or you explicitly choose Keep existing.
                </p>
              )}
              {floorUnresolved ? (
                <div className="flex flex-wrap gap-3">
                  {onRetryFloor ? (
                    <button type="button" onClick={onRetryFloor} className="text-[12px] text-[#3B82F6] hover:underline">
                      Retry
                    </button>
                  ) : null}
                  <span className="text-[12px] text-[rgba(255,255,255,0.55)]">Change constraints above</span>
                  <button
                    type="button"
                    onClick={() => set({ flooring: "keep", floorFinishMode: "keep_existing" })}
                    className="text-[12px] text-[#3B82F6] hover:underline"
                  >
                    Keep existing
                  </button>
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </div>

      <label className="flex items-center gap-2 text-sm text-[rgba(255,255,255,0.80)]">
        <input
          type="checkbox"
          checked={value.underfloorHeating}
          onChange={(e) => set({ underfloorHeating: e.target.checked })}
          className="accent-[#3B82F6]"
        />
        Underfloor heating
      </label>

      {isBedroom && (
        <div>
          <div className="text-sm font-medium text-white mb-2">Bed type</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {bedOptions.map((o) => (
              <button
                key={o.id}
                onClick={() => set({ bedType: o.id })}
                className={cn(
                  "p-4 rounded-[14px] text-left border transition-all",
                  value.bedType === o.id
                    ? "border-[#3B82F6] bg-[rgba(59,130,246,0.10)]"
                    : "border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] hover:border-[rgba(255,255,255,0.15)]"
                )}
              >
                <div className="text-[15px] font-medium text-white">{o.label}</div>
                <div className="text-[12px] text-[rgba(255,255,255,0.60)] mt-1">{o.desc}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-white mb-2">Other ideas (optional)</label>
        <textarea
          value={value.notes}
          onChange={(e) => set({ notes: e.target.value })}
          rows={4}
          placeholder="Write any wishes: materials, furniture, what to keep/remove…"
          className={cn(
            "w-full px-4 py-3 rounded-lg",
            "bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.08)]",
            "text-white text-sm focus:outline-none focus:border-[#3B82F6] resize-none"
          )}
        />
      </div>

      <div className="flex justify-start mt-2">
        <button
          onClick={onContinue}
          className="px-6 py-3 rounded-lg bg-[#3B82F6] text-white text-[14px] font-medium hover:bg-[#2563EB] transition-colors"
        >
          Continue
        </button>
      </div>
    </div>
  );
};

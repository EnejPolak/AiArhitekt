"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type RoomDesignPreferences = {
  wallMainColor: string;
  wallAccentColor: string;
  flooring: "keep" | "hardwood" | "laminate" | "tiles" | "marble";
  underfloorHeating: boolean;
  bedType: "none" | "king" | "queen" | "bunk" | "single";
  notes: string;
};

export interface Step6DesignPreferencesProps {
  roomType: string;
  value: RoomDesignPreferences;
  onChange: (value: RoomDesignPreferences) => void;
  onContinue: () => void;
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

export const Step6DesignPreferences: React.FC<Step6DesignPreferencesProps> = ({
  roomType,
  value,
  onChange,
  onContinue,
}) => {
  const isBedroom = roomType === "bedroom";

  const set = (patch: Partial<RoomDesignPreferences>) => onChange({ ...value, ...patch });

  return (
    <div className="space-y-6 mt-8">
      <div className="text-[15px] text-[rgba(255,255,255,0.80)] leading-relaxed">
        Tell me your preferences so I don’t guess. These will be used to build the image prompt.
      </div>

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
      </div>

      <div>
        <div className="text-sm font-medium text-white mb-2">Flooring</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {flooringOptions.map((o) => (
            <button
              key={o.id}
              onClick={() => set({ flooring: o.id })}
              className={cn(
                "p-4 rounded-[14px] text-left border transition-all",
                value.flooring === o.id
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


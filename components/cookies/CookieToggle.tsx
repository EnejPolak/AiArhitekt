"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface CookieToggleProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}

export const CookieToggle: React.FC<CookieToggleProps> = ({
  label,
  description,
  checked,
  onChange,
  disabled = false,
  className,
}) => {
  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <div className="flex-1">
        <label
          className={cn(
            "text-base font-medium text-white cursor-pointer",
            disabled && "opacity-60 cursor-not-allowed"
          )}
        >
          {label}
        </label>
        {description && (
          <p className="text-sm text-[rgba(255,255,255,0.65)] mt-1">
            {description}
          </p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={cn(
          "relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#00E6CC] focus:ring-offset-2 focus:ring-offset-transparent",
          checked
            ? "bg-[#00E6CC] shadow-[0_0_8px_rgba(0,230,204,0.4)]"
            : "bg-[rgba(255,255,255,0.15)]",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        <span
          className={cn(
            "inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ease-in-out",
            checked ? "translate-x-6" : "translate-x-1"
          )}
        />
      </button>
    </div>
  );
};


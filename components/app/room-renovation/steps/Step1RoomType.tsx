"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface Step1RoomTypeProps {
  selectedRoomType: "kitchen" | "bathroom" | "bedroom" | "living-room" | "other" | null;
  onSelect: (roomType: "kitchen" | "bathroom" | "bedroom" | "living-room" | "other") => void;
}

const roomOptions = [
  {
    id: "kitchen" as const,
    label: "Kitchen",
    icon: (
      <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-10 h-10">
        <rect x="12" y="16" width="40" height="32" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <line x1="12" y1="28" x2="52" y2="28" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="20" cy="22" r="2" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <circle cx="44" cy="22" r="2" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <rect x="24" y="32" width="16" height="16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
    ),
  },
  {
    id: "bathroom" as const,
    label: "Bathroom",
    icon: (
      <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-10 h-10">
        <rect x="12" y="16" width="40" height="40" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <circle cx="28" cy="28" r="4" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <rect x="40" y="24" width="8" height="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <line x1="12" y1="32" x2="52" y2="32" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "bedroom" as const,
    label: "Bedroom",
    icon: (
      <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-10 h-10">
        <rect x="12" y="16" width="40" height="40" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <rect x="16" y="28" width="20" height="20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <circle cx="44" cy="32" r="3" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <line x1="44" y1="35" x2="44" y2="48" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "living-room" as const,
    label: "Living room",
    icon: (
      <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-10 h-10">
        <rect x="12" y="16" width="40" height="40" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <rect x="20" y="24" width="12" height="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <rect x="36" y="24" width="12" height="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <circle cx="28" cy="40" r="2" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <circle cx="44" cy="40" r="2" stroke="currentColor" strokeWidth="1.5" fill="none" />
      </svg>
    ),
  },
  {
    id: "other" as const,
    label: "Other",
    icon: (
      <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-10 h-10">
        <rect x="12" y="16" width="40" height="40" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <line x1="12" y1="28" x2="52" y2="28" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="32" y1="16" x2="32" y2="56" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
];

export const Step1RoomType: React.FC<Step1RoomTypeProps> = ({ selectedRoomType, onSelect }) => {
  return (
    <div className="space-y-6 mt-6">
      {/* Room Type Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {roomOptions.map((option) => (
          <button
            key={option.id}
            onClick={() => onSelect(option.id)}
            className={cn(
              "group relative",
              "p-6 md:p-8",
              "bg-[rgba(255,255,255,0.02)]",
              "border rounded-[16px]",
              "text-left",
              "transition-all duration-300 ease-out",
              "hover:bg-[rgba(255,255,255,0.04)]",
              "hover:scale-[1.02]",
              "active:scale-[0.98]",
              selectedRoomType === option.id
                ? "border-[#3B82F6] bg-[rgba(59,130,246,0.10)]"
                : "border-[rgba(255,255,255,0.08)] hover:border-[rgba(255,255,255,0.15)]"
            )}
          >
            {/* Icon */}
            <div
              className={cn(
                "mb-4",
                "transition-colors duration-300",
                selectedRoomType === option.id
                  ? "text-[#3B82F6]"
                  : "text-[rgba(255,255,255,0.50)] group-hover:text-[rgba(255,255,255,0.80)]"
              )}
            >
              {option.icon}
            </div>

            {/* Label */}
            <div
              className={cn(
                "text-[18px] font-medium",
                selectedRoomType === option.id ? "text-white" : "text-[rgba(255,255,255,0.85)]"
              )}
            >
              {option.label}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

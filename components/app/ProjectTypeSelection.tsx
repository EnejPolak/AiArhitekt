"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface ProjectTypeSelectionProps {
  onSelect: (type: "room-renovation" | "home-renovation" | "new-construction") => void;
}

export const ProjectTypeSelection: React.FC<ProjectTypeSelectionProps> = ({ onSelect }) => {
  const [hoveredCard, setHoveredCard] = React.useState<string | null>(null);

  const cards = [
    {
      id: "room-renovation",
      title: "Renovate a Room",
      description: "Redesign a single room like a kitchen, bathroom, bedroom, or living room. Get AI visuals, style ideas, and cost estimates.",
      icon: (
        <svg
          viewBox="0 0 64 64"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-12 h-12"
        >
          <rect x="8" y="12" width="48" height="40" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <line x1="8" y1="24" x2="56" y2="24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <rect x="16" y="28" width="12" height="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <circle cx="44" cy="34" r="3" stroke="currentColor" strokeWidth="1.5" fill="none" />
          <line x1="44" y1="37" x2="44" y2="48" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="40" y1="44" x2="48" y2="44" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      id: "home-renovation",
      title: "Renovate a Home",
      description: "Plan a full apartment or house renovation. Multiple rooms, layout ideas, materials, and budget overview.",
      icon: (
        <svg
          viewBox="0 0 64 64"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-12 h-12"
        >
          <rect x="12" y="20" width="40" height="36" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <line x1="12" y1="32" x2="52" y2="32" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="32" y1="20" x2="32" y2="56" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <rect x="16" y="36" width="12" height="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <rect x="36" y="36" width="12" height="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <path d="M 20 8 L 32 4 L 44 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      ),
    },
    {
      id: "new-construction",
      title: "Build a New House",
      description: "Start a new house project from scratch. Includes land, layout, construction costs, and permits.",
      icon: (
        <svg
          viewBox="0 0 64 64"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-12 h-12"
        >
          <path
            d="M 32 8 L 8 24 L 8 56 L 56 56 L 56 24 Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          <path
            d="M 32 8 L 32 56"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <path
            d="M 8 24 L 32 8 L 56 24"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          <rect x="20" y="36" width="8" height="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <rect x="36" y="36" width="8" height="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      ),
    },
  ];

  return (
    <div className="flex-1 flex items-center justify-center px-4 md:px-8 py-12 md:py-16">
      <div className="w-full max-w-[900px] mx-auto">
        {/* Header */}
        <div className="text-center mb-12 md:mb-16">
          <h1 className="text-[32px] md:text-[40px] font-medium text-white mb-3 md:mb-4">
            What are you planning?
          </h1>
          <p className="text-[16px] md:text-[18px] text-[rgba(255,255,255,0.60)] max-w-[600px] mx-auto leading-relaxed">
            Choose the type of project you want to start. Each option will guide you through a personalized AI workflow.
          </p>
        </div>

        {/* Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
          {cards.map((card) => (
            <button
              key={card.id}
              onClick={() => onSelect(card.id as any)}
              onMouseEnter={() => setHoveredCard(card.id)}
              onMouseLeave={() => setHoveredCard(null)}
              className={cn(
                "group relative",
                "p-6 md:p-8",
                "bg-[rgba(255,255,255,0.02)]",
                "border border-[rgba(255,255,255,0.08)]",
                "rounded-[16px]",
                "text-left",
                "transition-all duration-300 ease-out",
                "hover:bg-[rgba(255,255,255,0.04)]",
                "hover:border-[rgba(255,255,255,0.15)]",
                hoveredCard === card.id && "shadow-lg shadow-black/20",
                "hover:scale-[1.02]",
                "active:scale-[0.98]"
              )}
            >
              {/* Icon */}
              <div
                className={cn(
                  "mb-4 md:mb-6",
                  "text-[rgba(255,255,255,0.50)]",
                  "transition-colors duration-300",
                  "group-hover:text-[rgba(255,255,255,0.80)]"
                )}
              >
                {card.icon}
              </div>

              {/* Content */}
              <div>
                <h3 className="text-[20px] md:text-[22px] font-medium text-white mb-2 md:mb-3 group-hover:text-white transition-colors">
                  {card.title}
                </h3>
                <p className="text-[14px] md:text-[15px] text-[rgba(255,255,255,0.60)] leading-relaxed group-hover:text-[rgba(255,255,255,0.70)] transition-colors">
                  {card.description}
                </p>
              </div>

              {/* Hover Indicator */}
              <div
                className={cn(
                  "absolute bottom-6 md:bottom-8 right-6 md:right-8",
                  "w-6 h-6",
                  "flex items-center justify-center",
                  "opacity-0 group-hover:opacity-100",
                  "transition-opacity duration-300"
                )}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-5 h-5 text-[rgba(255,255,255,0.60)]"
                >
                  <path
                    d="M5 12h14M12 5l7 7-7 7"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

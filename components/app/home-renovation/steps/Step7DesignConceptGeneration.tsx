"use client";

import * as React from "react";

export interface Step7DesignConceptGenerationProps {
  homeType: "apartment" | "house" | "townhouse" | "other";
  renovationScope: string[];
  styles: string[];
  budget: "essential" | "balanced" | "high-end" | "not-sure";
  observation: string | null;
  onConceptsGenerated: (concepts: Array<{ id: string; url: string; area: string }>) => void;
}

export const Step7DesignConceptGeneration: React.FC<Step7DesignConceptGenerationProps> = ({
  homeType,
  renovationScope,
  styles,
  budget,
  observation,
  onConceptsGenerated,
}) => {
  const [isGenerating, setIsGenerating] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const generateConcepts = async () => {
      try {
        setError(null);
        const scopeDescription = renovationScope.join(", ");
        const styleDescription = styles.length ? styles.join(", ") : "modern";

        const prompt =
          `Photorealistic architectural renovation concept for a residential ${homeType}. ` +
          `Renovation scope: ${scopeDescription}. Global style direction: ${styleDescription}. Budget: ${budget}. ` +
          `Neutral even lighting, ultra sharp, realistic materials, clean and decluttered. ` +
          `Create a cohesive concept presentation render (not a floorplan).` +
          (observation ? `\n\nContext from photos/floor plan:\n${observation}` : "");

        const negativePrompt =
          "floorplan, blueprint, sketch, technical drawing, black and white, grayscale, monochrome, line art, edges, outlines, " +
          "blur, blurry, soft focus, haze, fog, cinematic, film grain, vignette, text, watermark, logo, people, clutter";

        const response = await fetch("/api/render", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            prompt,
            negativePrompt,
            n: 2,
            size: "1536x1024",
          }),
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(err?.error || "Failed to generate design concepts");
        }

        const data = await response.json();
        const images: string[] = Array.isArray(data?.images) && data.images.length > 0
          ? data.images
          : data?.imageUrl
            ? [data.imageUrl]
            : [];

        const areas = scopeDescription.includes("kitchen")
          ? ["Living area", "Kitchen"]
          : ["Living area", "Bedroom"];

        const concepts = areas.slice(0, 2).map((area, i) => ({
          id: `concept-${i + 1}`,
          url: images[i] || "",
          area,
        }));

        onConceptsGenerated(concepts);
      } catch (err: any) {
        console.error("Error generating concepts:", err);
        setError(err.message || "Failed to generate design concepts");
        // Fallback: create placeholder concepts
        onConceptsGenerated([
          { id: "concept-1", url: "", area: "Living area" },
          { id: "concept-2", url: "", area: "Kitchen" },
        ]);
      } finally {
        setIsGenerating(false);
      }
    };

    generateConcepts();
  }, [homeType, renovationScope, styles, budget, observation, onConceptsGenerated]);

  if (isGenerating) {
    return (
      <div className="flex justify-start mb-6">
        <div className="max-w-[85%] rounded-[16px] px-6 py-5 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)]">
          <div className="text-[15px] text-[rgba(255,255,255,0.85)] leading-relaxed mb-3">
            Creating design concepts for your home…
          </div>
          <div className="flex items-center justify-center">
            <div className="w-12 h-12 border-4 border-[rgba(255,255,255,0.1)] border-t-[#3B82F6] rounded-full animate-spin" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-start mb-6">
        <div className="max-w-[85%] rounded-[16px] px-6 py-5 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)]">
          <div className="text-[15px] text-[rgba(255,255,255,0.85)] leading-relaxed">
            I couldn’t generate concepts right now.
          </div>
          <div className="text-[13px] text-[rgba(255,255,255,0.60)] mt-2">
            {error}
          </div>
          <div className="text-[13px] text-[rgba(255,255,255,0.60)] mt-2">
            If you see a 403 about `gpt-image-1`, verify your OpenAI organization and retry.
          </div>
        </div>
      </div>
    );
  }

  return null;
};

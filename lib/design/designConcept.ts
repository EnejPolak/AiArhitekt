import type { RoomAnalysisObservation } from "@/lib/analysis/schema";
import { isUnfinishedConstruction, observationText } from "./unfinishedRoom";

export type InteriorDesignConcept = {
  character: string;
  primaryColors: string[];
  secondaryColors: string[];
  wallFinish: string;
  flooringTreatment: string;
  woodMetal: string;
  textilePalette: string;
  lightingTemperature: string;
  furnishingProportions: string;
};

function uniqueColors(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = value.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(value.trim());
  }
  return out.slice(0, 4);
}

export function buildDesignConcept(input: {
  observation?: RoomAnalysisObservation | null;
  selectedStyles?: string[];
  brief?: {
    colorsLike?: string[];
    colorsDislike?: string[];
    materials?: string[];
    lightingTemp?: "warm" | "neutral" | "mixed" | null;
    atmosphere?: string | null;
  } | null;
}): InteriorDesignConcept {
  const observation = input.observation;
  const styles = (input.selectedStyles ?? []).map((item) => item.trim()).filter(Boolean);
  const observedColors = uniqueColors(observation?.visualCondition?.colors ?? []);
  const unfinished = isUnfinishedConstruction(observation);
  const blob = observationText(observation);
  const warm =
    input.brief?.lightingTemp === "warm" ||
    /warm|beige|greige|oak|cream|terracotta/.test(blob) ||
    styles.some((item) => /warm|minimal/.test(item));
  const liked = uniqueColors(input.brief?.colorsLike ?? []);

  const primary = liked.length > 0
    ? liked.slice(0, 2)
    : observedColors.length > 0
      ? observedColors.slice(0, 2)
      : warm
        ? ["warm greige", "soft ivory"]
        : ["soft white", "light greige"];
  const secondary = liked.slice(2, 4);
  if (secondary.length === 0) {
    secondary.push(...observedColors.slice(2, 4));
  }
  if (secondary.length === 0) {
    secondary.push(warm ? "muted olive" : "cool stone");
  }
  const avoid = (input.brief?.colorsDislike ?? []).filter(Boolean);

  return {
    character: styles.length
      ? `A cohesive ${styles.join(", ")} interior rather than a collection of unrelated products.`
      : "A cohesive residential interior with one design language across furniture, finishes, and lighting.",
    primaryColors: primary,
    secondaryColors: avoid.length ? secondary.filter((item) => !avoid.includes(item)) : secondary,
    wallFinish: unfinished
      ? "Visually complete unfinished wall surfaces to a calm plastered paint finish matching the primary color. This is a design proposal, not a shoppable paint SKU."
      : "Keep the photographed wall character unless a wall finish decision is explicitly listed.",
    flooringTreatment: unfinished
      ? "Visually complete raw floor surfaces to a quiet residential floor aligned with the wood/metal palette. This is a design proposal, not a shoppable flooring SKU unless a grounded floor product is listed."
      : "Keep the photographed floor unless a grounded floor product is listed.",
    woodMetal: (input.brief?.materials ?? []).includes("matte-metal")
      ? "Warm wood tones with quiet brushed or matte metal; avoid mixed chrome and gold."
      : warm
        ? "Warm wood tones with quiet brushed or matte metal; avoid mixed chrome and gold."
        : "Light wood or painted wood with restrained matte metal.",
    textilePalette: "Layer textiles in the primary and secondary colors; keep rug, sofa, and curtains in the same family if those products are approved.",
    lightingTemperature:
      input.brief?.lightingTemp === "neutral"
        ? "Neutral white, about 3500 K. Avoid cold retail lighting."
        : "Warm white, about 2700–3000 K. Avoid cold blue-white retail lighting.",
    furnishingProportions:
      "Scale furniture to the room and circulation, not to the product photograph crop. Do not oversize a sofa into a catalog island.",
  };
}

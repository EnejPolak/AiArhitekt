import type { RoomAnalysisObservation } from "@/lib/analysis/schema";
import type { ProductConcept } from "@/lib/discovery/locales/types";
import { hasCeilingWiringEvidence, isUnfinishedConstruction } from "./unfinishedRoom";

export type LightingLayer = {
  kind: "general" | "ambient" | "task" | "decorative";
  present: boolean;
  placement: string;
  brightness: string;
  colorTemperature: string;
};

export type LightingDesign = {
  layers: LightingLayer[];
  daylight: string;
  evening: string;
  wiringInstruction: string;
  avoid: string[];
};

function hasConcept(planned: ProductConcept[], concept: ProductConcept): boolean {
  return planned.includes(concept);
}

export function planLightingDesign(input: {
  observation?: RoomAnalysisObservation | null;
  plannedConcepts: ProductConcept[];
  brief?: { lightingTemp?: "warm" | "neutral" | "mixed" | null; atmosphere?: string | null } | null;
}): LightingDesign {
  const planned = input.plannedConcepts;
  const observation = input.observation;
  const daylightNote = observation?.visualCondition?.lighting?.trim() || "Natural light as photographed; do not invent a new window.";
  const unfinished = isUnfinishedConstruction(observation);
  const wiring = hasCeilingWiringEvidence(observation);
  const generalPresent = hasConcept(planned, "ceiling_light") || hasConcept(planned, "pendant_light");
  const ambientPresent = hasConcept(planned, "floor_lamp") || hasConcept(planned, "table_lamp") || hasConcept(planned, "wall_light");
  const taskPresent = hasConcept(planned, "desk") || hasConcept(planned, "table_lamp");
  const temperature =
    input.brief?.lightingTemp === "neutral" ? "3500 K neutral white" : "2700–3000 K warm white";

  const layers: LightingLayer[] = [
    {
      kind: "general",
      present: generalPresent,
      placement: generalPresent
        ? "Install the referenced ceiling or pendant fixture at the existing ceiling electrical point. Do not invent a second ceiling fixture."
        : "Do not invent a ceiling fixture. If hanging wires are visible, finish them as a closed ceiling point, not as a new lamp.",
      brightness: "Even general illumination for a residential living room; avoid spotlight glare.",
      colorTemperature: temperature,
    },
    {
      kind: "ambient",
      present: ambientPresent,
      placement: ambientPresent
        ? "Place referenced floor, table, or wall lights beside seating, not randomly in empty corners."
        : "Ambient lighting beside seating is a design recommendation for evening use. Do not invent a floor lamp unless it is in the product inventory.",
      brightness: "Softer than the ceiling layer; usable in the evening without washing out the room.",
      colorTemperature: temperature,
    },
    {
      kind: "task",
      present: taskPresent,
      placement: taskPresent
        ? "Keep task lighting at the work or reading surface that the inventory product serves."
        : "No separate task lighting unless an inventory product provides it.",
      brightness: "Locally brighter than ambient, without a studio-light look.",
      colorTemperature: temperature,
    },
    {
      kind: "decorative",
      present: false,
      placement:
        "Restrained decoration may finish a solid wall, but do not invent a shoppable artwork, plant, or accessory that is not in the product inventory.",
      brightness: "n/a",
      colorTemperature: "n/a",
    },
  ];

  const wiringInstruction =
    unfinished || wiring
      ? generalPresent
        ? "Do not leave exposed hanging electrical wires. Install the referenced ceiling fixture at the photographed electrical point. Do not move outlets."
        : "Do not leave exposed hanging electrical wires or unexplained empty electrical points. Finish the existing ceiling point; do not invent a fixture that is not in inventory."
      : "Do not add random fixtures. Use only lighting products in the inventory.";

  return {
    layers,
    daylight: `${daylightNote} Keep window glare off primary seating and any television wall.`,
    evening: "Show a finished evening-capable interior: general plus ambient layers from inventory products, warm color temperature, no neon LED-strip glow.",
    wiringInstruction,
    avoid: [
      "Excessive LED-strip aesthetics",
      "Unrealistic colored glow",
      "Randomly positioned fixtures",
      "Cold retail lighting",
    ],
  };
}

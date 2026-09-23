import type { RoomAnalysisObservation } from "@/lib/analysis/schema";
import type { ProductConcept } from "@/lib/discovery/locales/types";
import { mediaPreferenceFromText } from "./completeInterior";
import { exactDimensionsKnown, observationText } from "./unfinishedRoom";

export type LayoutOptionId =
  | "wall_anchored_conversation"
  | "window_facing_glare_risk"
  | "centered_showroom";

export type LayoutOption = {
  id: LayoutOptionId;
  title: string;
  sofaOrientation: string;
  viewingDirection: string | null;
  circulation: string;
  score: number;
  selected: boolean;
  rationale: string;
};

export type MediaWallStatus = "pending_preference" | "planned" | "not_used";

export type MediaWallPlan = {
  status: MediaWallStatus;
  sofaRelationship: string;
  glare: string;
  circulation: string;
  electrical: string;
};

export type LayoutPlan = {
  selectedOptionId: LayoutOptionId;
  options: LayoutOption[];
  selectedRationale: string;
  physicalFit: "verified" | "unverified";
  missingMeasurements: string[];
  preserveArchitecture: string[];
  mediaWall: MediaWallPlan;
};

function hasDoors(observation?: RoomAnalysisObservation | null): boolean {
  return (observation?.architecture?.doors?.length ?? 0) > 0;
}

function hasWindows(observation?: RoomAnalysisObservation | null): boolean {
  return (observation?.architecture?.windows?.length ?? 0) > 0;
}

function hasBalcony(observation?: RoomAnalysisObservation | null): boolean {
  return /balcony|terrace|loggia/.test(observationText(observation));
}

export function planFurnitureLayout(input: {
  observation?: RoomAnalysisObservation | null;
  plannedConcepts: ProductConcept[];
  userNotes?: string | null;
  brief?: { tvWanted?: boolean | null; concepts?: Partial<Record<ProductConcept, string>> } | null;
}): LayoutPlan {
  const observation = input.observation;
  const planned = input.plannedConcepts.filter((item) => item !== "other");
  const doors = hasDoors(observation);
  const windows = hasWindows(observation);
  const balcony = hasBalcony(observation);
  const mediaPref = mediaPreferenceFromText(
    [observationText(observation), input.userNotes ?? ""].filter(Boolean).join(" ")
  );
  const tvWanted = input.brief?.tvWanted;
  const declinesMedia = mediaPref.declines || tvWanted === false || input.brief?.concepts?.tv_console === "exclude";
  const mentionsMedia = (mediaPref.mentions && !mediaPref.declines) || tvWanted === true;
  const mediaPlanned = planned.includes("tv_console") || (mentionsMedia && !declinesMedia);
  const blob = observationText(observation);
  const limitedWallSpace = /limit wall space|sliding (?:glass )?door/.test(blob) && windows;

  const wallAnchored: LayoutOption = {
    id: "wall_anchored_conversation",
    title: "Wall-anchored conversation group",
    sofaOrientation: limitedWallSpace
      ? "Anchor the sofa on the remaining usable solid wall. Do not float it in the center, and do not park it against the glass wall or in front of the sliding door."
      : "Place the sofa along a usable wall that does not block doors, balcony access, or the main circulation path. Keep the seating group off the room center.",
    viewingDirection: limitedWallSpace
      ? "Face seating toward the remaining solid wall that is not the window or sliding-door wall. That facing wall is the only coherent media or feature wall if a television is wanted."
      : "Face seating toward a usable solid wall that is not the primary window wall. If a television is wanted, that opposite wall is the media wall.",
    circulation: limitedWallSpace
      ? "Keep the path to the sliding door and window wall clear. Large glazed openings already consume wall space; do not add furniture that blocks those openings."
      : "Keep walking clearance at doors, the balcony opening if present, and the path from the entry through the seating group.",
    score: 80 + (doors || balcony ? 10 : 0) + (windows ? 5 : 0) + (mediaPlanned ? 5 : 0) + (limitedWallSpace ? 5 : 0),
    selected: false,
    rationale:
      "A living room reads as a finished interior when seating is anchored to architecture and circulation, not when the sofa is centered like a catalog hero shot.",
  };

  const windowFacing: LayoutOption = {
    id: "window_facing_glare_risk",
    title: "Seating facing the window wall",
    sofaOrientation: "Place the sofa so the primary view is toward the window wall.",
    viewingDirection: windows
      ? "Television or artwork on the window wall would fight daylight glare."
      : "No window wall is observed.",
    circulation: "May crowd the window wall and reduce usable daylight control.",
    score: windows ? 35 : 10,
    selected: false,
    rationale: "Facing the window can look open in a product photo but creates glare and weaker TV placement.",
  };

  const centered: LayoutOption = {
    id: "centered_showroom",
    title: "Centered showroom placement",
    sofaOrientation: "Float the sofa in the middle of the room as in a product photograph.",
    viewingDirection: "No architectural facing logic.",
    circulation: "Blocks the natural walking path across the room.",
    score: 5,
    selected: false,
    rationale: "Rejected: centering the sofa because it looks attractive in a product photograph is not space planning.",
  };

  const options = [wallAnchored, windowFacing, centered].sort((left, right) => right.score - left.score);
  const selected = options[0]!;
  selected.selected = true;

  const missingMeasurements: string[] = [];
  if (!exactDimensionsKnown(observation)) {
    missingMeasurements.push("Room width and depth (plan dimensions).");
    if (planned.includes("sofa")) {
      missingMeasurements.push("Sofa overall footprint (width and depth), not only seat or leg height.");
    }
    if (planned.includes("rug")) {
      missingMeasurements.push("Confirm rug size against the seating group once room width is known.");
    }
  }

  const preserveArchitecture = [
    ...(observation?.architecture?.windows ?? []).map((item) => `Window: ${item}`),
    ...(observation?.architecture?.doors ?? []).map((item) => `Door: ${item}`),
    ...(observation?.architecture?.fixedElements ?? []).map((item) => `Fixed: ${item}`),
    ...(observation?.preserve ?? []),
  ];

  if (/\belectrical\b|\boutlet\b|\bwiring\b|\bwires?\b/.test(blob)) {
    preserveArchitecture.push("Existing electrical points stay where photographed.");
  }

  const mediaWall: MediaWallPlan = {
    status: planned.includes("tv_console") || (mentionsMedia && !declinesMedia)
      ? "planned"
      : declinesMedia
        ? "not_used"
        : "pending_preference",
    sofaRelationship: limitedWallSpace
      ? "Because glazed openings consume most of the wall length, the sofa and any television must share the remaining solid walls: sofa on one usable solid wall, screen on the facing solid wall — never on the glass."
      : "Anchor the sofa on a usable wall that leaves a solid facing wall for conversation or a television. Do not center the sofa as a catalog island.",
    glare: windows
      ? "Do not place a television on the window or sliding-door wall. Daylight from the photographed glazed openings would wash the screen. Curtains on that glass wall control glare; they are not a TV backdrop."
      : "No window wall is observed for glare against a screen.",
    circulation: limitedWallSpace
      ? "Keep the media or feature wall off the sliding-door path. Walking clearance at the glazed openings is required; exact clearances are unverified."
      : "Keep the media or feature wall off door and balcony swing. Walking path from entry through the seating group stays clear; exact clearances are unverified.",
    electrical:
      /electrical|outlet|wiring|wires?/.test(blob)
        ? "Use photographed electrical points. Do not invent a new outlet or move the ceiling point for a TV."
        : "No verified wall outlet for a TV was measured. Do not invent an electrical point or claim physical fit.",
  };

  return {
    selectedOptionId: selected.id,
    options,
    selectedRationale: selected.rationale,
    physicalFit: exactDimensionsKnown(observation) ? "verified" : "unverified",
    missingMeasurements,
    preserveArchitecture,
    mediaWall,
  };
}

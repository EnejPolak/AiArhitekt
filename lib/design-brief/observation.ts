import type { RoomAnalysisObservation } from "@/lib/analysis/schema";
import type { RoomPreferenceRoomType } from "@/lib/project-preferences/types";
import { observationText } from "@/lib/design/unfinishedRoom";
import { isUnfinishedConstruction, hasCeilingWiringEvidence } from "@/lib/design/unfinishedRoom";
import type { BriefObservationContext } from "./types";

export function briefObservationContext(input: {
  userRoomType?: RoomPreferenceRoomType | null;
  observation?: RoomAnalysisObservation | null;
}): BriefObservationContext {
  const observation = input.observation ?? null;
  const blob = observationText(observation);
  const userRoomType = input.userRoomType ?? null;
  const analysisRoomType = observation?.roomType ?? null;
  const mismatch = Boolean(
    userRoomType &&
      analysisRoomType &&
      analysisRoomType !== "unknown" &&
      analysisRoomType !== userRoomType
  );
  return {
    userRoomType,
    analysisRoomType,
    hasWindows: (observation?.architecture?.windows?.length ?? 0) > 0,
    hasDoors: (observation?.architecture?.doors?.length ?? 0) > 0,
    unfinished: isUnfinishedConstruction(observation),
    hasCeilingWiring: hasCeilingWiringEvidence(observation),
    hasBuiltInStorage: /built-?in|wardrobe|cabinets?|garderob|kuhinjsk\w*\s+omar/.test(blob),
    hasToilet: /\btoilet\b|\bwc\b|\bstrani[sš]/.test(blob),
    hasBed: /\bbed\b|\bpostelj/.test(blob) && !/need|empty/.test(blob),
    hasShower: /\bshower\b|\btu[sš]/.test(blob),
    hasBathtub: /\bbathtub\b|\bbath\b|\bkad\b/.test(blob),
    roomTypeMismatch: mismatch,
  };
}

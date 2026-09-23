import type { RoomAnalysisObservation } from "@/lib/analysis/schema";
import { normalizeMatchText } from "@/lib/text/diacritics";

export function observationText(observation?: RoomAnalysisObservation | null): string {
  if (!observation) return "";
  return normalizeMatchText(
    [
      observation.roomType,
      ...(observation.architecture?.walls ?? []),
      observation.architecture?.floor ?? "",
      ...(observation.architecture?.windows ?? []),
      ...(observation.architecture?.doors ?? []),
      ...(observation.architecture?.fixedElements ?? []),
      ...(observation.existingElements ?? []).map((item) => item.description),
      observation.visualCondition?.lighting ?? "",
      observation.visualCondition?.overall ?? "",
      ...(observation.visualCondition?.colors ?? []),
      ...(observation.constraints ?? []),
      ...(observation.preserve ?? []),
      ...(observation.replaceOrRemove ?? []),
      ...(observation.measurementStatus?.qualitativeNotes ?? []),
      ...(observation.uncertainties ?? []),
    ]
      .filter(Boolean)
      .join(" ")
  );
}

export function isUnfinishedConstruction(observation?: RoomAnalysisObservation | null): boolean {
  const blob = observationText(observation);
  if (!blob) return false;
  return (
    /\bunfinished\b/.test(blob) ||
    /\braw\s+(?:plaster|concrete|screed|walls?|floor)\b/.test(blob) ||
    /\bexposed\s+(?:wiring|wires?|cables?|construction)\b/.test(blob) ||
    /\bhanging\s+(?:wires?|cables?|flex(?:es)?)\b/.test(blob) ||
    /\bdangling\s+(?:wires?|cables?)\b/.test(blob) ||
    /\bconcrete\s+slab\b/.test(blob) ||
    /\bbare\s+screed\b/.test(blob) ||
    /\bconstruction\s+(?:site|shell|state)\b/.test(blob)
  );
}

export function hasCeilingWiringEvidence(observation?: RoomAnalysisObservation | null): boolean {
  const blob = observationText(observation);
  if (!blob) return false;
  return (
    /\b(dangling|exposed|loose|hanging)\b.{0,32}\b(wires?|cables?|flex(?:es)?)\b/.test(blob) ||
    /\b(wires?|cables?|flex(?:es)?)\b.{0,32}\b(ceiling|dangling|exposed|hanging)\b/.test(blob) ||
    /\bceiling\s+(electrical|wiring|wires?|outlet|rose|point|box|fixture)\b/.test(blob) ||
    /\belectrical\s+points?\b/.test(blob)
  );
}

export function exactDimensionsKnown(observation?: RoomAnalysisObservation | null): boolean {
  return Boolean(observation?.measurementStatus?.exactDimensionsKnown);
}

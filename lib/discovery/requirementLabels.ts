import type { RequirementProvenance } from "./itemSpecs";
import type { UnmatchedRequirement } from "./itemSpecs";

type LabelInput = {
  displayLabel?: string | null;
  itemSpec: string;
  provenance?: RequirementProvenance | null;
  requirementSnapshot?: unknown;
};

function snapshotFields(snapshot: unknown): { displayLabel?: string; provenance?: RequirementProvenance } {
  if (!snapshot || typeof snapshot !== "object") return {};
  const record = snapshot as Record<string, unknown>;
  const displayLabel = typeof record.displayLabel === "string" ? record.displayLabel : undefined;
  const provenance =
    record.provenance && typeof record.provenance === "object"
      ? (record.provenance as RequirementProvenance)
      : undefined;
  return { displayLabel, provenance };
}

export function resolvedRequirementDisplayLabel(input: LabelInput): string {
  const fromSnapshot = snapshotFields(input.requirementSnapshot);
  return (
    input.displayLabel?.trim() ||
    fromSnapshot.displayLabel?.trim() ||
    input.provenance?.paintRaw?.trim() ||
    fromSnapshot.provenance?.paintRaw?.trim() ||
    input.itemSpec.trim()
  );
}

export function resolvedRequirementUiLabel(input: LabelInput): string {
  return resolvedRequirementDisplayLabel(input).toUpperCase();
}

export function unmatchedRequirementDisplayLabel(item: UnmatchedRequirement): string {
  return resolvedRequirementDisplayLabel({
    displayLabel: item.displayLabel,
    itemSpec: item.itemSpec,
  });
}

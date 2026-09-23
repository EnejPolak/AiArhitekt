import type { ProductSelectionView } from "@/lib/discovery/types";

export function isLockedApprovedSelection(selection: ProductSelectionView): boolean {
  return (
    selection.referenceStatus === "ready" &&
    Boolean(selection.productUrl?.trim()) &&
    selection.requirementType === "furniture"
  );
}

export function lockedApprovedRequirementKeys(selections: ProductSelectionView[]): string[] {
  return [
    ...new Set(
      selections.filter(isLockedApprovedSelection).map((item) => item.requirementKey).filter(Boolean)
    ),
  ];
}

export function excludeLockedRequirementKeys<T extends { requirementKey: string }>(
  items: T[],
  lockedKeys: Iterable<string>
): { searchable: T[]; locked: T[] } {
  const locked = new Set([...lockedKeys].filter(Boolean));
  const searchable: T[] = [];
  const kept: T[] = [];
  for (const item of items) {
    if (locked.has(item.requirementKey)) kept.push(item);
    else searchable.push(item);
  }
  return { searchable, locked: kept };
}

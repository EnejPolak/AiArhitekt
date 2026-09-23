export type MixedDiscoveryMode = "replace" | "append" | "reuse";

export function resolveMixedDiscoveryMode(input: {
  searchedCount: number;
  searchableCount: number;
  lockedCount: number;
  hasPriorDiscovery: boolean;
}): MixedDiscoveryMode {
  if (input.searchedCount === 0) return "replace";
  if (input.searchableCount === 0 && input.hasPriorDiscovery) return "reuse";
  if (input.lockedCount > 0 && input.hasPriorDiscovery && input.searchableCount > 0) {
    return "append";
  }
  return "replace";
}

export function requirementsNeedingSearch<T extends { requirementKey: string }>(
  searched: T[],
  input: {
    priorSelectionKeys: Iterable<string>;
    unmatchedKeys?: Iterable<string>;
    lockedKeys?: Iterable<string>;
  }
): T[] {
  const covered = new Set(
    [
      ...input.priorSelectionKeys,
      ...(input.unmatchedKeys ?? []),
      ...(input.lockedKeys ?? []),
    ].filter(Boolean)
  );
  return searched.filter((item) => !covered.has(item.requirementKey));
}

/** Fill the next discovery batch from remaining required items, not only the first cap. */
export function nextDiscoverySearchBatch<T extends { requirementKey: string }>(
  allRequired: T[],
  input: {
    priorSelectionKeys: Iterable<string>;
    unmatchedKeys?: Iterable<string>;
    lockedKeys?: Iterable<string>;
    limit: number;
  }
): { searched: T[]; notSearched: T[] } {
  const remaining = requirementsNeedingSearch(allRequired, input);
  return {
    searched: remaining.slice(0, input.limit),
    notSearched: remaining.slice(input.limit),
  };
}

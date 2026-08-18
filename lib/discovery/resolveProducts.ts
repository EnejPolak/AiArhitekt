import type { PlaceResult } from "@/lib/places/placesService";
import type {
  CanonicalSerpSearchInput,
  CanonicalSerpSearchOutcome,
} from "@/lib/serp/search";
import { candidateMatchesRequirement } from "./categoryGate";
import { DiscoveryError, discoveryErrorMessage } from "./errors";
import {
  unmatchedRequirementSchema,
  type FurnitureNeed,
  type MaterialNeed,
  type SearchableRequirement,
  type UnmatchedRequirement,
} from "./itemSpecs";
import { mapCanonicalPickedToSelection, type CanonicalSelectionFields } from "./mapProduct";

export const MAX_DISCOVERY_QUERY_LEVELS = 3;

export type ResolvedDiscoverySelection = {
  requirementType: "furniture" | "material";
  requirementKey: string;
  requirementSnapshot: (FurnitureNeed | MaterialNeed) & {
    discoveryQuery: string;
    discoveryQueryLevel: number;
  };
  itemSpec: string;
  product: CanonicalSelectionFields;
};

function throwIfSerpFailed(
  serp: CanonicalSerpSearchOutcome
): asserts serp is Extract<CanonicalSerpSearchOutcome, { ok: true }> {
  if (serp.ok) return;
  if (serp.httpStatus === 429) {
    throw new DiscoveryError("serp_quota", discoveryErrorMessage("serp_quota"));
  }
  if (serp.error === "SERPAPI_KEY not configured") {
    throw new DiscoveryError("serp_unconfigured", discoveryErrorMessage("serp_unconfigured"));
  }
  throw new DiscoveryError("serp_failed", discoveryErrorMessage("serp_failed"));
}

export async function resolveProductsForRequirements(
  searched: SearchableRequirement[],
  searchSerp: (input: CanonicalSerpSearchInput) => Promise<CanonicalSerpSearchOutcome>,
  serpInputBase: Omit<CanonicalSerpSearchInput, "items">,
  stores: PlaceResult[]
): Promise<{
  selections: ResolvedDiscoverySelection[];
  unmatched: UnmatchedRequirement[];
}> {
  const remaining = [...searched];
  const levelByKey = new Map(searched.map((item) => [item.requirementKey, 0]));
  const selections: ResolvedDiscoverySelection[] = [];

  for (let pass = 0; pass < MAX_DISCOVERY_QUERY_LEVELS && remaining.length > 0; pass++) {
    const queries: string[] = [];
    const seen = new Set<string>();
    for (const requirement of remaining) {
      const level = levelByKey.get(requirement.requirementKey) ?? 0;
      const query = requirement.queryPlan[level] ?? requirement.itemSpec;
      if (!query || seen.has(query)) continue;
      seen.add(query);
      queries.push(query);
    }
    if (queries.length === 0) break;

    const serp = await searchSerp({
      ...serpInputBase,
      items: queries,
    });
    throwIfSerpFailed(serp);

    const byItem = new Map(serp.response.results.map((row) => [row.item, row]));
    const nextRemaining: SearchableRequirement[] = [];

    for (const requirement of remaining) {
      const level = levelByKey.get(requirement.requirementKey) ?? 0;
      const query = requirement.queryPlan[level] ?? requirement.itemSpec;
      const product = mapCanonicalPickedToSelection(byItem.get(query)?.picked ?? null, stores);
      if (product && candidateMatchesRequirement(requirement, product.productTitle)) {
        selections.push({
          requirementType: requirement.requirementType,
          requirementKey: requirement.requirementKey,
          requirementSnapshot: {
            ...requirement.snapshot,
            discoveryQuery: query,
            discoveryQueryLevel: level + 1,
          },
          itemSpec: query,
          product,
        });
        continue;
      }

      const nextLevel = level + 1;
      if (nextLevel < requirement.queryPlan.length && nextLevel < MAX_DISCOVERY_QUERY_LEVELS) {
        levelByKey.set(requirement.requirementKey, nextLevel);
        nextRemaining.push(requirement);
      }
    }

    remaining.splice(0, remaining.length, ...nextRemaining);
  }

  const selectedKeys = new Set(selections.map((item) => item.requirementKey));
  const unmatched = searched
    .filter((item) => !selectedKeys.has(item.requirementKey))
    .map((item) =>
      unmatchedRequirementSchema.parse({
        requirementKey: item.requirementKey,
        requirementType: item.requirementType,
        itemSpec: item.itemSpec,
        reason: "no_valid_product" as const,
      })
    );

  return { selections, unmatched };
}

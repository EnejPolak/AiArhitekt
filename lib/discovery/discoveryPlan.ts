import type { SearchableRequirement } from "./itemSpecs";
import { MAX_DISCOVERY_QUERY_LEVELS } from "./resolveProducts";
import {
  DISCOVERY_DEADLINE_MS,
  PER_DISCOVERY_SERP_BUDGET,
} from "./constants";
import { buildPlannedQueriesFromBundles } from "@/lib/serp/queryGen";
import { rulesBundle } from "@/lib/serp/searchBundle";
import { itemSpecToCategory } from "@/lib/serp/taxonomy";
import { resolveDomainsForItem } from "@/lib/serp/queryGen";

export type RequirementSerpPlan = {
  requirementKey: string;
  displayLabel: string;
  queryLevels: string[];
  taxonomyCategory: string;
  eligibleDomains: string[];
  logicalQueriesPerPass: number;
};

export type DiscoverySerpPlan = {
  requirementCount: number;
  domainsPerItem: number;
  variantsPerDomain: number;
  fastMode: boolean;
  requirements: RequirementSerpPlan[];
  pass1: { logicalQueries: number; maxProviderRequests: number };
  pass2: { logicalQueries: number; maxProviderRequests: number };
  pass3: { logicalQueries: number; maxProviderRequests: number };
  theoreticalLogicalQueriesAllPasses: number;
  globalProviderBudget: number;
  deadlineMs: number;
  legacyUnboundedEstimate: {
    domainsPerItem: number;
    variantsPerDomain: number;
    passes: number;
    perPassLogical: number;
    totalLogical: number;
    note: string;
  };
};

const DISCOVERY_FAST_DOMAINS_PER_ITEM = 2;
const DISCOVERY_FAST_VARIANTS_PER_DOMAIN = 2;

function planQueriesForItems(
  queries: string[],
  allowlistDomains: string[],
  domainCategoryMap?: Record<string, string[]>
): { perItem: Record<string, number>; total: number } {
  const bundles = queries.map((item) => rulesBundle(item, allowlistDomains));
  const { planned } = buildPlannedQueriesFromBundles(
    bundles,
    allowlistDomains,
    domainCategoryMap,
    undefined,
    {
      domainsPerItem: DISCOVERY_FAST_DOMAINS_PER_ITEM,
      queryVariantsPerDomain: DISCOVERY_FAST_VARIANTS_PER_DOMAIN,
    }
  );
  const perItem: Record<string, number> = {};
  let total = 0;
  for (const [item, itemQueries] of Object.entries(planned)) {
    perItem[item] = itemQueries.length;
    total += itemQueries.length;
  }
  return { perItem, total };
}

/**
 * Zero-provider dry plan for discovery SERP cost estimation.
 */
export function planDiscoverySerp(input: {
  requirements: SearchableRequirement[];
  allowlistDomains: string[];
  domainCategoryMap?: Record<string, string[]>;
}): DiscoverySerpPlan {
  const allowlist = [...new Set(input.allowlistDomains)];
  const requirementPlans: RequirementSerpPlan[] = input.requirements.map((req) => {
    const query = req.queryPlan[0] ?? req.itemSpec;
    const category = itemSpecToCategory(query);
    const eligibleDomains =
      input.domainCategoryMap && Object.keys(input.domainCategoryMap).length > 0
        ? resolveDomainsForItem(category, allowlist, input.domainCategoryMap).slice(
            0,
            DISCOVERY_FAST_DOMAINS_PER_ITEM
          )
        : allowlist.slice(0, DISCOVERY_FAST_DOMAINS_PER_ITEM);
    const { perItem } = planQueriesForItems([query], allowlist, input.domainCategoryMap);
    return {
      requirementKey: req.requirementKey,
      displayLabel: req.displayLabel ?? req.itemSpec,
      queryLevels: req.queryPlan.slice(0, MAX_DISCOVERY_QUERY_LEVELS),
      taxonomyCategory: category,
      eligibleDomains,
      logicalQueriesPerPass: perItem[query] ?? 0,
    };
  });

  const pass1Queries = input.requirements.map((r) => r.queryPlan[0] ?? r.itemSpec);
  const pass2Queries = input.requirements.map((r) => r.queryPlan[1] ?? r.queryPlan[0] ?? r.itemSpec);
  const pass3Queries = input.requirements.map((r) => r.queryPlan[2] ?? r.queryPlan[1] ?? r.itemSpec);

  const pass1 = planQueriesForItems(pass1Queries, allowlist, input.domainCategoryMap);
  const pass2 = planQueriesForItems(pass2Queries, allowlist, input.domainCategoryMap);
  const pass3 = planQueriesForItems(pass3Queries, allowlist, input.domainCategoryMap);

  const theoretical =
    pass1.total + pass2.total + pass3.total;

  const legacyPerPass = input.requirements.length * 4 * 3;
  const legacyTotal = legacyPerPass * MAX_DISCOVERY_QUERY_LEVELS;

  return {
    requirementCount: input.requirements.length,
    domainsPerItem: DISCOVERY_FAST_DOMAINS_PER_ITEM,
    variantsPerDomain: DISCOVERY_FAST_VARIANTS_PER_DOMAIN,
    fastMode: true,
    requirements: requirementPlans,
    pass1: {
      logicalQueries: pass1.total,
      maxProviderRequests: Math.min(PER_DISCOVERY_SERP_BUDGET, pass1.total),
    },
    pass2: {
      logicalQueries: pass2.total,
      maxProviderRequests: Math.min(PER_DISCOVERY_SERP_BUDGET, pass2.total),
    },
    pass3: {
      logicalQueries: pass3.total,
      maxProviderRequests: Math.min(PER_DISCOVERY_SERP_BUDGET, pass3.total),
    },
    theoreticalLogicalQueriesAllPasses: theoretical,
    globalProviderBudget: PER_DISCOVERY_SERP_BUDGET,
    deadlineMs: DISCOVERY_DEADLINE_MS,
    legacyUnboundedEstimate: {
      domainsPerItem: 4,
      variantsPerDomain: 3,
      passes: MAX_DISCOVERY_QUERY_LEVELS,
      perPassLogical: legacyPerPass,
      totalLogical: legacyTotal,
      note:
        "Pre-P1.6.6.1 non-fastMode could plan up to items×4 domains×3 variants per pass; effectiveMaxRequests was also raised above caller maxRequests.",
    },
  };
}

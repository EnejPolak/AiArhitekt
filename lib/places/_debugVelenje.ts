/**
 * One-shot Velenje Places D debug. Do not import this from production.
 */
import { readFileSync } from "node:fs";
import { searchPlaces, PlacesError } from "./placesService";
import { buildStoreDiscoveryPlan } from "./retailTaxonomy";

function loadEnvFile(path: string) {
  try {
    const text = readFileSync(path, "utf8");
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    /* missing file is fine */
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const VELENJE = { lat: 46.3592, lng: 15.1103, radiusKm: 50 };
const REQUIREMENTS = [
  "office chair",
  "computer desk",
  "marble flooring",
  "interior wall paint metallic black",
  "interior wall paint olive green",
];

async function main() {
  if (!process.env.GOOGLE_MAPS_API_KEY) {
    console.log(JSON.stringify({ error: "GOOGLE_MAPS_API_KEY missing" }, null, 2));
    process.exitCode = 1;
    return;
  }

  const storePlan = buildStoreDiscoveryPlan(REQUIREMENTS);

  try {
    const result = await searchPlaces({
      lat: VELENJE.lat,
      lng: VELENJE.lng,
      radiusKm: VELENJE.radiusKm,
      includeContractors: false,
      storePlan,
      debug: true,
    });

    const report = {
      location: VELENJE,
      resolvedShoppingRequirements: REQUIREMENTS,
      retailCategoriesDerived: storePlan.categories,
      requirementCategories: storePlan.requirementCategories,
      placesQueriesPlanned: {
        keywords: storePlan.queries.filter((q) => q.kind === "keyword"),
        types: storePlan.queries.filter((q) => q.kind === "type"),
        plannedQueries: result.meta.plannedQueries,
        plannedTypes: result.meta.plannedTypes,
      },
      outcome: result.outcome,
      requestsMade: result.meta.requestsMade,
      cacheHits: result.meta.cacheHits,
      googlePlacesRequests: (result.debug?.googlePlacesRequests ?? []).map((row) => ({
        kind: row.kind,
        query: row.query,
        httpStatus: row.httpStatus,
        providerStatus: row.providerStatus,
        resultCount: row.resultCount,
        cacheHit: row.cacheHit,
      })),
      candidatesFoundAfterRadius: result.meta.candidatesFound,
      discardedOutOfRadius: result.meta.discardedOutOfRadius,
      detailsFetched: result.meta.detailsFetched,
      pipeline: (result.debug?.pipeline ?? []).map((row) => ({
        name: row.name,
        place_id: row.place_id,
        googleTypes: row.googleTypes,
        sourceRetailCategories: row.sourceRetailCategories,
        sourceKeywords: row.sourceKeywords,
        websiteDomain: row.websiteDomain,
        classifyPlaceBucket: row.classifyPlaceBucket,
        storeScore: row.storeScore,
        officialDomain: row.officialDomain,
        catalogPath: row.catalogPath,
        catalogSignal: row.catalogSignal,
        rejectionReason: row.rejectionReason,
        acceptedStoreDomain: row.acceptedStoreDomain,
      })),
      storesDropped: result.debug?.storesDropped ?? [],
      finalStores: result.stores.map((s) => ({
        name: s.name,
        types: s.types,
        websiteDomain: s.websiteDomain,
        matchedRetailCategories: s.matchedRetailCategories,
        distanceKm: s.distanceKm,
      })),
      finalAllowlistDomainsStores: result.allowlistDomainsStores,
    };
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    const err = error instanceof PlacesError ? error : null;
    console.log(
      JSON.stringify(
        {
          location: VELENJE,
          resolvedShoppingRequirements: REQUIREMENTS,
          retailCategoriesDerived: storePlan.categories,
          thrown: true,
          code: err?.code ?? "UNKNOWN",
          httpStatus: err?.httpStatus ?? null,
          providerStatus: err?.providerStatus ?? null,
          message: err?.message ?? (error instanceof Error ? error.message : "error"),
        },
        null,
        2
      )
    );
    process.exitCode = err?.code === "PLACES_QUOTA_EXCEEDED" ? 0 : 1;
  }
}

void main();

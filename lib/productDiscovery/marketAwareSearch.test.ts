import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ACCEPTANCE_PRIMARY_MIN_COVERAGE, ACCEPTANCE_PRIMARY_MIN_SCORE } from "./constants";
import { LOCAL_MARKET_SEARCH_INSTRUCTION } from "./marketContext";
import { buildRequirementPolicyHints, buildSuggestedSearchQueriesForRequest } from "./matchPolicy";
import { buildProductDiscoveryUserMessage } from "./prompt";
import { buildTargetedResearchUserMessage } from "./targetedResearchPrompt";
import { resolveShoppingRequirements } from "@/lib/discovery/resolveRequirements";

const LIVE_PHASE_2E_NOTES = [
  "Keep my current sofa. Keep my current chair. Keep my current desk. Keep my current bed. Keep my current wardrobe.",
  "Need only these three products:",
  "1. black floor lamp, metal, max 150 EUR",
  "2. light-colored ceramic decorative vase, around 30 cm, max 60 EUR",
  "3. neutral living-room rug, approximately 160x230 cm, max 250 EUR",
].join(" ");

const emptyAnalysis = {
  furnitureNeeds: [] as const,
  materialNeeds: [] as const,
  constraints: [] as const,
  preserve: [] as const,
  replaceOrRemove: [] as const,
};

function parseMessage(requestedItem: string, market: {
  countryCode: string;
  formattedLocation: string;
  merchantDomains: string[];
}) {
  return JSON.parse(
    buildProductDiscoveryUserMessage({
      requestedItem,
      allowedDomains: market.merchantDomains,
      requirementPolicy: buildRequirementPolicyHints(requestedItem),
      suggestedSearchQueries: buildSuggestedSearchQueriesForRequest(
        requestedItem,
        market.merchantDomains
      ),
      marketContext: market,
    })
  ) as {
    requestedItem: string;
    allowedDomains: string[];
    marketContext: {
      countryCode: string | null;
      formattedLocation: string | null;
      merchantDomains: string[];
    };
    localMarketSearchInstruction: string;
    searchGuidance: Record<string, unknown>;
    requirementPolicy: Record<string, unknown>;
    suggestedSearchQueries: Array<{ query: string }>;
  };
}

describe("market-aware Step C request construction", () => {
  it("passes SI project location and Places domains into the search request", () => {
    const message = parseMessage("black floor lamp, metal, max 150 EUR", {
      countryCode: "SI",
      formattedLocation: "Ljubljana, Slovenia",
      merchantDomains: ["localhome.si", "domtrgovina.si"],
    });
    expect(message.marketContext.countryCode).toBe("SI");
    expect(message.marketContext.formattedLocation).toMatch(/Ljubljana/i);
    expect(message.marketContext.formattedLocation).toMatch(/Slovenia/i);
    expect(message.marketContext.merchantDomains).toEqual(["localhome.si", "domtrgovina.si"]);
    expect(message.allowedDomains).toEqual(["localhome.si", "domtrgovina.si"]);
    expect(message.localMarketSearchInstruction).toBe(LOCAL_MARKET_SEARCH_INSTRUCTION);
    expect(message.searchGuidance.useLocalMarketRetailerTerminology).toBe(true);
    expect(message.searchGuidance.preferTargetMarketLanguage).toBe(true);
    expect(message.searchGuidance.localizationIsSearchOnly).toBe(true);
    expect(message.searchGuidance.marketContextFromProjectLocation).toBe(true);
    expect(message.requestedItem).toBe("black floor lamp, metal, max 150 EUR");
  });

  it("passes DE market context without changing the semantic requirement", () => {
    const requestedItem = "black floor lamp, metal, max 150 EUR";
    const message = parseMessage(requestedItem, {
      countryCode: "DE",
      formattedLocation: "Berlin, Germany",
      merchantDomains: ["moebel-local.de"],
    });
    expect(message.marketContext.countryCode).toBe("DE");
    expect(message.marketContext.formattedLocation).toMatch(/Berlin/i);
    expect(message.marketContext.merchantDomains).toEqual(["moebel-local.de"]);
    expect(message.requestedItem).toBe(requestedItem);
    expect(message.searchGuidance.preferTargetMarketLanguage).toBe(true);
  });

  it("passes ES market context without changing the semantic requirement", () => {
    const requestedItem = "neutral living-room rug, approximately 160x230 cm, max 250 EUR";
    const message = parseMessage(requestedItem, {
      countryCode: "ES",
      formattedLocation: "Madrid, Spain",
      merchantDomains: ["hogar-local.es"],
    });
    expect(message.marketContext.countryCode).toBe("ES");
    expect(message.marketContext.formattedLocation).toMatch(/Madrid/i);
    expect(message.marketContext.merchantDomains).toEqual(["hogar-local.es"]);
    expect(message.requestedItem).toBe(requestedItem);
  });

  it("keeps acceptance policy and thresholds on the original semantic requirement", () => {
    const requestedItem = "black floor lamp, metal, max 150 EUR";
    const message = parseMessage(requestedItem, {
      countryCode: "SI",
      formattedLocation: "Ljubljana, Slovenia",
      merchantDomains: ["localhome.si"],
    });
    expect(message.requirementPolicy).toEqual(buildRequirementPolicyHints(requestedItem));
    expect(ACCEPTANCE_PRIMARY_MIN_SCORE).toBe(0.7);
    expect(ACCEPTANCE_PRIMARY_MIN_COVERAGE).toBe(0.6);
    expect(message.searchGuidance.originalRequestedItemIsAuthoritativeForAcceptance).toBe(true);
    expect(message.searchGuidance.doNotRelaxHardConstraintsDuringValidation).toBe(true);
  });

  it("does not mutate a floor lamp into a ceiling or pendant search requirement", () => {
    const message = parseMessage("black floor lamp, metal, max 150 EUR", {
      countryCode: "SI",
      formattedLocation: "Ljubljana, Slovenia",
      merchantDomains: ["localhome.si"],
    });
    expect(message.requestedItem).toMatch(/floor lamp/i);
    expect(message.requestedItem).not.toMatch(/ceiling|stropn|pendant|viseč/i);
    const suggested = message.suggestedSearchQueries.map((row) => row.query).join(" ");
    expect(suggested).not.toMatch(/stropna svetilka|viseča svetilka|pendant lamp|ceiling/i);
    expect(suggested).toMatch(/floor lamp/i);
  });

  it("does not introduce a country-to-product translation dictionary", () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const sources = ["marketContext.ts", "prompt.ts", "targetedResearchPrompt.ts"]
      .map((name) => readFileSync(join(dir, name), "utf8"))
      .join("\n");
    expect(sources).not.toMatch(/SI\s*:\s*\{[^}]*(talna|vaza|preproga)/);
    expect(sources).not.toMatch(/DE\s*:\s*\{[^}]*(Stehlampe|Vase|Teppich)/);
    expect(sources).not.toMatch(/ES\s*:\s*\{[^}]*(lampara|jarron|alfombra)/i);
    expect(sources).not.toMatch(/countryCode\s*===\s*["']SI["']/);
    expect(LOCAL_MARKET_SEARCH_INSTRUCTION).not.toMatch(/črna talna svetilka|Stehlampe|lámpara de pie/i);
  });

  it("does not add a separate translation model call in the request payload", () => {
    const message = parseMessage("black floor lamp, metal, max 150 EUR", {
      countryCode: "SI",
      formattedLocation: "Ljubljana, Slovenia",
      merchantDomains: ["localhome.si"],
    });
    expect(message).not.toHaveProperty("translationTask");
    expect(JSON.stringify(message)).not.toMatch(/translate_requirement|translationModel|separateTranslation/i);
    expect(message.searchGuidance.queryExpansionMustStayBounded).toBe(true);
  });
});

describe("Phase 2E live fixture + SI market context", () => {
  it("preserves all three semantic requirements and attaches Ljubljana market context", () => {
    const { searched, notSearched } = resolveShoppingRequirements({
      analysisRequirements: emptyAnalysis,
      preferences: { notes: LIVE_PHASE_2E_NOTES, flooring: "keep" },
    });
    expect(searched).toHaveLength(3);
    expect(notSearched).toHaveLength(0);

    const market = {
      countryCode: "SI" as const,
      formattedLocation: "Ljubljana, Slovenia",
      merchantDomains: ["localhome.si"],
    };

    const payloads = searched.map((requirement) => {
      const requestedItem = requirement.queryPlan[0] || requirement.itemSpec;
      return parseMessage(requestedItem, market);
    });

    expect(payloads).toHaveLength(3);
    const joined = payloads.map((row) => row.requestedItem).join(" | ");
    expect(joined).toMatch(/floor lamp/i);
    expect(joined).toMatch(/vase/i);
    expect(joined).toMatch(/rug/i);
    expect(joined).not.toMatch(/ceiling|stropn|pendant/i);

    for (const payload of payloads) {
      expect(payload.requestedItem).toBe(payload.requestedItem.trim());
      expect(payload.marketContext.countryCode).toBe("SI");
      expect(payload.marketContext.formattedLocation).toBe("Ljubljana, Slovenia");
      expect(payload.marketContext.merchantDomains).toEqual(["localhome.si"]);
      expect(payload.localMarketSearchInstruction).toContain("SEARCH-ONLY");
      expect(payload.searchGuidance.localizationIsSearchOnly).toBe(true);
    }

    const floor = payloads.find((row) => /floor lamp/i.test(row.requestedItem));
    const vase = payloads.find((row) => /vase/i.test(row.requestedItem));
    const rug = payloads.find((row) => /rug/i.test(row.requestedItem));
    expect(floor?.requestedItem).toMatch(/black/i);
    expect(floor?.requestedItem).toMatch(/metal/i);
    expect(floor?.requestedItem).toMatch(/150/);
    expect(vase?.requestedItem).toMatch(/ceramic/i);
    expect(vase?.requestedItem).toMatch(/30/);
    expect(vase?.requestedItem).toMatch(/60/);
    expect(rug?.requestedItem).toMatch(/160/);
    expect(rug?.requestedItem).toMatch(/230/);
    expect(rug?.requestedItem).toMatch(/250/);
  });

  it("targeted follow-up also receives market context without a translation dictionary", () => {
    const message = JSON.parse(
      buildTargetedResearchUserMessage({
        requestedItem: "black floor lamp, metal, max 150 EUR",
        allowedDomains: ["localhome.si"],
        marketContext: {
          countryCode: "SI",
          formattedLocation: "Ljubljana, Slovenia",
          merchantDomains: ["localhome.si"],
        },
      })
    );
    expect(message.marketContext.countryCode).toBe("SI");
    expect(message.requestedItem).toBe("black floor lamp, metal, max 150 EUR");
    expect(message.guidance.localeTerminology).not.toMatch(/viseča svetilka|pomivalno korito/);
    expect(message.localMarketSearchInstruction).toBe(LOCAL_MARKET_SEARCH_INSTRUCTION);
  });
});

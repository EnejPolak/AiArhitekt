import { describe, expect, it, afterEach } from "vitest";
import type { Response } from "openai/resources/responses/responses";
import {
  PRODUCT_DISCOVERY_SYSTEM_PROMPT,
  PRODUCT_DISCOVERY_SYSTEM_PROMPT_CONTROL,
  buildProductDiscoveryUserMessage,
  getProductDiscoverySystemPrompt,
} from "./prompt";
import { extractPrimarySearchDiagnostics } from "./sources";

describe("primary discovery prompt", () => {
  const previous = process.env.PRODUCT_DISCOVERY_PRIMARY_PROMPT_VARIANT;

  afterEach(() => {
    if (previous === undefined) delete process.env.PRODUCT_DISCOVERY_PRIMARY_PROMPT_VARIANT;
    else process.env.PRODUCT_DISCOVERY_PRIMARY_PROMPT_VARIANT = previous;
  });

  it("defaults to frozen control prompt", () => {
    delete process.env.PRODUCT_DISCOVERY_PRIMARY_PROMPT_VARIANT;
    expect(getProductDiscoverySystemPrompt()).toBe(PRODUCT_DISCOVERY_SYSTEM_PROMPT_CONTROL);
    expect(PRODUCT_DISCOVERY_SYSTEM_PROMPT_CONTROL).not.toContain(
      "SEARCH BROAD ENOUGH TO DISCOVER CANDIDATES"
    );
  });

  it("can select diversified candidate prompt via env", () => {
    process.env.PRODUCT_DISCOVERY_PRIMARY_PROMPT_VARIANT = "candidate";
    expect(getProductDiscoverySystemPrompt()).toBe(PRODUCT_DISCOVERY_SYSTEM_PROMPT);
    expect(PRODUCT_DISCOVERY_SYSTEM_PROMPT).toContain("SEARCH BROAD ENOUGH TO DISCOVER CANDIDATES");
    expect(PRODUCT_DISCOVERY_SYSTEM_PROMPT).toContain("viseča svetilka");
    expect(PRODUCT_DISCOVERY_SYSTEM_PROMPT_CONTROL).toContain(
      "return candidates from at least two merchant domains"
    );
    expect(PRODUCT_DISCOVERY_SYSTEM_PROMPT).toContain(
      "return candidates from at least two merchant domains"
    );
  });

  it("user message includes search-broad-validate-strict guidance", () => {
    const message = JSON.parse(
      buildProductDiscoveryUserMessage({
        requestedItem: "black metal pendant lamp approx 40cm max 120 EUR",
        allowedDomains: ["obi.si"],
      })
    );
    expect(message.searchGuidance.searchBroadValidateStrict).toBe(true);
    expect(message.searchGuidance.useLocalizedMerchantTerminology).toBe(true);
    expect(message.searchGuidance.doNotRelaxHardConstraintsDuringValidation).toBe(true);
    expect(message.searchGuidance.localizationIsSearchOnly).toBe(true);
    expect(message.marketContext.merchantDomains).toEqual(["obi.si"]);
  });
});

describe("extractPrimarySearchDiagnostics", () => {
  it("extracts provider-visible search queries and domains", () => {
    const response = {
      output: [
        {
          type: "web_search_call",
          id: "ws_1",
          status: "completed",
          action: {
            type: "search",
            query: "viseča svetilka črna 40 cm",
            sources: [{ type: "url", url: "https://obi.si/p/lamp-1" }],
          },
        },
        {
          type: "web_search_call",
          id: "ws_2",
          status: "completed",
          action: {
            type: "search",
            query: "black pendant lamp 40cm",
            sources: [{ type: "url", url: "https://merkur.si/p/lamp-2" }],
          },
        },
        {
          type: "web_search_call",
          id: "ws_3",
          status: "completed",
          action: {
            type: "open_page",
            url: "https://obi.si/p/lamp-1",
          },
        },
      ],
    } as unknown as Response;

    const diagnostics = extractPrimarySearchDiagnostics(response);
    expect(diagnostics.webSearchCallCount).toBe(3);
    expect(diagnostics.searchQueries).toEqual([
      "viseča svetilka črna 40 cm",
      "black pendant lamp 40cm",
    ]);
    expect(diagnostics.sourceCount).toBeGreaterThanOrEqual(2);
    expect(diagnostics.distinctSourceDomains).toEqual(["merkur.si", "obi.si"]);
  });
});

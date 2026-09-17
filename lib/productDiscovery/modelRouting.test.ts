import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OpenAI from "openai";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  PRODUCT_DISCOVERY_LUNA_MODEL,
  PRODUCT_DISCOVERY_TERRA_MODEL,
  getProductDiscoveryModel,
  getProductDiscoveryModelRouting,
  isProductDiscoveryLunaPrimaryEnabled,
} from "./modelRouting";
import { searchProductItem } from "./searchItem";

const FLAG = "PRODUCT_DISCOVERY_LUNA_PRIMARY";

const rescueNone = {
  output: [],
  output_parsed: {
    status: "none",
    candidateId: null,
    productName: null,
    retailer: null,
    price: null,
    currency: null,
    priceUnit: null,
    matchedRequirements: [],
    unmetRequirements: [],
    unknownRequirements: [],
    matchScore: 0,
    whyItMatches: "",
  },
};

const targetedNotFound = {
  output: [{ type: "web_search_call", action: { sources: [] } }],
  output_parsed: {
    status: "not_found",
    product: null,
  },
};

describe("product discovery model routing", () => {
  const previousFlag = process.env[FLAG];

  beforeEach(() => {
    delete process.env[FLAG];
  });

  afterEach(() => {
    if (previousFlag === undefined) delete process.env[FLAG];
    else process.env[FLAG] = previousFlag;
  });

  it("CASE A: unset flag keeps Terra for primary and targeted", () => {
    delete process.env[FLAG];
    expect(isProductDiscoveryLunaPrimaryEnabled()).toBe(false);
    expect(getProductDiscoveryModel("primary")).toBe(PRODUCT_DISCOVERY_TERRA_MODEL);
    expect(getProductDiscoveryModel("targeted")).toBe(PRODUCT_DISCOVERY_TERRA_MODEL);
    const routing = getProductDiscoveryModelRouting();
    expect(routing.lunaPrimaryEnabled).toBe(false);
    expect(routing.primaryModel).toBe("gpt-5.6-terra");
    expect(routing.targetedModel).toBe("gpt-5.6-terra");
  });

  it("CASE B: PRODUCT_DISCOVERY_LUNA_PRIMARY=false keeps Terra", () => {
    process.env[FLAG] = "false";
    expect(isProductDiscoveryLunaPrimaryEnabled()).toBe(false);
    expect(getProductDiscoveryModel("primary")).toBe("gpt-5.6-terra");
    expect(getProductDiscoveryModel("targeted")).toBe("gpt-5.6-terra");
  });

  it("CASE C: PRODUCT_DISCOVERY_LUNA_PRIMARY=true uses Luna primary and Terra targeted", () => {
    process.env[FLAG] = "true";
    expect(isProductDiscoveryLunaPrimaryEnabled()).toBe(true);
    expect(getProductDiscoveryModel("primary")).toBe(PRODUCT_DISCOVERY_LUNA_MODEL);
    expect(getProductDiscoveryModel("targeted")).toBe(PRODUCT_DISCOVERY_TERRA_MODEL);
    expect(getProductDiscoveryModel("targeted")).not.toBe(getProductDiscoveryModel("primary"));
  });

  it("forces Luna off in production even if the flag is true", () => {
    const previous = process.env.APP_DEPLOYMENT_ENV;
    process.env.APP_DEPLOYMENT_ENV = "production";
    process.env[FLAG] = "true";
    expect(isProductDiscoveryLunaPrimaryEnabled()).toBe(false);
    expect(getProductDiscoveryModel("primary")).toBe(PRODUCT_DISCOVERY_TERRA_MODEL);
    if (previous === undefined) delete process.env.APP_DEPLOYMENT_ENV;
    else process.env.APP_DEPLOYMENT_ENV = previous;
  });

  it("does not expose the flag as NEXT_PUBLIC", () => {
    const envExample = readFileSync(resolve(process.cwd(), "env.example"), "utf8");
    expect(envExample).not.toMatch(/NEXT_PUBLIC_PRODUCT_DISCOVERY_LUNA_PRIMARY/);
    expect(FLAG.startsWith("NEXT_PUBLIC_")).toBe(false);
  });

  it("CASE E: Luna primary success does not call targeted", async () => {
    process.env[FLAG] = "true";
    const mockParse = vi.fn(async () => ({
      output: [
        {
          type: "web_search_call",
          action: {
            sources: [
              {
                url: "https://obi.si/p/pendant",
                title: "Trio LED black pendant lamp 40cm €119.99",
              },
            ],
          },
        },
        {
          type: "message",
          content: [
            {
              type: "output_text",
              annotations: [
                {
                  type: "url_citation",
                  url: "https://obi.si/p/pendant",
                  title: "Trio LED black pendant lamp 40cm €119.99",
                },
              ],
            },
          ],
        },
      ],
      output_parsed: {
        status: "found",
        product: {
          name: "Trio LED pendant",
          retailer: "OBI",
          retailerDomain: "obi.si",
          productUrl: "https://obi.si/p/pendant",
          price: 119.99,
          currency: "EUR",
          priceUnit: null,
          imageUrl: null,
          specifications: [],
          matchScore: 0.9,
          matchedRequirements: ["black", "pendant lamp", "approx 40cm", "max 120 EUR"],
          unmetRequirements: [],
          unknownRequirements: ["metal"],
          whyItMatches: "Black pendant under budget.",
        },
      },
    }));

    const client = { responses: { parse: mockParse } } as unknown as OpenAI;
    const result = await searchProductItem({
      requestedItem: "black metal pendant lamp approx 40cm max 120 EUR",
      allowlistDomains: ["obi.si"],
      client,
    });

    expect(result.status).toBe("found");
    expect(mockParse).toHaveBeenCalledTimes(1);
    expect(mockParse.mock.calls[0]?.[0]?.model).toBe("gpt-5.6-luna");
    expect(result.diagnostics?.targetedResearchAttempted).toBe(false);
    expect(result.diagnostics?.targetedAttempted).toBe(false);
    expect(result.diagnostics?.targetedModel).toBeNull();
    expect(result.diagnostics?.primaryModel).toBe("gpt-5.6-luna");
    expect(result.diagnostics?.modelRouting).toEqual({
      lunaPrimaryEnabled: true,
      primaryModel: "gpt-5.6-luna",
      targetedModel: "gpt-5.6-terra",
    });
    expect(result.diagnostics?.usageByStage?.primary?.modelUsed).toBe("gpt-5.6-luna");
    expect(result.diagnostics?.usageByStage?.targeted).toBeNull();
  });

  it("CASE D: Luna primary failure uses Terra for targeted", async () => {
    process.env[FLAG] = "true";
    const mockParse = vi
      .fn()
      .mockResolvedValueOnce({
        output: [
          {
            type: "web_search_call",
            action: { sources: [{ url: "https://merkur.si/p/laminat" }] },
          },
        ],
        output_parsed: {
          status: "found",
          product: {
            name: "Laminat",
            retailer: "Merkur",
            retailerDomain: "merkur.si",
            productUrl: "https://merkur.si/p/laminat",
            price: 30,
            currency: "EUR",
            priceUnit: "m2",
            imageUrl: null,
            specifications: [],
            matchScore: 1,
            matchedRequirements: ["oak laminate"],
            unmetRequirements: ["max 25 EUR/m2"],
            unknownRequirements: [],
            whyItMatches: "Above budget.",
          },
        },
      })
      .mockResolvedValueOnce(rescueNone)
      .mockResolvedValueOnce(targetedNotFound);

    const client = { responses: { parse: mockParse } } as unknown as OpenAI;
    const result = await searchProductItem({
      requestedItem: "oak laminate max 25 EUR/m2",
      allowlistDomains: ["merkur.si"],
      client,
    });

    expect(result.status).toBe("not_found");
    expect(result.diagnostics?.targetedResearchAttempted).toBe(true);
    expect(result.diagnostics?.targetedAttempted).toBe(true);
    expect(mockParse).toHaveBeenCalledTimes(3);
    expect(mockParse.mock.calls[0]?.[0]?.model).toBe("gpt-5.6-luna");
    expect(mockParse.mock.calls[1]?.[0]?.model).toBe("gpt-5.6-terra");
    expect(mockParse.mock.calls[2]?.[0]?.model).toBe("gpt-5.6-terra");
    expect(result.diagnostics?.primaryModel).toBe("gpt-5.6-luna");
    expect(result.diagnostics?.targetedModel).toBe("gpt-5.6-terra");
    expect(result.diagnostics?.usageByStage?.primary?.modelUsed).toBe("gpt-5.6-luna");
    expect(result.diagnostics?.usageByStage?.targeted?.modelUsed).toBe("gpt-5.6-terra");
  });
});

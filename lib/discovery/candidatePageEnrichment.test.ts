import { describe, expect, it, vi } from "vitest";
import { evaluateCandidateRenderReadyWithFetch } from "./completeRoom";
import { enrichRankedCandidateFromProductPage } from "./candidatePageEnrichment";
import type { RankedProductCandidate } from "./style/types";
import { extractProductImageCandidates } from "@/lib/references/extractProductImages";
import { USABLE_PRODUCT_PNG } from "@/lib/references/imageFixtures";
import { extractModelProposedCandidates } from "@/lib/productDiscovery/stepCCandidates";
import { buildTargetedResearchUserMessage } from "@/lib/productDiscovery/targetedResearchPrompt";
import { recoveryExcludeProductUrls, resolveRequirementSlot, requirementRetrySearchHints } from "./completeRoom";

const publicLookup = async () => ({ address: "93.184.216.34", family: 4 });

function candidate(input: {
  url: string;
  title?: string;
  image?: string | null;
  domain?: string;
  hardValid?: boolean;
}): RankedProductCandidate {
  return {
    product: {
      productTitle: input.title ?? "Sofa",
      productSnippet: null,
      productUrl: input.url,
      productImageUrl: input.image ?? null,
      price: 199,
      currency: "EUR",
      retailerDomain: input.domain ?? "example-retailer.si",
      retailerName: "Example",
      hasReferenceImage: Boolean(input.image),
    },
    hardValid: input.hardValid ?? true,
    hardGateReasons: [],
    fidelity: null,
    serpScore: 80,
    serpConfidence: 1,
    styleFit: null,
    finalScore: 80,
  };
}

function htmlWithJsonLdImage(imageUrl: string): string {
  return `<html><script type="application/ld+json">{"@type":"Product","name":"Velpa sofa","image":"${imageUrl}"}</script></html>`;
}

function fetchHtmlThenImage(html: string, imagePath = "https://cdn.example-retailer.si/sofa.png") {
  return vi.fn(async (url: string) => {
    if (url === imagePath || url.includes(".png") || url.includes(".jpg")) {
      return new Response(USABLE_PRODUCT_PNG, {
        status: 200,
        headers: { "content-type": "image/png" },
      });
    }
    return new Response(html, { status: 200, headers: { "content-type": "text/html" } });
  });
}

describe("multi-candidate merchant page image acquisition", () => {
  it("A. valid product URL without Step C imageUrl still fetches the merchant page", async () => {
    const image = "https://cdn.example-retailer.si/sofa.png";
    const fetchFn = fetchHtmlThenImage(htmlWithJsonLdImage(image), image);
    const item = candidate({
      url: "https://www.example-retailer.si/p/sofa",
      image: null,
    });

    const verdict = await evaluateCandidateRenderReadyWithFetch(item, {
      fetch: fetchFn,
      lookup: publicLookup,
    });

    expect(fetchFn).toHaveBeenCalled();
    expect(fetchFn.mock.calls[0]?.[0]).toBe("https://www.example-retailer.si/p/sofa");
    expect(verdict.ready).toBe(true);
    expect(item.product.productImageUrl).toBe(image);
  });

  it("B. JSON-LD Product.image from the product page can become READY", async () => {
    const image = "https://cdn.example-retailer.si/sofa.png";
    const item = candidate({ url: "https://www.example-retailer.si/p/sofa", image: null });
    const verdict = await evaluateCandidateRenderReadyWithFetch(item, {
      fetch: fetchHtmlThenImage(htmlWithJsonLdImage(image), image),
      lookup: publicLookup,
    });
    expect(verdict.ready).toBe(true);
    expect(verdict.cachedBytesValid).toBe(true);
    expect((item.product as { imageEvidence?: Array<{ source: string; exactProductAssociation: boolean }> }).imageEvidence?.[0]?.source).toBe("json_ld_product");
  });

  it("C. candidate-pool path uses extractProductImageCandidates (same as winner/reference path)", async () => {
    const html = htmlWithJsonLdImage("https://cdn.example-retailer.si/sofa.png");
    const extracted = extractProductImageCandidates(html, "https://www.example-retailer.si/p/sofa");
    expect(extracted[0]?.source).toBe("jsonld");

    const item = candidate({ url: "https://www.example-retailer.si/p/sofa", image: null });
    await enrichRankedCandidateFromProductPage(item, {
      fetch: async () => new Response(html, { status: 200, headers: { "content-type": "text/html" } }),
      lookup: publicLookup,
    });
    expect(
      (item.product as { imageEvidence?: Array<{ source: string }> }).imageEvidence?.[0]?.source
    ).toBe("json_ld_product");
  });

  it("D. successful page parse with no usable product image is no_image", async () => {
    const item = candidate({ url: "https://www.example-retailer.si/p/sofa", image: null });
    const verdict = await evaluateCandidateRenderReadyWithFetch(item, {
      fetch: async () =>
        new Response("<html><body><p>No product photos</p></body></html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
      lookup: publicLookup,
    });
    expect(verdict.ready).toBe(false);
    expect(verdict.failureCode).toBe("no_image");
  });

  it("E. blocked page is merchant_blocked", async () => {
    const item = candidate({ url: "https://www.example-retailer.si/p/sofa", image: null });
    const verdict = await evaluateCandidateRenderReadyWithFetch(item, {
      fetch: async () => new Response("denied", { status: 403 }),
      lookup: publicLookup,
    });
    expect(verdict.ready).toBe(false);
    expect(verdict.failureCode).toBe("merchant_blocked");
  });

  it("F. extracted image that cannot be associated is association_unverified", async () => {
    const item = candidate({ url: "https://www.example-retailer.si/p/sofa", image: null });
    const html = htmlWithJsonLdImage("https://cdn.example-retailer.si/banner/hero.jpg");
    const verdict = await evaluateCandidateRenderReadyWithFetch(item, {
      fetch: async () => new Response(html, { status: 200, headers: { "content-type": "text/html" } }),
      lookup: publicLookup,
    });
    expect(verdict.ready).toBe(false);
    expect(verdict.failureCode).toBe("association_unverified");
  });

  it("G. recovery receives previously rejected canonical URLs before search", async () => {
    const rejectedUrl = "https://www.localhome.si/p/a";
    const recover = vi.fn(async ({ rejected }: { rejected: { productUrl: string }[] }) => {
      expect(recoveryExcludeProductUrls(rejected)).toContain(rejectedUrl);
      return [];
    });
    await resolveRequirementSlot({
      requirement: {
        requirementType: "furniture",
        requirementKey: "furniture:sofa:0",
        itemSpec: "sofa",
        queryPlan: ["sofa"],
        snapshot: { category: "sofa", quantity: 1, placementNotes: null, constraints: [] },
      },
      candidates: [candidate({ url: rejectedUrl, image: "https://cdn.localhome.si/a.png", domain: "localhome.si" })],
      evaluate: () => ({ ready: false, failureCode: "association_unverified" }),
      recover,
    });
    expect(recover).toHaveBeenCalledTimes(1);
    const message = JSON.parse(
      buildTargetedResearchUserMessage({
        requestedItem: "sofa",
        allowedDomains: ["localhome.si"],
        excludeProductUrls: recoveryExcludeProductUrls(recover.mock.calls[0]![0].rejected),
      })
    );
    expect(message.excludeProductUrls).toContain(rejectedUrl);

    const proposed = extractModelProposedCandidates({
      parsed: {
        status: "found",
        product: {
          name: "Old sofa",
          retailer: "Local Home",
          retailerDomain: "localhome.si",
          productUrl: rejectedUrl,
          price: 10,
          currency: "EUR",
          priceUnit: null,
          imageUrl: null,
          specifications: [],
          matchScore: 0.9,
          matchedRequirements: [],
          unmetRequirements: [],
          unknownRequirements: [],
          whyItMatches: "sofa",
        },
        candidates: [
          {
            name: "Fresh sofa",
            retailer: "Local Home",
            retailerDomain: "localhome.si",
            productUrl: "https://www.localhome.si/p/fresh",
            price: 20,
            currency: "EUR",
            priceUnit: null,
            imageUrl: null,
            specifications: [],
            matchScore: 0.8,
            matchedRequirements: [],
            unmetRequirements: [],
            unknownRequirements: [],
            whyItMatches: "sofa",
          },
        ],
      },
      requestedItem: "sofa",
      allowlistDomains: ["localhome.si"],
      excludeProductUrls: [rejectedUrl],
    });
    expect(proposed.map((item) => item.productUrl)).toEqual(["https://www.localhome.si/p/fresh"]);
  });

  it("production discovery/retry actions supply platform fetch for candidate enrichment", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(join(__dirname, "actions.ts"), "utf8");
    expect(src).toMatch(/discoverProjectProducts\([\s\S]*?fetch:\s*globalThis\.fetch/);
    expect(src).toMatch(/retryUnresolvedRequirement\([\s\S]*?fetch:\s*globalThis\.fetch/);
  });

  it("retry search hints exclude rejected URLs and pass blocked-domain status before search", async () => {
    const rejectedUrl = "https://www.blocked-shop.si/p/old-table";
    const rejected = [
      { productUrl: rejectedUrl, merchant: "blocked-shop.si", failureCode: "merchant_blocked" },
      {
        productUrl: "https://www.blocked-shop.si/p/old-table-2",
        merchant: "blocked-shop.si",
        failureCode: "merchant_blocked",
      },
    ];
    const hints = requirementRetrySearchHints(rejected);
    expect(hints.excludeProductUrls).toContain(rejectedUrl);
    expect(hints.referenceFetchBlockedDomains).toEqual(["blocked-shop.si"]);

    const { buildProductDiscoveryUserMessage } = await import("@/lib/productDiscovery/prompt");
    const message = JSON.parse(
      buildProductDiscoveryUserMessage({
        requestedItem: "coffee table",
        allowedDomains: ["blocked-shop.si", "localhome.si"],
        excludeProductUrls: hints.excludeProductUrls,
        referenceFetchBlockedDomains: hints.referenceFetchBlockedDomains,
      })
    );
    expect(message.excludeProductUrls).toContain(rejectedUrl);
    expect(message.merchantDomainStatus).toEqual([
      { domain: "blocked-shop.si", status: "reference_fetch_blocked" },
    ]);
  });
});

import { describe, expect, it, vi, beforeEach } from "vitest";
import { enrichDiscoveryWinners } from "./enrichWinners";
import type { ResolvedDiscoverySelection } from "./resolveProducts";
import {
  clearProductPageEnrichmentCache,
  parseProductPageEnrichment,
} from "@/lib/serp/productPageEnrichment";

const publicLookup = async () => ({ address: "93.184.216.34", family: 4 });

function selection(input: {
  key: string;
  title: string;
  url: string;
  price?: number | null;
  image?: string | null;
}): ResolvedDiscoverySelection {
  return {
    requirementType: "furniture",
    requirementKey: input.key,
    requirementSnapshot: {
      category: "desk",
      quantity: 1,
      placementNotes: null,
      constraints: [],
    },
    itemSpec: "computer desk",
    product: {
      productTitle: input.title,
      productSnippet: null,
      productUrl: input.url,
      productImageUrl: input.image ?? null,
      price: input.price ?? null,
      currency: input.price != null ? "EUR" : null,
      retailerDomain: "example-retailer.si",
      retailerName: "Example",
      hasReferenceImage: Boolean(input.image),
    },
  };
}

describe("winner-only enrichment", () => {
  beforeEach(() => {
    clearProductPageEnrichmentCache();
  });

  it("enriches only winners that are missing metadata", async () => {
    const fetchFn = vi.fn(async () =>
      new Response(
        `<html><script type="application/ld+json">{"@type":"Product","offers":{"price":"99.90"},"image":"https://cdn.example-retailer.si/product.jpg"}</script></html>`,
        { status: 200, headers: { "content-type": "text/html" } }
      )
    );

    const winnerA = selection({
      key: "desk:1",
      title: "Loser desk",
      url: "https://example-retailer.si/loser",
      price: null,
      image: null,
    });
    const winnerB = selection({
      key: "chair:1",
      title: "Winner chair",
      url: "https://example-retailer.si/winner",
      price: null,
      image: null,
    });

    const { selections, stats } = await enrichDiscoveryWinners([winnerA, winnerB], {
      allowlistDomains: ["example-retailer.si"],
      fetchOptions: { fetchFn, lookup: publicLookup },
    });

    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(stats.winnerEnrichmentAttempts).toBe(2);
    expect(selections[1]?.product.price).toBe(99.9);
    expect(selections[1]?.product.productImageUrl).toBe("https://cdn.example-retailer.si/product.jpg");
  });

  it("skips enrichment when SERP metadata is already complete", async () => {
    const fetchFn = vi.fn();
    const complete = selection({
      key: "desk:1",
      title: "Complete desk",
      url: "https://example-retailer.si/complete",
      price: 99.9,
      image: "https://cdn.example-retailer.si/existing.jpg",
    });

    const { stats } = await enrichDiscoveryWinners([complete], {
      allowlistDomains: ["example-retailer.si"],
      fetchOptions: { fetchFn, lookup: publicLookup },
    });

    expect(fetchFn).not.toHaveBeenCalled();
    expect(stats.winnerEnrichmentSkipped).toBe(1);
    expect(stats.winnerEnrichmentAttempts).toBe(0);
  });

  it("dedupes enrichment by canonical product URL", async () => {
    const fetchFn = vi.fn(async () =>
      new Response(`<meta property="og:image" content="https://cdn.example-retailer.si/shared.jpg" />`, {
        status: 200,
        headers: { "content-type": "text/html" },
      })
    );

    const url = "https://example-retailer.si/shared?ref=a";
    const first = selection({ key: "a:1", title: "A", url, price: null, image: null });
    const second = selection({
      key: "b:1",
      title: "B",
      url: "https://example-retailer.si/shared?ref=b",
      price: null,
      image: null,
    });

    const { stats } = await enrichDiscoveryWinners([first, second], {
      allowlistDomains: ["example-retailer.si"],
      fetchOptions: { fetchFn, lookup: publicLookup },
    });

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(stats.winnerEnrichmentAttempts).toBe(1);
  });

  it("preserves winner when enrichment fails", async () => {
    const fetchFn = vi.fn(async () => new Response("", { status: 403 }));
    const winner = selection({
      key: "desk:1",
      title: "Blocked desk",
      url: "https://example-retailer.si/blocked",
      price: null,
      image: null,
    });

    const { selections, stats } = await enrichDiscoveryWinners([winner], {
      allowlistDomains: ["example-retailer.si"],
      fetchOptions: { fetchFn, lookup: publicLookup },
    });

    expect(stats.winnerEnrichmentFailures).toBe(1);
    expect(selections[0]?.product.productTitle).toBe("Blocked desk");
    expect(selections[0]?.product.price).toBeNull();
  });

  it("skips enrichment when deadline is too low", async () => {
    const fetchFn = vi.fn();
    const winner = selection({
      key: "desk:1",
      title: "Late desk",
      url: "https://example-retailer.si/late",
      price: null,
      image: null,
    });

    const { stats } = await enrichDiscoveryWinners([winner], {
      allowlistDomains: ["example-retailer.si"],
      deadlineAt: Date.now() + 1_000,
      fetchOptions: { fetchFn, lookup: publicLookup },
    });

    expect(fetchFn).not.toHaveBeenCalled();
    expect(stats.winnerEnrichmentSkipped).toBe(1);
  });

  it("keeps SERP image and adds page price when only price is missing", async () => {
    const fetchFn = vi.fn(async () =>
      new Response(`<meta property="product:price:amount" content="99,90" />`, {
        status: 200,
        headers: { "content-type": "text/html" },
      })
    );
    const winner = selection({
      key: "desk:1",
      title: "Desk",
      url: "https://example-retailer.si/desk",
      price: null,
      image: "https://cdn.example-retailer.si/serp.jpg",
    });

    const { selections } = await enrichDiscoveryWinners([winner], {
      allowlistDomains: ["example-retailer.si"],
      fetchOptions: { fetchFn, lookup: publicLookup },
    });

    expect(selections[0]?.product.price).toBe(99.9);
    expect(selections[0]?.product.productImageUrl).toBe("https://cdn.example-retailer.si/serp.jpg");
  });
});

describe("product page parsing", () => {
  it("parses JSON-LD product price and image", () => {
    const html = `<script type="application/ld+json">{"@type":"Product","offers":{"price":"99.90"},"image":["https://cdn.example.com/product.jpg"]}</script>`;
    const parsed = parseProductPageEnrichment(html, "https://example-retailer.si/item");
    expect(parsed.price).toBe(99.9);
    expect(parsed.currency).toBe("EUR");
    expect(parsed.image).toBe("https://cdn.example.com/product.jpg");
    expect(parsed.priceSource).toBe("jsonld");
  });

  it("parses og:image when JSON-LD image is absent", () => {
    const html = `<meta property="og:image" content="https://cdn.example.com/desk.jpg" />`;
    const parsed = parseProductPageEnrichment(html, "https://example-retailer.si/item");
    expect(parsed.image).toBe("https://cdn.example.com/desk.jpg");
    expect(parsed.imageSource).toBe("og");
  });

  it("parses European price formats", () => {
    const html = `<div>99,90 €</div>`;
    const parsed = parseProductPageEnrichment(html, "https://example-retailer.si/item");
    expect(parsed.price).toBe(99.9);
  });

  it("does not parse dimensions as price", () => {
    const html = `<div>140/60/75 cm</div>`;
    const parsed = parseProductPageEnrichment(html, "https://example-retailer.si/item");
    expect(parsed.price).toBeNull();
  });
});

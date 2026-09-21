import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ProductSelectionView } from "@/lib/discovery/types";
import { mapCanonicalPickedToSelection } from "@/lib/discovery/mapProduct";
import { orderRenderReferences } from "@/lib/render/order";
import { loadRenderReadySelectedProductsFromState } from "@/lib/render/loadReady";
import { USABLE_PRODUCT_PNG } from "./imageFixtures";
import {
  associateProductImage,
  evidenceFromProductImageUrl,
  isRejectedGenericImageUrl,
} from "./imageEvidence";
import { runBoundedImageRescue } from "./rescueImage";
import { ensureProductReferenceAssets } from "./ensure";
import { isReusableReferenceAsset } from "./acquire";
import { ReferenceError as ProductReferenceError } from "./errors";

vi.mock("./queries", () => ({
  getProductReferenceAssetBySelection: vi.fn(),
}));

vi.mock("./acquire", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./acquire")>();
  return {
    ...actual,
    acquireProductReferenceAsset: vi.fn(),
  };
});

vi.mock("./extractProductImages", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./extractProductImages")>();
  return {
    ...actual,
    fetchProductPageHtml: vi.fn(),
    extractProductImageCandidates: vi.fn(),
  };
});

import { getProductReferenceAssetBySelection } from "./queries";
import { acquireProductReferenceAsset } from "./acquire";
import { fetchProductPageHtml, extractProductImageCandidates } from "./extractProductImages";
import type { ProductReferenceAssetView } from "./types";

const getAsset = vi.mocked(getProductReferenceAssetBySelection);
const acquire = vi.mocked(acquireProductReferenceAsset);
const fetchHtml = vi.mocked(fetchProductPageHtml);
const extractHtml = vi.mocked(extractProductImageCandidates);

const PROJECT = "11111111-1111-4111-8111-111111111111";
const SELECTION = "22222222-2222-4222-8222-222222222222";

function selection(overrides: Partial<ProductSelectionView> = {}): ProductSelectionView {
  return {
    id: SELECTION,
    projectId: PROJECT,
    discoveryId: "33333333-3333-4333-8333-333333333333",
    requirementType: "furniture",
    requirementKey: "furniture:vase:0",
    requirementSnapshot: { category: "vase" },
    itemSpec: "ceramic vase",
    productTitle: "ASA VAZA keramika",
    productUrl: "https://www.shop.example/p/asa-vaza",
    productImageUrl: null,
    price: 29.9,
    currency: "EUR",
    retailerDomain: "shop.example",
    retailerName: "Shop",
    hasReferenceImage: false,
    isConfirmed: false,
    referenceStatus: "pending",
    referenceFailureCode: null,
    referenceRescueAttempted: false,
    imageEvidence: [],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function asset(sourceImageUrl: string): ProductReferenceAssetView {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    projectId: PROJECT,
    selectionId: SELECTION,
    sourceImageUrl,
    sourcePageUrl: "https://www.shop.example/p/asa-vaza",
    isPrimary: true,
    sortOrder: 0,
    storageBucket: "project-assets",
    storagePath: `projects/${PROJECT}/product-references/${SELECTION}.png`,
    mimeType: "image/png",
    sizeBytes: USABLE_PRODUCT_PNG.byteLength,
    sourceHash: "a".repeat(64),
    width: 128,
    height: 128,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

function persistClient() {
  const updates: Array<Record<string, unknown>> = [];
  return {
    updates,
    client: {
      from: () => ({
        update: (row: Record<string, unknown>) => {
          updates.push(row);
          return {
            eq: () => ({
              eq: async () => ({ error: null }),
            }),
          };
        },
      }),
    },
  };
}

describe("product reference image acquisition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAsset.mockResolvedValue(null);
    fetchHtml.mockResolvedValue(null);
    extractHtml.mockReturnValue([]);
    acquire.mockReset();
  });

  it("accepted product preserves existing product_image_url", () => {
    const mapped = mapCanonicalPickedToSelection(
      {
        title: "ASA vase",
        url: "https://www.shop.example/p/asa-vaza",
        image: "https://cdn.shop.example/asa.png",
        price: 29.9,
        currency: "EUR",
        score: 90,
        confidence: 0.9,
        reasons: [],
        domain: "shop.example",
      },
      []
    );
    expect(mapped?.productImageUrl).toBe("https://cdn.shop.example/asa.png");
    expect(mapped?.imageEvidence?.some((item) => item.url === mapped.productImageUrl)).toBe(true);
  });

  it("JSON-LD image becomes a reference candidate", () => {
    const evidence = associateProductImage({
      url: "https://cdn.shop.example/asa.png",
      source: "json_ld_product",
      productUrl: "https://www.shop.example/p/asa-vaza",
      merchantDomain: "shop.example",
      sourcePageUrl: "https://www.shop.example/p/asa-vaza",
    });
    expect(evidence?.exactProductAssociation).toBe(true);
    expect(evidence?.source).toBe("json_ld_product");
  });

  it("og:image becomes a reference candidate", () => {
    const evidence = associateProductImage({
      url: "https://cdn.shop.example/asa-og.jpg",
      source: "open_graph",
      productUrl: "https://www.shop.example/p/asa-vaza",
      merchantDomain: "shop.example",
      sourcePageUrl: "https://www.shop.example/p/asa-vaza",
    });
    expect(evidence?.source).toBe("open_graph");
    expect(evidence?.exactProductAssociation).toBe(true);
  });

  it("image evidence survives selection persistence mapping", () => {
    const evidence = evidenceFromProductImageUrl({
      url: "https://cdn.shop.example/asa.png",
      productUrl: "https://www.shop.example/p/asa-vaza",
      merchantDomain: "shop.example",
    });
    const row = selection({
      productImageUrl: "https://cdn.shop.example/asa.png",
      hasReferenceImage: true,
      imageEvidence: evidence ? [evidence] : [],
    });
    expect(row.productImageUrl).toBe("https://cdn.shop.example/asa.png");
    expect(row.imageEvidence?.[0]?.url).toBe("https://cdn.shop.example/asa.png");
  });

  it("Lesnina-like: Cloudflare HTML blocked still succeeds when prior associated evidence exists", async () => {
    const saved = asset("https://cdn.shop.example/asa.png");
    acquire.mockResolvedValue(saved);
    fetchHtml.mockResolvedValue(null);
    const persist = persistClient();
    const result = await ensureProductReferenceAssets({
      persistClient: persist.client as never,
      ownerUserId: "user",
      projectId: PROJECT,
      selections: [
        selection({
          productImageUrl: "https://cdn.shop.example/asa.png",
          hasReferenceImage: true,
          imageEvidence: [
            associateProductImage({
              url: "https://cdn.shop.example/asa.png",
              source: "open_graph",
              productUrl: "https://www.shop.example/p/asa-vaza",
              merchantDomain: "shop.example",
              sourcePageUrl: "https://www.shop.example/p/asa-vaza",
            })!,
          ],
        }),
      ],
    });
    expect(fetchHtml).not.toHaveBeenCalled();
    expect(result.failedSelectionIds).toEqual([]);
    expect(result.assetsBySelectionId.get(SELECTION)?.id).toBe(saved.id);
    expect(persist.updates.some((row) => row.reference_status === "ready")).toBe(true);
  });

  it("Lesnina-like: Cloudflare HTML blocked with no saved image evidence stays unavailable", async () => {
    fetchHtml.mockResolvedValue(null);
    const persist = persistClient();
    const result = await ensureProductReferenceAssets({
      persistClient: persist.client as never,
      ownerUserId: "user",
      projectId: PROJECT,
      selections: [selection()],
    });
    expect(result.failedSelectionIds).toEqual([SELECTION]);
    expect(persist.updates.some((row) => row.reference_status === "unavailable")).toBe(true);
    expect(persist.updates.some((row) => row.reference_failure_code === "merchant_blocked")).toBe(
      true
    );
  });

  it("invalid image MIME is rejected", async () => {
    acquire.mockRejectedValue(new ProductReferenceError("invalid_image", "bad"));
    fetchHtml.mockResolvedValue(null);
    const persist = persistClient();
    const result = await ensureProductReferenceAssets({
      persistClient: persist.client as never,
      ownerUserId: "user",
      projectId: PROJECT,
      selections: [
        selection({
          productImageUrl: "https://cdn.shop.example/asa.png",
          imageEvidence: [
            associateProductImage({
              url: "https://cdn.shop.example/asa.png",
              source: "existing_product_image_url",
              productUrl: "https://www.shop.example/p/asa-vaza",
              merchantDomain: "shop.example",
            })!,
          ],
        }),
      ],
    });
    expect(result.failedSelectionIds).toEqual([SELECTION]);
    expect(persist.updates.some((row) => row.reference_failure_code === "invalid_image")).toBe(true);
  });

  it("banner/logo URLs are rejected", () => {
    expect(isRejectedGenericImageUrl("https://cdn.shop.example/logo.png")).toBe(true);
    expect(isRejectedGenericImageUrl("https://cdn.shop.example/banner/hero.jpg")).toBe(true);
    expect(isRejectedGenericImageUrl("https://www.shop.example/media/wysiwyg/storitve-flyout-image.jpg")).toBe(
      true
    );
    expect(
      associateProductImage({
        url: "https://cdn.shop.example/logo.png",
        source: "open_graph",
        productUrl: "https://www.shop.example/p/asa-vaza",
        merchantDomain: "shop.example",
      })
    ).toBeNull();
  });

  it("requires exact-product association", () => {
    expect(
      associateProductImage({
        url: "https://images.unsplash.com/generic-vase.jpg",
        source: "search_evidence",
        productUrl: "https://www.shop.example/p/asa-vaza",
        merchantDomain: "shop.example",
      })
    ).toBeNull();
  });

  it("rejects an image from the wrong product/retailer", () => {
    expect(
      associateProductImage({
        url: "https://cdn.other-merchant.si/sofa.jpg",
        source: "search_evidence",
        productUrl: "https://www.shop.example/p/asa-vaza",
        merchantDomain: "shop.example",
      })
    ).toBeNull();
  });

  it("runs rescue at most once", async () => {
    const rescueSearch = vi.fn(async () => ["https://cdn.shop.example/asa.png"]);
    acquire.mockResolvedValue(asset("https://cdn.shop.example/asa.png"));
    const persist = persistClient();
    const first = await ensureProductReferenceAssets({
      persistClient: persist.client as never,
      ownerUserId: "user",
      projectId: PROJECT,
      selections: [selection()],
      rescueSearch,
    });
    expect(rescueSearch).toHaveBeenCalledTimes(1);
    expect(first.rescueAttemptedCount).toBe(1);

    getAsset.mockResolvedValue(null);
    acquire.mockReset();
    rescueSearch.mockClear();
    const second = await ensureProductReferenceAssets({
      persistClient: persist.client as never,
      ownerUserId: "user",
      projectId: PROJECT,
      selections: [
        selection({
          referenceStatus: "unavailable",
          referenceRescueAttempted: true,
        }),
      ],
      rescueSearch,
    });
    expect(rescueSearch).not.toHaveBeenCalled();
    expect(second.rescueAttemptedCount).toBe(0);
    expect(acquire).not.toHaveBeenCalled();
  });

  it("rescue cannot replace the selected product", async () => {
    const persist = persistClient();
    const rescueSearch = vi.fn(async () => ["https://cdn.other-merchant.si/different-vase.jpg"]);
    const result = await ensureProductReferenceAssets({
      persistClient: persist.client as never,
      ownerUserId: "user",
      projectId: PROJECT,
      selections: [selection({ productTitle: "ASA VAZA keramika" })],
      rescueSearch,
    });
    expect(result.failedSelectionIds).toEqual([SELECTION]);
    expect(acquire).not.toHaveBeenCalled();
    expect(persist.updates.some((row) => row.reference_failure_code === "association_unverified")).toBe(
      true
    );
  });

  it("cache prevents rescue/fetch on refresh", async () => {
    const saved = asset("https://cdn.shop.example/asa.png");
    getAsset.mockResolvedValue(saved);
    const rescueSearch = vi.fn(async () => ["https://cdn.shop.example/asa.png"]);
    const persist = persistClient();
    const result = await ensureProductReferenceAssets({
      persistClient: persist.client as never,
      ownerUserId: "user",
      projectId: PROJECT,
      selections: [selection()],
      rescueSearch,
    });
    expect(isReusableReferenceAsset(saved, PROJECT, SELECTION)).toBe(true);
    expect(result.reusedCount).toBe(1);
    expect(rescueSearch).not.toHaveBeenCalled();
    expect(fetchHtml).not.toHaveBeenCalled();
    expect(acquire).not.toHaveBeenCalled();
  });

  it("FOUND status survives reference failure", async () => {
    const persist = persistClient();
    const found = selection();
    const result = await ensureProductReferenceAssets({
      persistClient: persist.client as never,
      ownerUserId: "user",
      projectId: PROJECT,
      selections: [found],
    });
    expect(result.failedSelectionIds).toEqual([found.id]);
    expect(found.productTitle).toBe("ASA VAZA keramika");
    expect(persist.updates.some((row) => row.reference_status === "unavailable")).toBe(true);
  });

  it("NOT_FOUND never triggers reference rescue", async () => {
    const rescueSearch = vi.fn(async () => ["https://cdn.shop.example/asa.png"]);
    const persist = persistClient();
    const result = await ensureProductReferenceAssets({
      persistClient: persist.client as never,
      ownerUserId: "user",
      projectId: PROJECT,
      selections: [],
      rescueSearch,
    });
    expect(rescueSearch).not.toHaveBeenCalled();
    expect(result.rescueAttemptedCount).toBe(0);
  });

  it("renderer only receives reference_status=ready assets", () => {
    const ready = selection({
      id: SELECTION,
      referenceStatus: "ready",
      productImageUrl: "https://cdn.shop.example/asa.png",
      hasReferenceImage: true,
    });
    const unavailable = selection({
      id: "55555555-5555-4555-8555-555555555555",
      referenceStatus: "unavailable",
      productTitle: "Still found vase",
    });
    const readyAsset = asset("https://cdn.shop.example/asa.png");
    const ordered = orderRenderReferences(
      [ready, unavailable],
      new Map([
        [ready.id, readyAsset],
        [unavailable.id, { ...readyAsset, selectionId: unavailable.id, id: "other" }],
      ])
    );
    expect(ordered.ordered.map((item) => item.selection.id)).toEqual([ready.id]);
    const loaded = loadRenderReadySelectedProductsFromState(
      [ready, unavailable],
      [readyAsset, { ...readyAsset, selectionId: unavailable.id, id: "other" }]
    );
    expect(loaded[0]?.grounding).toBe("reference-grounded");
    expect(loaded[1]?.grounding).toBe("reference-unavailable");
    expect(loaded[1]?.referenceAssets).toEqual([]);
  });
});

describe("bounded image rescue", () => {
  it("does not rerun when already attempted", async () => {
    const search = vi.fn(async () => ["https://cdn.shop.example/asa.png"]);
    const result = await runBoundedImageRescue(
      {
        productTitle: "ASA VAZA",
        merchantDomain: "shop.example",
        productUrl: "https://www.shop.example/p/asa-vaza",
        existingEvidence: [],
        rescueAlreadyAttempted: true,
      },
      search
    );
    expect(result.attempted).toBe(false);
    expect(search).not.toHaveBeenCalled();
  });
});

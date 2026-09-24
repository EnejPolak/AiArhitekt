import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  associateProductImage,
  imageConflictsProductIdentity,
  isRejectedGenericImageUrl,
  isUsableExactProductImageUrl,
  selectionHasUsableExactProductImage,
} from "@/lib/references/imageEvidence";
import { isSameDirectProductPage } from "@/lib/references/imageUrlGuards";
import { extractProductImageCandidates } from "@/lib/references/extractProductImages";
import { parseProductPageEnrichment } from "@/lib/serp/productPageEnrichment";
import { toProjectProductShoppingState } from "@/lib/discovery/shoppingState";
import { outdoorStorageConflictsIndoorRequirement } from "@/lib/discovery/requirementCategory";
import type { ProductDiscoveryView, ProductSelectionView } from "@/lib/discovery/types";
import {
  finalReportHeadline,
  resolveFinalReportProjectState,
  visualizationReadySelections,
} from "@/lib/render/finalReportState";

function selection(
  overrides: Partial<ProductSelectionView> & Pick<ProductSelectionView, "id" | "productTitle">
): ProductSelectionView {
  return {
    discoveryId: "d1",
    projectId: "p1",
    requirementType: "furniture",
    requirementKey: overrides.requirementKey ?? `furniture:${overrides.id}:0`,
    requirementSnapshot: {},
    itemSpec: overrides.itemSpec ?? "sofa",
    productSnippet: null,
    productUrl: overrides.productUrl ?? "https://shop.example/p/item",
    productImageUrl: overrides.productImageUrl ?? null,
    price: overrides.price ?? null,
    currency: overrides.currency ?? null,
    retailerDomain: overrides.retailerDomain ?? "shop.example",
    retailerName: "Shop",
    hasReferenceImage: Boolean(overrides.productImageUrl),
    referenceStatus: overrides.referenceStatus ?? "ready",
    isConfirmed: overrides.isConfirmed ?? true,
    imageEvidence: overrides.imageEvidence ?? [],
    createdAt: "2026-09-24T00:00:00.000Z",
    updatedAt: "2026-09-24T00:00:00.000Z",
    ...overrides,
  };
}

describe("first real demo data correction fixtures", () => {
  it("A: ceiling-light product with a sofa menu image is rejected, not READY", () => {
    const sofaMenu = "https://www.svetpohistva.si/i/menu/corner_sofas.jpg";
    const title = "Stropna svetilka Florida 24W LED - bela/črna";
    const spec = "ceiling light fixture";
    expect(isRejectedGenericImageUrl(sofaMenu)).toBe(true);
    expect(imageConflictsProductIdentity(sofaMenu, title, spec)).toBe(true);
    expect(
      associateProductImage({
        url: sofaMenu,
        source: "merchant_gallery",
        productUrl:
          "https://www.svetpohistva.si/trgovina/svetila/candellux/5610684-stropna-svetilka-florida-24w-led-bela-crna.html",
        merchantDomain: "svetpohistva.si",
        sourcePageUrl:
          "https://www.svetpohistva.si/trgovina/svetila/candellux/5610684-stropna-svetilka-florida-24w-led-bela-crna.html",
        productTitle: title,
        itemSpec: spec,
      })
    ).toBeNull();
    expect(
      selectionHasUsableExactProductImage(
        selection({
          id: "ceiling",
          productTitle: title,
          itemSpec: spec,
          productImageUrl: sofaMenu,
          referenceStatus: "ready",
        })
      )
    ).toBe(false);
  });

  it("B: curtain with only instruction/label image is not a usable visualization reference", () => {
    const legal =
      "https://www.obi.si/static/version1790083509/frontend/Obi/default/default/images/legal-guarantee-notice-sl.png";
    expect(isRejectedGenericImageUrl(legal)).toBe(true);
    expect(isUsableExactProductImageUrl(legal, "Zavesa Blackout Mia", "curtains")).toBe(false);
    const html = `<html><body><img src="${legal}" /><a href="/docs/instructions.pdf">PDF</a></body></html>`;
    const extracted = extractProductImageCandidates(html, "https://www.obi.si/p/zavesa");
    expect(extracted.every((item) => !item.url.includes("legal-guarantee-notice"))).toBe(true);
  });

  it("C: matching Product JSON-LD with actual product image is accepted", () => {
    const html = `
      <script type="application/ld+json">
      {"@type":"Product","name":"Klubska miza Snape","image":"https://cdn.shop.example/upload/catalog/snape.jpg","offers":{"@type":"Offer","price":"57","priceCurrency":"EUR"}}
      </script>
      <img src="https://cdn.shop.example/upload/catalog/snape.jpg" width="800" height="600" />
    `;
    const pageUrl = "https://www.shop.example/p/snape";
    const extracted = extractProductImageCandidates(html, pageUrl);
    expect(extracted.some((item) => item.source === "jsonld" && item.url.includes("snape.jpg"))).toBe(
      true
    );
    const evidence = associateProductImage({
      url: "https://cdn.shop.example/upload/catalog/snape.jpg",
      source: "json_ld_product",
      productUrl: pageUrl,
      merchantDomain: "shop.example",
      sourcePageUrl: pageUrl,
      productTitle: "Klubska miza Snape",
      itemSpec: "coffee table",
    });
    expect(evidence?.exactProductAssociation).toBe(true);
  });

  it("D: verified merchant price is recovered from JSON-LD / meta / itemprop", () => {
    const html = `
      <script type="application/ld+json">
      {"@type":"Product","name":"Preproga TRIOMPHE","offers":{"@type":"http://schema.org/Offer","price":199,"priceCurrency":"EUR"}}
      </script>
      <meta property="product:price:amount" content="199" />
      <meta itemprop="price" content="199" />
    `;
    const parsed = parseProductPageEnrichment(html, "https://www.harveynorman.si/preproga-triomphe");
    expect(parsed.price).toBe(199);
    expect(parsed.currency).toBe("EUR");
    expect(parsed.priceSource).toBe("jsonld");
  });

  it("E: price stays null when merchant exposes no verifiable current price", () => {
    const html = `<html><body><h1>Ceiling light</h1><p>Contact store for price</p></body></html>`;
    const parsed = parseProductPageEnrichment(html, "https://www.svetpohistva.si/p/florida");
    expect(parsed.price).toBeNull();
    expect(parsed.currency).toBeNull();
  });

  it("F: six found + two unresolved required blocks Generate / Final Report incomplete", () => {
    const discovery: ProductDiscoveryView = {
      id: "d1",
      projectId: "p1",
      sourceAnalysisId: "a1",
      sourceAnalysisUpdatedAt: "2026-09-24T00:00:00.000Z",
      locationInput: "Ljubljana",
      latitude: 46,
      longitude: 14,
      radiusKm: 50,
      searchedItemCount: 8,
      notSearchedCount: 1,
      allowlistDomains: ["harveynorman.si"],
      unmatchedRequirements: [
        {
          requirementKey: "furniture:floor-lamp:0",
          requirementType: "furniture",
          itemSpec: "premium floor lamp",
          displayLabel: "Floor lamp",
          reason: "search_interrupted",
        },
      ],
      sourcePreferences: {},
      sourcePreferencesHash: "a".repeat(64),
      createdAt: "2026-09-24T00:00:00.000Z",
      updatedAt: "2026-09-24T00:00:00.000Z",
    };
    const selections = [
      selection({
        id: "ceiling",
        productTitle: "Stropna svetilka Florida 24W LED - bela/črna",
        itemSpec: "ceiling light",
        requirementKey: "furniture:ceiling-light:0",
        productImageUrl: "https://www.svetpohistva.si/i/menu/corner_sofas.jpg",
      }),
      selection({
        id: "storage",
        productTitle: "Biohort Omara",
        itemSpec: "premium storage",
        requirementKey: "furniture:storage:0",
        productImageUrl:
          "https://www.obi.si/static/version/legal-guarantee-notice-sl.png",
      }),
      selection({
        id: "sofa",
        productTitle: "Kotna sedežna garnitura CUBINO S",
        itemSpec: "sofa",
        requirementKey: "furniture:sofa:0",
        productImageUrl: "https://cdn.harveynorman.si/cubino.jpg",
        price: 1521,
        currency: "EUR",
        imageEvidence: [
          associateProductImage({
            url: "https://cdn.harveynorman.si/cubino.jpg",
            source: "json_ld_product",
            productUrl: "https://www.harveynorman.si/cubino",
            merchantDomain: "harveynorman.si",
            sourcePageUrl: "https://www.harveynorman.si/cubino",
            productTitle: "Kotna sedežna garnitura CUBINO S",
            itemSpec: "sofa",
          })!,
        ],
        productUrl: "https://www.harveynorman.si/cubino",
        retailerDomain: "harveynorman.si",
      }),
    ];
    const shopping = toProjectProductShoppingState(discovery, selections);
    expect(shopping.missingRequirements.some((item) => /floor lamp/i.test(item.label))).toBe(true);
    expect(
      shopping.missingRequirements.some((item) => /Florida|Biohort|ceiling|storage|Omara/i.test(item.label))
    ).toBe(true);
    const state = resolveFinalReportProjectState({
      hasSucceededRender: false,
      processing: false,
      generationFailed: false,
      discovery,
      selections,
      unmatched: discovery.unmatchedRequirements,
      preferences: {
        selectedStyles: [],
        budgetLevel: "balanced",
        wallMainColor: "",
        wallAccentColor: "",
        flooring: "keep",
        underfloorHeating: false,
        bedType: "none",
        keepExistingWalls: true,
        wallFinishMode: "keep_existing",
        floorFinishMode: "keep_existing",
        notes: "",
      },
      requiredPlanItems: [
        { requirementKey: "furniture:sofa:0", displayLabel: "Sofa", concept: "sofa" },
        { requirementKey: "furniture:ceiling-light:0", displayLabel: "Ceiling light", concept: "ceiling light" },
        { requirementKey: "furniture:storage:0", displayLabel: "Storage", concept: "storage" },
        { requirementKey: "furniture:floor-lamp:0", displayLabel: "Floor lamp", concept: "floor lamp" },
      ],
    });
    expect(state).toBe("incomplete_requirements");
    expect(finalReportHeadline(state)).not.toMatch(/project is ready/i);
    expect(finalReportHeadline(state)).toMatch(/incomplete/i);
  });

  it("G: successful persisted render keeps Final Report on generated + existing image wording", () => {
    const state = resolveFinalReportProjectState({
      hasSucceededRender: true,
      processing: false,
      generationFailed: false,
      discovery: null,
      selections: [],
      unmatched: [],
      preferences: {
        selectedStyles: [],
        budgetLevel: null,
        wallMainColor: "",
        wallAccentColor: "",
        flooring: "keep",
        underfloorHeating: false,
        bedType: "none",
        keepExistingWalls: true,
        wallFinishMode: "keep_existing",
        floorFinishMode: "keep_existing",
        notes: "",
      },
    });
    expect(state).toBe("generated");
    expect(finalReportHeadline(state)).toBe("Your renovation project is ready.");
    const step10 = readFileSync(
      join(process.cwd(), "components/app/room-renovation/steps/Step10FinalReport.tsx"),
      "utf8"
    );
    expect(step10).toContain("loadRoomRenderState");
    expect(step10).toContain('alt="Selected design"');
    expect(step10).toContain("final-report-headline");
    expect(step10).not.toContain("Download Project Report");
  });

  it("category-page redirect is not accepted as a direct product page", () => {
    expect(
      isSameDirectProductPage(
        "https://www.svetpohistva.si/trgovina/svetila/candellux/5610684-stropna-svetilka-florida-24w-led-bela-crna.html",
        "https://www.svetpohistva.si/trgovina/svetila/"
      )
    ).toBe(false);
    expect(
      isSameDirectProductPage(
        "https://www.harveynorman.si/preproga-triomphe",
        "https://www.harveynorman.si/preproga-triomphe"
      )
    ).toBe(true);
  });

  it("persisted invalid references do not count as visualization READY", () => {
    const florida = selection({
      id: "ceiling",
      productTitle: "Stropna svetilka Florida 24W LED - bela/črna",
      itemSpec: "ceiling light",
      productImageUrl: "https://www.svetpohistva.si/i/menu/corner_sofas.jpg",
      referenceStatus: "ready",
    });
    const mia = selection({
      id: "curtain",
      productTitle: "Zavesa Blackout Mia",
      itemSpec: "curtains",
      productImageUrl: "https://www.obi.si/static/version/legal-guarantee-notice-sl.png",
      referenceStatus: "ready",
    });
    expect(visualizationReadySelections([florida, mia])).toEqual([]);
  });

  it("Biohort outdoor equipment cabinet does not satisfy indoor living-room storage", () => {
    expect(
      outdoorStorageConflictsIndoorRequirement({
        productTitle: "Biohort Omara za opremo Biohort vel. 150 temno siva",
        itemSpec: "premium storage",
        productUrl:
          "https://www.obi.si/p/biohort-omara-za-opremo-biohort-vel-150-temno-siva-s-x-g-155-cm-x-83-cm-110908",
        requirementKey: "furniture:storage:0",
      })
    ).toBe(true);
  });

  it("Final Report incomplete copy is used when no succeeded render exists", () => {
    expect(finalReportHeadline("incomplete_requirements")).not.toMatch(/project is ready/i);
    const step10 = readFileSync(
      join(process.cwd(), "components/app/room-renovation/steps/Step10FinalReport.tsx"),
      "utf8"
    );
    expect(step10).toMatch(/No visualization yet|Back to product review|Complete required/i);
  });
});

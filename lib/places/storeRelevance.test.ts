import { describe, expect, it } from "vitest";
import {
  classifyPlaceBucket,
  evaluateStoreDomainGate,
  placesOutcomeFromCounts,
} from "./storeRelevance";
import { PLACES_ERROR_CODES } from "./errors";

describe("classifyPlaceBucket generic store secondary check", () => {
  it("may become store when generic store has home-retail search signal and official catalog website", () => {
    expect(
      classifyPlaceBucket(["store", "point_of_interest"], "Home Living", "homeliving.si", {
        sourceKeywords: ["pohištvo"],
        categoriesMatched: ["furniture"],
        catalogSignal: true,
      })
    ).toBe("store");
  });

  it("rejects a generic store with an unrelated business", () => {
    expect(
      classifyPlaceBucket(["store", "point_of_interest"], "Petrol Station", "petrol.si", {
        sourceKeywords: ["pohištvo"],
        categoriesMatched: ["furniture"],
      })
    ).toBe(null);
    expect(
      classifyPlaceBucket(["store", "bakery"], "Fresh Bakery", "freshbakery.example", {
        categoriesMatched: ["furniture"],
      })
    ).toBe(null);
  });

  it("keeps furniture_store even when Google also tags restaurant/food", () => {
    expect(
      classifyPlaceBucket(
        ["furniture_store", "home_goods_store", "store", "restaurant", "food"],
        "Showroom Cafe",
        "showroom.example"
      )
    ).toBe("store");
  });

  it("does not classify a service business as a store", () => {
    expect(classifyPlaceBucket(["electrician"], "Janez Električar", "elektricar-janez.si")).toBe(
      "contractor"
    );
    expect(classifyPlaceBucket(["plumber"], "Vodovod servis")).toBe("contractor");
  });
});

describe("evaluateStoreDomainGate", () => {
  it("accepts a generic store found via furniture when the website is a valid retailer", () => {
    const gate = evaluateStoreDomainGate({
      name: "Home Living",
      types: ["store", "point_of_interest"],
      website: "https://www.homeliving.example/shop",
      websiteDomain: "homeliving.example",
      storeScore: 0.3,
      categoriesMatched: ["furniture"],
      catalogSignal: true,
    });
    expect(gate.accept).toBe(true);
    expect(gate.reason).toBeNull();
  });

  it("rejects a generic unrelated store even if found via a furniture query", () => {
    const gate = evaluateStoreDomainGate({
      name: "Fresh Bakery",
      types: ["store", "bakery"],
      website: "https://freshbakery.example",
      websiteDomain: "freshbakery.example",
      storeScore: 0.3,
      categoriesMatched: ["furniture"],
    });
    expect(gate.accept).toBe(false);
    expect(gate.reason).toBe("generic_store_unrelated");
  });

  it("accepts furniture_store official homepage with no /shop path when retail evidence is strong", () => {
    const gate = evaluateStoreDomainGate({
      name: "City Furniture",
      types: ["furniture_store", "point_of_interest"],
      website: "https://www.cityfurniture.example/",
      websiteDomain: "cityfurniture.example",
      storeScore: 0.7,
    });
    expect(gate.catalogPath).toBe(false);
    expect(gate.accept).toBe(true);
    expect(gate.reason).toBeNull();
  });

  it("rejects social or directory websites", () => {
    const facebook = evaluateStoreDomainGate({
      name: "City Furniture",
      types: ["furniture_store"],
      website: "https://www.facebook.com/cityfurniture",
      websiteDomain: "facebook.com",
      storeScore: 0.9,
    });
    expect(facebook.accept).toBe(false);
    expect(facebook.reason).toBe("social_or_directory_website");

    const directory = evaluateStoreDomainGate({
      name: "City Furniture",
      types: ["furniture_store"],
      website: "https://www.bizi.si/city-furniture",
      websiteDomain: "bizi.si",
      storeScore: 0.9,
    });
    expect(directory.accept).toBe(false);
    expect(directory.reason).toBe("social_or_directory_website");
  });

  it("does not require a catalog path for a strong retail homepage", () => {
    const gate = evaluateStoreDomainGate({
      name: "Local Hardware",
      types: ["hardware_store", "store"],
      website: "https://hardware.example",
      websiteDomain: "hardware.example",
      storeScore: 0.72,
    });
    expect(gate.catalogPath).toBe(false);
    expect(gate.accept).toBe(true);
  });
});

describe("placesOutcomeFromCounts", () => {
  it("diagnoses STORES_FOUND_BUT_FILTERED when candidates exist but none stay stores", () => {
    expect(
      placesOutcomeFromCounts({
        rawCandidates: 8,
        afterRadius: 8,
        storeBucketCount: 0,
        storesWithWebsite: 0,
        validStoreDomains: 0,
      })
    ).toBe(PLACES_ERROR_CODES.STORES_FOUND_BUT_FILTERED);
  });

  it("diagnoses NO_PLACES_CANDIDATES when Google returns nothing", () => {
    expect(
      placesOutcomeFromCounts({
        rawCandidates: 0,
        afterRadius: 0,
        storeBucketCount: 0,
        storesWithWebsite: 0,
        validStoreDomains: 0,
      })
    ).toBe(PLACES_ERROR_CODES.NO_PLACES_CANDIDATES);
  });
});

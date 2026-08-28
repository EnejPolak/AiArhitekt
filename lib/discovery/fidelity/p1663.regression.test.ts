import { describe, expect, it } from "vitest";
import { classifyCandidateProductKind } from "./productKind";
import {
  evaluateCandidateHardGate,
  scoreRequirementFidelity,
} from "./requirementFidelity";
import { candidateMatchesRequirement } from "../categoryGate";
import { resolveShoppingRequirements } from "../resolveRequirements";
import { withLocalizedQueryPlan } from "../locales";
import { debugRankDeskCandidates } from "../style/rankCandidates";
import {
  canonicalShoppingPreferences,
  loadStoredShoppingPreferenceSnapshot,
  shoppingPreferencesMatch,
  type ShoppingPreferenceInput,
} from "../preferences";
import { shoppingPreferenceFingerprint } from "../preferenceHash";
import { discoveryMatchesShoppingSource } from "../stale";
import type { ProductDiscoveryView } from "../types";
import { projectRoomPreferencesToShoppingPreferences } from "@/lib/project-preferences/adapter";
import { EMPTY_PROJECT_ROOM_PREFERENCES } from "@/lib/project-preferences/types";
import { parsePaintPreference } from "../paintParser";

const LIVE_CERSANIT = "Cersanit Stenska ploščica Exclusive Marble (60 x 120 cm, Bela)";
const LIVE_DULUX = "Dulux Lateks za stene črna mat 1 l";
const LIVE_GAMING_DESK = "Carryhome GAMING MIZA kovina, leseni material rdeča, črna";

function marbleRequirement() {
  const { searched } = resolveShoppingRequirements({
    analysisRequirements: {
      furnitureNeeds: [],
      materialNeeds: [],
      constraints: [],
      preserve: [],
      replaceOrRemove: [],
    },
    preferences: { flooring: "marble" },
  });
  return withLocalizedQueryPlan(searched.find((i) => i.provenance?.concept === "marble")!, "sl", "SI");
}

function gamingChairRequirement() {
  const { searched } = resolveShoppingRequirements({
    analysisRequirements: {
      furnitureNeeds: [],
      materialNeeds: [],
      constraints: [],
      preserve: [],
      replaceOrRemove: [],
    },
    preferences: { notes: "gaming chair", selectedStyles: ["luxury", "modern", "minimal"] },
  });
  return searched.find((i) => i.provenance?.concept === "gaming_chair")!;
}

function matteBlackPaintRequirement() {
  const { searched } = resolveShoppingRequirements({
    analysisRequirements: {
      furnitureNeeds: [],
      materialNeeds: [],
      constraints: [],
      preserve: [],
      replaceOrRemove: [],
    },
    preferences: { wallMainColor: "matte black" },
  });
  return searched.find((i) => i.provenance?.paintHue === "black")!;
}

const liveProjectPrefs = {
  ...EMPTY_PROJECT_ROOM_PREFERENCES,
  wallMainColor: "matte black",
  wallAccentColor: "olive green",
  flooring: "marble" as const,
  selectedStyles: ["luxury", "modern", "minimal"],
  notes: "gaming chair",
};

describe("P1.6.6.3 live regression fixtures", () => {
  it("A: wall-only Cersanit marble tile rejected for floor", () => {
    expect(classifyCandidateProductKind({ title: LIVE_CERSANIT })).toBe("wall_tile");
    const gate = evaluateCandidateHardGate(marbleRequirement(), { title: LIVE_CERSANIT });
    expect(gate.hardValid).toBe(false);
    expect(gate.hardGateReasons).toEqual(expect.arrayContaining(["wall-only-tile", "not_floor_covering"]));
    expect(gate.fidelity.productKind).toBe("wall_tile");
  });

  it("B: floor+wall tile accepted", () => {
    const title = "Talna in stenska ploščica Marble 60x120";
    expect(classifyCandidateProductKind({ title })).toBe("floor_and_wall_tile");
    expect(candidateMatchesRequirement(marbleRequirement(), title)).toBe(true);
  });

  it("C: bathroom cabinet rejected for gaming chair", () => {
    expect(
      candidateMatchesRequirement(gamingChairRequirement(), "SoBuy VISOKA KOPALNIŠKA OMARA bela")
    ).toBe(false);
  });

  it("D: coffee capsule box rejected for gaming chair", () => {
    expect(
      candidateMatchesRequirement(
        gamingChairRequirement(),
        "SoBuy ŠKATLA ZA KAPSULE ZA KAVO črna"
      )
    ).toBe(false);
  });

  it("E: actual gaming chair accepted", () => {
    expect(
      candidateMatchesRequirement(gamingChairRequirement(), "Novel GAMING STOL kovina, umetna masa, tekstil črna, bela")
    ).toBe(true);
    expect(
      candidateMatchesRequirement(gamingChairRequirement(), "Xora GAMING STOL ergonomski")
    ).toBe(true);
  });

  it("F: gaming desk still valid for desk requirement", () => {
    const { searched } = resolveShoppingRequirements({
      analysisRequirements: {
        furnitureNeeds: [{ category: "desk", quantity: 1, placementNotes: null, constraints: ["computer desk"] }],
        materialNeeds: [],
        constraints: [],
        preserve: [],
        replaceOrRemove: [],
      },
      preferences: { selectedStyles: ["luxury", "modern", "minimal"] },
    });
    const desk = searched.find((i) => i.provenance?.concept === "desk")!;
    expect(candidateMatchesRequirement(desk, LIVE_GAMING_DESK)).toBe(true);
  });

  it("G: mat does not match inside material", () => {
    const ranked = debugRankDeskCandidates(
      [{ title: LIVE_GAMING_DESK, score: 60 }],
      ["luxury", "modern", "minimal"]
    );
    expect(ranked[0]?.matched).not.toContain("mat");
  });

  it("H: standalone mat matches matte finish in paint fidelity", () => {
    const req = matteBlackPaintRequirement();
    const fidelity = scoreRequirementFidelity(req, { title: LIVE_DULUX });
    expect(fidelity.finishMatch).toBe("exact");
    expect(fidelity.hueMatch).toBe("exact");
    expect(fidelity.productKindMatch).toBe("exact");
  });

  it("I: Dulux exact black matte hard gate passes", () => {
    const gate = evaluateCandidateHardGate(matteBlackPaintRequirement(), { title: LIVE_DULUX });
    expect(gate.hardValid).toBe(true);
    expect(gate.fidelity.finishMatch).toBe("exact");
    expect(gate.fidelity.hueMatch).toBe("exact");
  });

  it("J: style array order does not change shopping hash", () => {
    const a = shoppingPreferenceFingerprint({
      ...projectRoomPreferencesToShoppingPreferences(liveProjectPrefs),
      selectedStyles: ["luxury", "modern", "minimal"],
    });
    const b = shoppingPreferenceFingerprint({
      ...projectRoomPreferencesToShoppingPreferences(liveProjectPrefs),
      selectedStyles: ["luxury", "minimal", "modern"],
    });
    expect(a.hash).toBe(b.hash);
    expect(a.snapshot.selectedStyles).toEqual(["luxury", "minimal", "modern"]);
  });

  it("rejects premium office chair for explicit gaming_chair", () => {
    expect(
      candidateMatchesRequirement(gamingChairRequirement(), "Premium pisarniški stol")
    ).toBe(false);
  });

  it("K: reloaded discovery snapshot matches room prefs immediately after success", () => {
    const shopping = projectRoomPreferencesToShoppingPreferences(liveProjectPrefs);
    const { snapshot, hash } = shoppingPreferenceFingerprint(shopping);
    const persistedJson = { ...snapshot, schemaVersion: 2 as const };
    const reloadedDiscoveryPrefs = loadStoredShoppingPreferenceSnapshot(persistedJson);
    const wronglyReloaded = canonicalShoppingPreferences(persistedJson as unknown as ShoppingPreferenceInput);

    expect(reloadedDiscoveryPrefs.noteShoppingIntents).toEqual(["gaming_chair"]);
    expect(wronglyReloaded.noteShoppingIntents).toEqual([]);
    expect(reloadedDiscoveryPrefs).not.toEqual(wronglyReloaded);
    expect(shoppingPreferencesMatch(reloadedDiscoveryPrefs, shopping)).toBe(true);

    const discovery: ProductDiscoveryView = {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      projectId: "22222222-2222-4222-8222-222222222222",
      sourceAnalysisId: "11111111-1111-4111-8111-111111111111",
      sourceAnalysisUpdatedAt: "2026-08-22T00:00:00.000Z",
      locationInput: "Velenje, Slovenia",
      latitude: 46.3592,
      longitude: 15.1103,
      radiusKm: 50,
      searchedItemCount: 5,
      notSearchedCount: 0,
      allowlistDomains: ["bauhaus.si"],
      unmatchedRequirements: [],
      sourcePreferences: reloadedDiscoveryPrefs,
      sourcePreferencesHash: hash,
      createdAt: "2026-08-22T00:00:00.000Z",
      updatedAt: "2026-08-22T00:00:00.000Z",
    };

    expect(
      discoveryMatchesShoppingSource(discovery, {
        locationInput: discovery.locationInput,
        preferences: shopping,
      })
    ).toBe(true);
  });

  it("L: prints identity diff for live-shaped fixture", () => {
    const stored = shoppingPreferenceFingerprint(projectRoomPreferencesToShoppingPreferences(liveProjectPrefs));
    const uiOrder = projectRoomPreferencesToShoppingPreferences({
      ...liveProjectPrefs,
      selectedStyles: ["luxury", "minimal", "modern"],
    });
    const current = shoppingPreferenceFingerprint(uiOrder);
    const accentParsed = parsePaintPreference(liveProjectPrefs.wallAccentColor);

    // eslint-disable-next-line no-console -- audit output requested by P1.6.6.3
    console.info("[p1663-identity-audit]", {
      storedDiscoveryHash: stored.hash,
      currentComputedHash: current.hash,
      hashesMatch: stored.hash === current.hash,
      storedCanonicalShoppingIdentity: stored.snapshot,
      currentCanonicalShoppingIdentity: current.snapshot,
      persistedAccentColor: liveProjectPrefs.wallAccentColor,
      parsedAccentHue: accentParsed?.hue,
      shoppingPreferencesMatch: shoppingPreferencesMatch(stored.snapshot, uiOrder),
    });

    expect(stored.hash).toBe(current.hash);
    expect(accentParsed?.hue).toBe("olive-green");
  });
});

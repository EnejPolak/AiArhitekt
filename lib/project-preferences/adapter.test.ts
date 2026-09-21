import { describe, expect, it } from "vitest";
import { canonicalShoppingPreferences } from "@/lib/discovery/preferences";
import { shoppingPreferenceFingerprint } from "@/lib/discovery/preferenceHash";
import { discoveryMatchesShoppingSource } from "@/lib/discovery/stale";
import type { ProductDiscoveryView } from "@/lib/discovery/types";
import {
  canonicalShoppingPreferencesFromProject,
  projectRoomPreferencesToRenderPreferences,
  projectRoomPreferencesToShoppingPreferences,
} from "./adapter";
import { EMPTY_PROJECT_ROOM_PREFERENCES } from "./types";

const persistedMarble = {
  ...EMPTY_PROJECT_ROOM_PREFERENCES,
  wallMainColor: "metallic black",
  wallAccentColor: "olive green",
  flooring: "marble" as const,
  selectedStyles: ["modern"],
  keepExistingWalls: false,
  wallFinishMode: "concept_color",
};

const remountDefaults = {
  ...EMPTY_PROJECT_ROOM_PREFERENCES,
  wallMainColor: "warm greige",
  wallAccentColor: "olive green",
  flooring: "keep" as const,
};

function discoveryFromPrefs(prefs: typeof persistedMarble): ProductDiscoveryView {
  const { snapshot, hash } = shoppingPreferenceFingerprint(
    projectRoomPreferencesToShoppingPreferences(prefs)
  );
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    projectId: "22222222-2222-4222-8222-222222222222",
    sourceAnalysisId: "11111111-1111-4111-8111-111111111111",
    sourceAnalysisUpdatedAt: "2026-08-18T00:00:00.000Z",
    locationInput: "Velenje, Slovenia",
    latitude: 46.3592,
    longitude: 15.1103,
    radiusKm: 50,
    searchedItemCount: 2,
    notSearchedCount: 0,
    allowlistDomains: ["localhome.si"],
    unmatchedRequirements: [],
    sourcePreferences: snapshot,
    sourcePreferencesHash: hash,
    createdAt: "2026-08-18T00:00:00.000Z",
    updatedAt: "2026-08-18T00:00:00.000Z",
  };
}

describe("project room preference adapter", () => {
  it("maps persisted marble/metallic black into the shopping snapshot", () => {
    const shopping = canonicalShoppingPreferencesFromProject(persistedMarble);
    expect(shopping).toMatchObject({
      wallMainColor: "metallic black",
      wallAccentColor: "olive green",
      flooring: "marble",
    });
  });

  it("does not put notes, budget, or location into the shopping identity", () => {
    const a = shoppingPreferenceFingerprint(
      projectRoomPreferencesToShoppingPreferences({
        ...persistedMarble,
        notes: "please make it cozy",
        budgetLevel: "premium",
        locationInput: "Celje",
        latitude: 46.2,
        longitude: 15.2,
        radiusKm: 25,
      })
    );
    const b = shoppingPreferenceFingerprint(projectRoomPreferencesToShoppingPreferences(persistedMarble));
    expect(a.hash).toBe(b.hash);
  });

  it("keeps notes and budget in the render subset", () => {
    const render = projectRoomPreferencesToRenderPreferences({
      ...persistedMarble,
      notes: "keep the window nook",
      budgetLevel: "premium",
    });
    expect(render.notes).toBe("keep the window nook");
    expect(render.budgetLevel).toBe("premium");
    expect(render.flooring).toBe("marble");
    expect(render.keepExistingWalls).toBe(false);
  });

  it("treats Metallic Black whitespace as the same shopping identity", () => {
    const a = shoppingPreferenceFingerprint(
      projectRoomPreferencesToShoppingPreferences({
        ...persistedMarble,
        wallMainColor: " Metallic Black ",
      })
    );
    const b = shoppingPreferenceFingerprint(projectRoomPreferencesToShoppingPreferences(persistedMarble));
    expect(a.hash).toBe(b.hash);
  });

  it("does not remount a marble project as flooring=keep / warm greige", () => {
    const discovery = discoveryFromPrefs(persistedMarble);
    expect(
      discoveryMatchesShoppingSource(discovery, {
        locationInput: discovery.locationInput,
        preferences: projectRoomPreferencesToShoppingPreferences(remountDefaults),
      })
    ).toBe(false);
    expect(
      discoveryMatchesShoppingSource(discovery, {
        locationInput: discovery.locationInput,
        preferences: projectRoomPreferencesToShoppingPreferences(persistedMarble),
      })
    ).toBe(true);
    expect(canonicalShoppingPreferences(remountDefaults).flooring).toBe("keep");
    expect(canonicalShoppingPreferencesFromProject(persistedMarble).flooring).toBe("marble");
  });

  it("matches discovery hash immediately after success when persisted prefs are unchanged", () => {
    const fingerprint = shoppingPreferenceFingerprint(
      projectRoomPreferencesToShoppingPreferences(persistedMarble)
    );
    const discovery = discoveryFromPrefs(persistedMarble);
    expect(discovery.sourcePreferencesHash).toBe(fingerprint.hash);
    expect(
      discoveryMatchesShoppingSource(discovery, {
        locationInput: discovery.locationInput,
        preferences: projectRoomPreferencesToShoppingPreferences(persistedMarble),
      })
    ).toBe(true);
  });

  it("uses persisted project prefs for render, not client greige defaults", () => {
    const fromDb = projectRoomPreferencesToRenderPreferences(persistedMarble);
    const fromClient = projectRoomPreferencesToRenderPreferences(remountDefaults);
    expect(fromDb.wallMainColor).toBe("metallic black");
    expect(fromDb.flooring).toBe("marble");
    expect(fromClient.wallMainColor).toBe("warm greige");
    expect(fromClient.flooring).toBe("keep");
  });
});

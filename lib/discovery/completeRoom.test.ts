import { describe, expect, it, vi } from "vitest";
import type { SearchableRequirement } from "./itemSpecs";
import type { RankedProductCandidate } from "./style/types";
import {
  MAX_RECOVERY_SEARCHES_PER_REQUIREMENT,
  completeRoomGate,
  evaluateCandidateRenderReady,
  markSlotUserRemoved,
  mergeRankedCandidatePool,
  renderInventoryExcludesRejected,
  rememberRejectedCandidate,
  resolveCompleteRoomSelections,
  resolveRequirementSlot,
  selectFirstRenderReadyCandidate,
} from "./completeRoom";

function sofaRequirement(): SearchableRequirement {
  return {
    requirementType: "furniture",
    requirementKey: "furniture:sofa:0",
    itemSpec: "sofa",
    queryPlan: ["sofa"],
    snapshot: { category: "sofa", quantity: 1, placementNotes: null, constraints: [] },
    displayLabel: "Sofa",
  };
}

function ranked(
  url: string,
  title: string,
  score: number,
  extras: Partial<RankedProductCandidate["product"]> & { hardValid?: boolean } = {}
): RankedProductCandidate {
  const { hardValid = true, ...product } = extras;
  return {
    product: {
      productTitle: title,
      productSnippet: null,
      productUrl: url,
      productImageUrl: product.productImageUrl ?? `https://cdn.localhome.si/${title}.jpg`,
      price: product.price ?? 199,
      currency: "EUR",
      retailerDomain: product.retailerDomain ?? "localhome.si",
      retailerName: product.retailerName ?? "Local Home",
      hasReferenceImage: product.hasReferenceImage ?? true,
    },
    hardValid,
    hardGateReasons: hardValid ? [] : ["furniture_mismatch"],
    fidelity: null,
    serpScore: score,
    serpConfidence: 1,
    styleFit: null,
    finalScore: score,
  };
}

function evaluateByUrl(
  readyUrl: string,
  failures: Record<string, string>
): (candidate: RankedProductCandidate) => { ready: boolean; failureCode?: string; cachedBytesValid?: boolean } {
  return (candidate) => {
    if (candidate.product.productUrl === readyUrl) {
      return { ready: true, cachedBytesValid: true };
    }
    return {
      ready: false,
      failureCode: failures[candidate.product.productUrl] ?? "no_image",
    };
  };
}

describe("complete room product resolution", () => {
  it("A. skips association_unverified candidate A and resolves the requirement to READY candidate B", async () => {
    const a = ranked("https://www.xxxlesnina.si/p/calia", "Lesnina Calia Italia", 90, {
      productImageUrl: "https://media.xxxlutz.com/calia.jpg",
      retailerDomain: "xxxlesnina.si",
    });
    const b = ranked("https://www.localhome.si/p/sofa-b", "Ready sofa B", 80);
    const slot = await resolveRequirementSlot({
      requirement: sofaRequirement(),
      candidates: [a, b],
      evaluate: evaluateByUrl("https://www.localhome.si/p/sofa-b", {
        "https://www.xxxlesnina.si/p/calia": "association_unverified",
      }),
    });

    expect(slot.status).toBe("ready");
    expect(slot.selected?.product.productUrl).toBe("https://www.localhome.si/p/sofa-b");
    expect(slot.rejected).toEqual([
      {
        productUrl: "https://www.xxxlesnina.si/p/calia",
        merchant: "xxxlesnina.si",
        failureCode: "association_unverified",
      },
    ]);
    expect(slot.recoverySearchesUsed).toBe(0);
  });

  it("B. skips merchant_blocked candidate A and selects READY candidate B", async () => {
    const a = ranked("https://blocked.si/p/sofa", "Blocked sofa", 90);
    const b = ranked("https://www.localhome.si/p/sofa-b", "Ready sofa B", 70);
    const selected = await selectFirstRenderReadyCandidate({
      candidates: [a, b],
      evaluate: evaluateByUrl("https://www.localhome.si/p/sofa-b", {
        "https://blocked.si/p/sofa": "merchant_blocked",
      }),
    });

    expect(selected.selected?.product.productTitle).toBe("Ready sofa B");
    expect(selected.rejected[0]?.failureCode).toBe("merchant_blocked");
  });

  it("C. three failing candidates leave the requirement unresolved", async () => {
    const candidates = [
      ranked("https://www.localhome.si/p/a", "A", 90),
      ranked("https://www.localhome.si/p/b", "B", 80),
      ranked("https://www.localhome.si/p/c", "C", 70),
    ];
    const slot = await resolveRequirementSlot({
      requirement: sofaRequirement(),
      candidates,
      evaluate: () => ({ ready: false, failureCode: "invalid_image" }),
    });

    expect(slot.status).toBe("unresolved");
    expect(slot.selected).toBeNull();
    expect(slot.rejected).toHaveLength(3);
  });

  it("D. exhausted pool allows at most one requirement-specific recovery search", async () => {
    const recover = vi.fn(async () => [
      ranked("https://www.localhome.si/p/recovered-fail", "Recovered fail", 60),
    ]);
    const slot = await resolveRequirementSlot({
      requirement: sofaRequirement(),
      candidates: [
        ranked("https://www.localhome.si/p/a", "A", 90),
        ranked("https://www.localhome.si/p/b", "B", 80),
      ],
      evaluate: () => ({ ready: false, failureCode: "fetch_failed" }),
      recover,
    });

    expect(recover).toHaveBeenCalledTimes(MAX_RECOVERY_SEARCHES_PER_REQUIREMENT);
    expect(slot.recoverySearchesUsed).toBe(1);
    expect(slot.status).toBe("unresolved");

    const again = await resolveRequirementSlot({
      requirement: sofaRequirement(),
      candidates: [],
      rejected: slot.rejected,
      recoverySearchesUsed: slot.recoverySearchesUsed,
      evaluate: () => ({ ready: false, failureCode: "fetch_failed" }),
      recover,
    });
    expect(recover).toHaveBeenCalledTimes(1);
    expect(again.recoverySearchesUsed).toBe(1);
  });

  it("A. initial zero candidates triggers automatic recovery", async () => {
    const recover = vi.fn(async () => [ranked("https://www.localhome.si/p/recovered", "Recovered", 50)]);
    const slot = await resolveRequirementSlot({
      requirement: sofaRequirement(),
      candidates: [],
      evaluate: evaluateByUrl("https://www.localhome.si/p/recovered", {}),
      recover,
    });
    expect(recover).toHaveBeenCalledTimes(1);
    expect(slot.recoveredFromSearch).toBe(true);
    expect(slot.status).toBe("ready");
    expect(slot.selected?.product.productUrl).toBe("https://www.localhome.si/p/recovered");
  });

  it("E. recovery success makes the requirement READY", async () => {
    const slot = await resolveRequirementSlot({
      requirement: sofaRequirement(),
      candidates: [ranked("https://www.localhome.si/p/a", "A", 90)],
      evaluate: evaluateByUrl("https://www.localhome.si/p/recovered", {
        "https://www.localhome.si/p/a": "association_unverified",
      }),
      recover: async () => [ranked("https://www.localhome.si/p/recovered", "Recovered sofa", 50)],
    });

    expect(slot.status).toBe("ready");
    expect(slot.recoveredFromSearch).toBe(true);
    expect(slot.selected?.product.productUrl).toBe("https://www.localhome.si/p/recovered");
  });

  it("F. one unresolved requirement out of five blocks the final render", () => {
    const gate = completeRoomGate({
      searchedItemCount: 5,
      readyRequirementKeys: [
        "furniture:sofa:0",
        "furniture:coffee-table:1",
        "furniture:rug:2",
        "furniture:floor-lamp:3",
      ],
      unmatched: [
        {
          requirementKey: "furniture:plant:4",
          requirementType: "furniture",
          itemSpec: "plant",
          displayLabel: "Plant",
          reason: "no_valid_product",
        },
      ],
    });

    expect(gate.requiredSlots).toBe(5);
    expect(gate.readySlots).toBe(4);
    expect(gate.unresolvedSlots).toBe(1);
    expect(gate.allowed).toBe(false);
  });

  it("G. all five READY slots allow render", () => {
    const gate = completeRoomGate({
      searchedItemCount: 5,
      readyRequirementKeys: [
        "furniture:sofa:0",
        "furniture:coffee-table:1",
        "furniture:rug:2",
        "furniture:floor-lamp:3",
        "furniture:plant:4",
      ],
      unmatched: [],
    });

    expect(gate.requiredSlots).toBe(5);
    expect(gate.readySlots).toBe(5);
    expect(gate.unresolvedSlots).toBe(0);
    expect(gate.allowed).toBe(true);
  });

  it("H. a rejected candidate never appears in render inventory", async () => {
    const rejectedUrl = "https://www.xxxlesnina.si/p/calia";
    const readyUrl = "https://www.localhome.si/p/sofa-b";
    const slot = await resolveRequirementSlot({
      requirement: sofaRequirement(),
      candidates: [ranked(rejectedUrl, "Rejected", 90), ranked(readyUrl, "Ready", 80)],
      evaluate: evaluateByUrl(readyUrl, { [rejectedUrl]: "association_unverified" }),
    });
    const inventoryUrls = slot.selected ? [slot.selected.product.productUrl] : [];

    expect(renderInventoryExcludesRejected(inventoryUrls, slot.rejected)).toBe(true);
    expect(inventoryUrls).not.toContain(rejectedUrl);
  });

  it("I. selected product always has valid cached reference bytes", async () => {
    const selected = await selectFirstRenderReadyCandidate({
      candidates: [
        ranked("https://www.localhome.si/p/a", "A", 90),
        ranked("https://www.localhome.si/p/b", "B", 80),
      ],
      evaluate: evaluateByUrl("https://www.localhome.si/p/b", {
        "https://www.localhome.si/p/a": "invalid_image",
      }),
    });

    expect(selected.selected?.product.productUrl).toBe("https://www.localhome.si/p/b");
    expect(selected.cachedBytesValid).toBe(true);
    expect(selected.selected?.product.productImageUrl).toBeTruthy();
  });

  it("J. one failed product does not require a full-project rediscovery", async () => {
    const counters = { geocode: 0, places: 0, fullProject: 0, recover: 0 };
    await resolveRequirementSlot({
      requirement: sofaRequirement(),
      candidates: [ranked("https://www.localhome.si/p/a", "A", 90)],
      evaluate: () => ({ ready: false, failureCode: "association_unverified" }),
      recover: async () => {
        counters.recover += 1;
        return [ranked("https://www.localhome.si/p/b", "B", 40)];
      },
    });

    expect(counters.geocode).toBe(0);
    expect(counters.places).toBe(0);
    expect(counters.fullProject).toBe(0);
    expect(counters.recover).toBe(1);
  });

  it("retains a bounded ranked candidate pool without selecting weak candidates", () => {
    const pool = mergeRankedCandidatePool(
      [],
      [
        ranked("https://www.localhome.si/p/1", "One", 90),
        ranked("https://www.localhome.si/p/2", "Two", 80),
        ranked("https://www.localhome.si/p/3", "Three", 70),
        ranked("https://www.localhome.si/p/4", "Four", 60),
        ranked("https://www.localhome.si/p/5", "Five", 50),
        ranked("https://www.localhome.si/p/6", "Six", 40),
      ]
    );
    expect(pool).toHaveLength(5);
    expect(pool.map((item) => item.product.productTitle)).toEqual([
      "One",
      "Two",
      "Three",
      "Four",
      "Five",
    ]);
  });

  it("persists rejected candidate memory and will not reselect it later", () => {
    const rejected = rememberRejectedCandidate([], {
      productUrl: "https://www.localhome.si/p/a",
      merchant: "localhome.si",
      failureCode: "association_unverified",
    });
    expect(rejected).toHaveLength(1);
    const again = rememberRejectedCandidate(rejected, {
      productUrl: "https://www.localhome.si/p/a",
      merchant: "localhome.si",
      failureCode: "association_unverified",
    });
    expect(again).toHaveLength(1);
  });

  it("does not treat FOUND as enough; association_unverified is not RENDER_READY", () => {
    const foundButUnrenderable = ranked(
      "https://www.xxxlesnina.si/p/calia",
      "Calia sofa",
      90,
      {
        productImageUrl: "https://media.xxxlutz.com/calia.jpg",
        retailerDomain: "xxxlesnina.si",
      }
    );
    expect(evaluateCandidateRenderReady(foundButUnrenderable)).toEqual({
      ready: false,
      failureCode: "association_unverified",
    });
  });

  it("user-removed unresolved slots drop out of the complete-room gate", () => {
    const unresolved = {
      requirementKey: "furniture:sofa:0",
      requirementType: "furniture" as const,
      itemSpec: "sofa",
      displayLabel: "Sofa",
      reason: "no_valid_product" as const,
    };
    const gate = completeRoomGate({
      searchedItemCount: 1,
      readyRequirementKeys: [],
      unmatched: [markSlotUserRemoved(unresolved)],
    });
    expect(gate.requiredSlots).toBe(0);
    expect(gate.allowed).toBe(false);
  });

  it("resolveCompleteRoomSelections keeps other slots when one candidate fails", async () => {
    const sofa = sofaRequirement();
    const table: SearchableRequirement = {
      requirementType: "furniture",
      requirementKey: "furniture:coffee-table:1",
      itemSpec: "coffee table",
      queryPlan: ["coffee table"],
      snapshot: { category: "coffee table", quantity: 1, placementNotes: null, constraints: [] },
      displayLabel: "Coffee table",
    };
    const result = await resolveCompleteRoomSelections({
      searched: [sofa, table],
      pools: [
        {
          requirement: sofa,
          candidates: [
            ranked("https://www.localhome.si/p/sofa-a", "Sofa A", 90),
            ranked("https://www.localhome.si/p/sofa-b", "Sofa B", 80),
          ],
        },
        {
          requirement: table,
          candidates: [ranked("https://www.localhome.si/p/table", "Table", 90)],
        },
      ],
      searchUnmatched: [],
      evaluate: (candidate) =>
        candidate.product.productUrl === "https://www.localhome.si/p/sofa-a"
          ? { ready: false, failureCode: "association_unverified" }
          : { ready: true, cachedBytesValid: true },
    });

    expect(result.selections.map((item) => item.product.productTitle).sort()).toEqual([
      "Sofa B",
      "Table",
    ]);
    expect(result.unmatched).toEqual([]);
    expect(result.recoverySearchCount).toBe(0);
  });
});

describe("zero-candidate + true multi-candidate hardening", () => {
  it("B. recovery READY product resolves the requirement automatically", async () => {
    const slot = await resolveRequirementSlot({
      requirement: sofaRequirement(),
      candidates: [],
      evaluate: evaluateByUrl("https://www.localhome.si/p/b", {}),
      recover: async () => [
        ranked("https://www.localhome.si/p/b", "Sofa B", 80),
        ranked("https://www.localhome.si/p/c", "Sofa C", 70),
      ],
    });
    expect(slot.status).toBe("ready");
    expect(slot.selected?.product.productUrl).toBe("https://www.localhome.si/p/b");
    expect(slot.recoverySearchesUsed).toBe(1);
  });

  it("C. initial zero + recovery zero leaves the requirement unresolved", async () => {
    const slot = await resolveRequirementSlot({
      requirement: sofaRequirement(),
      candidates: [],
      evaluate: () => ({ ready: false, failureCode: "no_image" }),
      recover: async () => [],
    });
    expect(slot.status).toBe("unresolved");
    expect(slot.selected).toBeNull();
    expect(slot.recoverySearchesUsed).toBe(1);
  });

  it("D. A and B fail, C READY is selected without recovery", async () => {
    const recover = vi.fn(async () => [ranked("https://www.localhome.si/p/recovery", "Recovery", 10)]);
    const slot = await resolveRequirementSlot({
      requirement: sofaRequirement(),
      candidates: [
        ranked("https://www.localhome.si/p/a", "A", 90),
        ranked("https://www.localhome.si/p/b", "B", 80),
        ranked("https://www.localhome.si/p/c", "C", 70),
      ],
      evaluate: evaluateByUrl("https://www.localhome.si/p/c", {
        "https://www.localhome.si/p/a": "association_unverified",
        "https://www.localhome.si/p/b": "invalid_image",
      }),
      recover,
    });
    expect(slot.status).toBe("ready");
    expect(slot.selected?.product.productTitle).toBe("C");
    expect(recover).not.toHaveBeenCalled();
    expect(slot.recoverySearchesUsed).toBe(0);
  });

  it("E. exhausted initial pool triggers exactly one recovery search", async () => {
    const recover = vi.fn(async () => [ranked("https://www.localhome.si/p/r", "R", 40)]);
    await resolveRequirementSlot({
      requirement: sofaRequirement(),
      candidates: [
        ranked("https://www.localhome.si/p/a", "A", 90),
        ranked("https://www.localhome.si/p/b", "B", 80),
      ],
      evaluate: () => ({ ready: false, failureCode: "fetch_failed" }),
      recover,
    });
    expect(recover).toHaveBeenCalledTimes(1);
  });

  it("F. recovery never treats a previously rejected canonical product as new", async () => {
    const rejectedUrl = "https://www.localhome.si/p/a";
    const recover = vi.fn(async () => [
      ranked("https://www.LocalHome.si/p/a/", "Rejected again", 90),
      ranked("https://www.localhome.si/p/fresh", "Fresh", 50),
    ]);
    const slot = await resolveRequirementSlot({
      requirement: sofaRequirement(),
      candidates: [ranked(rejectedUrl, "A", 90)],
      evaluate: evaluateByUrl("https://www.localhome.si/p/fresh", {
        [rejectedUrl]: "association_unverified",
      }),
      recover,
    });
    expect(slot.selected?.product.productUrl).toBe("https://www.localhome.si/p/fresh");
    expect(slot.rejected.some((item) => item.productUrl === rejectedUrl)).toBe(true);
    expect(renderInventoryExcludesRejected([slot.selected!.product.productUrl], slot.rejected)).toBe(true);
  });

  it("I. one unresolved slot blocks render", () => {
    const gate = completeRoomGate({
      searchedItemCount: 5,
      readyRequirementKeys: ["a", "b", "c", "d"],
      unmatched: [
        {
          requirementKey: "furniture:floor-lamp:4",
          requirementType: "furniture",
          itemSpec: "floor lamp",
          displayLabel: "Floor lamp",
          reason: "no_valid_product",
        },
      ],
    });
    expect(gate.requiredSlots).toBe(5);
    expect(gate.readySlots).toBe(4);
    expect(gate.unresolvedSlots).toBe(1);
    expect(gate.allowed).toBe(false);
  });

  it("J. all slots READY allows render", () => {
    const gate = completeRoomGate({
      searchedItemCount: 5,
      readyRequirementKeys: ["a", "b", "c", "d", "e"],
      unmatched: [],
    });
    expect(gate.allowed).toBe(true);
    expect(gate.unresolvedSlots).toBe(0);
  });

  it("K. candidate failure does not rerun geocode, Places, or the full project", async () => {
    const counters = { geocode: 0, places: 0, fullProject: 0, recover: 0 };
    await resolveRequirementSlot({
      requirement: sofaRequirement(),
      candidates: [],
      evaluate: () => ({ ready: false, failureCode: "no_image" }),
      recover: async () => {
        counters.recover += 1;
        return [];
      },
    });
    expect(counters.geocode).toBe(0);
    expect(counters.places).toBe(0);
    expect(counters.fullProject).toBe(0);
    expect(counters.recover).toBe(1);
  });
});

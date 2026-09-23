import { describe, expect, it } from "vitest";
import type { RoomAnalysisObservation } from "@/lib/analysis/schema";
import { validRoomAnalysisResult } from "@/lib/analysis/fixtures";
import { buildInteriorDesignBrief } from "./brief";
import { evaluateInteriorCompleteness, extraCompletenessItems } from "./completeInterior";
import { planFurnitureLayout } from "./layoutPlan";
import { planLightingDesign } from "./lightingDesign";
import {
  exactDimensionsKnown,
  hasCeilingWiringEvidence,
  isUnfinishedConstruction,
} from "./unfinishedRoom";
import { excludeLockedRequirementKeys, lockedApprovedRequirementKeys } from "./approvedLock";
import { requirementsNeedingSearch, resolveMixedDiscoveryMode } from "./mixedDiscovery";
import { productApprovalGate, evaluateCompleteRoomReadiness } from "@/lib/render/readiness";
import type { ProductSelectionView } from "@/lib/discovery/types";
import { normalizeFurnishingPlan } from "@/lib/discovery/furnishingPlan";
import { buildRoomRenderPrompt } from "@/lib/render/prompt";
import { referencePriority, type OrderedRenderReference } from "@/lib/render/order";
import type { ProductReferenceAssetView } from "@/lib/references/types";

function livingObservation(overrides: Partial<RoomAnalysisObservation> = {}): RoomAnalysisObservation {
  return {
    roomType: "living-room",
    architecture: {
      walls: ["usable long wall opposite the camera", "window wall on the left"],
      floor: "bare screed",
      windows: ["one window on the left wall"],
      doors: ["entry door", "balcony door"],
      fixedElements: ["ceiling electrical point with hanging wires"],
    },
    existingElements: [],
    visualCondition: {
      lighting: "daylight from the left window",
      colors: ["raw plaster"],
      overall: "unfinished raw plaster and hanging ceiling wires",
    },
    constraints: ["do not block the balcony door"],
    preserve: ["windows", "doors", "electrical points"],
    replaceOrRemove: [],
    measurementStatus: { exactDimensionsKnown: false, qualitativeNotes: ["open living room"] },
    uncertainties: ["true room width"],
    ...overrides,
  };
}

function selection(partial: Partial<ProductSelectionView> & Pick<ProductSelectionView, "requirementKey">): ProductSelectionView {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
    projectId: "11111111-1111-4111-8111-111111111111",
    discoveryId: "22222222-2222-4222-8222-222222222222",
    requirementType: "furniture",
    requirementSnapshot: { category: "sofa" },
    itemSpec: "sofa",
    productTitle: "Taremo II",
    productUrl: "https://www.svetpohistva.si/trgovina/kavci/taremo-ii.html",
    productImageUrl: "https://cdn.example/sofa.jpg",
    price: 1,
    currency: "EUR",
    retailerDomain: "svetpohistva.si",
    retailerName: "Svet pohistva",
    hasReferenceImage: true,
    isConfirmed: true,
    referenceStatus: "ready",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...partial,
  };
}

function ref(
  imageIndex: number,
  extra: Partial<ProductSelectionView> & Pick<ProductSelectionView, "id" | "requirementKey" | "itemSpec" | "productTitle">
): OrderedRenderReference {
  const full: ProductSelectionView = {
    projectId: "11111111-1111-4111-8111-111111111111",
    discoveryId: "22222222-2222-4222-8222-222222222222",
    requirementType: "furniture",
    requirementSnapshot: { category: extra.itemSpec },
    productUrl: "https://www.localhome.si/p/1",
    productImageUrl: null,
    price: 199,
    currency: "EUR",
    retailerDomain: "localhome.si",
    retailerName: "Local",
    hasReferenceImage: true,
    isConfirmed: true,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...extra,
  };
  const asset: ProductReferenceAssetView = {
    id: `asset-${full.id}`,
    projectId: full.projectId,
    selectionId: full.id,
    sourceImageUrl: "https://cdn.localhome.si/1.jpg",
    sourcePageUrl: "https://www.localhome.si/p/1",
    isPrimary: true,
    sortOrder: 0,
    storageBucket: "project-assets",
    storagePath: `projects/${full.projectId}/product-references/${full.id}.jpg`,
    mimeType: "image/jpeg",
    sizeBytes: 22,
    sourceHash: "a".repeat(64),
    width: 1,
    height: 1,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
  return {
    imageIndex,
    selection: full,
    asset,
    priority: referencePriority(full),
    originalIndex: imageIndex - 2,
  };
}

describe("autonomous interior design workflow", () => {
  it("evaluates living-room furnishing categories without forcing a TV unit", () => {
    const planned = ["sofa", "coffee_table", "rug", "ceiling_light"] as const;
    const completeness = evaluateInteriorCompleteness({
      observation: livingObservation(),
      plannedConcepts: [...planned],
    });
    const byConcept = Object.fromEntries(completeness.map((item) => [item.concept, item.decision]));
    expect(byConcept.sofa).toBe("required_present");
    expect(byConcept.coffee_table).toBe("required_present");
    expect(byConcept.rug).toBe("required_present");
    expect(byConcept.ceiling_light).toBe("required_present");
    expect(byConcept.tv_console).toBe("needs_preference");
    expect(byConcept.window_treatment).toBe("required");
    expect(byConcept.storage).toBe("suggested");
    expect(byConcept.floor_lamp).toBe("suggested");
    expect(completeness.find((item) => item.category === "restrained decoration")?.decision).toBe(
      "design_proposal"
    );

    const withMedia = evaluateInteriorCompleteness({
      observation: livingObservation({
        constraints: ["television on the long wall"],
      }),
      plannedConcepts: [...planned],
    });
    expect(withMedia.find((item) => item.concept === "tv_console")?.decision).toBe("required");

    const declined = evaluateInteriorCompleteness({
      observation: livingObservation(),
      plannedConcepts: [...planned],
      userNotes: "no television",
    });
    expect(declined.find((item) => item.concept === "tv_console")?.decision).toBe("not_appropriate");
  });

  it("auto-requires missing functional living-room categories and leaves storage optional", () => {
    const plan = normalizeFurnishingPlan({
      analysisRequirements: {
        furnitureNeeds: [
          { category: "sofa", quantity: 1, placementNotes: null, constraints: [] },
          { category: "coffee table", quantity: 1, placementNotes: null, constraints: [] },
          { category: "rug", quantity: 1, placementNotes: null, constraints: [] },
          { category: "floor lamp", quantity: 1, placementNotes: null, constraints: [] },
        ],
        materialNeeds: [],
        constraints: [],
        preserve: [],
        replaceOrRemove: [],
      },
      observation: livingObservation(),
    });
    expect(plan.required.map((item) => item.concept)).toEqual(
      expect.arrayContaining(["sofa", "coffee_table", "rug", "floor_lamp", "ceiling_light", "window_treatment"])
    );
    expect(plan.required.some((item) => item.concept === "tv_console")).toBe(false);
    expect(plan.suggested.map((item) => item.concept)).toEqual(expect.arrayContaining(["storage"]));
    expect(plan.required.some((item) => /plant|artwork/i.test(item.category))).toBe(false);
    expect(
      extraCompletenessItems({
        observation: livingObservation(),
        plannedConcepts: ["sofa", "coffee_table", "rug", "floor_lamp"],
      }).some((item) => item.concept === "tv_console")
    ).toBe(false);
    expect(plan.required.length).toBeLessThanOrEqual(8);
  });

  it("plans layout before rendering and rejects centered showroom placement", () => {
    const layout = planFurnitureLayout({
      observation: livingObservation(),
      plannedConcepts: ["sofa", "coffee_table", "rug", "ceiling_light"],
    });
    expect(layout.selectedOptionId).toBe("wall_anchored_conversation");
    expect(layout.options.find((item) => item.id === "centered_showroom")?.selected).toBe(false);
    expect(layout.selectedRationale).toMatch(/not when the sofa is centered/i);
    expect(layout.physicalFit).toBe("unverified");
    expect(layout.mediaWall.status).toBe("pending_preference");
    expect(layout.mediaWall.glare).toMatch(/window/i);

    const glazed = planFurnitureLayout({
      observation: livingObservation({
        constraints: ["large windows and sliding door limit wall space"],
        architecture: {
          walls: ["white, unfinished"],
          floor: "unfinished concrete",
          windows: ["large, multiple, providing natural light"],
          doors: ["large sliding glass door"],
          fixedElements: [],
        },
      }),
      plannedConcepts: ["sofa", "coffee_table", "rug", "ceiling_light"],
    });
    expect(glazed.mediaWall.status).toBe("pending_preference");
    expect(glazed.mediaWall.sofaRelationship).toMatch(/remaining solid walls/i);
    expect(glazed.options.find((item) => item.selected)?.sofaOrientation).toMatch(/sliding door/i);
    expect(layout.missingMeasurements.some((item) => /sofa overall footprint/i.test(item))).toBe(true);

    const prompt = buildRoomRenderPrompt({
      observation: livingObservation(),
      designRequirements: validRoomAnalysisResult.designRequirements,
      unmatchedRequirements: [],
      preferences: {
        selectedStyles: ["warm-minimal"],
        budgetLevel: "balanced",
        wallMainColor: "",
        wallAccentColor: "",
        flooring: "keep",
        underfloorHeating: false,
        bedType: "none",
        keepExistingWalls: true,
        notes: "",
      },
      references: [
        ref(2, {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
          requirementKey: "furniture:sofa:0",
          itemSpec: "sofa",
          productTitle: "Taremo II",
        }),
      ],
    });
    expect(prompt.prompt).toContain("LAYOUT PLAN");
    expect(prompt.prompt).toContain("Do not center the sofa in the room because it looks attractive in a product photograph.");
    expect(prompt.prompt).toContain("INTERIOR DESIGN BRIEF");
  });

  it("preserves fixed architecture in the brief and render prompt", () => {
    const brief = buildInteriorDesignBrief({
      observation: livingObservation(),
      plannedConcepts: ["sofa", "ceiling_light"],
    });
    expect(brief.layout.preserveArchitecture.join(" ")).toMatch(/window|door|electrical/i);
    const prompt = buildRoomRenderPrompt({
      observation: livingObservation(),
      designRequirements: validRoomAnalysisResult.designRequirements,
      unmatchedRequirements: [],
      preferences: {
        selectedStyles: [],
        budgetLevel: null,
        wallMainColor: "",
        wallAccentColor: "",
        flooring: "keep",
        underfloorHeating: false,
        bedType: "none",
        keepExistingWalls: true,
        notes: "",
      },
      references: [],
    });
    expect(prompt.prompt).toContain(
      "Do not silently move windows, doors, walls, electrical outlets, or other fixed architectural features."
    );
    expect(prompt.prompt).toContain("The original room is the architectural source of truth.");
  });

  it("locks approved READY furniture so those requirement keys are not searched again", () => {
    const selections = [
      selection({ requirementKey: "furniture:sofa:0" }),
      selection({
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
        requirementKey: "furniture:coffee-table:0",
        itemSpec: "coffee table",
        productTitle: "Rutar coffee table",
      }),
      selection({
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
        requirementKey: "furniture:pending:0",
        productTitle: "Pending lamp",
        referenceStatus: "pending",
      }),
    ];
    const locked = lockedApprovedRequirementKeys(selections);
    expect(locked).toEqual(["furniture:sofa:0", "furniture:coffee-table:0"]);
    const { searchable, locked: kept } = excludeLockedRequirementKeys(
      [
        { requirementKey: "furniture:sofa:0" },
        { requirementKey: "furniture:coffee-table:0" },
        { requirementKey: "furniture:rug:0" },
      ],
      locked
    );
    expect(searchable.map((item) => item.requirementKey)).toEqual(["furniture:rug:0"]);
    expect(kept.map((item) => item.requirementKey)).toEqual([
      "furniture:sofa:0",
      "furniture:coffee-table:0",
    ]);
  });

  it("marks missing dimensions as unverified and does not invent measurements", () => {
    const observation = livingObservation();
    expect(exactDimensionsKnown(observation)).toBe(false);
    const brief = buildInteriorDesignBrief({
      observation,
      plannedConcepts: ["sofa", "rug"],
    });
    expect(brief.exactDimensionsKnown).toBe(false);
    expect(brief.unknownMeasurements.join(" ")).toMatch(/do not invent/i);
    const prompt = buildRoomRenderPrompt({
      observation,
      designRequirements: validRoomAnalysisResult.designRequirements,
      unmatchedRequirements: [],
      preferences: {
        selectedStyles: [],
        budgetLevel: null,
        wallMainColor: "",
        wallAccentColor: "",
        flooring: "keep",
        underfloorHeating: false,
        bedType: "none",
        keepExistingWalls: true,
        notes: "",
      },
      references: [],
    });
    expect(prompt.prompt).toContain("Physical fit is NOT VERIFIED");
    expect(prompt.prompt).toContain("Do not invent room or product dimensions.");
  });

  it("requires finished-room completeness and no exposed construction wiring in completed visualizations", () => {
    expect(isUnfinishedConstruction(livingObservation())).toBe(true);
    expect(hasCeilingWiringEvidence(livingObservation())).toBe(true);
    const lighting = planLightingDesign({
      observation: livingObservation(),
      plannedConcepts: ["ceiling_light", "sofa"],
    });
    expect(lighting.wiringInstruction).toMatch(/do not leave exposed hanging electrical wires/i);
    expect(lighting.avoid).toEqual(
      expect.arrayContaining(["Excessive LED-strip aesthetics", "Unrealistic colored glow"])
    );

    const snapshot = buildRoomRenderPrompt({
      observation: livingObservation(),
      designRequirements: {
        furnitureNeeds: [
          {
            category: "sofa",
            quantity: 1,
            placementNotes: null,
            constraints: [],
          },
          {
            category: "ceiling light fixture",
            quantity: null,
            placementNotes: null,
            constraints: [],
          },
        ],
        materialNeeds: [],
        constraints: [],
        preserve: [],
        replaceOrRemove: [],
      },
      unmatchedRequirements: [],
      preferences: {
        selectedStyles: ["warm-minimal"],
        budgetLevel: "balanced",
        wallMainColor: "",
        wallAccentColor: "",
        flooring: "keep",
        underfloorHeating: false,
        bedType: "none",
        keepExistingWalls: true,
        notes: "",
      },
      references: [
        ref(2, {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
          requirementKey: "furniture:sofa:0",
          itemSpec: "sofa",
          productTitle: "Taremo II",
        }),
        ref(3, {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4",
          requirementKey: "furniture:ceiling-light:0",
          itemSpec: "ceiling light fixture",
          productTitle: "Varano ceiling light",
        }),
      ],
    });
    expect(snapshot.renderIntent).toBe("furnish_only");
    expect(snapshot.prompt).toContain("VISUAL COMPLETION");
    expect(snapshot.prompt).toContain("finished interior");
    expect(snapshot.prompt).toContain("Do not leave exposed hanging electrical wires");
    expect(snapshot.prompt).toContain("install it at the existing ceiling electrical point");
    expect(snapshot.prompt).not.toContain("Do not paint, plaster, refinish, or complete unfinished walls, floors, or ceilings.");
    expect(snapshot.prompt).not.toContain("Do not invent a completed white interior over an unfinished room.");
    expect(extraCompletenessItems({
      observation: livingObservation(),
      plannedConcepts: ["sofa", "coffee_table", "rug", "ceiling_light"],
    }).find((item) => item.concept === "window_treatment")?.decision).toBe("required");
  });

  it("appends mixed discovery instead of replacing locked READY products", () => {
    expect(
      resolveMixedDiscoveryMode({
        searchedCount: 5,
        searchableCount: 1,
        lockedCount: 4,
        hasPriorDiscovery: true,
      })
    ).toBe("append");
    expect(
      resolveMixedDiscoveryMode({
        searchedCount: 4,
        searchableCount: 0,
        lockedCount: 4,
        hasPriorDiscovery: true,
      })
    ).toBe("reuse");
    expect(
      resolveMixedDiscoveryMode({
        searchedCount: 4,
        searchableCount: 4,
        lockedCount: 0,
        hasPriorDiscovery: false,
      })
    ).toBe("replace");
    expect(
      requirementsNeedingSearch(
        [
          { requirementKey: "furniture:sofa:0" },
          { requirementKey: "furniture:window-treatment:0" },
        ],
        {
          priorSelectionKeys: ["furniture:sofa:0"],
          lockedKeys: ["furniture:sofa:0"],
        }
      ).map((item) => item.requirementKey)
    ).toEqual(["furniture:window-treatment:0"]);
  });

  it("blocks render until each READY furniture product is approved", () => {
    const blocked = productApprovalGate([
      {
        isConfirmed: false,
        requirementType: "furniture",
        referenceStatus: "ready",
        productTitle: "Taremo II",
      },
    ]);
    expect(blocked.allowed).toBe(false);
    expect(blocked.unconfirmedLabels).toEqual(["Taremo II"]);
    const allowed = productApprovalGate([
      {
        isConfirmed: true,
        requirementType: "furniture",
        referenceStatus: "ready",
        productTitle: "Taremo II",
      },
    ]);
    expect(allowed.allowed).toBe(true);
  });

  it("blocks generate when a required living-room category has no READY product yet", () => {
    const plan = normalizeFurnishingPlan({
      analysisRequirements: {
        furnitureNeeds: [
          { category: "sofa", quantity: 1, placementNotes: null, constraints: [] },
          { category: "coffee table", quantity: 1, placementNotes: null, constraints: [] },
          { category: "rug", quantity: 1, placementNotes: null, constraints: [] },
          { category: "ceiling light fixture", quantity: 1, placementNotes: null, constraints: [] },
        ],
        materialNeeds: [],
        constraints: [],
        preserve: [],
        replaceOrRemove: [],
      },
      observation: livingObservation(),
    });
    const gate = evaluateCompleteRoomReadiness({
      searchedItemCount: 4,
      unmatched: [],
      readyRequirementKeys: [
        "furniture:sofa:0",
        "furniture:coffee-table:0",
        "furniture:rug:0",
        "furniture:ceiling-light:0",
      ],
      preferences: {
        selectedStyles: [],
        budgetLevel: null,
        wallMainColor: "",
        wallAccentColor: "",
        flooring: "keep",
        underfloorHeating: false,
        bedType: "none",
        keepExistingWalls: true,
        notes: "",
      },
      requiredPlanItems: plan.required.map((item) => ({
        requirementKey: item.requirementKey,
        displayLabel: item.displayLabel,
        concept: item.concept,
      })),
    });
    expect(plan.required.some((item) => item.concept === "window_treatment")).toBe(true);
    expect(gate.allowed).toBe(false);
    expect(gate.unresolvedLabels.join(" ")).toMatch(/window treatment/i);
  });
});

import { describe, expect, it } from "vitest";
import {
  applyAnswer,
  briefPlannerIntent,
  cloneEmptyBrief,
  designBriefIdentity,
  firstUnanswered,
  isEmptyDesignBrief,
  markBriefComplete,
  parseDesignBriefAnswers,
  questionsForRoom,
  seedDesignBriefFromPreferences,
  visibleQuestions,
} from "@/lib/design-brief";
import type { BriefObservationContext } from "@/lib/design-brief";
import { evaluateInteriorCompleteness, extraCompletenessItems } from "@/lib/design/completeInterior";
import { canonicalShoppingPreferences } from "@/lib/discovery/preferences";
import { shoppingPreferenceFingerprint } from "@/lib/discovery/preferenceHash";
import { projectRoomPreferencesToShoppingPreferences } from "@/lib/project-preferences/adapter";
import { EMPTY_PROJECT_ROOM_PREFERENCES } from "@/lib/project-preferences/types";
import { resolveMixedDiscoveryMode, requirementsNeedingSearch, nextDiscoverySearchBatch } from "@/lib/design/mixedDiscovery";
import { isLockedApprovedSelection, lockedApprovedRequirementKeys } from "@/lib/design/approvedLock";
import { productApprovalGate, evaluateCompleteRoomReadiness, designBriefGenerateGate, designBriefBlockMessage } from "@/lib/render/readiness";
import { MAX_PRODUCT_DISCOVERY_ITEMS } from "@/lib/discovery/constants";
import type { ProductSelectionView } from "@/lib/discovery/types";

function observation(
  overrides: Partial<BriefObservationContext> = {}
): BriefObservationContext {
  return {
    userRoomType: "living-room",
    analysisRoomType: "living-room",
    hasWindows: true,
    hasDoors: true,
    unfinished: true,
    hasCeilingWiring: true,
    hasBuiltInStorage: false,
    hasToilet: false,
    hasBed: false,
    hasShower: false,
    hasBathtub: false,
    roomTypeMismatch: false,
    ...overrides,
  };
}

describe("design brief question packs", () => {
  it("gives each of the five room types a distinct functional pack", () => {
    const living = questionsForRoom("living-room").map((item) => item.id);
    const bedroom = questionsForRoom("bedroom").map((item) => item.id);
    const kitchen = questionsForRoom("kitchen").map((item) => item.id);
    const bathroom = questionsForRoom("bathroom").map((item) => item.id);
    const other = questionsForRoom("other").map((item) => item.id);

    expect(living).toEqual(expect.arrayContaining(["shared.style", "living.tv", "living.seating"]));
    expect(bedroom).toEqual(expect.arrayContaining(["bedroom.bed", "bedroom.wardrobe", "bedroom.occupants"]));
    expect(kitchen).toEqual(expect.arrayContaining(["kitchen.cooking", "kitchen.layout", "kitchen.appliances"]));
    expect(bathroom).toEqual(expect.arrayContaining(["bathroom.wet", "bathroom.vanity", "bathroom.tiles"]));
    expect(other).toEqual(expect.arrayContaining(["other.purpose"]));
    expect(other).not.toContain("living.tv");
    expect(kitchen).not.toContain("living.seating");
    expect(bathroom).not.toContain("bedroom.bed");
  });

  it("shows the photo mismatch question without silently overriding the selected room type", () => {
    const questions = questionsForRoom("bedroom");
    const ctx = observation({
      userRoomType: "bedroom",
      analysisRoomType: "living-room",
      roomTypeMismatch: true,
    });
    const doc = cloneEmptyBrief("bedroom");
    expect(visibleQuestions(questions, doc, ctx).some((item) => item.id === "shared.roomTypeMismatch")).toBe(true);
    const kept = applyAnswer({
      document: doc,
      questions,
      questionId: "shared.roomTypeMismatch",
      answer: { questionId: "shared.roomTypeMismatch", mode: "value", value: "keep_selected" },
    });
    expect(kept.roomType).toBe("bedroom");
    expect(questionsForRoom(kept.roomType).map((item) => item.id)).toEqual(
      expect.arrayContaining(["bedroom.bed"])
    );
    expect(questionsForRoom(kept.roomType).map((item) => item.id)).not.toContain("living.tv");
  });

  it("asks custom rooms for purpose before functional questions", () => {
    const questions = questionsForRoom("other");
    const ctx = observation({ userRoomType: "other", analysisRoomType: "other" });
    const doc = cloneEmptyBrief("other");
    expect(firstUnanswered(questions, doc, ctx)?.id).toBe("shared.style");
    expect(questions.find((item) => item.id === "other.purpose")).toBeTruthy();
    expect(visibleQuestions(questions, doc, ctx).some((item) => item.id === "living.tv")).toBe(false);
  });

  it("still presents optional questions so Skip stays distinct from unanswered", () => {
    const questions = questionsForRoom("living-room");
    const ctx = observation();
    let doc = cloneEmptyBrief("living-room");
    doc = applyAnswer({
      document: doc,
      questions,
      questionId: "shared.style",
      answer: { questionId: "shared.style", mode: "value", value: ["modern"] },
    });
    doc = applyAnswer({
      document: doc,
      questions,
      questionId: "shared.budget",
      answer: { questionId: "shared.budget", mode: "value", value: "balanced" },
    });
    expect(firstUnanswered(questions, doc, ctx)?.id).toBe("shared.priorities");
  });
});

describe("conditional branching", () => {
  it("skips TV size and media furniture when the user declines a television", () => {
    const questions = questionsForRoom("living-room");
    const ctx = observation();
    let doc = cloneEmptyBrief("living-room");
    doc = applyAnswer({
      document: doc,
      questions,
      questionId: "living.tv",
      answer: { questionId: "living.tv", mode: "value", value: "no" },
    });
    const visible = visibleQuestions(questions, doc, ctx).map((item) => item.id);
    expect(visible).not.toContain("living.tvSize");
    expect(visible).not.toContain("living.mediaFurniture");
    expect(briefPlannerIntent(doc).tvWanted).toBe(false);
    expect(briefPlannerIntent(doc).concepts.tv_console).toBe("exclude");
  });

  it("asks TV size only after an explicit yes", () => {
    const questions = questionsForRoom("living-room");
    const ctx = observation();
    let doc = cloneEmptyBrief("living-room");
    doc = applyAnswer({
      document: doc,
      questions,
      questionId: "living.tv",
      answer: { questionId: "living.tv", mode: "value", value: "yes" },
    });
    expect(visibleQuestions(questions, doc, ctx).map((item) => item.id)).toEqual(
      expect.arrayContaining(["living.tvSize", "living.mediaFurniture"])
    );
  });

  it("excludes a TV console when the customer chooses wall-mounted minimal furniture", () => {
    const questions = questionsForRoom("living-room");
    let doc = cloneEmptyBrief("living-room");
    doc = applyAnswer({
      document: doc,
      questions,
      questionId: "living.tv",
      answer: { questionId: "living.tv", mode: "value", value: "yes" },
    });
    doc = applyAnswer({
      document: doc,
      questions,
      questionId: "living.mediaFurniture",
      answer: { questionId: "living.mediaFurniture", mode: "value", value: "wall-mount" },
    });
    expect(briefPlannerIntent(doc).concepts.tv_console).toBe("exclude");
  });

  it("does not treat unanswered questions as yes", () => {
    const doc = cloneEmptyBrief("living-room");
    const intent = briefPlannerIntent(doc);
    expect(intent.tvWanted).toBeNull();
    expect(intent.concepts.tv_console).toBe("needs_preference");
    const completeness = evaluateInteriorCompleteness({
      observation: {
        roomType: "living-room",
        architecture: {
          walls: ["solid wall"],
          floor: "screed",
          windows: ["window"],
          doors: ["door"],
          fixedElements: [],
        },
        existingElements: [],
        visualCondition: { lighting: "daylight", colors: [], overall: "empty" },
        constraints: [],
        preserve: [],
        replaceOrRemove: [],
        measurementStatus: { exactDimensionsKnown: false, qualitativeNotes: [] },
        uncertainties: [],
      },
      plannedConcepts: ["sofa"],
      brief: intent,
    });
    expect(completeness.find((item) => item.concept === "tv_console")?.decision).toBe("needs_preference");
  });

  it("stores Let AI decide explicitly", () => {
    const questions = questionsForRoom("living-room");
    const doc = applyAnswer({
      document: cloneEmptyBrief("living-room"),
      questions,
      questionId: "living.tv",
      answer: { questionId: "living.tv", mode: "ai_decide" },
    });
    expect(doc.answers["living.tv"]?.mode).toBe("ai_decide");
    expect(briefPlannerIntent(doc).concepts.tv_console).toBe("ai_decide");
  });

  it("stores exclusions and already-have without inventing the product", () => {
    const questions = questionsForRoom("bedroom");
    let doc = cloneEmptyBrief("bedroom");
    doc = applyAnswer({
      document: doc,
      questions,
      questionId: "bedroom.wardrobe",
      answer: { questionId: "bedroom.wardrobe", mode: "already_have" },
    });
    doc = applyAnswer({
      document: doc,
      questions,
      questionId: "bedroom.reading",
      answer: { questionId: "bedroom.reading", mode: "value", value: "no" },
    });
    const intent = briefPlannerIntent(doc);
    expect(intent.concepts.wardrobe).toBe("already_have");
    expect(intent.concepts.reading_chair).toBe("exclude");
  });

  it("invalidates dependent answers when a parent answer changes", () => {
    const questions = questionsForRoom("living-room");
    let doc = cloneEmptyBrief("living-room");
    doc = applyAnswer({
      document: doc,
      questions,
      questionId: "living.tv",
      answer: { questionId: "living.tv", mode: "value", value: "yes" },
    });
    doc = applyAnswer({
      document: doc,
      questions,
      questionId: "living.tvSize",
      answer: { questionId: "living.tvSize", mode: "value", value: "55-65" },
    });
    expect(doc.answers["living.tvSize"]).toBeTruthy();
    doc = applyAnswer({
      document: doc,
      questions,
      questionId: "living.tv",
      answer: { questionId: "living.tv", mode: "value", value: "no" },
    });
    expect(doc.answers["living.tvSize"]).toBeUndefined();
    expect(doc.answers["living.tv"]?.value).toBe("no");
  });

  it("adapts custom rooms from a free-text purpose instead of living-room questions", () => {
    const questions = questionsForRoom("other");
    const ctx = observation({ userRoomType: "other", analysisRoomType: "other" });
    let doc = cloneEmptyBrief("other");
    doc = applyAnswer({
      document: doc,
      questions,
      questionId: "other.purpose",
      answer: { questionId: "other.purpose", mode: "value", value: "custom" },
    });
    expect(visibleQuestions(questions, doc, ctx).some((item) => item.id === "other.purposeText")).toBe(true);
    doc = applyAnswer({
      document: doc,
      questions,
      questionId: "other.purposeText",
      answer: { questionId: "other.purposeText", mode: "value", value: "piano practice and guest sleep" },
    });
    doc = applyAnswer({
      document: doc,
      questions,
      questionId: "other.functions",
      answer: { questionId: "other.functions", mode: "value", value: ["sleep", "desk"] },
    });
    expect(doc.customPurpose).toBe("custom");
    expect(doc.customPurposeText).toBe("piano practice and guest sleep");
    expect(briefPlannerIntent(doc).functions).toEqual(["sleep", "desk"]);
    expect(visibleQuestions(questions, doc, ctx).map((item) => item.id)).toEqual(
      expect.arrayContaining(["other.desk", "other.sleep"])
    );
  });

  it("asks walk-in shower only when a shower is selected", () => {
    const questions = questionsForRoom("bathroom");
    const ctx = observation({ userRoomType: "bathroom", analysisRoomType: "bathroom" });
    let doc = cloneEmptyBrief("bathroom");
    doc = applyAnswer({
      document: doc,
      questions,
      questionId: "bathroom.wet",
      answer: { questionId: "bathroom.wet", mode: "value", value: "bathtub" },
    });
    expect(visibleQuestions(questions, doc, ctx).map((item) => item.id)).not.toContain("bathroom.walkIn");
    doc = applyAnswer({
      document: doc,
      questions,
      questionId: "bathroom.wet",
      answer: { questionId: "bathroom.wet", mode: "value", value: "shower" },
    });
    expect(visibleQuestions(questions, doc, ctx).map((item) => item.id)).toContain("bathroom.walkIn");
  });
});

describe("persistence and old-project compatibility", () => {
  it("parses empty jsonb as a default brief", () => {
    expect(isEmptyDesignBrief(parseDesignBriefAnswers({}))).toBe(true);
    expect(isEmptyDesignBrief(parseDesignBriefAnswers(null))).toBe(true);
    expect(designBriefIdentity(parseDesignBriefAnswers({}))).toBeUndefined();
  });

  it("round-trips a saved document", () => {
    const questions = questionsForRoom("kitchen");
    const saved = markBriefComplete(
      applyAnswer({
        document: cloneEmptyBrief("kitchen"),
        questions,
        questionId: "kitchen.cooking",
        answer: { questionId: "kitchen.cooking", mode: "value", value: "daily" },
      })
    );
    const parsed = parseDesignBriefAnswers(JSON.parse(JSON.stringify(saved)));
    expect(parsed.completed).toBe(true);
    expect(parsed.answers["kitchen.cooking"]?.value).toBe("daily");
  });

  it("seeds styles and budget from existing preferences without wiping answers", () => {
    const existing = seedDesignBriefFromPreferences(
      {
        roomType: "living-room",
        selectedStyles: ["modern"],
        budgetLevel: "balanced",
        bedType: "none",
        notes: "keep the radiator",
        wallMainColor: "",
        wallAccentColor: "",
      },
      {
        schemaVersion: 1,
        roomType: "living-room",
        customPurpose: null,
        customPurposeText: null,
        currentQuestionId: "living.tv",
        completed: false,
        answers: {
          "living.tv": {
            questionId: "living.tv",
            mode: "value",
            value: "yes",
            answeredAt: "2026-01-01T00:00:00.000Z",
          },
        },
      }
    );
    expect(existing.answers["living.tv"]?.value).toBe("yes");
    expect(existing.answers["shared.style"]?.value).toEqual(["modern"]);
    expect(existing.answers["shared.budget"]?.value).toBe("balanced");
  });

  it("does not change shopping identity for an empty/old design brief", () => {
    const base = {
      ...EMPTY_PROJECT_ROOM_PREFERENCES,
      selectedStyles: ["modern"],
      wallMainColor: "metallic black",
      wallAccentColor: "olive green",
      flooring: "marble" as const,
    };
    const emptyHash = shoppingPreferenceFingerprint(
      projectRoomPreferencesToShoppingPreferences(base)
    ).hash;
    const omittedHash = shoppingPreferenceFingerprint(
      canonicalShoppingPreferences({
        selectedStyles: base.selectedStyles,
        wallMainColor: base.wallMainColor,
        wallAccentColor: base.wallAccentColor,
        flooring: base.flooring,
        underfloorHeating: false,
        bedType: "none",
        keepExistingWalls: true,
      })
    ).hash;
    expect(emptyHash).toBe(omittedHash);
  });

  it("adds designBriefIdentity only after the brief is completed", () => {
    const questions = questionsForRoom("living-room");
    let doc = applyAnswer({
      document: cloneEmptyBrief("living-room"),
      questions,
      questionId: "living.tv",
      answer: { questionId: "living.tv", mode: "value", value: "no" },
    });
    expect(designBriefIdentity(doc)).toBeUndefined();
    doc = markBriefComplete(doc);
    expect(designBriefIdentity(doc)).toContain("tv");
  });
});

describe("downstream planning for every room type", () => {
  it("requires a bed in bedrooms and keeps cabinetry as a design proposal in kitchens", () => {
    expect(
      evaluateInteriorCompleteness({
        observation: { roomType: "bedroom" } as never,
        plannedConcepts: [],
        brief: briefPlannerIntent(cloneEmptyBrief("bedroom")),
      }).find((item) => item.concept === "bed")?.decision
    ).toBe("required");

    const kitchen = evaluateInteriorCompleteness({
      observation: { roomType: "kitchen" } as never,
      plannedConcepts: [],
      brief: briefPlannerIntent(cloneEmptyBrief("kitchen")),
    });
    expect(kitchen.find((item) => item.category === "cabinetry and plumbing")?.decision).toBe("design_proposal");
    expect(kitchen.find((item) => item.concept === "ceiling_light")?.decision).toBe("required");

    const bathroom = evaluateInteriorCompleteness({
      observation: { roomType: "bathroom" } as never,
      plannedConcepts: [],
      brief: briefPlannerIntent(cloneEmptyBrief("bathroom")),
    });
    expect(bathroom.find((item) => item.category === "sanitary ware and plumbing")?.decision).toBe(
      "design_proposal"
    );
    expect(
      extraCompletenessItems({
        observation: { roomType: "kitchen" } as never,
        plannedConcepts: [],
        brief: briefPlannerIntent(cloneEmptyBrief("kitchen")),
      }).some((item) => item.decision === "design_proposal")
    ).toBe(false);

    const office = evaluateInteriorCompleteness({
      observation: { roomType: "other" } as never,
      plannedConcepts: [],
      brief: {
        ...briefPlannerIntent(cloneEmptyBrief("other")),
        customPurpose: "office",
        functions: ["desk"],
      },
    });
    expect(office.find((item) => item.concept === "desk")?.decision).toBe("required");
    expect(office.find((item) => item.concept === "office_chair")?.decision).toBe("required");
    expect(office.find((item) => item.concept === "sofa")).toBeUndefined();
    expect(office.find((item) => item.concept === "tv_console")).toBeUndefined();
  });

  it("does not treat skipped as no, and does not leak hidden TV-size after TV is declined", () => {
    const questions = questionsForRoom("living-room");
    let doc = cloneEmptyBrief("living-room");
    doc = applyAnswer({
      document: doc,
      questions,
      questionId: "living.tv",
      answer: { questionId: "living.tv", mode: "value", value: "yes" },
    });
    doc = applyAnswer({
      document: doc,
      questions,
      questionId: "living.tvSize",
      answer: { questionId: "living.tvSize", mode: "value", value: "55-65" },
    });
    doc = applyAnswer({
      document: doc,
      questions,
      questionId: "living.curtains",
      answer: { questionId: "living.curtains", mode: "skipped" },
    });
    expect(briefPlannerIntent(doc).concepts.window_treatment).toBeUndefined();
    doc = applyAnswer({
      document: doc,
      questions,
      questionId: "living.tv",
      answer: { questionId: "living.tv", mode: "value", value: "no" },
    });
    expect(doc.answers["living.tvSize"]).toBeUndefined();
    expect(briefPlannerIntent(doc).tvWanted).toBe(false);
    expect(briefPlannerIntent(doc).tvSize).toBeNull();
    expect(briefPlannerIntent(doc).concepts.tv_console).toBe("exclude");
    const declined = applyAnswer({
      document: cloneEmptyBrief("living-room"),
      questions,
      questionId: "living.tv",
      answer: { questionId: "living.tv", mode: "value", value: "no" },
    });
    const skipped = applyAnswer({
      document: cloneEmptyBrief("living-room"),
      questions,
      questionId: "living.tv",
      answer: { questionId: "living.tv", mode: "skipped" },
    });
    expect(briefPlannerIntent(declined).concepts.tv_console).toBe("exclude");
    expect(briefPlannerIntent(skipped).concepts.tv_console).not.toBe("exclude");
  });

  it("prunes walk-in shower answers when the wet zone becomes tub-only", () => {
    const questions = questionsForRoom("bathroom");
    let doc = cloneEmptyBrief("bathroom");
    doc = applyAnswer({
      document: doc,
      questions,
      questionId: "bathroom.wet",
      answer: { questionId: "bathroom.wet", mode: "value", value: "shower" },
    });
    doc = applyAnswer({
      document: doc,
      questions,
      questionId: "bathroom.walkIn",
      answer: { questionId: "bathroom.walkIn", mode: "value", value: "yes" },
    });
    expect(doc.answers["bathroom.walkIn"]).toBeTruthy();
    doc = applyAnswer({
      document: doc,
      questions,
      questionId: "bathroom.wet",
      answer: { questionId: "bathroom.wet", mode: "value", value: "bathtub" },
    });
    expect(doc.answers["bathroom.walkIn"]).toBeUndefined();
  });

  it("does not let leftover living-room TV answers drive an office brief", () => {
    const living = questionsForRoom("living-room");
    let doc = applyAnswer({
      document: cloneEmptyBrief("living-room"),
      questions: living,
      questionId: "living.tv",
      answer: { questionId: "living.tv", mode: "value", value: "yes" },
    });
    doc = { ...doc, roomType: "other", customPurpose: "office", customPurposeText: "home office" };
    const intent = briefPlannerIntent(doc);
    expect(intent.concepts.tv_console).toBeUndefined();
    expect(intent.tvWanted).toBeNull();
    expect(intent.customPurpose).toBe("office");
  });

  it("blocks generate when more than 10 required items leave leftovers not_searched", () => {
    const requiredPlanItems = Array.from({ length: 12 }, (_, index) => ({
      requirementKey: `furniture:item-${index}:0`,
      displayLabel: `Item ${index + 1}`,
      concept: index === 0 ? "sofa" : undefined,
    }));
    const ready = requiredPlanItems.slice(0, MAX_PRODUCT_DISCOVERY_ITEMS).map((item) => item.requirementKey);
    const leftover = requiredPlanItems.slice(MAX_PRODUCT_DISCOVERY_ITEMS);
    const gate = evaluateCompleteRoomReadiness({
      searchedItemCount: MAX_PRODUCT_DISCOVERY_ITEMS,
      readyRequirementKeys: ready,
      unmatched: leftover.map((item) => ({
        requirementKey: item.requirementKey,
        requirementType: "furniture" as const,
        itemSpec: item.displayLabel,
        displayLabel: item.displayLabel,
        reason: "not_searched" as const,
      })),
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
      requiredPlanItems,
    });
    expect(leftover).toHaveLength(2);
    expect(leftover.map((item) => item.requirementKey)).toEqual([
      "furniture:item-10:0",
      "furniture:item-11:0",
    ]);
    expect(gate.allowed).toBe(false);
    expect(gate.readySlots).toBe(MAX_PRODUCT_DISCOVERY_ITEMS);
    expect(gate.requiredSlots).toBe(12);
    expect(gate.unresolvedLabels.join(" ")).toMatch(/Item 11|Item 12/);
  });

  it("fills the next discovery batch from leftover required items after 10 READY locks", () => {
    const allRequired = Array.from({ length: 12 }, (_, index) => ({
      requirementKey: `furniture:item-${index}:0`,
    }));
    const locked = allRequired.slice(0, MAX_PRODUCT_DISCOVERY_ITEMS).map((item) => item.requirementKey);
    const first = nextDiscoverySearchBatch(allRequired, {
      priorSelectionKeys: [],
      lockedKeys: [],
      limit: MAX_PRODUCT_DISCOVERY_ITEMS,
    });
    expect(first.searched).toHaveLength(MAX_PRODUCT_DISCOVERY_ITEMS);
    expect(first.notSearched.map((item) => item.requirementKey)).toEqual([
      "furniture:item-10:0",
      "furniture:item-11:0",
    ]);
    const second = nextDiscoverySearchBatch(allRequired, {
      priorSelectionKeys: locked,
      lockedKeys: locked,
      limit: MAX_PRODUCT_DISCOVERY_ITEMS,
    });
    expect(second.searched.map((item) => item.requirementKey)).toEqual([
      "furniture:item-10:0",
      "furniture:item-11:0",
    ]);
    expect(second.notSearched).toEqual([]);
    expect(
      resolveMixedDiscoveryMode({
        searchedCount: second.searched.length,
        searchableCount: second.searched.length,
        lockedCount: locked.length,
        hasPriorDiscovery: true,
      })
    ).toBe("append");
  });
});

describe("approved-product preservation", () => {
  it("keeps mixed discovery in append mode and does not bypass the approval gate", () => {
    expect(
      resolveMixedDiscoveryMode({
        searchedCount: 4,
        searchableCount: 2,
        lockedCount: 4,
        hasPriorDiscovery: true,
      })
    ).toBe("append");
    const locked = [
      {
        requirementKey: "furniture:sofa:0",
        productUrl: "https://example/sofa",
        referenceStatus: "ready",
        requirementType: "furniture" as const,
        isConfirmed: true,
        productTitle: "Taremo II",
      },
      {
        requirementKey: "furniture:coffee-table:0",
        productUrl: "https://example/table",
        referenceStatus: "ready",
        requirementType: "furniture" as const,
        isConfirmed: true,
        productTitle: "Rutar coffee table",
      },
    ] as ProductSelectionView[];
    expect(locked.every(isLockedApprovedSelection)).toBe(true);
    const need = requirementsNeedingSearch(
      [{ requirementKey: "furniture:sofa:0" }, { requirementKey: "furniture:curtains:0" }],
      { priorSelectionKeys: lockedApprovedRequirementKeys(locked) }
    );
    expect(need.map((item) => item.requirementKey)).toEqual(["furniture:curtains:0"]);
    expect(productApprovalGate(locked).allowed).toBe(true);
    expect(
      productApprovalGate(
        locked.map((item) => ({ ...item, isConfirmed: false }))
      ).allowed
    ).toBe(false);
  });
});

describe("design brief generate gate", () => {
  it("blocks incomplete new-project briefs and allows completed briefs", () => {
    const empty = parseDesignBriefAnswers({});
    expect(isEmptyDesignBrief(empty)).toBe(true);
    expect(designBriefGenerateGate(empty).allowed).toBe(false);
    expect(designBriefGenerateGate(empty, { hasSucceededRender: true }).allowed).toBe(true);
    expect(designBriefGenerateGate(empty, { hasSucceededRender: true }).legacy).toBe(true);

    const started = {
      ...empty,
      currentQuestionId: "living.use",
    };
    expect(designBriefGenerateGate(started).allowed).toBe(false);
    expect(designBriefGenerateGate(started, { hasSucceededRender: true }).allowed).toBe(false);

    const completed = markBriefComplete(started);
    expect(designBriefGenerateGate(completed).allowed).toBe(true);
    expect(designBriefBlockMessage()).toBe("Complete Design Brief before generating a design.");
  });

  it("does not rewrite empty legacy briefs", () => {
    const empty = parseDesignBriefAnswers(null);
    expect(empty.completed).toBe(false);
    expect(Object.keys(empty.answers)).toEqual([]);
    const allowedLegacy = designBriefGenerateGate(empty, { hasSucceededRender: true });
    expect(allowedLegacy).toEqual({ allowed: true, legacy: true });
    expect(empty).toEqual(parseDesignBriefAnswers(null));
  });
});

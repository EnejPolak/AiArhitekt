import type { ProductConcept } from "@/lib/discovery/locales/types";
import type { BriefPlannerIntent } from "@/lib/design-brief/apply";
import type { CompletenessCategory, CompletenessDecision } from "./completeInterior";

type EvalSpec = {
  concept: ProductConcept;
  category: string;
  evaluate: (has: (concept: ProductConcept) => boolean, brief?: BriefPlannerIntent | null) => CompletenessDecision;
  rationale: (decision: CompletenessDecision) => string;
};

function presentOr(has: (c: ProductConcept) => boolean, concept: ProductConcept, fallback: CompletenessDecision): CompletenessDecision {
  return has(concept) ? "required_present" : fallback;
}

export function overlayBriefDecision(
  item: CompletenessCategory,
  brief?: BriefPlannerIntent | null
): CompletenessCategory {
  if (!brief) return item;
  const intent = brief.concepts[item.concept];
  if (!intent) return item;
  if (item.decision === "required_present" && intent !== "exclude") return item;
  if (intent === "exclude") {
    return { ...item, decision: "not_appropriate", rationale: "You excluded this from the Design Brief." };
  }
  if (intent === "already_have") {
    return { ...item, decision: "satisfied_existing", rationale: "You already have this; it will not be searched." };
  }
  if (intent === "needs_preference") {
    return { ...item, decision: "needs_preference", rationale: item.rationale };
  }
  if (intent === "required" && item.decision !== "required_present") {
    return { ...item, decision: "required", rationale: "Required from your Design Brief." };
  }
  if (intent === "suggested" && item.decision !== "required" && item.decision !== "required_present") {
    return { ...item, decision: "suggested", rationale: "Suggested from your Design Brief, not a mandatory purchase." };
  }
  if (intent === "ai_decide" && (item.decision === "needs_preference" || item.decision === "not_appropriate")) {
    return { ...item, decision: "suggested", rationale: "You asked the designer to decide. This stays a suggestion until you approve a product." };
  }
  return item;
}

const BEDROOM: EvalSpec[] = [
  {
    concept: "bed",
    category: "bed",
    evaluate: (has) => presentOr(has, "bed", "required"),
    rationale: (d) => (d === "required_present" ? "A bed is already planned." : "A bedroom needs a bed unless you already have one."),
  },
  {
    concept: "bedside",
    category: "bedside table",
    evaluate: (has) => presentOr(has, "bedside", "required"),
    rationale: (d) => (d === "required_present" ? "Bedside storage is planned." : "A bedside surface keeps circulation usable around the bed."),
  },
  {
    concept: "wardrobe",
    category: "wardrobe",
    evaluate: (has) => presentOr(has, "wardrobe", "suggested"),
    rationale: (d) =>
      d === "required_present"
        ? "Wardrobe storage is planned."
        : "Freestanding wardrobe storage is recommended when no built-in is being kept.",
  },
  {
    concept: "ceiling_light",
    category: "ceiling light fixture",
    evaluate: (has) => presentOr(has, "ceiling_light", "required"),
    rationale: (d) => (d === "required_present" ? "Ceiling lighting is planned." : "A bedroom needs general lighting."),
  },
  {
    concept: "table_lamp",
    category: "bedside lamp",
    evaluate: (has) => presentOr(has, "table_lamp", "suggested"),
    rationale: () => "Lighting on both sides of the bed is recommended for evening use.",
  },
  {
    concept: "window_treatment",
    category: "window treatment",
    evaluate: (has) => presentOr(has, "window_treatment", "required"),
    rationale: () => "Blackout or dim-out curtains support sleep when windows exist.",
  },
  {
    concept: "reading_chair",
    category: "reading chair",
    evaluate: (has) => presentOr(has, "reading_chair", "suggested"),
    rationale: () => "A reading chair is optional unless you asked for a reading corner.",
  },
  {
    concept: "storage",
    category: "storage",
    evaluate: (has) => presentOr(has, "storage", "suggested"),
    rationale: () => "Extra closed storage is a design recommendation, not a mandatory purchase.",
  },
];

const KITCHEN: EvalSpec[] = [
  {
    concept: "ceiling_light",
    category: "ceiling light fixture",
    evaluate: (has) => presentOr(has, "ceiling_light", "required"),
    rationale: () => "A kitchen needs even general light. Task lighting does not replace a ceiling point.",
  },
  {
    concept: "pendant_light",
    category: "pendant light",
    evaluate: (has) => presentOr(has, "pendant_light", "suggested"),
    rationale: () => "Pendants over dining or an island are optional until you ask for them.",
  },
  {
    concept: "dining_table",
    category: "dining table",
    evaluate: (has) => presentOr(has, "dining_table", "suggested"),
    rationale: () => "A dining table is used only if this kitchen includes a dining spot.",
  },
  {
    concept: "dining_chair",
    category: "dining chair",
    evaluate: (has) => presentOr(has, "dining_chair", "suggested"),
    rationale: () => "Dining chairs follow the table if dining is wanted.",
  },
  {
    concept: "storage",
    category: "open kitchen storage",
    evaluate: (has) => presentOr(has, "storage", "suggested"),
    rationale: () => "Open shelving can be searched as furniture. Built-in cabinetry is a design proposal, not an invented SKU.",
  },
  {
    concept: "window_treatment",
    category: "window treatment",
    evaluate: (has) => presentOr(has, "window_treatment", "suggested"),
    rationale: () => "Kitchen curtains stay optional unless you ask for them.",
  },
  {
    concept: "other",
    category: "cabinetry and plumbing",
    evaluate: () => "design_proposal",
    rationale: () =>
      "Cabinetry layout, appliance housing, and any plumbing or ventilation change are unverified design proposals requiring professional validation. They are not silent construction work and not invented products.",
  },
];

const BATHROOM: EvalSpec[] = [
  {
    concept: "ceiling_light",
    category: "ceiling light fixture",
    evaluate: (has) => presentOr(has, "ceiling_light", "required"),
    rationale: () => "A bathroom needs general lighting.",
  },
  {
    concept: "wall_light",
    category: "mirror lighting",
    evaluate: (has) => presentOr(has, "wall_light", "suggested"),
    rationale: () => "Mirror lighting is recommended for a vanity, not assumed from an empty photo.",
  },
  {
    concept: "storage",
    category: "bathroom storage",
    evaluate: (has) => presentOr(has, "storage", "suggested"),
    rationale: () => "Vanity or tall storage is a design recommendation unless you already have it.",
  },
  {
    concept: "window_treatment",
    category: "window treatment",
    evaluate: (has) => presentOr(has, "window_treatment", "suggested"),
    rationale: () => "Privacy glazing or a curtain is optional when a window exists.",
  },
  {
    concept: "other",
    category: "sanitary ware and plumbing",
    evaluate: () => "design_proposal",
    rationale: () =>
      "Shower, bathtub, toilet, and drainage stay as photographed unless you later brief a professional. Relocation is not treated as a feasible construction solution here.",
  },
];

function otherSpecs(brief?: BriefPlannerIntent | null): EvalSpec[] {
  const purpose = brief?.customPurpose ?? "custom";
  const functions = new Set(brief?.functions ?? []);
  if (purpose === "office") functions.add("desk");
  if (purpose === "dining") functions.add("dining");
  if (purpose === "child" || purpose === "guest") functions.add("sleep");
  if (purpose === "hallway" || purpose === "utility") functions.add("storage");
  if (purpose === "hobby") {
    functions.add("desk");
    functions.add("storage");
  }
  if (functions.size === 0) functions.add("storage");
  const specs: EvalSpec[] = [
    {
      concept: "ceiling_light",
      category: "ceiling light fixture",
      evaluate: (has) => presentOr(has, "ceiling_light", "required"),
      rationale: () => "This room still needs general lighting.",
    },
  ];
  if (purpose === "office" || functions.has("desk")) {
    specs.push(
      {
        concept: "desk",
        category: "desk",
        evaluate: (has) => presentOr(has, "desk", "required"),
        rationale: () => "A home office needs a desk unless you already have one.",
      },
      {
        concept: "office_chair",
        category: "office chair",
        evaluate: (has) => presentOr(has, "office_chair", "required"),
        rationale: () => "A task chair belongs with the desk.",
      }
    );
  }
  if (purpose === "dining" || functions.has("dining")) {
    specs.push(
      {
        concept: "dining_table",
        category: "dining table",
        evaluate: (has) => presentOr(has, "dining_table", "required"),
        rationale: () => "A dining room needs a table.",
      },
      {
        concept: "dining_chair",
        category: "dining chair",
        evaluate: (has) => presentOr(has, "dining_chair", "required"),
        rationale: () => "Dining chairs belong with the table.",
      }
    );
  }
  if (purpose === "child" || purpose === "guest" || functions.has("sleep")) {
    specs.push({
      concept: "bed",
      category: "bed",
      evaluate: (has) => presentOr(has, "bed", "required"),
      rationale: () => "Sleeping use needs a bed unless you already have one.",
    });
  }
  specs.push({
    concept: "storage",
    category: "storage",
    evaluate: (has) => presentOr(has, "storage", "suggested"),
    rationale: () => "Storage is recommended for this use, not automatically purchased.",
  });
  specs.push({
    concept: "window_treatment",
    category: "window treatment",
    evaluate: (has) => presentOr(has, "window_treatment", "suggested"),
    rationale: () => "Curtains are optional unless you asked for them.",
  });
  return specs;
}

export function completenessSpecsForRoom(
  roomType: string,
  brief?: BriefPlannerIntent | null
): EvalSpec[] {
  if (roomType === "bedroom") return BEDROOM;
  if (roomType === "kitchen") return KITCHEN;
  if (roomType === "bathroom") return BATHROOM;
  if (roomType === "other") return otherSpecs(brief);
  return [];
}

export function evaluateRoomSpecs(
  specs: EvalSpec[],
  has: (concept: ProductConcept) => boolean,
  brief?: BriefPlannerIntent | null
): CompletenessCategory[] {
  return specs.map((item) => {
    const decision = item.evaluate(has, brief);
    return overlayBriefDecision(
      {
        concept: item.concept,
        category: item.category,
        decision,
        rationale: item.rationale(decision),
      },
      brief
    );
  });
}

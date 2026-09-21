import type { DesignRequirements, RoomAnalysisObservation } from "@/lib/analysis/schema";
import type { UnmatchedRequirement } from "@/lib/discovery/itemSpecs";
import type { ProductSelectionView } from "@/lib/discovery/types";
import {
  isArchitecturalFinishReference,
  resolveArchitecturalFinishes,
  type ArchitecturalFinishes,
  type FloorFinishDecision,
  type WallFinishDecision,
} from "./finishes";
import { resolveRenderIntentFromFinishes, type RenderIntent } from "./intent";
import {
  toExpectedRenderInventory,
  type ExpectedRenderInventoryItem,
} from "./inventory";
import { verifiedProductAppearance } from "./productFacts";
import type { OrderedRenderReference } from "./order";
import type { RoomRenderPreferences } from "./preferences";
import { canonicalRenderPreferences } from "./preferences";
import { buildRenderHonestyReport, type RenderHonestyReport } from "./report";

export type RenderPromptSnapshot = {
  schemaVersion: 2;
  renderIntent: RenderIntent;
  expectedRenderInventory: ExpectedRenderInventoryItem[];
  architecturalFinishes: ArchitecturalFinishes;
  renderReport: RenderHonestyReport;
  prompt: string;
  imageMapping: Array<{
    imageIndex: number;
    role: "original_room" | "product_reference" | "finish_reference";
    selectionId: string | null;
    requirementKey: string | null;
    requirementType: "furniture" | "material" | null;
    productTitle: string | null;
  }>;
};

export type BuildRenderPromptInput = {
  observation: RoomAnalysisObservation;
  designRequirements: DesignRequirements;
  unmatchedRequirements: UnmatchedRequirement[];
  ungroundedSelections?: ProductSelectionView[];
  preferences: RoomRenderPreferences;
  references: OrderedRenderReference[];
};

function joinNotes(notes: string[]): string {
  return notes.filter(Boolean).join("; ");
}

function requirementLabel(item: OrderedRenderReference): string {
  const snap = item.selection.requirementSnapshot as { category?: unknown; surface?: unknown } | null;
  if (snap && typeof snap.category === "string") {
    if (item.selection.requirementType === "material" && typeof snap.surface === "string") {
      return `${snap.surface} (${snap.category})`;
    }
    return snap.category;
  }
  return item.selection.itemSpec;
}

function letterForIndex(imageIndex: number): string {
  const code = 64 + imageIndex;
  if (code < 65 || code > 90) return String(imageIndex);
  return String.fromCharCode(code);
}

function persistedRequirementNotes(snapshot: unknown): string[] {
  if (!snapshot || typeof snapshot !== "object") return [];
  const record = snapshot as Record<string, unknown>;
  const notes: string[] = [];
  if (typeof record.placementNotes === "string" && record.placementNotes.trim()) {
    notes.push(`Placement note: ${record.placementNotes.trim()}`);
  }
  if (typeof record.finishDirection === "string" && record.finishDirection.trim()) {
    notes.push(`Finish direction: ${record.finishDirection.trim()}`);
  }
  if (Array.isArray(record.constraints)) {
    const constraints = record.constraints
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .join("; ");
    if (constraints) notes.push(`Requirement constraints: ${constraints}`);
  }
  return notes;
}

function observedList(label: string, values: string[]): string | null {
  const cleaned = values.map((item) => item.trim()).filter(Boolean);
  if (cleaned.length === 0) return null;
  return `${label}: ${cleaned.join("; ")}`;
}

function roomAuthoritySection(input: {
  observation: RoomAnalysisObservation;
  designRequirements: DesignRequirements;
  preferences: RoomRenderPreferences;
  renderIntent: RenderIntent;
}): string {
  const architecture = [
    observedList("Walls", input.observation.architecture.walls),
    input.observation.architecture.floor
      ? `Floor: ${input.observation.architecture.floor}`
      : null,
    observedList("Windows", input.observation.architecture.windows),
    observedList("Doors", input.observation.architecture.doors),
    observedList("Fixed elements", input.observation.architecture.fixedElements),
    input.observation.visualCondition.overall
      ? `Visual condition: ${input.observation.visualCondition.overall}`
      : null,
    observedList("Observed colors", input.observation.visualCondition.colors),
    input.observation.visualCondition.lighting
      ? `Lighting: ${input.observation.visualCondition.lighting}`
      : null,
  ].filter((line): line is string => Boolean(line));

  const preserve = joinNotes([
    ...input.observation.preserve,
    ...input.designRequirements.preserve,
  ]);
  const replace = joinNotes([
    ...input.observation.replaceOrRemove,
    ...input.designRequirements.replaceOrRemove,
  ]);
  const constraints = joinNotes([
    ...input.observation.constraints,
    ...input.designRequirements.constraints,
  ]);

  const modeLines =
    input.renderIntent === "furnish_only"
      ? [
          "Render mode: FURNISH_ONLY.",
          "Preserve the existing architectural surfaces exactly as photographed: walls, floor finish, ceiling, windows, doors, raw/unfinished state, materials, and surface condition.",
          "Do not paint, plaster, refinish, or complete unfinished walls, floors, or ceilings.",
          "Do not replace flooring or invent a finished interior.",
          "Only add the referenced inventory products. Leave remaining space empty.",
        ]
      : [
          "Render mode: COMPLETE_INTERIOR.",
          "Preserve room geometry: camera, perspective, wall planes, windows, doors, floor geometry, ceiling plane, and room proportions.",
          "Change architectural surfaces only as listed in ARCHITECTURAL FINISHES. Do not invent other finishes.",
          "Preserve the photographed ceiling unless a grounded ceiling finish is listed.",
          "Lighting treatment means ambient light on existing fixtures and surfaces, not adding lamps or other purchasable lighting unless listed in the physical object inventory.",
          "Do not move, add, or remove windows, doors, or structural openings.",
        ];

  return [
    "ROOM AUTHORITY",
    "IMAGE A (Image 1) is the customer's real empty or unfinished room and is the spatial source.",
    "Preserve this room's architecture, perspective and camera position: walls, windows, doors, floor, ceiling, room proportions, and major structural geometry.",
    ...modeLines,
    ...architecture.map((line) => `Observed: ${line}.`),
    preserve ? `Preserve: ${preserve}.` : "Preserve existing architecture and any elements marked to keep.",
    replace
      ? `Replace or remove only: ${replace}. If a listed replacement has no referenced inventory product, leave the existing object as photographed or leave the space empty. Do not invent a substitute.`
      : "Do not remove architecture. Replace only elements covered by supplied product references.",
    constraints ? `Constraints: ${constraints}.` : "",
    input.preferences.underfloorHeating
      ? "Underfloor heating is requested; do not show bulky radiators as a replacement heating system unless already present as fixed architecture."
      : "",
  ]
    .filter((line) => line.trim().length > 0)
    .join("\n");
}

function physicalObjectInventorySection(
  references: OrderedRenderReference[],
  inventory: ExpectedRenderInventoryItem[]
): string {
  const productRefs = references.filter((item) => !isArchitecturalFinishReference(item));
  const productInventory = inventory.filter((item) =>
    productRefs.some((ref) => ref.selection.id === item.selectionId)
  );
  const productBlocks = productRefs.map((item) => {
    const kind = item.selection.requirementType === "material" ? "material/surface" : "furniture";
    const letter = letterForIndex(item.imageIndex);
    const appearance = verifiedProductAppearance(item.selection.requirementSnapshot);
    const row = productInventory.find((entry) => entry.selectionId === item.selection.id);
    const verifiedFacts = [
      appearance.material ? `Known material: ${appearance.material}.` : null,
      appearance.color ? `Known color: ${appearance.color}.` : null,
      appearance.dimensions ? `Known dimensions: ${appearance.dimensions}.` : null,
      ...persistedRequirementNotes(item.selection.requirementSnapshot),
    ].filter((line): line is string => Boolean(line));

    return [
      `IMAGE ${letter} (Image ${item.imageIndex}) is the exact selected ${kind} reference: ${item.selection.productTitle} (${requirementLabel(item)}).`,
      `Role: REFERENCE-GROUNDED PRODUCT.`,
      `Product name: ${item.selection.productTitle}.`,
      `Category: ${requirementLabel(item)}.`,
      `Reference image index: ${item.imageIndex}.`,
      row ? `Inventory selection: ${row.selectionId}.` : "",
      ...verifiedFacts,
      "The supplied product reference image is authoritative for this product's identity.",
      "Preserve as closely as possible its silhouette, proportions, component layout, doors/drawers/openings, handles/pulls, legs/base, shelf configuration, material, color, and distinctive construction details.",
      "If the reference shows a sliding panel, do not convert it into a drawer, hinged door, or open shelf.",
      "Do not redesign product internals. Do not change doors, drawers, shelves, openings, handles, or construction details.",
      "You may change only viewpoint relative to the camera, perspective, physical placement, apparent scale appropriate for the room, orientation, lighting/shadows, and partial occlusion.",
      "Do not replace this referenced item with a stylistically similar but materially different invented product.",
    ]
      .filter((line) => line.trim().length > 0)
      .join("\n");
  });

  const names =
    productInventory.length > 0
      ? productInventory
          .map((item) => `${item.productName} (${item.category}, Image ${item.referenceImageIndex})`)
          .join("; ")
      : "none";

  return [
    "PHYSICAL OBJECT INVENTORY",
    "The only new physical furniture, decor, accessories, plants, lighting, textiles or other purchasable objects you may introduce into this room are the supplied referenced products listed below.",
    "Do not invent additional furniture or decor.",
    "Do not add placeholder objects.",
    "Do not add visually similar substitutes.",
    "If an area of the room would otherwise remain empty, leave it empty.",
    `Allowed new physical products: ${names}.`,
    "PRODUCT AUTHORITIES",
    "Supplied product reference images are authoritative for product identity.",
    "Furnish IMAGE A using only the specific referenced products below.",
    ...productBlocks,
  ].join("\n");
}

function wallFinishLines(wall: WallFinishDecision): string[] {
  const requested = `Wall finish requestedMode: ${wall.requestedMode}.`;
  const resolved = `Wall finish resolvedMode: ${wall.resolvedMode}.`;
  if (wall.requestedMode === "keep_existing") {
    return [
      requested,
      resolved,
      "Preserve the photographed wall finish, color, and surface condition.",
      "Do not paint, plaster, or invent a wall product.",
    ];
  }
  if (wall.requestedMode === "concept_color") {
    const colors = [
      wall.colorDirection ? `main ${wall.colorDirection}` : null,
      wall.accentColorDirection ? `accent ${wall.accentColorDirection}` : null,
    ]
      .filter(Boolean)
      .join("; ");
    return [
      requested,
      resolved,
      `Apply this approved wall color direction: ${colors || "as specified"}.`,
      "This is a concept-only wall finish, not a shoppable merchant product.",
      "Do not invent a paint SKU, brand, label, or product listing.",
    ];
  }
  if (wall.resolvedMode === "unresolved") {
    return [
      requested,
      resolved,
      "Exact wall paint was requested and is unresolved.",
      "Do not invent a wall paint product. Do not silently fall back to concept color or keep existing.",
    ];
  }
  return [
    requested,
    resolved,
    `IMAGE ${letterForIndex(wall.referenceImageIndex)} (Image ${wall.referenceImageIndex}) is the exact wall finish product: ${wall.productName}.`,
    "Apply that referenced product as the wall surface. Preserve its color, sheen, and material identity.",
    "This wall finish is a grounded shoppable product.",
  ];
}

function floorFinishLines(floor: FloorFinishDecision): string[] {
  const requested = `Floor finish requestedMode: ${floor.requestedMode}.`;
  const resolved = `Floor finish resolvedMode: ${floor.resolvedMode}.`;
  if (floor.requestedMode === "keep_existing") {
    return [
      requested,
      resolved,
      "Preserve the photographed floor finish. Do not replace flooring. Do not invent a floor product.",
    ];
  }
  if (floor.resolvedMode === "unresolved") {
    return [
      requested,
      resolved,
      "A floor change was requested and is unresolved.",
      "Do not invent a floor finish. Do not silently keep the existing floor.",
    ];
  }
  return [
    requested,
    resolved,
    `IMAGE ${letterForIndex(floor.referenceImageIndex)} (Image ${floor.referenceImageIndex}) is the exact floor finish product: ${floor.productName}.`,
    "Apply that referenced product as the floor surface only. Do not invent another floor covering.",
    "This floor finish is a grounded shoppable product.",
  ];
}

function architecturalFinishesSection(finishes: ArchitecturalFinishes): string {
  return [
    "ARCHITECTURAL FINISHES",
    "Architectural finishes are separate from shoppable furniture.",
    "Do not invent extra purchasable furniture or decor to complete the room.",
    ...wallFinishLines(finishes.wall_finish),
    ...floorFinishLines(finishes.floor_finish),
  ].join("\n");
}

function allowedChangesSection(
  preferences: RoomRenderPreferences,
  renderIntent: RenderIntent,
  finishes: ArchitecturalFinishes
): string {
  const styleLine =
    preferences.selectedStyles.length > 0
      ? `User style direction: ${preferences.selectedStyles.join(", ")}. Use style only for arrangement of inventory products and allowed surface treatment. Do not invent extra furniture or decor to match the style.`
      : "No additional named style beyond the supplied product references.";
  const budgetLine = preferences.budgetLevel
    ? `Budget signal for visual density and finish quality: ${preferences.budgetLevel}.`
    : "No budget signal specified.";
  const bedLine =
    preferences.bedType === "none"
      ? "No bed is requested unless a supplied product reference is a bed."
      : `Bed preference: ${preferences.bedType}, only if a supplied bed reference exists. Do not invent a bed SKU.`;

  const finishLines =
    renderIntent === "complete_interior"
      ? [
          "Allowed room-surface changes: only the wall and floor decisions in ARCHITECTURAL FINISHES.",
          finishes.wall_finish.resolvedMode === "keep_existing"
            ? "Keep the existing wall finish."
            : finishes.wall_finish.resolvedMode === "concept_color"
              ? "Wall color may change as a concept direction only."
              : finishes.wall_finish.resolvedMode === "exact_product"
                ? "Walls use the grounded exact wall product."
                : "Exact wall paint is unresolved. Do not invent a wall finish.",
          finishes.floor_finish.resolvedMode === "exact_product"
            ? "Floor uses the grounded exact floor product."
            : finishes.floor_finish.resolvedMode === "unresolved"
              ? "Floor change is unresolved. Do not invent a floor covering and do not silently keep the old floor."
              : "Keep the existing floor finish. Do not invent a floor covering.",
        ]
      : [
          "Allowed room changes: add only the referenced inventory products. Leave remaining space empty.",
          "Do not apply wall color or flooring changes; keep photographed surface finishes.",
        ];

  return [
    "ALLOWED CHANGES",
    "Allowed product adaptations only: camera-relative orientation, perspective, physical placement, apparent scale, lighting/shadows, occlusion.",
    ...finishLines,
    styleLine,
    budgetLine,
    bedLine,
    preferences.notes ? `User notes: ${preferences.notes}.` : "",
  ]
    .filter((line) => line.trim().length > 0)
    .join("\n");
}

function forbiddenChangesSection(renderIntent: RenderIntent, finishes: ArchitecturalFinishes): string {
  const surfaceForbidden =
    renderIntent === "furnish_only"
      ? [
          "Do not finish, paint, plaster, or replace unfinished/raw walls, floors, or ceilings.",
          "Do not invent a completed white interior over an unfinished room.",
        ]
      : [
          "Do not change camera, room proportions, or structural openings while completing interior surfaces.",
          finishes.floor_finish.resolvedMode === "exact_product"
            ? "Do not replace the grounded floor product with a different design."
            : finishes.floor_finish.resolvedMode === "unresolved"
              ? "Do not invent a floor finish. Do not silently keep the existing floor."
              : "Do not invent a floor finish.",
          finishes.wall_finish.resolvedMode === "keep_existing"
            ? "Do not invent a wall finish product."
            : finishes.wall_finish.resolvedMode === "concept_color"
              ? "Do not present the wall color as a shoppable merchant product."
              : finishes.wall_finish.resolvedMode === "exact_product"
                ? "Do not replace the grounded wall product with a different design."
                : "Do not invent a wall paint product. Do not silently fall back to concept color.",
        ];

  return [
    "FORBIDDEN CHANGES",
    "Do not invent architectural changes unless an explicit renovation requirement above says otherwise.",
    ...surfaceForbidden,
    "Do not change a grounded product's doors, drawers, shelves, openings, handles/pulls, legs/base, or construction details.",
    "Do not convert a sliding panel into a drawer, hinged door, or open shelf.",
    "Do not redesign product internals.",
    "Do not generate shopping text, prices, URLs, logos as labels, or captions inside the image.",
    "Do not claim pixel-identical photographic identity or exact physical measurements.",
    "Do not invent extra furniture, rugs, lamps, plants, planters, cushions, artwork, books, or other purchasable objects beyond the supplied references.",
    "Do not invent extra major furniture beyond the supplied references.",
  ].join("\n");
}

function existingRoomObjectsSection(): string {
  return [
    "EXISTING ROOM OBJECTS",
    "Objects already visible in IMAGE 1 (the customer's original room) may remain.",
    "They are the customer's possessions, not Ai Arhitekt shopping items.",
    "Do not require merchant links for pre-existing customer possessions.",
    "Do not treat original-room objects as generated shopping products.",
    "The restriction on new physical objects applies only to items introduced by Ai Arhitekt.",
  ].join("\n");
}

function excludedProductsSection(input: {
  unmatchedRequirements: UnmatchedRequirement[];
  ungroundedSelections: ProductSelectionView[];
}): string {
  const unmatched = input.unmatchedRequirements
    .map((item) => `${item.requirementKey} (${item.itemSpec})`)
    .sort((a, b) => a.localeCompare(b));
  const ungrounded = input.ungroundedSelections
    .map((item) => `${item.requirementKey} (${item.itemSpec})`)
    .sort((a, b) => a.localeCompare(b));

  const lines = [
    "EXCLUDED PRODUCTS",
    "There is no invented furniture in a customer render.",
    "Do not introduce sofas, chairs, tables, rugs, lamps, plants, planters, shelves, cabinets, decorative objects, cushions, artwork, books, or purchasable accessories unless they are listed in PHYSICAL OBJECT INVENTORY.",
    "Plants are not an exception. If no plant or planter is in the inventory, do not render a plant or planter.",
    "Architectural finishes follow ARCHITECTURAL FINISHES only. Wall concept color is not a shoppable product. Floor changes require a grounded floor product. Loose physical furniture and decor must always be inventory products.",
  ];

  if (unmatched.length > 0) {
    lines.push(
      `These requirements were NOT_FOUND. Do not introduce them. Leave that area empty: ${unmatched.join(", ")}.`
    );
  } else {
    lines.push("Do not introduce unrelated major furniture that is not in the supplied product references.");
  }

  if (ungrounded.length > 0) {
    lines.push(
      `These selected products have no usable reference image. Do not introduce them. Leave that area empty: ${ungrounded.join(", ")}.`
    );
  }

  return lines.join("\n");
}

export function buildRoomRenderPrompt(input: BuildRenderPromptInput): RenderPromptSnapshot {
  const preferences = canonicalRenderPreferences(input.preferences);
  const architecturalFinishes = resolveArchitecturalFinishes({
    preferences,
    references: input.references,
  });
  const renderIntent = resolveRenderIntentFromFinishes(architecturalFinishes);
  const expectedRenderInventory = toExpectedRenderInventory(input.references);
  const renderReport = buildRenderHonestyReport({
    inventory: expectedRenderInventory,
    finishes: architecturalFinishes,
  });
  const mapping: RenderPromptSnapshot["imageMapping"] = [
    {
      imageIndex: 1,
      role: "original_room",
      selectionId: null,
      requirementKey: null,
      requirementType: null,
      productTitle: null,
    },
    ...input.references.map((item) => ({
      imageIndex: item.imageIndex,
      role: isArchitecturalFinishReference(item)
        ? ("finish_reference" as const)
        : ("product_reference" as const),
      selectionId: item.selection.id,
      requirementKey: item.selection.requirementKey,
      requirementType: item.selection.requirementType,
      productTitle: item.selection.productTitle,
    })),
  ];

  const prompt = [
    "This is exact-product reference-grounded rendering of the customer's original room, not generic furniture invention.",
    roomAuthoritySection({
      observation: input.observation,
      designRequirements: input.designRequirements,
      preferences,
      renderIntent,
    }),
    existingRoomObjectsSection(),
    physicalObjectInventorySection(input.references, expectedRenderInventory),
    architecturalFinishesSection(architecturalFinishes),
    allowedChangesSection(preferences, renderIntent, architecturalFinishes),
    forbiddenChangesSection(renderIntent, architecturalFinishes),
    excludedProductsSection({
      unmatchedRequirements: input.unmatchedRequirements,
      ungroundedSelections: input.ungroundedSelections ?? [],
    }),
  ]
    .filter((line) => line.trim().length > 0)
    .join("\n\n");

  return {
    schemaVersion: 2,
    renderIntent,
    expectedRenderInventory,
    architecturalFinishes,
    renderReport,
    prompt,
    imageMapping: mapping,
  };
}

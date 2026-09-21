import type { ExpectedRenderInventoryItem } from "./inventory";
import type { ArchitecturalFinishes, FinishGrounding, FinishResolvedMode, FloorFinishMode, WallFinishMode } from "./finishes";
import {
  architecturalFinishesFromSnapshot,
  requestedFinishLabel,
  resolvedFinishLabel,
} from "./finishes";
import type { Json } from "@/lib/database.types";
import {
  formatReferenceQualityLabel,
  type ReferenceQualityClass,
} from "@/lib/references/referenceQuality";

export type FinishIntentSummary = {
  surface: "wall_finish" | "floor_finish";
  requestedMode: WallFinishMode | FloorFinishMode;
  resolvedMode: FinishResolvedMode;
  requestedLabel: string;
  resolvedLabel: string;
};

export type ExactVisualizedItem = {
  kind: "shoppable_product" | "exact_finish";
  surface: "wall_finish" | "floor_finish" | null;
  selectionId: string;
  productName: string;
  merchantName: string;
  productUrl: string;
  referenceAssetId: string;
  referenceStatus: "ready";
  referenceQuality: ReferenceQualityClass | null;
  referenceWidth: number | null;
  referenceHeight: number | null;
  referenceSizeBytes: number | null;
  referenceSource: string | null;
  exactProductAssociation: boolean;
};

export type ConceptOnlyFinishChoice = {
  surface: "wall_finish";
  mode: "concept_color";
  shoppable: false;
  colorDirection: string;
  accentColorDirection: string;
};

export type RenderHonestyReport = {
  productsToBuy: ExpectedRenderInventoryItem[];
  finishDecisions: ArchitecturalFinishes;
  finishIntent: {
    wall_finish: FinishIntentSummary;
    floor_finish: FinishIntentSummary;
  };
  exactVisualizedItems: ExactVisualizedItem[];
  conceptOnlyFinishChoices: ConceptOnlyFinishChoice[];
};

function finishIntentSummary(
  surface: "wall_finish" | "floor_finish",
  requestedMode: WallFinishMode | FloorFinishMode,
  resolvedMode: FinishResolvedMode
): FinishIntentSummary {
  return {
    surface,
    requestedMode,
    resolvedMode,
    requestedLabel: requestedFinishLabel(surface, requestedMode),
    resolvedLabel: resolvedFinishLabel(resolvedMode),
  };
}

function groundingAsInventory(
  grounding: FinishGrounding,
  category: string,
  inventory: ExpectedRenderInventoryItem[]
): ExpectedRenderInventoryItem {
  const fromInventory = inventory.find((item) => item.selectionId === grounding.selectionId);
  return {
    selectionId: grounding.selectionId,
    requirementId: grounding.requirementKey,
    productName: grounding.productName,
    merchantName: grounding.merchantName,
    productUrl: grounding.productUrl,
    price: fromInventory?.price ?? null,
    currency: fromInventory?.currency ?? null,
    referenceAssetId: grounding.referenceAssetId,
    referenceStatus: "ready",
    referenceImageIndex: grounding.referenceImageIndex,
    category: fromInventory?.category ?? category,
    referenceQuality: fromInventory?.referenceQuality ?? null,
    referenceWidth: fromInventory?.referenceWidth ?? null,
    referenceHeight: fromInventory?.referenceHeight ?? null,
    referenceSizeBytes: fromInventory?.referenceSizeBytes ?? null,
    referenceSource: fromInventory?.referenceSource ?? null,
    exactProductAssociation: fromInventory?.exactProductAssociation !== false,
  };
}

function visualizedFromInventory(
  item: ExpectedRenderInventoryItem,
  kind: ExactVisualizedItem["kind"],
  surface: ExactVisualizedItem["surface"]
): ExactVisualizedItem {
  return {
    kind,
    surface,
    selectionId: item.selectionId,
    productName: item.productName,
    merchantName: item.merchantName,
    productUrl: item.productUrl,
    referenceAssetId: item.referenceAssetId,
    referenceStatus: "ready",
    referenceQuality: item.referenceQuality,
    referenceWidth: item.referenceWidth,
    referenceHeight: item.referenceHeight,
    referenceSizeBytes: item.referenceSizeBytes,
    referenceSource: item.referenceSource,
    exactProductAssociation: item.exactProductAssociation !== false,
  };
}

export function referenceQualityDiagnostic(item: Pick<
  ExactVisualizedItem,
  "referenceQuality" | "referenceWidth" | "referenceHeight" | "referenceStatus"
>): string[] {
  const lines = [item.referenceStatus === "ready" ? "READY" : item.referenceStatus];
  if (item.referenceQuality) {
    lines.push(`Reference quality: ${formatReferenceQualityLabel(item.referenceQuality)}`);
  }
  if (item.referenceWidth && item.referenceHeight) {
    lines.push(`${item.referenceWidth} × ${item.referenceHeight}`);
  }
  return lines;
}

export function buildRenderHonestyReport(input: {
  inventory: ExpectedRenderInventoryItem[];
  finishes: ArchitecturalFinishes;
}): RenderHonestyReport {
  const finishIds = new Set<string>();
  const finishProducts: ExpectedRenderInventoryItem[] = [];
  const exactVisualizedItems: ExactVisualizedItem[] = [];

  if (input.finishes.wall_finish.resolvedMode === "exact_product") {
    finishIds.add(input.finishes.wall_finish.selectionId);
    const row = groundingAsInventory(input.finishes.wall_finish, "wall finish", input.inventory);
    finishProducts.push(row);
    exactVisualizedItems.push(visualizedFromInventory(row, "exact_finish", "wall_finish"));
  }
  if (input.finishes.floor_finish.resolvedMode === "exact_product") {
    finishIds.add(input.finishes.floor_finish.selectionId);
    const row = groundingAsInventory(input.finishes.floor_finish, "floor finish", input.inventory);
    finishProducts.push(row);
    exactVisualizedItems.push(visualizedFromInventory(row, "exact_finish", "floor_finish"));
  }

  const shoppableProducts = input.inventory.filter((item) => !finishIds.has(item.selectionId));
  for (const item of shoppableProducts) {
    exactVisualizedItems.push(visualizedFromInventory(item, "shoppable_product", null));
  }

  const conceptOnlyFinishChoices: ConceptOnlyFinishChoice[] =
    input.finishes.wall_finish.resolvedMode === "concept_color"
      ? [
          {
            surface: "wall_finish",
            mode: "concept_color",
            shoppable: false,
            colorDirection: input.finishes.wall_finish.colorDirection,
            accentColorDirection: input.finishes.wall_finish.accentColorDirection,
          },
        ]
      : [];

  return {
    productsToBuy: [...shoppableProducts, ...finishProducts],
    finishDecisions: input.finishes,
    finishIntent: {
      wall_finish: finishIntentSummary(
        "wall_finish",
        input.finishes.wall_finish.requestedMode,
        input.finishes.wall_finish.resolvedMode
      ),
      floor_finish: finishIntentSummary(
        "floor_finish",
        input.finishes.floor_finish.requestedMode,
        input.finishes.floor_finish.resolvedMode
      ),
    },
    exactVisualizedItems,
    conceptOnlyFinishChoices,
  };
}

export function renderHonestyReportFromSnapshot(
  promptSnapshot: { renderReport?: unknown; architecturalFinishes?: unknown } | Json | null | undefined
): RenderHonestyReport | null {
  if (!promptSnapshot || typeof promptSnapshot !== "object" || Array.isArray(promptSnapshot)) {
    return null;
  }
  const record = promptSnapshot as { renderReport?: unknown };
  const raw = record.renderReport;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const report = raw as Partial<RenderHonestyReport>;
  const finishes = architecturalFinishesFromSnapshot(promptSnapshot);
  if (!finishes) return null;
  if (!Array.isArray(report.productsToBuy) || !Array.isArray(report.exactVisualizedItems)) return null;
  if (!Array.isArray(report.conceptOnlyFinishChoices)) return null;
  const honesty = buildRenderHonestyReport({
    inventory: report.productsToBuy as ExpectedRenderInventoryItem[],
    finishes,
  });
  return {
    productsToBuy: report.productsToBuy as ExpectedRenderInventoryItem[],
    finishDecisions: finishes,
    finishIntent: honesty.finishIntent,
    exactVisualizedItems: report.exactVisualizedItems as ExactVisualizedItem[],
    conceptOnlyFinishChoices: report.conceptOnlyFinishChoices as ConceptOnlyFinishChoice[],
  };
}

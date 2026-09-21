import { isFloorMaterialNeed } from "@/lib/discovery/floorMaterial";
import { isWallPaintMaterial, type MaterialNeed } from "@/lib/discovery/itemSpecs";
import type { OrderedRenderReference } from "./order";
import type { RoomRenderPreferences } from "./preferences";
import { canonicalRenderPreferences } from "./preferences";

export const WALL_FINISH_MODES = ["keep_existing", "concept_color", "exact_product"] as const;
export const FLOOR_FINISH_MODES = ["keep_existing", "exact_product"] as const;
export const FINISH_RESOLVED_MODES = [
  "keep_existing",
  "concept_color",
  "exact_product",
  "unresolved",
] as const;

export type WallFinishMode = (typeof WALL_FINISH_MODES)[number];
export type FloorFinishMode = (typeof FLOOR_FINISH_MODES)[number];
export type FinishResolvedMode = (typeof FINISH_RESOLVED_MODES)[number];

export type FinishGrounding = {
  selectionId: string;
  requirementKey: string;
  productName: string;
  merchantName: string;
  productUrl: string;
  referenceAssetId: string;
  referenceImageIndex: number;
  referenceStatus: "ready";
};

type FinishBase<Surface extends string, Requested extends string> = {
  surface: Surface;
  requestedMode: Requested;
  resolvedMode: Requested | "unresolved";
};

export type WallFinishDecision =
  | (FinishBase<"wall_finish", "keep_existing"> & {
      requestedMode: "keep_existing";
      resolvedMode: "keep_existing";
      shoppable: false;
    })
  | (FinishBase<"wall_finish", "concept_color"> & {
      requestedMode: "concept_color";
      resolvedMode: "concept_color";
      shoppable: false;
      colorDirection: string;
      accentColorDirection: string;
    })
  | (FinishBase<"wall_finish", "exact_product"> & {
      requestedMode: "exact_product";
      resolvedMode: "exact_product";
      shoppable: true;
    } & FinishGrounding)
  | (FinishBase<"wall_finish", "exact_product"> & {
      requestedMode: "exact_product";
      resolvedMode: "unresolved";
      shoppable: true;
    });

export type FloorFinishDecision =
  | (FinishBase<"floor_finish", "keep_existing"> & {
      requestedMode: "keep_existing";
      resolvedMode: "keep_existing";
      shoppable: false;
    })
  | (FinishBase<"floor_finish", "exact_product"> & {
      requestedMode: "exact_product";
      resolvedMode: "exact_product";
      shoppable: true;
    } & FinishGrounding)
  | (FinishBase<"floor_finish", "exact_product"> & {
      requestedMode: "exact_product";
      resolvedMode: "unresolved";
      shoppable: true;
    });

export type ArchitecturalFinishes = {
  wall_finish: WallFinishDecision;
  floor_finish: FloorFinishDecision;
};

export type RequiredExactFinishSlot = {
  surface: "wall_finish" | "floor_finish";
  requestedMode: "exact_product";
  label: string;
  resolved: boolean;
};

function stringField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value.trim() : "";
}

export function materialNeedFromSelection(snapshot: unknown, itemSpec: string): MaterialNeed | null {
  const record = snapshot && typeof snapshot === "object" ? (snapshot as Record<string, unknown>) : {};
  const category = stringField(record, "category") || itemSpec.trim();
  if (!category) return null;
  const constraints = Array.isArray(record.constraints)
    ? record.constraints.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
  return {
    surface: stringField(record, "surface") || "unknown",
    category,
    finishDirection: stringField(record, "finishDirection") || null,
    constraints,
  };
}

export function isWallFinishRequirementKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return (
    normalized.includes("material:wall") ||
    normalized.includes("interior-wall-paint") ||
    normalized.includes("wall_paint")
  );
}

export function isFloorFinishRequirementKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return normalized.includes("material:floor") || normalized.includes("user-flooring");
}

export function isWallFinishReference(item: OrderedRenderReference): boolean {
  if (item.selection.requirementType !== "material") return false;
  if (isWallFinishRequirementKey(item.selection.requirementKey)) return true;
  const need = materialNeedFromSelection(item.selection.requirementSnapshot, item.selection.itemSpec);
  if (need && isWallPaintMaterial(need)) return true;
  const blob = `${item.selection.itemSpec} ${item.selection.requirementKey}`;
  return /\bwall\b/.test(blob) && /paint|barv|premaz/.test(blob);
}

export function isFloorFinishReference(item: OrderedRenderReference): boolean {
  if (item.selection.requirementType !== "material") return false;
  if (isFloorFinishRequirementKey(item.selection.requirementKey)) return true;
  const need = materialNeedFromSelection(item.selection.requirementSnapshot, item.selection.itemSpec);
  return need
    ? isFloorMaterialNeed(need)
    : /\bfloor|\bflooring/.test(`${item.selection.itemSpec} ${item.selection.requirementKey}`);
}

export function isArchitecturalFinishReference(item: OrderedRenderReference): boolean {
  return isWallFinishReference(item) || isFloorFinishReference(item);
}

export function requestedWallFinishMode(preferences: RoomRenderPreferences): WallFinishMode {
  return canonicalRenderPreferences(preferences).wallFinishMode;
}

export function requestedFloorFinishMode(
  preferences: RoomRenderPreferences
): FloorFinishMode {
  return canonicalRenderPreferences(preferences).flooring === "keep" ? "keep_existing" : "exact_product";
}

export { keepExistingWallsFromWallFinishMode, inferWallFinishMode } from "./preferences";

export function requestedFinishLabel(
  surface: "wall_finish" | "floor_finish",
  requestedMode: WallFinishMode | FloorFinishMode
): string {
  if (surface === "floor_finish") {
    return requestedMode === "keep_existing" ? "Keep existing" : "Change floor";
  }
  if (requestedMode === "keep_existing") return "Keep existing";
  if (requestedMode === "concept_color") return "Choose color";
  return "Choose exact paint product";
}

export function resolvedFinishLabel(resolvedMode: FinishResolvedMode): string {
  if (resolvedMode === "unresolved") return "Unresolved";
  if (resolvedMode === "keep_existing") return "Keep existing";
  if (resolvedMode === "concept_color") return "Concept color";
  return "Exact product";
}

function groundingFromReference(item: OrderedRenderReference): FinishGrounding {
  return {
    selectionId: item.selection.id,
    requirementKey: item.selection.requirementKey,
    productName: item.selection.productTitle,
    merchantName: item.selection.retailerName ?? item.selection.retailerDomain,
    productUrl: item.selection.productUrl,
    referenceAssetId: item.asset.id,
    referenceImageIndex: item.imageIndex,
    referenceStatus: "ready",
  };
}

function firstMatch(
  references: OrderedRenderReference[],
  match: (item: OrderedRenderReference) => boolean
): OrderedRenderReference | undefined {
  return references.find(match);
}

export function resolveWallFinish(input: {
  preferences: RoomRenderPreferences;
  references: OrderedRenderReference[];
}): WallFinishDecision {
  const preferences = canonicalRenderPreferences(input.preferences);
  const requestedMode = requestedWallFinishMode(preferences);
  if (requestedMode === "keep_existing") {
    return {
      surface: "wall_finish",
      requestedMode: "keep_existing",
      resolvedMode: "keep_existing",
      shoppable: false,
    };
  }
  if (requestedMode === "concept_color") {
    return {
      surface: "wall_finish",
      requestedMode: "concept_color",
      resolvedMode: "concept_color",
      shoppable: false,
      colorDirection: preferences.wallMainColor.trim(),
      accentColorDirection: preferences.wallAccentColor.trim(),
    };
  }
  const grounded = firstMatch(input.references, isWallFinishReference);
  if (grounded) {
    return {
      surface: "wall_finish",
      requestedMode: "exact_product",
      resolvedMode: "exact_product",
      shoppable: true,
      ...groundingFromReference(grounded),
    };
  }
  return {
    surface: "wall_finish",
    requestedMode: "exact_product",
    resolvedMode: "unresolved",
    shoppable: true,
  };
}

export function resolveFloorFinish(input: {
  preferences: RoomRenderPreferences;
  references: OrderedRenderReference[];
}): FloorFinishDecision {
  const preferences = canonicalRenderPreferences(input.preferences);
  const requestedMode = requestedFloorFinishMode(preferences);
  if (requestedMode === "keep_existing") {
    return {
      surface: "floor_finish",
      requestedMode: "keep_existing",
      resolvedMode: "keep_existing",
      shoppable: false,
    };
  }
  const grounded = firstMatch(input.references, isFloorFinishReference);
  if (grounded) {
    return {
      surface: "floor_finish",
      requestedMode: "exact_product",
      resolvedMode: "exact_product",
      shoppable: true,
      ...groundingFromReference(grounded),
    };
  }
  return {
    surface: "floor_finish",
    requestedMode: "exact_product",
    resolvedMode: "unresolved",
    shoppable: true,
  };
}

export function resolveArchitecturalFinishes(input: {
  preferences: RoomRenderPreferences;
  references: OrderedRenderReference[];
}): ArchitecturalFinishes {
  return {
    wall_finish: resolveWallFinish(input),
    floor_finish: resolveFloorFinish(input),
  };
}

export function finishesAllowSurfaceChange(finishes: ArchitecturalFinishes): boolean {
  return (
    finishes.wall_finish.resolvedMode === "concept_color" ||
    finishes.wall_finish.resolvedMode === "exact_product" ||
    finishes.floor_finish.resolvedMode === "exact_product"
  );
}

export function finishHasUnresolvedRequiredChange(finishes: ArchitecturalFinishes): boolean {
  return (
    finishes.wall_finish.resolvedMode === "unresolved" ||
    finishes.floor_finish.resolvedMode === "unresolved"
  );
}

export function requiredExactFinishSlots(input: {
  preferences: RoomRenderPreferences;
  readyRequirementKeys: string[];
}): RequiredExactFinishSlot[] {
  const preferences = canonicalRenderPreferences(input.preferences);
  const slots: RequiredExactFinishSlot[] = [];
  if (requestedWallFinishMode(preferences) === "exact_product") {
    slots.push({
      surface: "wall_finish",
      requestedMode: "exact_product",
      label: "Exact wall paint",
      resolved: input.readyRequirementKeys.some(isWallFinishRequirementKey),
    });
  }
  if (requestedFloorFinishMode(preferences) === "exact_product") {
    slots.push({
      surface: "floor_finish",
      requestedMode: "exact_product",
      label: "Floor change",
      resolved: input.readyRequirementKeys.some(isFloorFinishRequirementKey),
    });
  }
  return slots;
}

export function architecturalFinishesFromSnapshot(value: unknown): ArchitecturalFinishes | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as { architecturalFinishes?: unknown };
  const raw = record.architecturalFinishes;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const finishes = raw as { wall_finish?: unknown; floor_finish?: unknown };
  const wall = parseWallFinish(finishes.wall_finish);
  const floor = parseFloorFinish(finishes.floor_finish);
  if (!wall || !floor) return null;
  return { wall_finish: wall, floor_finish: floor };
}

function parseGrounding(record: Record<string, unknown>): FinishGrounding | null {
  if (typeof record.selectionId !== "string" || !record.selectionId) return null;
  if (typeof record.requirementKey !== "string") return null;
  if (typeof record.productName !== "string") return null;
  if (typeof record.merchantName !== "string") return null;
  if (typeof record.productUrl !== "string") return null;
  if (typeof record.referenceAssetId !== "string") return null;
  if (typeof record.referenceImageIndex !== "number") return null;
  if (record.referenceStatus !== "ready") return null;
  return {
    selectionId: record.selectionId,
    requirementKey: record.requirementKey,
    productName: record.productName,
    merchantName: record.merchantName,
    productUrl: record.productUrl,
    referenceAssetId: record.referenceAssetId,
    referenceImageIndex: record.referenceImageIndex,
    referenceStatus: "ready",
  };
}

function requestedOf(record: Record<string, unknown>, fallback: string): string {
  return typeof record.requestedMode === "string" ? record.requestedMode : fallback;
}

function resolvedOf(record: Record<string, unknown>, fallback: string): string {
  if (typeof record.resolvedMode === "string") return record.resolvedMode;
  if (typeof record.mode === "string") return record.mode;
  return fallback;
}

function parseWallFinish(value: unknown): WallFinishDecision | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.surface !== "wall_finish") return null;
  const requested = requestedOf(record, typeof record.mode === "string" ? record.mode : "");
  const resolved = resolvedOf(record, requested);
  if (requested === "keep_existing" && resolved === "keep_existing") {
    return {
      surface: "wall_finish",
      requestedMode: "keep_existing",
      resolvedMode: "keep_existing",
      shoppable: false,
    };
  }
  if (requested === "concept_color" && resolved === "concept_color") {
    return {
      surface: "wall_finish",
      requestedMode: "concept_color",
      resolvedMode: "concept_color",
      shoppable: false,
      colorDirection: typeof record.colorDirection === "string" ? record.colorDirection : "",
      accentColorDirection: typeof record.accentColorDirection === "string" ? record.accentColorDirection : "",
    };
  }
  if (requested === "exact_product" && resolved === "unresolved") {
    return {
      surface: "wall_finish",
      requestedMode: "exact_product",
      resolvedMode: "unresolved",
      shoppable: true,
    };
  }
  if (requested === "exact_product" && resolved === "exact_product") {
    const grounded = parseGrounding(record);
    if (!grounded) return null;
    return {
      surface: "wall_finish",
      requestedMode: "exact_product",
      resolvedMode: "exact_product",
      shoppable: true,
      ...grounded,
    };
  }
  return null;
}

function parseFloorFinish(value: unknown): FloorFinishDecision | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.surface !== "floor_finish") return null;
  const requested = requestedOf(record, typeof record.mode === "string" ? record.mode : "");
  const resolved = resolvedOf(record, requested);
  if (requested === "keep_existing" && resolved === "keep_existing") {
    return {
      surface: "floor_finish",
      requestedMode: "keep_existing",
      resolvedMode: "keep_existing",
      shoppable: false,
    };
  }
  if (requested === "exact_product" && resolved === "unresolved") {
    return {
      surface: "floor_finish",
      requestedMode: "exact_product",
      resolvedMode: "unresolved",
      shoppable: true,
    };
  }
  if (requested === "exact_product" && resolved === "exact_product") {
    const grounded = parseGrounding(record);
    if (!grounded) return null;
    return {
      surface: "floor_finish",
      requestedMode: "exact_product",
      resolvedMode: "exact_product",
      shoppable: true,
      ...grounded,
    };
  }
  return null;
}

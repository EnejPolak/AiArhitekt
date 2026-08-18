import { createHash } from "node:crypto";
import { canonicalJson } from "./canonical";
import {
  ROOM_RENDER_MODEL,
  ROOM_RENDER_PROVIDER,
  ROOM_RENDER_SCHEMA_VERSION,
} from "./constants";
import type { RoomRenderPreferences } from "./preferences";
import { canonicalRenderPreferences } from "./preferences";
import type { OrderedRenderReference } from "./order";

export type RenderFingerprintInput = {
  roomUploadId: string;
  roomStoragePath: string;
  analysisId: string;
  analysisUpdatedAt: string;
  discoveryId: string;
  preferences: RoomRenderPreferences;
  references: OrderedRenderReference[];
};

export function buildRenderSourceFingerprint(input: RenderFingerprintInput): string {
  const preferences = canonicalRenderPreferences(input.preferences);
  const confirmedSelectionIds = [...input.references.map((item) => item.selection.id)].sort((a, b) =>
    a.localeCompare(b)
  );
  const referenceHashes = [...input.references]
    .map((item) => ({
      selectionId: item.selection.id,
      sourceHash: item.asset.sourceHash,
    }))
    .sort((a, b) => a.selectionId.localeCompare(b.selectionId));

  const payload = {
    analysisId: input.analysisId,
    analysisUpdatedAt: input.analysisUpdatedAt,
    confirmedSelectionIds,
    discoveryId: input.discoveryId,
    model: ROOM_RENDER_MODEL,
    preferences,
    provider: ROOM_RENDER_PROVIDER,
    referenceHashes,
    roomStoragePath: input.roomStoragePath,
    roomUploadId: input.roomUploadId,
    schemaVersion: ROOM_RENDER_SCHEMA_VERSION,
  };

  return createHash("sha256").update(canonicalJson(payload)).digest("hex");
}

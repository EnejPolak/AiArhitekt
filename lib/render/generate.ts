import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { getProjectRoomAnalysis } from "@/lib/analysis/queries";
import { isCurrentRoomAnalysis } from "@/lib/analysis/stale";
import { type CompleteRoomGate } from "@/lib/discovery/completeRoom";
import { getProjectProductDiscovery, getProjectProductSelections } from "@/lib/discovery/queries";
import {
  canonicalShoppingPreferences,
  furnitureShoppingPreferencesMatch,
  loadStoredShoppingPreferenceSnapshot,
  shoppingPreferencesMatch,
} from "@/lib/discovery/preferences";
import { isCurrentProductDiscovery } from "@/lib/discovery/stale";
import { PROJECT_ASSETS_BUCKET } from "@/lib/references/constants";
import { ensureProductReferenceAssets } from "@/lib/references/ensure";
import { listProjectProductReferenceAssets } from "@/lib/references/queries";
import type { FetchLike } from "@/lib/references/fetchImage";
import type { AddressLookup } from "@/lib/references/ssrf";
import { PROJECT_UPLOADS_BUCKET } from "@/lib/uploads/constants";
import { getRoomPhotoUpload } from "@/lib/uploads/queries";
import { detectImageMime } from "@/lib/uploads/signature";
import { claimRoomRenderSlot } from "./claim";
import { type RoomRenderOutputMimeType } from "./constants";
import { isOpenAiImageRenderEnabled } from "./env";
import { RenderError, renderErrorMessage } from "./errors";
import { buildRenderSourceFingerprint } from "./fingerprint";
import { orderRenderReferences, type OrderedRenderReference } from "./order";
import { editRoomImageWithOpenAI, type RoomImageEditFn, type RoomImageEditFile } from "./openai";
import { buildRoomRenderPath } from "./path";
import { completeRoomRender, failRoomRender, insertProcessingRoomRender } from "./persist";
import { canonicalRenderPreferences, type RoomRenderPreferences } from "./preferences";
import { buildRoomRenderPrompt } from "./prompt";
import { completeRoomBlockMessage, evaluateCompleteRoomReadiness } from "./readiness";
import {
  getLatestSucceededRenderByFingerprint,
  getProcessingRenderByFingerprint,
  promptSnapshotAsJson,
} from "./queries";
import { toReferenceSnapshot, type RoomRenderView } from "./types";
import { validateRenderOutputBytes } from "./validate";

type Client = SupabaseClient<Database>;

function logRenderProviderBudget(event: "reused" | "generated" | "disabled", providerCalls: number) {
  console.info("[room-render]", {
    event,
    openai_image_edit: providerCalls,
    geocode: 0,
    places: 0,
    serp: 0,
    room_analysis: 0,
  });
}

export type GenerateRoomRenderInput = {
  userClient: Client;
  persistClient: Client;
  ownerUserId: string;
  projectId: string;
  preferences: RoomRenderPreferences;
  force?: boolean;
  editImage?: RoomImageEditFn;
  fetch?: FetchLike;
  lookup?: AddressLookup;
};

export type PreparedRenderSource = {
  photo: NonNullable<Awaited<ReturnType<typeof getRoomPhotoUpload>>>;
  analysis: NonNullable<Awaited<ReturnType<typeof getProjectRoomAnalysis>>>;
  discovery: NonNullable<Awaited<ReturnType<typeof getProjectProductDiscovery>>>;
  selections: Awaited<ReturnType<typeof getProjectProductSelections>>;
  confirmed: Awaited<ReturnType<typeof getProjectProductSelections>>;
  ordered: OrderedRenderReference[];
  missing: Array<{ selectionId: string; productTitle: string }>;
  completeRoom: CompleteRoomGate;
  fingerprint: string;
  preferences: RoomRenderPreferences;
};

async function downloadPrivateBytes(
  client: Client,
  bucket: string,
  path: string
): Promise<Uint8Array> {
  const { data, error } = await client.storage.from(bucket).download(path);
  if (error || !data) {
    throw new RenderError("failed", renderErrorMessage("failed"));
  }
  return new Uint8Array(await data.arrayBuffer());
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function shoppingSourceCurrentForRender(
  stored: unknown,
  preferences: RoomRenderPreferences
): boolean {
  if (furnitureShoppingPreferencesMatch(stored, preferences)) return true;
  if (shoppingPreferencesMatch(stored, preferences)) return true;
  const snapshot = loadStoredShoppingPreferenceSnapshot(stored);
  const current = canonicalShoppingPreferences(preferences);
  return (
    JSON.stringify(snapshot.selectedStyles) === JSON.stringify(current.selectedStyles) &&
    snapshot.underfloorHeating === current.underfloorHeating &&
    snapshot.bedType === current.bedType
  );
}

export async function prepareRenderSource(
  userClient: Client,
  projectId: string,
  preferencesInput: RoomRenderPreferences
): Promise<PreparedRenderSource> {
  const preferences = canonicalRenderPreferences(preferencesInput);
  const photo = await getRoomPhotoUpload(userClient, projectId);
  if (!photo) {
    throw new RenderError("missing_photo", renderErrorMessage("missing_photo"));
  }
  const analysis = await getProjectRoomAnalysis(userClient, projectId);
  if (!analysis) {
    throw new RenderError("missing_analysis", renderErrorMessage("missing_analysis"));
  }
  if (!isCurrentRoomAnalysis(analysis, photo)) {
    throw new RenderError("stale_source", renderErrorMessage("stale_source"));
  }
  const discovery = await getProjectProductDiscovery(userClient, projectId);
  if (!discovery) {
    throw new RenderError("missing_discovery", renderErrorMessage("missing_discovery"));
  }
  if (!isCurrentProductDiscovery(discovery, analysis)) {
    throw new RenderError("stale_source", renderErrorMessage("stale_source"));
  }
  if (!shoppingSourceCurrentForRender(discovery.sourcePreferences, preferences)) {
    throw new RenderError("stale_source", renderErrorMessage("stale_source"));
  }

  const selections = await getProjectProductSelections(userClient, discovery.id);
  if (selections.length === 0) {
    throw new RenderError("no_confirmed_products", renderErrorMessage("no_confirmed_products"));
  }

  const assets = await listProjectProductReferenceAssets(userClient, projectId);
  const assetsBySelectionId = new Map(assets.map((asset) => [asset.selectionId, asset]));
  const orderedResult = orderRenderReferences(selections, assetsBySelectionId);
  const missing = orderedResult.missing.map((item) => ({
    selectionId: item.id,
    productTitle: item.productTitle,
  }));

  const fingerprint = buildRenderSourceFingerprint({
    roomUploadId: photo.id,
    roomStoragePath: photo.storage_path,
    analysisId: analysis.id,
    analysisUpdatedAt: analysis.updated_at,
    discoveryId: discovery.id,
    preferences,
    references: orderedResult.ordered,
  });

  const completeRoom = evaluateCompleteRoomReadiness({
    searchedItemCount: discovery.searchedItemCount,
    unmatched: discovery.unmatchedRequirements,
    readyRequirementKeys: orderedResult.ordered.map((item) => item.selection.requirementKey),
    preferences,
  });

  return {
    photo,
    analysis,
    discovery,
    selections,
    confirmed: selections.filter((item) => item.isConfirmed),
    ordered: orderedResult.ordered,
    missing,
    completeRoom,
    fingerprint,
    preferences,
  };
}

export async function generateRoomRender(
  input: GenerateRoomRenderInput
): Promise<{ render: RoomRenderView; reused: boolean; providerCalls: number }> {
  const probe = await prepareRenderSource(input.userClient, input.projectId, input.preferences);
  if (probe.missing.length > 0) {
    await ensureProductReferenceAssets({
      persistClient: input.persistClient,
      ownerUserId: input.ownerUserId,
      projectId: input.projectId,
      selections: probe.selections,
      fetch: input.fetch,
      lookup: input.lookup,
    });
  }

  const source =
    probe.missing.length > 0
      ? await prepareRenderSource(input.userClient, input.projectId, input.preferences)
      : probe;
  if (!source.completeRoom.allowed) {
    throw new RenderError("incomplete_room", completeRoomBlockMessage(source.completeRoom), {
      missingReferences:
        source.completeRoom.unresolvedLabels.length > 0
          ? source.completeRoom.unresolvedLabels.map((label) => ({
              selectionId: "",
              productTitle: label,
            }))
          : source.missing,
    });
  }
  if (source.ordered.length === 0) {
    throw new RenderError(
      "reference_grounding_unavailable",
      renderErrorMessage("reference_grounding_unavailable"),
      { missingReferences: source.missing }
    );
  }

  const processing = await getProcessingRenderByFingerprint(
    input.userClient,
    input.projectId,
    source.fingerprint
  );
  if (processing) {
    logRenderProviderBudget("reused", 0);
    return { render: processing, reused: true, providerCalls: 0 };
  }

  if (!input.force) {
    const existing = await getLatestSucceededRenderByFingerprint(
      input.userClient,
      input.projectId,
      source.fingerprint
    );
    if (existing) {
      logRenderProviderBudget("reused", 0);
      return { render: existing, reused: true, providerCalls: 0 };
    }
  }

  if (!isOpenAiImageRenderEnabled()) {
    logRenderProviderBudget("disabled", 0);
    throw new RenderError("render_disabled", renderErrorMessage("render_disabled"));
  }

  await claimRoomRenderSlot(input.userClient, input.projectId);

  const racing = await getProcessingRenderByFingerprint(
    input.userClient,
    input.projectId,
    source.fingerprint
  );
  if (racing) {
    logRenderProviderBudget("reused", 0);
    return { render: racing, reused: true, providerCalls: 0 };
  }

  const promptSnapshot = buildRoomRenderPrompt({
    observation: source.analysis.analysis,
    designRequirements: source.analysis.design_requirements,
    unmatchedRequirements: source.discovery.unmatchedRequirements,
    ungroundedSelections: source.selections.filter(
      (item) => !source.ordered.some((ref) => ref.selection.id === item.id)
    ),
    preferences: source.preferences,
    references: source.ordered,
  });
  const referenceSnapshot = source.ordered.map((item) =>
    toReferenceSnapshot({
      imageIndex: item.imageIndex,
      selection: item.selection,
      assetId: item.asset.id,
      referenceHash: item.asset.sourceHash,
    })
  );

  const inserted = await insertProcessingRoomRender({
    persistClient: input.persistClient,
    ownerUserId: input.ownerUserId,
    projectId: input.projectId,
    sourceUploadId: source.photo.id,
    sourceAnalysisId: source.analysis.id,
    sourceAnalysisUpdatedAt: source.analysis.updated_at,
    sourceDiscoveryId: source.discovery.id,
    sourceFingerprint: source.fingerprint,
    promptSnapshot: promptSnapshotAsJson(promptSnapshot),
    referenceSnapshot: promptSnapshotAsJson(referenceSnapshot),
  });

  if (!inserted.created) {
    logRenderProviderBudget("reused", 0);
    return { render: inserted.row, reused: true, providerCalls: 0 };
  }

  try {
    const roomBytes = await downloadPrivateBytes(
      input.userClient,
      PROJECT_UPLOADS_BUCKET,
      source.photo.storage_path
    );
    const roomMime = detectImageMime(roomBytes);
    if (roomMime !== "image/jpeg" && roomMime !== "image/png" && roomMime !== "image/webp") {
      throw new RenderError("failed", renderErrorMessage("failed"));
    }

    const images: RoomImageEditFile[] = [
      {
        filename: `01-original-room.${roomMime === "image/png" ? "png" : roomMime === "image/webp" ? "webp" : "jpg"}`,
        mime: roomMime,
        bytes: roomBytes,
      },
    ];

    for (const item of source.ordered) {
      const bytes = await downloadPrivateBytes(
        input.userClient,
        PROJECT_ASSETS_BUCKET,
        item.asset.storagePath
      );
      const mime = detectImageMime(bytes) ?? item.asset.mimeType;
      if (mime !== "image/jpeg" && mime !== "image/png" && mime !== "image/webp") {
        throw new RenderError("failed", renderErrorMessage("failed"));
      }
      const index = String(item.imageIndex).padStart(2, "0");
      images.push({
        filename: `${index}-${item.selection.requirementKey}.${mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg"}`,
        mime,
        bytes,
      });
    }

    const editImage = input.editImage ?? editRoomImageWithOpenAI;
    const edited = await editImage({
      prompt: promptSnapshot.prompt,
      images,
    });
    const validated = validateRenderOutputBytes(edited.bytes);
    const mime: RoomRenderOutputMimeType = validated.mime;
    const outputPath = buildRoomRenderPath(input.projectId, inserted.id, mime);
    const outputHash = sha256Hex(edited.bytes);

    const uploaded = await input.persistClient.storage.from(PROJECT_ASSETS_BUCKET).upload(outputPath, edited.bytes, {
      contentType: mime,
      upsert: false,
    });
    if (uploaded.error) {
      throw new RenderError("failed", renderErrorMessage("failed"));
    }

    try {
      const completed = await completeRoomRender({
        persistClient: input.persistClient,
        ownerUserId: input.ownerUserId,
        projectId: input.projectId,
        renderId: inserted.id,
        outputStoragePath: outputPath,
        outputMimeType: mime,
        outputSizeBytes: validated.sizeBytes,
        outputHash,
      });
      logRenderProviderBudget("generated", 1);
      return { render: completed, reused: false, providerCalls: 1 };
    } catch (error) {
      await input.persistClient.storage.from(PROJECT_ASSETS_BUCKET).remove([outputPath]);
      throw error;
    }
  } catch (error) {
    const code = error instanceof RenderError ? error.code : "failed";
    try {
      await failRoomRender({
        persistClient: input.persistClient,
        ownerUserId: input.ownerUserId,
        projectId: input.projectId,
        renderId: inserted.id,
        errorCode: code,
      });
    } catch {
      // Keep the original provider/validation error.
    }
    throw error;
  }
}

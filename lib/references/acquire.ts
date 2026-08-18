import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { PROJECT_ASSETS_BUCKET } from "./constants";
import { ReferenceError, mapReferenceDbError, referenceErrorMessage } from "./errors";
import { fetchValidatedProductImage, type FetchLike } from "./fetchImage";
import {
  buildProductReferencePath,
  candidateProductReferencePaths,
} from "./path";
import { getProductReferenceAssetBySelection } from "./queries";
import type { AddressLookup } from "./ssrf";
import type { ProductReferenceAssetView } from "./types";

type Client = SupabaseClient<Database>;

export type AcquireProductReferenceInput = {
  persistClient: Client;
  ownerUserId: string;
  projectId: string;
  selectionId: string;
  sourceImageUrl: string;
  fetch?: FetchLike;
  lookup?: AddressLookup;
};

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function acquireProductReferenceAsset(
  input: AcquireProductReferenceInput
): Promise<ProductReferenceAssetView> {
  const fetched = await fetchValidatedProductImage(input.sourceImageUrl, {
    fetch: input.fetch,
    lookup: input.lookup,
  });
  const storagePath = buildProductReferencePath(input.projectId, input.selectionId, fetched.mime);
  const sourceHash = sha256Hex(fetched.bytes);
  const uploaded = await input.persistClient.storage.from(PROJECT_ASSETS_BUCKET).upload(storagePath, fetched.bytes, {
    contentType: fetched.mime,
    upsert: true,
  });
  if (uploaded.error) {
    throw new ReferenceError("failed", referenceErrorMessage("failed"));
  }

  const { data, error } = await input.persistClient.rpc("upsert_project_product_reference_asset", {
    p_owner_user_id: input.ownerUserId,
    p_project_id: input.projectId,
    p_selection_id: input.selectionId,
    p_source_image_url: fetched.sourceUrl,
    p_storage_path: storagePath,
    p_mime_type: fetched.mime,
    p_size_bytes: fetched.sizeBytes,
    p_source_hash: sourceHash,
    p_width: (fetched.dimensions?.width ?? null) as number,
    p_height: (fetched.dimensions?.height ?? null) as number,
  });

  if (error || data == null) {
    await input.persistClient.storage.from(PROJECT_ASSETS_BUCKET).remove([storagePath]);
    throw mapReferenceDbError(error);
  }

  const extras = candidateProductReferencePaths(input.projectId, input.selectionId).filter(
    (path) => path !== storagePath
  );
  if (extras.length > 0) {
    await input.persistClient.storage.from(PROJECT_ASSETS_BUCKET).remove(extras);
  }

  const saved = await getProductReferenceAssetBySelection(input.persistClient, input.selectionId);
  if (!saved) {
    throw new ReferenceError("failed", referenceErrorMessage("failed"));
  }
  return saved;
}

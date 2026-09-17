import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { PROJECT_ASSETS_BUCKET } from "./constants";
import { ReferenceError, mapReferenceDbError, referenceErrorMessage } from "./errors";
import { fetchValidatedProductImage, type FetchLike } from "./fetchImage";
import {
  buildProductReferencePath,
  candidateProductReferencePaths,
  parseProductReferencePath,
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
  sourcePageUrl?: string | null;
  fetch?: FetchLike;
  lookup?: AddressLookup;
  /** When true, skip merchant fetch if a stored asset already exists. Default true. */
  cacheFirst?: boolean;
};

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function isReusableReferenceAsset(
  asset: ProductReferenceAssetView | null,
  projectId: string,
  selectionId: string
): asset is ProductReferenceAssetView {
  if (!asset) return false;
  if (asset.projectId !== projectId || asset.selectionId !== selectionId) return false;
  if (!/^[a-f0-9]{64}$/.test(asset.sourceHash)) return false;
  const parsed = parseProductReferencePath(asset.storagePath);
  if (!parsed) return false;
  return parsed.projectId === projectId && parsed.selectionId === selectionId;
}

export async function acquireProductReferenceAsset(
  input: AcquireProductReferenceInput
): Promise<ProductReferenceAssetView> {
  const cacheFirst = input.cacheFirst !== false;
  if (cacheFirst) {
    const existing = await getProductReferenceAssetBySelection(input.persistClient, input.selectionId);
    if (isReusableReferenceAsset(existing, input.projectId, input.selectionId)) {
      return existing;
    }
  }

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
    p_source_page_url: input.sourcePageUrl ?? null,
    p_is_primary: true,
    p_sort_order: 0,
    p_storage_path: storagePath,
    p_mime_type: fetched.mime,
    p_size_bytes: fetched.sizeBytes,
    p_source_hash: sourceHash,
    p_width: fetched.dimensions?.width ?? null,
    p_height: fetched.dimensions?.height ?? null,
  });

  if (error || data == null) {
    await input.persistClient.storage.from(PROJECT_ASSETS_BUCKET).remove([storagePath]);
    throw mapReferenceDbError(error);
  }

  await input.persistClient
    .from("project_product_selections")
    .update({
      has_reference_image: true,
      product_image_url: fetched.sourceUrl,
      reference_status: "ready",
      reference_failure_code: null,
    })
    .eq("id", input.selectionId)
    .eq("project_id", input.projectId);

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

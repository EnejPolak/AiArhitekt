import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { projectIdSchema } from "@/lib/projects/schema";
import type { ProductReferenceMimeType } from "./constants";
import { mapReferenceDbError } from "./errors";
import type { ProductReferenceAssetView } from "./types";

type Client = SupabaseClient<Database>;

function asAsset(
  row: Database["public"]["Tables"]["project_product_reference_assets"]["Row"]
): ProductReferenceAssetView {
  return {
    id: row.id,
    projectId: row.project_id,
    selectionId: row.selection_id,
    sourceImageUrl: row.source_image_url,
    storageBucket: row.storage_bucket,
    storagePath: row.storage_path,
    mimeType: row.mime_type as ProductReferenceMimeType,
    sizeBytes: row.size_bytes,
    sourceHash: row.source_hash,
    width: row.width,
    height: row.height,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getProductReferenceAssetBySelection(
  client: Client,
  selectionId: string
): Promise<ProductReferenceAssetView | null> {
  const { data, error } = await client
    .from("project_product_reference_assets")
    .select("*")
    .eq("selection_id", selectionId)
    .maybeSingle();
  if (error) throw mapReferenceDbError(error);
  if (!data) return null;
  return asAsset(data);
}

export async function listProjectProductReferenceAssets(
  client: Client,
  projectId: string
): Promise<ProductReferenceAssetView[]> {
  const parsed = projectIdSchema.safeParse(projectId);
  if (!parsed.success) return [];
  const { data, error } = await client
    .from("project_product_reference_assets")
    .select("*")
    .eq("project_id", parsed.data)
    .order("created_at", { ascending: true });
  if (error) throw mapReferenceDbError(error);
  return (data ?? []).map(asAsset);
}

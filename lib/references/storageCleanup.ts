import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { PROJECT_ASSETS_BUCKET } from "./constants";
import { productReferenceFolderPrefix, projectRenderFolderPrefix } from "./path";

type Client = SupabaseClient<Database>;

async function listFolderFiles(client: Client, folder: string): Promise<string[]> {
  const { data, error } = await client.storage.from(PROJECT_ASSETS_BUCKET).list(folder, {
    limit: 100,
  });
  if (error || !data) return [];
  return data
    .filter((item) => item.name && !item.name.endsWith("/"))
    .map((item) => `${folder}/${item.name}`);
}

async function metadataReferencePaths(client: Client, projectId: string): Promise<string[]> {
  const { data } = await client
    .from("project_product_reference_assets")
    .select("storage_path")
    .eq("project_id", projectId);
  return (data ?? []).map((row) => row.storage_path).filter(Boolean);
}

async function metadataRenderPaths(client: Client, projectId: string): Promise<string[]> {
  const { data } = await client
    .from("project_room_renders")
    .select("output_storage_path")
    .eq("project_id", projectId);
  return (data ?? [])
    .map((row) => row.output_storage_path)
    .filter((path): path is string => Boolean(path));
}

export async function removeProductReferenceStorageObjects(
  client: Client,
  projectId: string
): Promise<void> {
  const paths = [
    ...(await metadataReferencePaths(client, projectId)),
    ...(await listFolderFiles(client, productReferenceFolderPrefix(projectId))),
  ];
  const unique = [...new Set(paths)];
  if (unique.length === 0) return;
  await client.storage.from(PROJECT_ASSETS_BUCKET).remove(unique);
}

export async function removeProjectAssetObjects(client: Client, projectId: string): Promise<void> {
  await removeProductReferenceStorageObjects(client, projectId);
  const renderPaths = [
    ...(await metadataRenderPaths(client, projectId)),
    ...(await listFolderFiles(client, projectRenderFolderPrefix(projectId))),
  ];
  const unique = [...new Set(renderPaths)];
  if (unique.length === 0) return;
  await client.storage.from(PROJECT_ASSETS_BUCKET).remove(unique);
}

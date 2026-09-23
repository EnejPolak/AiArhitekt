import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/database.types";
import { projectIdSchema } from "@/lib/projects/schema";
import { DiscoveryError, discoveryErrorMessage, mapDiscoveryDbError } from "./errors";
import { unmatchedRequirementSchema, type UnmatchedRequirement } from "./itemSpecs";
import type { ProductDiscoveryView, ProductSelectionView } from "./types";
import type { CanonicalSelectionFields } from "./mapProduct";
import type { FurnitureNeed, MaterialNeed } from "./itemSpecs";
import type { ShoppingPreferenceInput, ShoppingPreferenceSnapshot } from "./preferences";
import { canonicalShoppingPreferences, loadStoredShoppingPreferenceSnapshot } from "./preferences";
import { removeProductReferenceStorageObjects } from "@/lib/references/storageCleanup";
import {
  parseProductImageEvidence,
  type ProductReferenceFailureCode,
  type ProductReferenceStatus,
} from "@/lib/references/imageEvidence";

type Client = SupabaseClient<Database>;

const allowlistSchema = z.array(z.string().min(1).max(253)).max(80);

function asAllowlist(value: Json): string[] {
  const parsed = allowlistSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}

function asUnmatched(value: Json): UnmatchedRequirement[] {
  const parsed = z.array(unmatchedRequirementSchema).safeParse(value);
  return parsed.success ? parsed.data : [];
}

function asDiscovery(
  row: Database["public"]["Tables"]["project_product_discoveries"]["Row"]
): ProductDiscoveryView {
  return {
    id: row.id,
    projectId: row.project_id,
    sourceAnalysisId: row.source_analysis_id,
    sourceAnalysisUpdatedAt: row.source_analysis_updated_at,
    locationInput: row.location_input,
    latitude: row.latitude,
    longitude: row.longitude,
    radiusKm: row.radius_km,
    searchedItemCount: row.searched_item_count,
    notSearchedCount: row.not_searched_count,
    allowlistDomains: asAllowlist(row.allowlist_domains),
    unmatchedRequirements: asUnmatched(row.unmatched_requirements),
    sourcePreferences: loadStoredShoppingPreferenceSnapshot(row.source_preferences),
    sourcePreferencesHash: String(row.source_preferences_hash ?? ""),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function asSelection(
  row: Database["public"]["Tables"]["project_product_selections"]["Row"]
): ProductSelectionView | null {
  if (row.requirement_type !== "furniture" && row.requirement_type !== "material") {
    return null;
  }
  const price =
    row.price == null ? null : typeof row.price === "number" ? row.price : Number(row.price);
  return {
    id: row.id,
    projectId: row.project_id,
    discoveryId: row.discovery_id,
    requirementType: row.requirement_type,
    requirementKey: row.requirement_key,
    requirementSnapshot: row.requirement_snapshot,
    itemSpec: row.item_spec,
    productTitle: row.product_title,
    productUrl: row.product_url,
    productImageUrl: row.product_image_url,
    price: Number.isFinite(price as number) ? (price as number) : null,
    currency: row.currency === "EUR" ? "EUR" : null,
    retailerDomain: row.retailer_domain,
    retailerName: row.retailer_name,
    hasReferenceImage: row.has_reference_image,
    isConfirmed: row.is_confirmed,
    referenceStatus: (row.reference_status === "ready" || row.reference_status === "unavailable"
      ? row.reference_status
      : "pending") as ProductReferenceStatus,
    referenceFailureCode: (row.reference_failure_code as ProductReferenceFailureCode | null) ?? null,
    referenceRescueAttempted: Boolean(row.reference_rescue_attempted),
    imageEvidence: parseProductImageEvidence(row.image_evidence),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getProjectProductDiscovery(
  client: Client,
  projectId: string
): Promise<ProductDiscoveryView | null> {
  const parsed = projectIdSchema.safeParse(projectId);
  if (!parsed.success) return null;

  const { data, error } = await client
    .from("project_product_discoveries")
    .select("*")
    .eq("project_id", parsed.data)
    .maybeSingle();

  if (error) throw mapDiscoveryDbError(error);
  if (!data) return null;
  return asDiscovery(data);
}

export async function getProjectProductSelections(
  client: Client,
  discoveryId: string
): Promise<ProductSelectionView[]> {
  const { data, error } = await client
    .from("project_product_selections")
    .select("*")
    .eq("discovery_id", discoveryId)
    .order("created_at", { ascending: true });

  if (error) throw mapDiscoveryDbError(error);
  return (data ?? []).map(asSelection).filter((row): row is ProductSelectionView => row !== null);
}

export async function deleteProjectProductDiscovery(
  client: Client,
  projectId: string
): Promise<void> {
  const parsed = projectIdSchema.safeParse(projectId);
  if (!parsed.success) return;

  await removeProductReferenceStorageObjects(client, parsed.data);

  const { error } = await client
    .from("project_product_discoveries")
    .delete()
    .eq("project_id", parsed.data);

  if (error) throw mapDiscoveryDbError(error);
}

export type PersistDiscoveryInput = {
  projectId: string;
  sourceAnalysisId: string;
  sourceAnalysisUpdatedAt: string;
  locationInput: string;
  latitude: number;
  longitude: number;
  radiusKm: number;
  searchedItemCount: number;
  notSearchedCount: number;
  allowlistDomains: string[];
  unmatchedRequirements: UnmatchedRequirement[];
  sourcePreferences: ShoppingPreferenceSnapshot;
  sourcePreferencesHash: string;
  selections: Array<{
    requirementType: "furniture" | "material";
    requirementKey: string;
    requirementSnapshot: FurnitureNeed | MaterialNeed;
    itemSpec: string;
    product: CanonicalSelectionFields;
  }>;
};

export async function persistProductDiscoveryResult(
  persistClient: Client,
  ownerUserId: string,
  input: PersistDiscoveryInput,
  readClient: Client
): Promise<{ discovery: ProductDiscoveryView; selections: ProductSelectionView[] }> {
  const { data, error } = await persistClient.rpc("replace_project_product_discovery_result", {
    p_owner_user_id: ownerUserId,
    p_project_id: input.projectId,
    p_discovery: {
      source_analysis_id: input.sourceAnalysisId,
      source_analysis_updated_at: input.sourceAnalysisUpdatedAt,
      location_input: input.locationInput,
      latitude: input.latitude,
      longitude: input.longitude,
      radius_km: input.radiusKm,
      searched_item_count: input.searchedItemCount,
      not_searched_count: input.notSearchedCount,
      allowlist_domains: input.allowlistDomains,
      unmatched_requirements: input.unmatchedRequirements,
      source_preferences: input.sourcePreferences,
      source_preferences_hash: input.sourcePreferencesHash,
    } as unknown as Json,
    p_selections: input.selections.map((item) => ({
      requirement_type: item.requirementType,
      requirement_key: item.requirementKey,
      requirement_snapshot: item.requirementSnapshot,
      item_spec: item.itemSpec,
      product_title: item.product.productTitle,
      product_url: item.product.productUrl,
      product_image_url: item.product.productImageUrl,
      price: item.product.price,
      currency: item.product.currency,
      retailer_domain: item.product.retailerDomain,
      retailer_name: item.product.retailerName,
      has_reference_image: item.product.hasReferenceImage,
      image_evidence: item.product.imageEvidence ?? [],
    })) as unknown as Json,
  });

  if (error || data == null) {
    throw mapDiscoveryDbError(error);
  }

  await removeProductReferenceStorageObjects(persistClient, input.projectId);

  const discovery = await getProjectProductDiscovery(readClient, input.projectId);
  if (!discovery) {
    throw new DiscoveryError("failed", discoveryErrorMessage("failed"));
  }
  const selections = await getProjectProductSelections(readClient, discovery.id);
  return { discovery, selections };
}

export async function appendProductDiscoverySelections(
  persistClient: Client,
  readClient: Client,
  input: {
    projectId: string;
    discoveryId: string;
    searchedItemCount: number;
    notSearchedCount: number;
    allowlistDomains: string[];
    unmatchedRequirements: UnmatchedRequirement[];
    sourcePreferences: ShoppingPreferenceSnapshot;
    sourcePreferencesHash: string;
    selections: PersistDiscoveryInput["selections"];
  }
): Promise<{ discovery: ProductDiscoveryView; selections: ProductSelectionView[] }> {
  const { error: updateError } = await persistClient
    .from("project_product_discoveries")
    .update({
      searched_item_count: input.searchedItemCount,
      not_searched_count: input.notSearchedCount,
      allowlist_domains: input.allowlistDomains as unknown as Json,
      unmatched_requirements: input.unmatchedRequirements as unknown as Json,
      source_preferences: input.sourcePreferences as unknown as Json,
      source_preferences_hash: input.sourcePreferencesHash,
    })
    .eq("id", input.discoveryId);
  if (updateError) throw mapDiscoveryDbError(updateError);

  for (const item of input.selections) {
    const { error } = await persistClient.from("project_product_selections").insert({
      project_id: input.projectId,
      discovery_id: input.discoveryId,
      requirement_type: item.requirementType,
      requirement_key: item.requirementKey,
      requirement_snapshot: item.requirementSnapshot as unknown as Json,
      item_spec: item.itemSpec,
      product_title: item.product.productTitle,
      product_url: item.product.productUrl,
      product_image_url: item.product.productImageUrl,
      price: item.product.price,
      currency: item.product.currency,
      retailer_domain: item.product.retailerDomain,
      retailer_name: item.product.retailerName,
      has_reference_image: item.product.hasReferenceImage,
      image_evidence: (item.product.imageEvidence ?? []) as unknown as Json,
      is_confirmed: false,
      reference_status: "pending",
    });
    if (error) throw mapDiscoveryDbError(error);
  }

  const discovery = await getProjectProductDiscovery(readClient, input.projectId);
  if (!discovery) {
    throw new DiscoveryError("failed", discoveryErrorMessage("failed"));
  }
  const selections = await getProjectProductSelections(readClient, discovery.id);
  return { discovery, selections };
}

export async function setSelectionConfirmed(
  client: Client,
  selectionId: string,
  confirmed: boolean
): Promise<ProductSelectionView> {
  const { data, error } = await client
    .from("project_product_selections")
    .update({ is_confirmed: confirmed })
    .eq("id", selectionId)
    .select("*")
    .single();

  if (error || !data) {
    throw mapDiscoveryDbError(error);
  }
  const mapped = asSelection(data);
  if (!mapped) {
    throw new DiscoveryError("failed", discoveryErrorMessage("failed"));
  }
  return mapped;
}

export async function updateDiscoveryUnmatchedRequirements(
  persistClient: Client,
  discoveryId: string,
  unmatched: UnmatchedRequirement[]
): Promise<void> {
  const { error } = await persistClient
    .from("project_product_discoveries")
    .update({ unmatched_requirements: unmatched as unknown as Json })
    .eq("id", discoveryId);
  if (error) throw mapDiscoveryDbError(error);
}

export async function insertReadyProductSelection(
  persistClient: Client,
  input: {
    projectId: string;
    discoveryId: string;
    selection: PersistDiscoveryInput["selections"][number];
  }
): Promise<void> {
  const { error } = await persistClient.from("project_product_selections").insert({
    project_id: input.projectId,
    discovery_id: input.discoveryId,
    requirement_type: input.selection.requirementType,
    requirement_key: input.selection.requirementKey,
    requirement_snapshot: input.selection.requirementSnapshot as unknown as Json,
    item_spec: input.selection.itemSpec,
    product_title: input.selection.product.productTitle,
    product_url: input.selection.product.productUrl,
    product_image_url: input.selection.product.productImageUrl,
    price: input.selection.product.price,
    currency: input.selection.product.currency,
    retailer_domain: input.selection.product.retailerDomain,
    retailer_name: input.selection.product.retailerName,
    has_reference_image: input.selection.product.hasReferenceImage,
    image_evidence: (input.selection.product.imageEvidence ?? []) as unknown as Json,
    is_confirmed: true,
    reference_status: "pending",
  });
  if (error) throw mapDiscoveryDbError(error);
}

export async function getOwnedSelection(
  client: Client,
  selectionId: string
): Promise<ProductSelectionView | null> {
  const { data, error } = await client
    .from("project_product_selections")
    .select("*")
    .eq("id", selectionId)
    .maybeSingle();
  if (error) throw mapDiscoveryDbError(error);
  if (!data) return null;
  return asSelection(data);
}

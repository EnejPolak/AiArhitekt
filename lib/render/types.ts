import type { ProductSelectionView } from "@/lib/discovery/types";
import type { Json } from "@/lib/database.types";
import type { RoomRenderStatus } from "./constants";
import type { RenderPromptSnapshot } from "./prompt";

export type RenderReferenceSnapshotItem = {
  imageIndex: number;
  selectionId: string;
  requirementKey: string;
  requirementType: "furniture" | "material";
  productTitle: string;
  productUrl: string;
  price: number | null;
  currency: "EUR" | null;
  retailerDomain: string;
  retailerName: string | null;
  referenceAssetId: string;
  referenceHash: string;
};

export type RoomRenderView = {
  id: string;
  projectId: string;
  sourceUploadId: string | null;
  sourceAnalysisId: string | null;
  sourceAnalysisUpdatedAt: string | null;
  sourceDiscoveryId: string | null;
  sourceFingerprint: string;
  provider: string;
  model: string;
  schemaVersion: number;
  status: RoomRenderStatus;
  promptSnapshot: RenderPromptSnapshot | Json;
  referenceSnapshot: RenderReferenceSnapshotItem[] | Json;
  outputStorageBucket: string | null;
  outputStoragePath: string | null;
  outputMimeType: string | null;
  outputSizeBytes: number | null;
  outputHash: string | null;
  errorCode: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
  previewUrl: string | null;
  isCurrent: boolean;
};

export type MissingRenderReference = {
  selectionId: string;
  productTitle: string;
};

export type RoomRenderReadiness = {
  fingerprint: string;
  confirmed: ProductSelectionView[];
  missingReferences: MissingRenderReference[];
};

export function toReferenceSnapshot(item: {
  imageIndex: number;
  selection: ProductSelectionView;
  assetId: string;
  referenceHash: string;
}): RenderReferenceSnapshotItem {
  return {
    imageIndex: item.imageIndex,
    selectionId: item.selection.id,
    requirementKey: item.selection.requirementKey,
    requirementType: item.selection.requirementType,
    productTitle: item.selection.productTitle,
    productUrl: item.selection.productUrl,
    price: item.selection.price,
    currency: item.selection.currency,
    retailerDomain: item.selection.retailerDomain,
    retailerName: item.selection.retailerName,
    referenceAssetId: item.assetId,
    referenceHash: item.referenceHash,
  };
}

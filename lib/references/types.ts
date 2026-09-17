import type { ProductReferenceMimeType } from "./constants";

export type ProductReferenceAssetView = {
  id: string;
  projectId: string;
  selectionId: string;
  sourceImageUrl: string;
  sourcePageUrl: string | null;
  isPrimary: boolean;
  sortOrder: number;
  storageBucket: string;
  storagePath: string;
  mimeType: ProductReferenceMimeType;
  sizeBytes: number;
  sourceHash: string;
  width: number | null;
  height: number | null;
  createdAt: string;
  updatedAt: string;
};

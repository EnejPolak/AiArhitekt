import type { ProductReferenceMimeType } from "./constants";

export type ProductReferenceAssetView = {
  id: string;
  projectId: string;
  selectionId: string;
  sourceImageUrl: string;
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

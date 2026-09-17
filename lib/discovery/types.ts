import type { DesignRequirements } from "@/lib/analysis/schema";
import type {
  ProductImageEvidence,
  ProductReferenceFailureCode,
  ProductReferenceStatus,
} from "@/lib/references/imageEvidence";
import type { UnmatchedRequirement } from "./itemSpecs";
import type { ShoppingPreferenceSnapshot } from "./preferences";

export type ProductDiscoveryView = {
  id: string;
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
  sourcePreferences: ShoppingPreferenceSnapshot | Record<string, unknown>;
  sourcePreferencesHash: string;
  createdAt: string;
  updatedAt: string;
};

export type ProductSelectionView = {
  id: string;
  projectId: string;
  discoveryId: string;
  requirementType: "furniture" | "material";
  requirementKey: string;
  requirementSnapshot: unknown;
  itemSpec: string;
  productTitle: string;
  productUrl: string;
  productImageUrl: string | null;
  price: number | null;
  currency: "EUR" | null;
  retailerDomain: string;
  retailerName: string | null;
  hasReferenceImage: boolean;
  isConfirmed: boolean;
  referenceStatus?: ProductReferenceStatus;
  referenceFailureCode?: ProductReferenceFailureCode | null;
  referenceRescueAttempted?: boolean;
  imageEvidence?: ProductImageEvidence[];
  createdAt: string;
  updatedAt: string;
};

export type ProductDiscoveryState = {
  discovery: ProductDiscoveryView;
  selections: ProductSelectionView[];
  designRequirements: DesignRequirements;
};

export type DiscoveryStatus =
  | "ready"
  | "finding_stores"
  | "searching_products"
  | "results"
  | "partial_results"
  | "no_products"
  | "error";

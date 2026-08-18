import { z } from "zod";

export const placesSearchRequestSchema = z.object({
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
  radiusKm: z.number().min(1).max(50),
  mode: z.enum(["category", "brand"]).optional(),
  brandKeywords: z.array(z.string()).optional(),
  dryRun: z.boolean().optional(),
  onlyWithWebsite: z.boolean().optional(),
  debug: z.boolean().optional(),
});

export const placeResultSchema = z.object({
  name: z.string(),
  place_id: z.string(),
  website: z.string().optional(),
  websiteDomain: z.string().optional(),
  distanceKm: z.number().optional(),
  rating: z.number().optional(),
  categoryBucket: z.enum(["store", "contractor"]).optional(),
});

export const placesSearchResponseSchema = z.object({
  status: z.number(),
  stores: z.array(placeResultSchema),
  contractors: z.array(placeResultSchema).optional(),
  domains: z
    .object({
      stores: z.array(z.string()),
      contractors: z.array(z.string()),
    })
    .optional(),
  allowlistDomainsStores: z.array(z.string()).optional(),
  allowlistDomainsContractors: z.array(z.string()).optional(),
  meta: z
    .object({
      requestsMade: z.number(),
      discardedOutOfRadius: z.number().optional(),
      filteredOutCount: z.number().optional(),
    })
    .passthrough()
    .optional(),
});

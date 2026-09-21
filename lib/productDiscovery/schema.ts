import { z } from "zod";

export const productDiscoveryProductModelSchema = z.object({
  name: z.string().min(1),
  retailer: z.string().min(1),
  retailerDomain: z.string().min(1),
  productUrl: z.string().min(1),
  price: z.number().positive().nullable(),
  currency: z.string().nullable(),
  priceUnit: z.string().nullable(),
  imageUrl: z.string().nullable(),
  specifications: z.array(
    z.object({
      key: z.string(),
      value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
    })
  ),
  matchScore: z.number().min(0).max(1),
  matchedRequirements: z.array(z.string()),
  unmetRequirements: z.array(z.string()),
  unknownRequirements: z.array(z.string()),
  whyItMatches: z.string(),
  sku: z.string().min(1).max(120).nullable().optional(),
  category: z.string().min(1).max(120).nullable().optional(),
  rank: z.number().int().min(1).max(5).nullable().optional(),
  sourceUrls: z.array(z.string().min(1).max(2048)).max(8).nullable().optional(),
});

export const productDiscoveryModelSchema = z.object({
  status: z.enum(["found", "not_found"]),
  product: productDiscoveryProductModelSchema.nullable(),
  candidates: z.array(productDiscoveryProductModelSchema).max(5),
});

export type ProductDiscoveryModelOutput = z.infer<typeof productDiscoveryModelSchema>;
export type ProductDiscoveryModelProduct = z.infer<typeof productDiscoveryProductModelSchema>;

import { z } from "zod";

/** Canonical purchasable product (never invented). Missing commerce fields are null. */
export const canonicalProductSchema = z.object({
  title: z.string(),
  url: z.string().min(1),
  price: z.number().nullable(),
  currency: z.literal("EUR").nullable(),
  image: z.string().nullable(),
  domain: z.string(),
  snippet: z.string().nullable().optional(),
  score: z.number().optional(),
  confidence: z.number().min(0).max(1).optional(),
  reasons: z.array(z.string()).optional(),
});

export type CanonicalProduct = z.infer<typeof canonicalProductSchema>;

export const serpPriceValueSchema = z.object({
  value: z.number(),
  currency: z.literal("EUR"),
  unit: z.enum(["item", "m2", "from", "set"]).optional(),
});

/** Raw SerpAPI organic row — extra keys allowed, then stripped in normalize. */
export const serpApiOrganicItemSchema = z
  .object({
    title: z.string().optional(),
    link: z.string().optional(),
    snippet: z.string().optional(),
    thumbnail: z.string().optional(),
    image: z.string().optional(),
    price: z.unknown().optional(),
    rich_snippet: z.unknown().optional(),
    rich_snippets: z.unknown().optional(),
  })
  .passthrough();

export const serpApiResponseSchema = z
  .object({
    organic_results: z.array(serpApiOrganicItemSchema).optional(),
  })
  .passthrough();

export type SerpApiResponse = z.infer<typeof serpApiResponseSchema>;

export const serpSearchRequestSchema = z.object({
  dryRun: z.boolean().optional(),
  maxRequests: z.number().optional(),
  fastMode: z.boolean().optional(),
  items: z.array(z.string()),
  allowlistDomains: z.array(z.string()).optional(),
  domainCategoryMap: z.record(z.string(), z.array(z.string())).optional(),
  preferredDomains: z.union([z.array(z.string()), z.string()]).optional(),
  language: z.string().optional(),
  country: z.string().optional(),
  debug: z.boolean().optional(),
});

export const serpPickedSchema = z.object({
  title: z.string(),
  url: z.string(),
  price: z.number().nullable(),
  currency: z.literal("EUR").nullable(),
  image: z.string().nullable(),
  domain: z.string(),
  score: z.number(),
  confidence: z.number(),
  reasons: z.array(z.string()),
  snippet: z.string().nullable().optional(),
});

export const serpSearchResponseSchema = z.object({
  dryRun: z.boolean(),
  plannedQueries: z.record(z.string(), z.array(z.string())),
  plannedTotalQueries: z.number(),
  effectiveMaxRequests: z.number(),
  executedCount: z.number(),
  providerRequests: z.number().optional(),
  providerAttempts: z.number().optional(),
  providerSuccesses: z.number().optional(),
  providerFailures: z.number().optional(),
  cacheHits: z.number().optional(),
  logicalQueries: z.number().optional(),
  queryFailures: z
    .array(
      z.object({
        item: z.string(),
        query: z.string(),
        code: z.enum(["provider_timeout", "provider_5xx", "network_error", "invalid_response"]),
        message: z.string(),
        providerStatus: z.number().optional(),
      })
    )
    .optional(),
  stoppedReason: z.enum(["budget", "deadline", "daily_cap"]).nullable().optional(),
  dailyUsed: z.number(),
  dailyRemaining: z.number(),
  results: z.array(
    z.object({
      item: z.string(),
      picked: serpPickedSchema.nullable().optional(),
      topCandidates: z.array(z.unknown()).optional(),
    })
  ),
  status: z.number(),
});

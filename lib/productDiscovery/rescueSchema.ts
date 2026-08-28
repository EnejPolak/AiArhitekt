import { z } from "zod";

export const rescueSelectionSchema = z.object({
  status: z.enum(["selected", "none"]),
  candidateId: z.string().nullable(),
  productName: z.string().nullable(),
  retailer: z.string().nullable(),
  price: z.number().positive().nullable(),
  currency: z.string().nullable(),
  priceUnit: z.string().nullable(),
  matchedRequirements: z.array(z.string()),
  unmetRequirements: z.array(z.string()),
  unknownRequirements: z.array(z.string()),
  matchScore: z.number().min(0).max(1),
  whyItMatches: z.string(),
});

export type RescueSelectionOutput = z.infer<typeof rescueSelectionSchema>;

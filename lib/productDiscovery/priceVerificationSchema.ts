import { z } from "zod";

export const priceVerificationModelSchema = z.object({
  status: z.enum(["verified", "not_found", "conflicting"]),
  price: z.number().positive().nullable(),
  currency: z.string().nullable(),
  evidenceSourceIndex: z.number().int().min(0).nullable(),
  productIdentityConfirmed: z.boolean(),
  reasoningSummary: z.string(),
});

export type PriceVerificationModelOutput = z.infer<typeof priceVerificationModelSchema>;

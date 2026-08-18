import { z } from "zod";

/** Budget allocation JSON from the model — caps only, not product commerce data. */
export const budgetPlanSchema = z.object({
  caps: z.record(
    z.string(),
    z.object({
      max: z.number(),
      qty: z.number(),
    })
  ),
  reservedBufferRatio: z.number(),
  totalBudget: z.number(),
});

export type BudgetPlan = z.infer<typeof budgetPlanSchema>;

/** GPT pick among existing SERP candidates. URL must be validated against the candidate list; price is ignored (use candidate price). */
export const gptPickJsonSchema = z.object({
  pickedUrl: z.string().nullable(),
  pickedTitle: z.string().nullable().optional(),
  pickedPrice: z
    .object({
      value: z.number(),
      currency: z.literal("EUR"),
      unit: z.enum(["item", "m2", "from", "set"]).optional(),
    })
    .nullable()
    .optional(),
  confidence: z.enum(["high", "medium", "low"]).optional(),
  reason: z.string().optional(),
});

export type GptPickJson = z.infer<typeof gptPickJsonSchema>;

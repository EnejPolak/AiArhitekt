import { z } from "zod";

export const DESIGN_BRIEF_SCHEMA_VERSION = 1 as const;

export const answerModeSchema = z.enum([
  "value",
  "ai_decide",
  "not_applicable",
  "already_have",
  "skipped",
]);

export type AnswerMode = z.infer<typeof answerModeSchema>;

export const designBriefAnswerSchema = z.object({
  questionId: z.string().trim().min(1).max(80),
  mode: answerModeSchema,
  value: z
    .union([z.string().max(400), z.array(z.string().max(80)).max(12), z.number(), z.boolean(), z.null()])
    .optional(),
  answeredAt: z.string().min(1).max(40),
});

export type DesignBriefAnswer = z.infer<typeof designBriefAnswerSchema>;

export const designBriefDocumentSchema = z.object({
  schemaVersion: z.literal(DESIGN_BRIEF_SCHEMA_VERSION),
  roomType: z.enum(["kitchen", "bathroom", "bedroom", "living-room", "other"]).nullable(),
  customPurpose: z.string().trim().max(80).nullable(),
  customPurposeText: z.string().trim().max(400).nullable(),
  currentQuestionId: z.string().trim().max(80).nullable(),
  completed: z.boolean(),
  answers: z.record(z.string(), designBriefAnswerSchema),
});

export type DesignBriefDocument = z.infer<typeof designBriefDocumentSchema>;

export const EMPTY_DESIGN_BRIEF: DesignBriefDocument = {
  schemaVersion: DESIGN_BRIEF_SCHEMA_VERSION,
  roomType: null,
  customPurpose: null,
  customPurposeText: null,
  currentQuestionId: null,
  completed: false,
  answers: {},
};

export function parseDesignBriefAnswers(raw: unknown): DesignBriefDocument {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...EMPTY_DESIGN_BRIEF };
  }
  const record = raw as Record<string, unknown>;
  if (Object.keys(record).length === 0) {
    return { ...EMPTY_DESIGN_BRIEF };
  }
  const parsed = designBriefDocumentSchema.safeParse(raw);
  if (!parsed.success) {
    return { ...EMPTY_DESIGN_BRIEF };
  }
  return parsed.data;
}

export function isEmptyDesignBrief(doc: DesignBriefDocument): boolean {
  return !doc.completed && Object.keys(doc.answers).length === 0 && !doc.currentQuestionId;
}

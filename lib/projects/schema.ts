import { z } from "zod";
import { MVP_PROJECT_TYPE, PROJECT_NAME_MAX } from "./types";
import { isAllowedStepKey } from "./steps";

export const projectIdSchema = z.string().uuid("Invalid project.");

export const projectNameSchema = z
  .string()
  .transform((value) => value.trim())
  .pipe(
    z
      .string()
      .min(1, "Enter a project name.")
      .max(
        PROJECT_NAME_MAX,
        `Name must be at most ${PROJECT_NAME_MAX} characters.`
      )
  );

export const creatableProjectTypeSchema = z.literal(MVP_PROJECT_TYPE);

export const createProjectSchema = z.object({
  projectType: creatableProjectTypeSchema.optional().default(MVP_PROJECT_TYPE),
  name: projectNameSchema.optional(),
});

export const renameProjectSchema = z.object({
  projectId: projectIdSchema,
  name: projectNameSchema,
});

export const projectIdInputSchema = z.object({
  projectId: projectIdSchema,
});

export const updateWizardSchema = z
  .object({
    projectId: projectIdSchema,
    currentStepKey: z.string().trim().min(1).max(64),
    flowVersion: z.number().int().positive().optional(),
    projectType: creatableProjectTypeSchema,
  })
  .refine((value) => isAllowedStepKey(value.projectType, value.currentStepKey), {
    message: "Unknown wizard step.",
    path: ["currentStepKey"],
  });

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type RenameProjectInput = z.infer<typeof renameProjectSchema>;
export type UpdateWizardInput = z.infer<typeof updateWizardSchema>;

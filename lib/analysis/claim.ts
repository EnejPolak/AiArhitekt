import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { projectIdSchema } from "@/lib/projects/schema";
import { AnalysisError, analysisErrorMessage, mapAnalysisDbError, rateLimitMessage } from "./errors";

type Client = SupabaseClient<Database>;

const claimResultSchema = z.object({
  claimed: z.boolean(),
  retry_after_seconds: z.number().int(),
});

export async function claimRoomAnalysisSlot(
  client: Client,
  projectId: string
): Promise<void> {
  const parsedId = projectIdSchema.safeParse(projectId);
  if (!parsedId.success) {
    throw new AnalysisError("invalid_input", analysisErrorMessage("invalid_input"));
  }

  const { data, error } = await client.rpc("claim_room_analysis_slot", {
    p_project_id: parsedId.data,
  });

  if (error) {
    const code = (error.code ?? "").toUpperCase();
    if (code === "42501" || code === "PGRST301" || code === "PGRST116") {
      throw new AnalysisError("not_found", analysisErrorMessage("not_found"));
    }
    throw mapAnalysisDbError(error);
  }

  let raw: unknown = data;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      throw new AnalysisError("failed", analysisErrorMessage("failed"));
    }
  }

  const parsed = claimResultSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AnalysisError("failed", analysisErrorMessage("failed"));
  }

  if (!parsed.data.claimed) {
    throw new AnalysisError(
      "rate_limited",
      rateLimitMessage(parsed.data.retry_after_seconds),
      parsed.data.retry_after_seconds
    );
  }
}

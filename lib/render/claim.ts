import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { projectIdSchema } from "@/lib/projects/schema";
import { RenderError, renderErrorMessage, renderRateLimitMessage, mapRenderDbError } from "./errors";

type Client = SupabaseClient<Database>;

const claimResultSchema = z.object({
  claimed: z.boolean(),
  retry_after_seconds: z.number().int(),
});

export async function claimRoomRenderSlot(client: Client, projectId: string): Promise<void> {
  const parsedId = projectIdSchema.safeParse(projectId);
  if (!parsedId.success) {
    throw new RenderError("invalid_input", renderErrorMessage("invalid_input"));
  }

  const { data, error } = await client.rpc("claim_room_render_slot", {
    p_project_id: parsedId.data,
  });

  if (error) {
    const code = (error.code ?? "").toUpperCase();
    if (code === "42501" || code === "PGRST301" || code === "PGRST116") {
      throw new RenderError("not_found", renderErrorMessage("not_found"));
    }
    throw mapRenderDbError(error);
  }

  let raw: unknown = data;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      throw new RenderError("failed", renderErrorMessage("failed"));
    }
  }

  const parsed = claimResultSchema.safeParse(raw);
  if (!parsed.success) {
    throw new RenderError("failed", renderErrorMessage("failed"));
  }

  if (!parsed.data.claimed) {
    throw new RenderError(
      "rate_limited",
      renderRateLimitMessage(parsed.data.retry_after_seconds),
      { retryAfterSeconds: parsed.data.retry_after_seconds }
    );
  }
}

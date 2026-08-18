import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { projectIdSchema } from "@/lib/projects/schema";
import { DiscoveryError, discoveryErrorMessage, discoveryRateLimitMessage, mapDiscoveryDbError } from "./errors";

type Client = SupabaseClient<Database>;

const claimResultSchema = z.object({
  claimed: z.boolean(),
  retry_after_seconds: z.number().int(),
});

export async function claimProductDiscoverySlot(
  client: Client,
  projectId: string
): Promise<void> {
  const parsedId = projectIdSchema.safeParse(projectId);
  if (!parsedId.success) {
    throw new DiscoveryError("invalid_input", discoveryErrorMessage("invalid_input"));
  }

  const { data, error } = await client.rpc("claim_product_discovery_slot", {
    p_project_id: parsedId.data,
  });

  if (error) {
    const code = (error.code ?? "").toUpperCase();
    if (code === "42501" || code === "PGRST301" || code === "PGRST116") {
      throw new DiscoveryError("not_found", discoveryErrorMessage("not_found"));
    }
    throw mapDiscoveryDbError(error);
  }

  let raw: unknown = data;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      throw new DiscoveryError("failed", discoveryErrorMessage("failed"));
    }
  }

  const parsed = claimResultSchema.safeParse(raw);
  if (!parsed.success) {
    throw new DiscoveryError("failed", discoveryErrorMessage("failed"));
  }

  if (!parsed.data.claimed) {
    throw new DiscoveryError(
      "rate_limited",
      discoveryRateLimitMessage(parsed.data.retry_after_seconds),
      parsed.data.retry_after_seconds
    );
  }
}

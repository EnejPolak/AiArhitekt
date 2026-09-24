export type RenderErrorCode =
  | "invalid_input"
  | "unauthenticated"
  | "not_found"
  | "missing_photo"
  | "missing_analysis"
  | "missing_discovery"
  | "stale_source"
  | "no_confirmed_products"
  | "reference_missing"
  | "reference_grounding_unavailable"
  | "incomplete_room"
  | "incomplete_design_brief"
  | "too_many_references"
  | "render_disabled"
  | "provider_unconfigured"
  | "provider_timeout"
  | "provider_busy"
  | "provider_failed"
  | "invalid_output"
  | "rate_limited"
  | "failed";

export class RenderError extends Error {
  readonly code: RenderErrorCode;
  readonly retryAfterSeconds?: number;
  readonly missingReferences: Array<{ selectionId: string; productTitle: string }>;

  constructor(
    code: RenderErrorCode,
    message: string,
    extras?: {
      retryAfterSeconds?: number;
      missingReferences?: Array<{ selectionId: string; productTitle: string }>;
    }
  ) {
    super(message);
    this.name = "RenderError";
    this.code = code;
    this.retryAfterSeconds = extras?.retryAfterSeconds;
    this.missingReferences = extras?.missingReferences ?? [];
  }
}

export function renderErrorMessage(code: RenderErrorCode): string {
  switch (code) {
    case "invalid_input":
      return "Check the project and try again.";
    case "unauthenticated":
      return "Sign in to continue.";
    case "not_found":
      return "Project not found.";
    case "missing_photo":
      return "Upload a room photo before generating a design.";
    case "missing_analysis":
      return "Analyze the room before generating a design.";
    case "missing_discovery":
      return "Find and confirm products before generating a design.";
    case "stale_source":
      return "Your room analysis or products are out of date. Finish those steps first.";
    case "no_confirmed_products":
      return "Approve each product before generating a design.";
    case "reference_missing":
      return "A selected product is not render-ready. Unconfirm it or choose another product.";
    case "reference_grounding_unavailable":
      return "None of the selected products have a usable product image for visualization.";
    case "incomplete_room":
      return "We couldn't yet find a verified product for every required item. Resolve or remove the remaining items before generating a design.";
    case "incomplete_design_brief":
      return "Complete Design Brief before generating a design.";
    case "too_many_references":
      return "Too many confirmed product references for one generation. Reduce approved products, then try again.";
    case "render_disabled":
      return "Room visualization is temporarily unavailable.";
    case "provider_unconfigured":
      return "Room visualization is not configured.";
    case "provider_timeout":
      return "We couldn't finish the render. Try again.";
    case "provider_busy":
      return "Room visualization is busy. Try again in a moment.";
    case "provider_failed":
      return "Could not generate the room visualization. Try again.";
    case "invalid_output":
      return "The generated image was incomplete. Try again.";
    case "rate_limited":
      return "Please wait a moment before generating this design again.";
    default:
      return "Could not generate the room visualization. Try again.";
  }
}

export function renderRateLimitMessage(retryAfterSeconds: number): string {
  const seconds = Math.max(1, Math.ceil(retryAfterSeconds));
  return `${renderErrorMessage("rate_limited")} Try again in ${seconds} seconds.`;
}

export function mapRenderDbError(error: { message?: string; code?: string } | null): RenderError {
  if (!error) return new RenderError("failed", renderErrorMessage("failed"));
  const code = (error.code ?? "").toUpperCase();
  if (code === "PGRST116" || code === "42501" || code === "PGRST301") {
    return new RenderError("not_found", renderErrorMessage("not_found"));
  }
  return new RenderError("failed", renderErrorMessage("failed"));
}

export function mapRenderProviderFailure(error: unknown): RenderError {
  if (error instanceof RenderError) return error;

  const status =
    typeof error === "object" && error !== null && "status" in error
      ? Number((error as { status?: unknown }).status)
      : undefined;
  const name =
    typeof error === "object" && error !== null && "name" in error
      ? String((error as { name?: unknown }).name)
      : "";
  const message = error instanceof Error ? error.message.toLowerCase() : "";

  if (name.includes("Timeout") || message.includes("timeout") || message.includes("timed out")) {
    return new RenderError("provider_timeout", renderErrorMessage("provider_timeout"));
  }
  if (status === 429) {
    return new RenderError("provider_busy", renderErrorMessage("provider_busy"));
  }
  if (status !== undefined && status >= 500) {
    return new RenderError("provider_failed", renderErrorMessage("provider_failed"));
  }
  return new RenderError("provider_failed", renderErrorMessage("provider_failed"));
}

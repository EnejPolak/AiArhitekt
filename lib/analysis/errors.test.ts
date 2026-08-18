import { describe, expect, it } from "vitest";
import { AnalysisError, analysisErrorMessage, mapProviderFailure, rateLimitMessage } from "./errors";

describe("analysis provider error mapping", () => {
  it("maps timeouts", () => {
    const mapped = mapProviderFailure({ name: "APIConnectionTimeoutError", message: "timeout" });
    expect(mapped).toBeInstanceOf(AnalysisError);
    expect(mapped.code).toBe("provider_timeout");
    expect(mapped.message).toBe(analysisErrorMessage("provider_timeout"));
  });

  it("maps 429", () => {
    expect(mapProviderFailure({ status: 429, message: "rate" }).code).toBe("provider_busy");
  });

  it("maps 5xx", () => {
    expect(mapProviderFailure({ status: 503, message: "unavailable" }).code).toBe(
      "provider_failed"
    );
  });

  it("does not leak provider payloads in mapped messages", () => {
    const mapped = mapProviderFailure({
      status: 500,
      message: "internal stack at openai.chat",
    });
    expect(mapped.message).toBe(analysisErrorMessage("provider_failed"));
    expect(mapped.message).not.toContain("stack");
    expect(mapped.message).not.toContain("openai.chat");
  });

  it("returns a controlled cooldown message without SQL details", () => {
    const message = rateLimitMessage(42);
    expect(message).toBe(
      "Please wait a moment before analyzing this room again. Try again in 42 seconds."
    );
    expect(message).not.toContain("claim_room_analysis_slot");
    expect(message).not.toContain("project_ai_request_guards");
    expect(analysisErrorMessage("rate_limited")).not.toContain("SQL");
  });
});

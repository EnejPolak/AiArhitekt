import { describe, expect, it } from "vitest";
import { AnalysisError, analysisErrorMessage, mapProviderFailure } from "./errors";

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
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { validRoomAnalysisResult } from "./fixtures";

const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));

vi.mock("openai", () => ({
  default: class OpenAI {
    chat = { completions: { create: createMock } };
    constructor(_opts: unknown) {}
  },
}));

describe("analyzeRoomImage", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    createMock.mockReset();
  });

  it("parses a valid structured provider response", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    createMock.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(validRoomAnalysisResult) } }],
    });
    const { analyzeRoomImage } = await import("./openai");
    const { result, meta } = await analyzeRoomImage({
      bytes: Buffer.from("fake"),
      mime: "image/jpeg",
    });
    expect(result.analysis.roomType).toBe("living-room");
    expect(meta).toEqual({ provider: "openai", model: "gpt-4o" });
    expect(createMock).toHaveBeenCalledTimes(1);
    const payload = createMock.mock.calls[0]?.[0] as {
      model: string;
      response_format: { type: string };
    };
    expect(payload.model).toBe("gpt-4o");
    expect(payload.response_format).toEqual({ type: "json_object" });
  });

  it("rejects malformed provider JSON", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    createMock.mockResolvedValue({
      choices: [{ message: { content: "not-json" } }],
    });
    const { analyzeRoomImage } = await import("./openai");
    await expect(
      analyzeRoomImage({ bytes: Buffer.from("fake"), mime: "image/jpeg" })
    ).rejects.toMatchObject({ code: "invalid_result" });
  });

  it("maps missing API config", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const { analyzeRoomImage } = await import("./openai");
    await expect(
      analyzeRoomImage({ bytes: Buffer.from("fake"), mime: "image/jpeg" })
    ).rejects.toMatchObject({ code: "provider_unconfigured" });
    expect(createMock).not.toHaveBeenCalled();
  });

  it("maps provider timeout", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    createMock.mockRejectedValue({ name: "APIConnectionTimeoutError", message: "timed out" });
    const { analyzeRoomImage } = await import("./openai");
    await expect(
      analyzeRoomImage({ bytes: Buffer.from("fake"), mime: "image/jpeg" })
    ).rejects.toMatchObject({ code: "provider_timeout" });
  });
});

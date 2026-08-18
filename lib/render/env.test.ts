import { afterEach, describe, expect, it, vi } from "vitest";
import { getOpenAiImageQuality, getOpenAiImageSize, isOpenAiImageRenderEnabled } from "./env";

describe("OpenAI image render env", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults the kill switch to off", () => {
    vi.stubEnv("OPENAI_IMAGE_RENDER_ENABLED", "");
    expect(isOpenAiImageRenderEnabled()).toBe(false);
  });

  it("enables only for true/1/yes", () => {
    vi.stubEnv("OPENAI_IMAGE_RENDER_ENABLED", "true");
    expect(isOpenAiImageRenderEnabled()).toBe(true);
    vi.stubEnv("OPENAI_IMAGE_RENDER_ENABLED", "YES");
    expect(isOpenAiImageRenderEnabled()).toBe(true);
    vi.stubEnv("OPENAI_IMAGE_RENDER_ENABLED", "false");
    expect(isOpenAiImageRenderEnabled()).toBe(false);
  });

  it("defaults MVP quality to medium and size to auto", () => {
    vi.stubEnv("OPENAI_IMAGE_QUALITY", "");
    vi.stubEnv("OPENAI_IMAGE_SIZE", "");
    expect(getOpenAiImageQuality()).toBe("medium");
    expect(getOpenAiImageSize()).toBe("auto");
  });
});

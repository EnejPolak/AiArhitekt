import { afterEach, describe, expect, it, vi } from "vitest";
import { RenderError } from "./errors";

const { editMock } = vi.hoisted(() => ({ editMock: vi.fn() }));

vi.mock("openai", () => ({
  default: class OpenAI {
    images = { edit: editMock };
    constructor(_opts: unknown) {}
  },
}));

const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("editRoomImageWithOpenAI", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    editMock.mockReset();
  });

  it("does not call the provider when the kill switch is off", async () => {
    vi.stubEnv("OPENAI_IMAGE_RENDER_ENABLED", "false");
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    const { editRoomImageWithOpenAI } = await import("./openai");
    await expect(
      editRoomImageWithOpenAI({
        prompt: "edit",
        images: [
          { filename: "01.jpg", mime: "image/jpeg", bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]) },
          { filename: "02.jpg", mime: "image/jpeg", bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]) },
        ],
      })
    ).rejects.toMatchObject({ code: "render_disabled" });
    expect(editMock).not.toHaveBeenCalled();
  });

  it("sends gpt-image-1.5, high input_fidelity, and the image file array", async () => {
    vi.stubEnv("OPENAI_IMAGE_RENDER_ENABLED", "true");
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("OPENAI_IMAGE_QUALITY", "medium");
    vi.stubEnv("OPENAI_IMAGE_SIZE", "auto");
    editMock.mockResolvedValue({ data: [{ b64_json: PNG_B64 }] });
    const { editRoomImageWithOpenAI } = await import("./openai");
    const room = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const sofa = new Uint8Array([0xff, 0xd8, 0xff, 0x00, 0xd9]);
    const result = await editRoomImageWithOpenAI({
      prompt: "Image 1 is the original room",
      images: [
        { filename: "01-original-room.jpg", mime: "image/jpeg", bytes: room },
        { filename: "02-furniture:sofa:0.jpg", mime: "image/jpeg", bytes: sofa },
      ],
    });
    expect(result.mime).toBe("image/png");
    expect(editMock).toHaveBeenCalledTimes(1);
    const payload = editMock.mock.calls[0]?.[0] as {
      model: string;
      input_fidelity: string;
      quality: string;
      size: string;
      image: File[];
      prompt: string;
    };
    expect(payload.model).toBe("gpt-image-1.5");
    expect(payload.input_fidelity).toBe("high");
    expect(payload.quality).toBe("medium");
    expect(payload.size).toBe("auto");
    expect(payload.prompt).toContain("original room");
    expect(Array.isArray(payload.image)).toBe(true);
    expect(payload.image[0]?.name).toBe("01-original-room.jpg");
    expect(payload.image[1]?.name).toBe("02-furniture:sofa:0.jpg");
  });

  it("rejects provider output that is not b64 image bytes", async () => {
    vi.stubEnv("OPENAI_IMAGE_RENDER_ENABLED", "true");
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    editMock.mockResolvedValue({ data: [{ url: "https://cdn.openai.example/out.png" }] });
    const { editRoomImageWithOpenAI } = await import("./openai");
    await expect(
      editRoomImageWithOpenAI({
        prompt: "edit",
        images: [
          { filename: "01.jpg", mime: "image/jpeg", bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]) },
          { filename: "02.jpg", mime: "image/jpeg", bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]) },
        ],
      })
    ).rejects.toBeInstanceOf(RenderError);
    expect(editMock).toHaveBeenCalledTimes(1);
  });
});

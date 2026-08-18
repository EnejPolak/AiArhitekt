import { describe, expect, it } from "vitest";
import { RenderError, mapRenderProviderFailure, renderErrorMessage, renderRateLimitMessage } from "./errors";
import { validateRenderOutputBytes } from "./validate";
import { PRODUCT_FIDELITY_DISCLAIMER } from "./constants";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);

describe("render helpers", () => {
  it("validates PNG magic bytes and rejects empty output", () => {
    expect(validateRenderOutputBytes(PNG).mime).toBe("image/png");
    expect(() => validateRenderOutputBytes(new Uint8Array())).toThrow(RenderError);
    expect(() => validateRenderOutputBytes(Uint8Array.from([1, 2, 3, 4]))).toThrow(RenderError);
  });

  it("maps provider failures without leaking payloads", () => {
    const mapped = mapRenderProviderFailure({ status: 500, message: "openai stack" });
    expect(mapped.code).toBe("provider_failed");
    expect(mapped.message).toBe(renderErrorMessage("provider_failed"));
    expect(mapped.message).not.toContain("openai stack");
    expect(renderRateLimitMessage(12)).toContain("12 seconds");
  });

  it("keeps the product-fidelity disclaimer", () => {
    expect(PRODUCT_FIDELITY_DISCLAIMER).toBe(
      "Visualization created using your selected product references."
    );
  });

  it("does not call image generation from load, confirm, find-products, or analysis", () => {
    const files = [
      "lib/discovery/actions.ts",
      "lib/analysis/actions.ts",
      "lib/analysis/analyze.ts",
      "lib/uploads/actions.ts",
      "lib/render/server.ts",
      "app/app/projects/[projectId]/page.tsx",
    ];
    for (const file of files) {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      expect(source).not.toContain("generateRoomRender(");
      expect(source).not.toContain("editRoomImageWithOpenAI");
      expect(source).not.toContain("gpt-image-1.5");
    }
  });
});

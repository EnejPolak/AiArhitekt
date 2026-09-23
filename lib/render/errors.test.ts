import { describe, expect, it } from "vitest";
import { RenderError, mapRenderProviderFailure, renderErrorMessage, renderRateLimitMessage } from "./errors";
import { validateRenderOutputBytes } from "./validate";
import { PRODUCT_FIDELITY_DISCLAIMER, PHYSICAL_FIT_DISCLAIMER } from "./constants";
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
      "Visualization created from your room photo using selected product images as visual references. It is not a photograph of those exact items in your room."
    );
    expect(PHYSICAL_FIT_DISCLAIMER).toContain("Physical fit is not verified");
    expect(renderErrorMessage("incomplete_design_brief")).toBe(
      "Complete Design Brief before generating a design."
    );
  });

  it("blocks incomplete briefs in the generate action before any image provider call", () => {
    const source = readFileSync(join(process.cwd(), "lib/render/actions.ts"), "utf8");
    const gateAt = source.indexOf("designBriefGenerateGate");
    const generateAt = source.indexOf("generateRoomRender(");
    expect(gateAt).toBeGreaterThan(0);
    expect(generateAt).toBeGreaterThan(gateAt);
    expect(source).toContain("incomplete_design_brief");
    expect(source).not.toContain("editRoomImageWithOpenAI");
  });

  it("loads the final report image from persisted renders without generating", () => {
    const step10 = readFileSync(
      join(process.cwd(), "components/app/room-renovation/steps/Step10FinalReport.tsx"),
      "utf8"
    );
    expect(step10).toContain("loadRoomRenderState");
    expect(step10).toContain("PHYSICAL_FIT_DISCLAIMER");
    expect(step10).not.toContain("generateRoomRenderAction");
    expect(step10).not.toContain("console.log");
    expect(step10).not.toContain("Download Project Report");
    expect(step10).toContain("PDF export is not available yet");
  });

  it("exposes approval, back navigation, and brief completion on Generate", () => {
    const generate = readFileSync(join(process.cwd(), "components/app/room-renovation/steps/Step9bProductSourcing.tsx"), "utf8");
    const panel = readFileSync(join(process.cwd(), "components/app/room-renovation/FinalRoomRenderPanel.tsx"), "utf8");
    const flow = readFileSync(join(process.cwd(), "components/app/room-renovation/RoomRenovationFlow.tsx"), "utf8");
    expect(generate).toContain("Back to products");
    expect(panel).toContain("onToggleConfirmed");
    expect(panel).toContain("Complete Design Brief");
    expect(flow).toContain("setProductConfirmed");
    expect(flow).not.toContain("generateRoomRender(");
    const confirm = readFileSync(join(process.cwd(), "lib/discovery/actions.ts"), "utf8");
    const confirmFn = confirm.slice(confirm.indexOf("export async function setProductConfirmed"));
    const readySkip = confirmFn.indexOf('selection.referenceStatus !== "ready"');
    const ensureAt = confirmFn.indexOf("ensureProductReferenceAssets");
    expect(readySkip).toBeGreaterThan(0);
    expect(ensureAt).toBeGreaterThan(readySkip);
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

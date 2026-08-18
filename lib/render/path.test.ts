import { describe, expect, it } from "vitest";
import { buildRoomRenderPath, parseRoomRenderPath } from "./path";

describe("room render storage path", () => {
  const projectId = "11111111-1111-4111-8111-111111111111";
  const renderId = "22222222-2222-4222-8222-222222222222";

  it("builds a deterministic private path", () => {
    expect(buildRoomRenderPath(projectId, renderId, "image/webp")).toBe(
      `projects/${projectId}/renders/${renderId}.webp`
    );
    expect(parseRoomRenderPath(`projects/${projectId}/renders/${renderId}.png`)).toMatchObject({
      projectId,
      renderId,
      ext: "png",
    });
    expect(parseRoomRenderPath("../secret.png")).toBeNull();
    expect(parseRoomRenderPath(`projects/${projectId}/product-references/${renderId}.jpg`)).toBeNull();
  });
});

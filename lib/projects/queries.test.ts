import { describe, expect, it, vi } from "vitest";
import { getProjectById } from "./queries";

describe("getProjectById", () => {
  it("returns null for an invalid id without querying", async () => {
    const from = vi.fn();
    const result = await getProjectById({ from } as never, "not-a-uuid");
    expect(result).toBeNull();
    expect(from).not.toHaveBeenCalled();
  });
});

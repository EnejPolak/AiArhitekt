import { afterEach, describe, expect, it, vi } from "vitest";
import { getProjectById, listActiveProjects } from "./queries";

describe("getProjectById", () => {
  it("returns null for an invalid id without querying", async () => {
    const from = vi.fn();
    const result = await getProjectById({ from } as never, "not-a-uuid");
    expect(result).toBeNull();
    expect(from).not.toHaveBeenCalled();
  });
});

describe("listActiveProjects", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function clientWithOrder(order: ReturnType<typeof vi.fn>) {
    const is = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ is }));
    const from = vi.fn(() => ({ select }));
    return { from } as never;
  }

  it("returns an empty list when the authenticated user owns no projects", async () => {
    const order = vi.fn().mockResolvedValue({ data: [], error: null });
    await expect(listActiveProjects(clientWithOrder(order))).resolves.toEqual([]);
  });

  it("retries once after JWT iat skew and then returns the empty list", async () => {
    vi.useFakeTimers();
    const order = vi
      .fn()
      .mockResolvedValueOnce({
        data: null,
        error: { code: "PGRST303", message: "JWT issued at future" },
      })
      .mockResolvedValueOnce({ data: [], error: null });
    const pending = listActiveProjects(clientWithOrder(order));
    await vi.advanceTimersByTimeAsync(800);
    await expect(pending).resolves.toEqual([]);
    expect(order).toHaveBeenCalledTimes(2);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkDailyCap, resetDailyUsage } from "@/lib/serpGuardrails";
import { POST } from "./route";

vi.mock("@/lib/serpGuardrails", () => ({
  resetDailyUsage: vi.fn(),
  checkDailyCap: vi.fn(),
}));

const resetDailyUsageMock = vi.mocked(resetDailyUsage);
const checkDailyCapMock = vi.mocked(checkDailyCap);

const KEYS = [
  "VERCEL_ENV",
  "VERCEL_TARGET_ENV",
  "APP_DEPLOYMENT_ENV",
  "API_DEBUG_ENABLED",
] as const;
const snapshot: Record<string, string | undefined> = {};

describe("POST /api/serp/reset-usage", () => {
  beforeEach(() => {
    for (const key of KEYS) snapshot[key] = process.env[key];
    for (const key of KEYS) delete process.env[key];
    resetDailyUsageMock.mockReset();
    checkDailyCapMock.mockReset();
  });

  afterEach(() => {
    for (const key of KEYS) {
      const value = snapshot[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("returns 404 in production even when API_DEBUG_ENABLED is true", async () => {
    process.env.VERCEL_ENV = "production";
    process.env.API_DEBUG_ENABLED = "true";
    const res = await POST();
    expect(res.status).toBe(404);
    expect(resetDailyUsageMock).not.toHaveBeenCalled();
  });

  it("resets usage when explicitly enabled outside production", async () => {
    process.env.API_DEBUG_ENABLED = "true";
    resetDailyUsageMock.mockResolvedValue({ date: "2026-08-18", used: 0 });
    checkDailyCapMock.mockResolvedValue({
      allowed: true,
      used: 0,
      remaining: 100,
    });

    const res = await POST();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(resetDailyUsageMock).toHaveBeenCalledTimes(1);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchSerp } from "@/lib/serp/provider";
import {
  checkDailyCap,
  getSerpCachedByKey,
  incrementDailyUsage,
  setSerpCachedByKey,
  waitForRateLimit,
} from "@/lib/serpGuardrails";
import { runCanonicalSerpSearch } from "@/lib/serp/search";

vi.mock("@/lib/serp/provider", () => ({
  fetchSerp: vi.fn(),
}));

vi.mock("@/lib/serpGuardrails", () => ({
  checkDailyCap: vi.fn(async () => ({ allowed: true, used: 1, remaining: 99 })),
  waitForRateLimit: vi.fn(async () => {}),
  incrementDailyUsage: vi.fn(async () => {}),
  getSerpCachedByKey: vi.fn(() => null),
  setSerpCachedByKey: vi.fn(),
}));

vi.mock("@/lib/serp/domainStats", () => ({
  rankDomainsBySuccess: vi.fn(async (domains: string[]) => domains),
  recordDomainOutcome: vi.fn(async () => {}),
}));

const fetchSerpMock = vi.mocked(fetchSerp);
const checkDailyCapMock = vi.mocked(checkDailyCap);
const incrementDailyUsageMock = vi.mocked(incrementDailyUsage);
const getSerpCachedByKeyMock = vi.mocked(getSerpCachedByKey);
const setSerpCachedByKeyMock = vi.mocked(setSerpCachedByKey);

const allowlist = ["localhome.si", "bauhaus.si"];

describe("canonical SERP per-query fault tolerance (P1.6.6.2)", () => {
  beforeEach(() => {
    fetchSerpMock.mockReset();
    incrementDailyUsageMock.mockClear();
    getSerpCachedByKeyMock.mockReset();
    setSerpCachedByKeyMock.mockClear();
    checkDailyCapMock.mockResolvedValue({ allowed: true, used: 1, remaining: 99 });
    process.env.SERPAPI_KEY = "test-serp-key";
  });

  it("19: one query 500 does not fail entire canonical search", async () => {
    fetchSerpMock
      .mockResolvedValueOnce([
        {
          title: "Računalniška miza bela",
          link: "https://www.localhome.si/p/desk",
          snippet: "miza",
        },
      ])
      .mockRejectedValueOnce(new Error("SERP API error: 500 Internal Server Error"));

    const outcome = await runCanonicalSerpSearch({
      items: ["računalniška miza"],
      allowlistDomains: allowlist,
      fastMode: true,
      maxRequests: 4,
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.response.results[0]?.picked?.title).toContain("Računalniška miza");
    expect(outcome.response.queryFailures).toHaveLength(1);
    expect(outcome.response.queryFailures[0]?.code).toBe("provider_5xx");
    expect(outcome.response.providerAttempts).toBe(2);
    expect(outcome.response.providerSuccesses).toBe(1);
    expect(outcome.response.providerFailures).toBe(1);
  });

  it("20: timeout + success preserves success and counts both attempts", async () => {
    fetchSerpMock
      .mockRejectedValueOnce(new Error("SERP API request timeout"))
      .mockResolvedValueOnce([
        {
          title: "Gaming stol ergonomski",
          link: "https://www.localhome.si/p/chair",
          snippet: "gaming stol",
        },
      ]);

    const outcome = await runCanonicalSerpSearch({
      items: ["gaming stol"],
      allowlistDomains: allowlist,
      fastMode: true,
      maxRequests: 4,
      retryOnTimeout: false,
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.response.providerAttempts).toBe(2);
    expect(outcome.response.providerSuccesses).toBe(1);
    expect(outcome.response.providerFailures).toBe(1);
    expect(outcome.response.results[0]?.topCandidates.length).toBeGreaterThan(0);
    expect(incrementDailyUsageMock).toHaveBeenCalledTimes(2);
  });

  it("21: provider quota 429 aborts entire canonical search", async () => {
    fetchSerpMock.mockRejectedValueOnce(new Error("SERP API error: 429 Too Many Requests"));

    const outcome = await runCanonicalSerpSearch({
      items: ["gaming stol"],
      allowlistDomains: allowlist,
      fastMode: true,
      maxRequests: 4,
    });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.httpStatus).toBe(429);
    expect(outcome.error).toMatch(/cap|quota/i);
  });

  it("22: cache hit costs zero provider attempts", async () => {
    getSerpCachedByKeyMock.mockReturnValueOnce({
      organic: [
        {
          title: "Cached miza",
          link: "https://www.localhome.si/p/cached",
          snippet: "cached",
        },
      ],
    });
    fetchSerpMock.mockResolvedValueOnce([
      {
        title: "Live miza",
        link: "https://www.bauhaus.si/p/live",
        snippet: "live",
      },
    ]);

    const outcome = await runCanonicalSerpSearch({
      items: ["računalniška miza"],
      allowlistDomains: allowlist,
      fastMode: true,
      maxRequests: 4,
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.response.providerAttempts).toBe(1);
    expect(outcome.response.cacheHits).toBe(1);
    expect(incrementDailyUsageMock).toHaveBeenCalledTimes(1);
  });

  it("23: failed query is not cached and is retried on next run", async () => {
    fetchSerpMock
      .mockRejectedValueOnce(new Error("network fetch failed"))
      .mockRejectedValueOnce(new Error("network fetch failed"))
      .mockResolvedValueOnce([
        {
          title: "Gaming stol",
          link: "https://www.localhome.si/p/chair",
          snippet: "gaming",
        },
      ])
      .mockResolvedValueOnce([
        {
          title: "Gaming stol extra",
          link: "https://www.bauhaus.si/p/chair",
          snippet: "gaming",
        },
      ]);

    const first = await runCanonicalSerpSearch({
      items: ["gaming stol"],
      allowlistDomains: allowlist,
      fastMode: true,
      maxRequests: 2,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.response.queryFailures.length).toBeGreaterThanOrEqual(1);
    expect(setSerpCachedByKeyMock).not.toHaveBeenCalled();

    const second = await runCanonicalSerpSearch({
      items: ["gaming stol"],
      allowlistDomains: allowlist,
      fastMode: true,
      maxRequests: 2,
    });

    expect(second.ok).toBe(true);
    expect(fetchSerpMock.mock.calls.length).toBeGreaterThan(first.response.providerAttempts);
  });
});

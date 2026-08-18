import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchSerp } from "@/lib/serp/provider";
import { checkDailyCap, incrementDailyUsage, waitForRateLimit } from "@/lib/serpGuardrails";
import { POST } from "./route";

vi.mock("@/lib/serp/provider", () => ({
  fetchSerp: vi.fn(),
}));

vi.mock("@/lib/serpGuardrails", () => ({
  checkDailyCap: vi.fn(async () => ({ allowed: true, used: 4, remaining: 96 })),
  waitForRateLimit: vi.fn(async () => {}),
  incrementDailyUsage: vi.fn(async () => {}),
  getSerpCachedByKey: vi.fn(() => null),
  setSerpCachedByKey: vi.fn(),
}));

vi.mock("@/lib/serp/domainStats", () => ({
  rankDomainsBySuccess: vi.fn(async (domains: string[]) => domains),
  recordDomainOutcome: vi.fn(async () => {}),
}));

vi.mock("@/lib/serp/enrich", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/serp/enrich")>();
  return {
    ...actual,
    enrichProductPage: vi.fn(async () => ({
      price: null,
      currency: null,
      image: null,
    })),
  };
});

const fetchSerpMock = vi.mocked(fetchSerp);
const checkDailyCapMock = vi.mocked(checkDailyCap);
const incrementDailyUsageMock = vi.mocked(incrementDailyUsage);
const waitForRateLimitMock = vi.mocked(waitForRateLimit);

function request(body: unknown): Request {
  return new Request("http://localhost/api/serp/search", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "127.0.0.1" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/serp/search", () => {
  beforeEach(() => {
    fetchSerpMock.mockReset();
    incrementDailyUsageMock.mockClear();
    waitForRateLimitMock.mockClear();
    checkDailyCapMock.mockResolvedValue({ allowed: true, used: 4, remaining: 96 });
    process.env.SERPAPI_KEY = "test-serp-key";
    delete process.env.ENRICH_PRODUCT_PAGE;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("unexpected network fetch in SERP route test");
      })
    );
  });

  it("returns 400 for an invalid request body", async () => {
    const res = await POST(request({ items: "not-an-array" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Invalid SERP request");
    expect(fetchSerpMock).not.toHaveBeenCalled();
  });

  it("returns 400 when allowlistDomains is empty", async () => {
    const res = await POST(
      request({ items: ["stenska barva bela"], allowlistDomains: [] })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("allowlistDomains required");
    expect(fetchSerpMock).not.toHaveBeenCalled();
  });

  it("dryRun does not execute provider searches and returns executedCount 0", async () => {
    const res = await POST(
      request({
        items: ["stenska barva bela"],
        allowlistDomains: ["merkur.si"],
        dryRun: true,
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.dryRun).toBe(true);
    expect(json.executedCount).toBe(0);
    expect(json.dailyUsed).toBe(4);
    expect(json.dailyRemaining).toBe(96);
    expect(json.results[0].picked).toBeNull();
    expect(fetchSerpMock).not.toHaveBeenCalled();
    expect(waitForRateLimitMock).not.toHaveBeenCalled();
    expect(incrementDailyUsageMock).not.toHaveBeenCalled();
  });

  it("successful pick uses canonical url (not link), includes quota fields, and does not invent price", async () => {
    fetchSerpMock.mockResolvedValue([
      {
        title: "Stenska barva bela 10L",
        link: "https://www.merkur.si/p/stenska-barva-bela",
        snippet: "Interior wall paint",
      },
    ]);

    const res = await POST(
      request({
        items: ["stenska barva bela"],
        allowlistDomains: ["merkur.si"],
        dryRun: false,
        fastMode: true,
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe(200);
    expect(json.dailyUsed).toBe(4);
    expect(json.dailyRemaining).toBe(96);
    expect(json.executedCount).toBeGreaterThan(0);
    expect(fetchSerpMock).toHaveBeenCalled();

    const picked = json.results[0].picked;
    expect(picked).not.toBeNull();
    expect(picked.url).toBe("https://www.merkur.si/p/stenska-barva-bela");
    expect(picked).not.toHaveProperty("link");
    expect(picked.price).toBeNull();
    expect(picked.currency).toBeNull();
    expect(picked.title).toBe("Stenska barva bela 10L");
  });

  it("returns picked: null when no real product result exists", async () => {
    fetchSerpMock.mockResolvedValue([
      {
        title: "Kategorija barve",
        link: "https://www.merkur.si/c/stenske-barve",
        snippet: "Pregled kategorije",
      },
    ]);

    const res = await POST(
      request({
        items: ["stenska barva bela"],
        allowlistDomains: ["merkur.si"],
        dryRun: false,
        fastMode: true,
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.results[0].picked).toBeNull();
    const payload = JSON.stringify(json);
    expect(payload).not.toMatch(/"link"\s*:/);
    expect(json.results[0]).not.toMatchObject({ picked: { price: expect.any(Number) } });
  });
});

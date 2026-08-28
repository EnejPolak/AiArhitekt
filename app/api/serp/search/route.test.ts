import { beforeEach, describe, expect, it, vi } from "vitest";
import { runOpenAIProductDiscovery } from "@/lib/productDiscovery/search";
import { POST } from "./route";

vi.mock("@/lib/productDiscovery/search", () => ({
  runOpenAIProductDiscovery: vi.fn(),
}));

const runOpenAIProductDiscoveryMock = vi.mocked(runOpenAIProductDiscovery);

function request(body: unknown): Request {
  return new Request("http://localhost/api/serp/search", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "127.0.0.1" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/serp/search", () => {
  beforeEach(() => {
    runOpenAIProductDiscoveryMock.mockReset();
  });

  it("returns 400 for an invalid request body", async () => {
    const res = await POST(request({ items: "not-an-array" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Invalid SERP request");
    expect(runOpenAIProductDiscoveryMock).not.toHaveBeenCalled();
  });

  it("returns no_retailers results when allowlistDomains is empty", async () => {
    runOpenAIProductDiscoveryMock.mockResolvedValue({
      ok: true,
      response: {
        dryRun: false,
        plannedQueries: { "stenska barva bela": [] },
        plannedTotalQueries: 0,
        effectiveMaxRequests: 1,
        executedCount: 0,
        dailyUsed: 0,
        dailyRemaining: 0,
        results: [{ item: "stenska barva bela", picked: null, topCandidates: [] }],
        status: 200,
        productDiscoveryResults: [
          {
            requestedItem: "stenska barva bela",
            status: "no_retailers",
            product: null,
            sources: [],
          },
        ],
      },
    });

    const res = await POST(
      request({ items: ["stenska barva bela"], allowlistDomains: [] })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.productDiscoveryResults[0].status).toBe("no_retailers");
    expect(json.results[0].picked).toBeNull();
  });

  it("dryRun does not execute OpenAI searches and returns executedCount 0", async () => {
    runOpenAIProductDiscoveryMock.mockResolvedValue({
      ok: true,
      response: {
        dryRun: true,
        plannedQueries: { "stenska barva bela": ["openai:web_search:merkur.si"] },
        plannedTotalQueries: 1,
        effectiveMaxRequests: 1,
        executedCount: 0,
        dailyUsed: 0,
        dailyRemaining: 0,
        results: [{ item: "stenska barva bela", picked: null, topCandidates: [] }],
        status: 200,
      },
    });

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
    expect(json.results[0].picked).toBeNull();
  });

  it("maps a found OpenAI product to canonical picked without inventing price", async () => {
    runOpenAIProductDiscoveryMock.mockResolvedValue({
      ok: true,
      response: {
        dryRun: false,
        plannedQueries: { "stenska barva bela": ["openai:web_search:merkur.si"] },
        plannedTotalQueries: 1,
        effectiveMaxRequests: 1,
        executedCount: 1,
        dailyUsed: 0,
        dailyRemaining: 0,
        results: [
          {
            item: "stenska barva bela",
            picked: {
              title: "Stenska barva bela 10L",
              url: "https://www.merkur.si/p/stenska-barva-bela",
              price: null,
              currency: null,
              image: null,
              domain: "merkur.si",
              score: 88,
              confidence: 0.88,
              reasons: ["white wall paint"],
              snippet: "Matches white interior paint.",
            },
            topCandidates: [],
          },
        ],
        status: 200,
      },
    });

    const res = await POST(
      request({
        items: ["stenska barva bela"],
        allowlistDomains: ["merkur.si"],
        dryRun: false,
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    const picked = json.results[0].picked;
    expect(picked).not.toBeNull();
    expect(picked.url).toBe("https://www.merkur.si/p/stenska-barva-bela");
    expect(picked.price).toBeNull();
    expect(picked.currency).toBeNull();
  });
});

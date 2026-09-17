import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getVerifiedUser } from "@/lib/auth/session";
import { isDebugApiAllowed } from "@/lib/env/deployment";
import { getPlaceDetails } from "@/lib/places/placesService";
import { POST as generatePost } from "@/app/api/generate/route";
import { POST as greetingPost } from "@/app/api/generate-greeting/route";
import { POST as budgetPlanPost } from "@/app/api/budget-plan/route";
import { POST as analyzeHomePost } from "@/app/api/analyze-home/route";
import { POST as renderPost } from "@/app/api/render/route";
import { POST as promptRoomRenderPost } from "@/app/api/prompt-room-render/route";
import { POST as renovateKitchenPost } from "@/app/api/renovate-kitchen/route";
import { POST as autoKitchenPost } from "@/app/api/mask/auto-kitchen/route";
import { POST as maskSegmentPost } from "@/app/api/mask/segment/route";
import { POST as generateItemsPost } from "@/app/api/orchestrator/generate-items/route";
import { POST as pickCandidatesPost } from "@/app/api/orchestrator/pick-candidates/route";
import { POST as summarizePost } from "@/app/api/orchestrator/summarize/route";
import { GET as placesDetailsGet } from "@/app/api/places/details/route";
import { GET as placesStoresGet } from "@/app/api/places-stores/route";
import { POST as placesContractorsPost } from "@/app/api/places-contractors/route";

const completionsCreate = vi.hoisted(() => vi.fn());
const imagesGenerate = vi.hoisted(() => vi.fn());
const imagesEdit = vi.hoisted(() => vi.fn());
const replicateRun = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  getVerifiedUser: vi.fn(),
}));

vi.mock("@/lib/env/deployment", async () => {
  const actual = await vi.importActual<typeof import("@/lib/env/deployment")>("@/lib/env/deployment");
  return {
    ...actual,
    isDebugApiAllowed: vi.fn(),
  };
});

vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create: completionsCreate } };
    images = { generate: imagesGenerate, edit: imagesEdit };
  },
}));

vi.mock("replicate", () => ({
  default: class {
    run = replicateRun;
  },
}));

vi.mock("@/lib/places/placesService", () => ({
  getPlaceDetails: vi.fn(),
}));

const getVerifiedUserMock = vi.mocked(getVerifiedUser);
const isDebugApiAllowedMock = vi.mocked(isDebugApiAllowed);
const getPlaceDetailsMock = vi.mocked(getPlaceDetails);

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "127.0.0.1" },
    body: JSON.stringify(body),
  });
}

function remainingSpendCalls(): Array<{ name: string; call: () => Promise<Response> }> {
  return [
    { name: "/api/generate", call: () => generatePost(jsonRequest("http://localhost/api/generate", {})) },
    {
      name: "/api/generate-greeting",
      call: () => greetingPost(jsonRequest("http://localhost/api/generate-greeting", {})),
    },
    {
      name: "/api/budget-plan",
      call: () => budgetPlanPost(jsonRequest("http://localhost/api/budget-plan", {})),
    },
    {
      name: "/api/analyze-home",
      call: () => analyzeHomePost(jsonRequest("http://localhost/api/analyze-home", { images: [] })),
    },
    { name: "/api/render", call: () => renderPost(jsonRequest("http://localhost/api/render", {})) },
    {
      name: "/api/prompt-room-render",
      call: () => promptRoomRenderPost(jsonRequest("http://localhost/api/prompt-room-render", {})),
    },
    {
      name: "/api/renovate-kitchen",
      call: () => renovateKitchenPost(jsonRequest("http://localhost/api/renovate-kitchen", {})),
    },
    {
      name: "/api/mask/auto-kitchen",
      call: () => autoKitchenPost(jsonRequest("http://localhost/api/mask/auto-kitchen", {})),
    },
    {
      name: "/api/mask/segment",
      call: () => maskSegmentPost(jsonRequest("http://localhost/api/mask/segment", {})),
    },
    {
      name: "/api/orchestrator/generate-items",
      call: () => generateItemsPost(jsonRequest("http://localhost/api/orchestrator/generate-items", {})),
    },
    {
      name: "/api/orchestrator/pick-candidates",
      call: () => pickCandidatesPost(jsonRequest("http://localhost/api/orchestrator/pick-candidates", {})),
    },
    {
      name: "/api/orchestrator/summarize",
      call: () => summarizePost(jsonRequest("http://localhost/api/orchestrator/summarize", {})),
    },
    {
      name: "/api/places/details",
      call: () => placesDetailsGet(new Request("http://localhost/api/places/details?placeId=abc")),
    },
    {
      name: "/api/places-stores",
      call: () => placesStoresGet(new Request("http://localhost/api/places-stores?lat=46&lng=14")),
    },
    {
      name: "/api/places-contractors",
      call: () =>
        placesContractorsPost(
          jsonRequest("http://localhost/api/places-contractors", { location: { lat: 46, lng: 14 }, neededTrades: [] })
        ),
    },
  ];
}

function listRouteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...listRouteFiles(full));
    else if (entry === "route.ts") out.push(full);
  }
  return out;
}

const SPEND_MARKERS =
  /openai|replicate|serpapi|googleapis|GOOGLE_MAPS_API_KEY|OPENAI_API_KEY|REPLICATE_API_TOKEN|SERPAPI_KEY|getPlaceDetails|searchPlaces|geocodeAddress|runOpenAIProductDiscovery/i;

describe("remaining spend route authentication", () => {
  beforeEach(() => {
    getVerifiedUserMock.mockReset();
    isDebugApiAllowedMock.mockReset();
    getPlaceDetailsMock.mockReset();
    completionsCreate.mockReset();
    imagesGenerate.mockReset();
    imagesEdit.mockReset();
    replicateRun.mockReset();
    isDebugApiAllowedMock.mockReturnValue(false);
    getVerifiedUserMock.mockResolvedValue(null);
    delete process.env.OPENAI_API_KEY;
    delete process.env.REPLICATE_API_TOKEN;
    delete process.env.SERPAPI_KEY;
    delete process.env.GOOGLE_MAPS_API_KEY;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("locks every spend-capable API route behind requireSpendRouteAuth", () => {
    const apiRoot = join(process.cwd(), "app/api");
    const spendFiles: string[] = [];
    for (const file of listRouteFiles(apiRoot)) {
      const rel = file.slice(process.cwd().length + 1);
      if (rel.includes("serp/reset-usage")) continue;
      const text = readFileSync(file, "utf8");
      if (SPEND_MARKERS.test(text)) spendFiles.push(rel);
    }

    expect(spendFiles.length).toBeGreaterThan(10);
    for (const rel of spendFiles) {
      const text = readFileSync(join(process.cwd(), rel), "utf8");
      expect(text, rel).toContain("requireSpendRouteAuth");
    }

    const resetUsage = readFileSync(join(process.cwd(), "app/api/serp/reset-usage/route.ts"), "utf8");
    expect(resetUsage).not.toMatch(/openai|replicate|serpapi\.com|GOOGLE_MAPS/i);
    expect(resetUsage).toContain("isDebugApiAllowed");
  });

  it("does not expose provider keys as NEXT_PUBLIC_*", () => {
    const envExample = readFileSync(join(process.cwd(), "env.example"), "utf8");
    expect(envExample).not.toMatch(/NEXT_PUBLIC_OPENAI/);
    expect(envExample).not.toMatch(/NEXT_PUBLIC_REPLICATE/);
    expect(envExample).not.toMatch(/NEXT_PUBLIC_SERPAPI/);
    expect(envExample).not.toMatch(/NEXT_PUBLIC_GOOGLE_MAPS/);
    expect(envExample).toContain("OPENAI_API_KEY=");
    expect(envExample).toContain("GOOGLE_MAPS_API_KEY=");
  });

  it("returns 401 for unauthenticated production requests and does not execute providers", async () => {
    for (const { name, call } of remainingSpendCalls()) {
      const res = await call();
      expect(res.status, name).toBe(401);
      expect(await res.json()).toMatchObject({ error: "unauthenticated" });
    }
    expect(completionsCreate).not.toHaveBeenCalled();
    expect(imagesGenerate).not.toHaveBeenCalled();
    expect(imagesEdit).not.toHaveBeenCalled();
    expect(replicateRun).not.toHaveBeenCalled();
    expect(getPlaceDetailsMock).not.toHaveBeenCalled();
  });

  it("lets an authenticated user through to the handler", async () => {
    getVerifiedUserMock.mockResolvedValue({ id: "user-1" } as never);

    for (const { name, call } of remainingSpendCalls()) {
      const res = await call();
      expect(res.status, name).not.toBe(401);
    }
    expect(completionsCreate).not.toHaveBeenCalled();
    expect(imagesGenerate).not.toHaveBeenCalled();
    expect(imagesEdit).not.toHaveBeenCalled();
    expect(replicateRun).not.toHaveBeenCalled();
  });

  it("allows the explicit debug gate without a user", async () => {
    isDebugApiAllowedMock.mockReturnValue(true);
    const res = await greetingPost(jsonRequest("http://localhost/api/generate-greeting", {}));
    expect(res.status).toBe(200);
    expect(getVerifiedUserMock).not.toHaveBeenCalled();
    expect(completionsCreate).not.toHaveBeenCalled();
  });

  it("makes production debug bypass impossible", async () => {
    const { isDebugApiAllowed: realIsDebugApiAllowed } = await vi.importActual<
      typeof import("@/lib/env/deployment")
    >("@/lib/env/deployment");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("API_DEBUG_ENABLED", "true");
    expect(realIsDebugApiAllowed()).toBe(false);

    isDebugApiAllowedMock.mockImplementation(() => realIsDebugApiAllowed());
    getVerifiedUserMock.mockResolvedValue(null);
    const res = await greetingPost(jsonRequest("http://localhost/api/generate-greeting", {}));
    expect(res.status).toBe(401);
    expect(completionsCreate).not.toHaveBeenCalled();
  });

  it("does not leak provider error text on remaining spend 500s", async () => {
    getVerifiedUserMock.mockResolvedValue({ id: "user-1" } as never);
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    completionsCreate.mockRejectedValue(new Error("OPENAI_SECRET_LEAK quota exceeded"));
    getPlaceDetailsMock.mockRejectedValue(new Error("GOOGLE_SECRET_LEAK quota exceeded"));

    imagesGenerate.mockRejectedValue(new Error("OPENAI_SECRET_LEAK quota exceeded"));

    const budgetRes = await budgetPlanPost(
      jsonRequest("http://localhost/api/budget-plan", {
        roomType: "bedroom",
        budgetLevel: "mid",
        totalBudget: { min: 1000, max: 2000 },
      })
    );
    const renderRes = await renderPost(jsonRequest("http://localhost/api/render", { prompt: "room" }));
    const detailsRes = await placesDetailsGet(new Request("http://localhost/api/places/details?placeId=abc"));

    expect(budgetRes.status).toBe(500);
    expect(renderRes.status).toBe(500);
    expect(detailsRes.status).toBe(500);
    const budgetBody = await budgetRes.json();
    const renderBody = await renderRes.json();
    const detailsBody = await detailsRes.json();
    expect(JSON.stringify(budgetBody)).not.toMatch(/OPENAI_SECRET_LEAK|quota exceeded/i);
    expect(JSON.stringify(renderBody)).not.toMatch(/OPENAI_SECRET_LEAK|quota exceeded/i);
    expect(JSON.stringify(detailsBody)).not.toMatch(/GOOGLE_SECRET_LEAK|quota exceeded/i);
    expect(budgetBody.error).toBe("internal_error");
    expect(renderBody.error).toBe("internal_error");
    expect(detailsBody.error).toBe("internal_error");
  });
});

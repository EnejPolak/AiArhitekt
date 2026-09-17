import { NextResponse } from "next/server";
import OpenAI from "openai";
import { rulesBundle } from "@/lib/serp/searchBundle";
import { getSafeCandidates } from "@/lib/serp/safetyFilter";
import { gptPickJsonSchema } from "@/lib/schemas/ai";
import { requireSpendRouteAuth } from "@/lib/api/spendAuth";
import { sanitizedInternalErrorResponse } from "@/lib/api/publicError";

export const runtime = "nodejs";

const HOME_CATEGORIES = new Set([
  "bathroom_plumbing",
  "furniture",
  "decor_textiles",
  "lighting",
  "flooring",
  "paint_walls",
]);

/** ItemSpec keywords that indicate HOME context (only then we drop tool-intent for mirrors/decor). */
const HOME_CONTEXT_KEYWORDS = [
  "kopal", "stensk", "umival", "led", "spalnica", "dnevna", "pohištvo", "pohistvo",
  "dekor", "preproga", "postelja", "bathroom", "wall", "mirror", "ogledal",
  "living", "bedroom", "furniture", "decor",
];

function legacyUrl(legacy: { url?: string; link?: string } | null | undefined): string | undefined {
  const u = legacy?.url || legacy?.link;
  return u && u.trim() ? u.trim() : undefined;
}

function hasHomeContext(itemSpec: string): boolean {
  const lower = (itemSpec ?? "").toLowerCase();
  return HOME_CONTEXT_KEYWORDS.some((kw) => lower.includes(kw));
}

/** One candidate from SERP topCandidates */
type CandidateInput = {
  title: string;
  url: string;
  domain: string;
  snippet?: string;
  price?: { value: number; currency: "EUR"; unit?: "item" | "m2" | "from" | "set" } | null;
  image?: string | null;
  score: number;
  flags: {
    isProductLikeUrl: boolean;
    isCategoryLikeUrl: boolean;
    hasToolIntent: boolean;
    hasHomeIntent: boolean;
  };
};

/** One item with its candidates and optional legacy SERP pick */
type ItemWithCandidates = {
  item: string;
  category?: string;
  topCandidates: CandidateInput[];
  legacyPicked?: { url?: string; link?: string; title?: string; price?: string; currency?: string } | null;
};

/** Request body */
type PickCandidatesRequest = {
  items: ItemWithCandidates[];
};

/** One pick result */
type PickResult = {
  item: string;
  pickedUrl: string | null;
  pickedTitle?: string;
  pickedPrice?: { value: number; currency: "EUR"; unit?: "item" | "m2" | "from" | "set" } | null;
  confidence: "high" | "medium" | "low";
  reason: string;
  selectionSource: "gpt" | "fallback" | "legacy";
};

/** Response */
type PickCandidatesResponse = {
  picks: PickResult[];
};

/** Pre-filter: drop hasToolIntent only when category is home AND itemSpec has home context. */
function filterCandidates(item: ItemWithCandidates): CandidateInput[] {
  const category = (item.category ?? "").toLowerCase();
  const isHomeCategory = HOME_CATEGORIES.has(category);
  const itemHasHomeContext = hasHomeContext(item.item);
  if (!isHomeCategory || !itemHasHomeContext) return item.topCandidates;
  return item.topCandidates.filter((c) => !c.flags.hasToolIntent);
}

/** Safety filter: only candidates that pass tool/mustTokens/pdf/budget. Max 3 for GPT. */
function getSafeCandidatesForPick(item: ItemWithCandidates): CandidateInput[] {
  const bundle = rulesBundle(item.item);
  const filtered = filterCandidates(item);
  const safe = getSafeCandidates(item.item, bundle, filtered as import("@/lib/serp/safetyFilter").CandidateForFilter[], 3);
  return safe as CandidateInput[];
}

/** Best candidate by score (first in list, already sorted by score). */
function bestByScore(candidates: CandidateInput[]): CandidateInput | null {
  return candidates.length > 0 ? candidates[0] : null;
}

/** Must-hit token rules: if item matches pattern, candidate title+snippet must contain at least one of the tokens. */
const MUST_HIT_RULES: Array<{ pattern: RegExp; tokens: string[] }> = [
  { pattern: /ogledal|mirror/i, tokens: ["ogledal", "mirror", "ogledalo"] },
  { pattern: /preprog|tepih|rug/i, tokens: ["preprog", "tepih", "preproga", "rug"] },
  { pattern: /zaves|zagrinjal|ogrinjal|curtain/i, tokens: ["zaves", "zagrinjal", "ogrinjal", "zavesa", "curtain"] },
];

const MIN_TOKEN_OVERLAP = 1;

function getMustHitTokens(itemSpec: string): string[] | null {
  const lower = (itemSpec ?? "").toLowerCase();
  for (const { pattern, tokens } of MUST_HIT_RULES) {
    if (pattern.test(lower)) return tokens;
  }
  return null;
}

function getItemSpecTokens(itemSpec: string): string[] {
  const lower = (itemSpec ?? "").toLowerCase().replace(/[^\w\s]/g, " ");
  return lower.split(/\s+/).filter((t) => t.length >= 2);
}

/** True if candidate is a safe fallback: must-hit satisfied (when required) and min token overlap. */
function isSafeFallbackCandidate(itemSpec: string, candidate: CandidateInput): boolean {
  const text = `${candidate.title ?? ""} ${candidate.snippet ?? ""}`.toLowerCase();
  const specTokens = getItemSpecTokens(itemSpec);
  const mustHits = getMustHitTokens(itemSpec);
  if (mustHits != null) {
    const hasMustHit = mustHits.some((t) => text.includes(t));
    if (!hasMustHit) return false;
  }
  const overlap = specTokens.filter((t) => text.includes(t)).length;
  return overlap >= MIN_TOKEN_OVERLAP;
}

/** Best candidate by score that passes safe-fallback check; otherwise null. */
function safeFallbackBest(itemSpec: string, candidates: CandidateInput[]): CandidateInput | null {
  for (const c of candidates) {
    if (isSafeFallbackCandidate(itemSpec, c)) return c;
  }
  return null;
}

export async function POST(req: Request) {
  const auth = await requireSpendRouteAuth();
  if (!auth.ok) return auth.response;
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY not configured" },
        { status: 500 }
      );
    }

    const body: PickCandidatesRequest = await req.json().catch(() => ({}));
    const items: ItemWithCandidates[] = Array.isArray(body.items) ? body.items : [];

    if (items.length === 0) {
      return NextResponse.json(
        { error: "items array is required" },
        { status: 400 }
      );
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const picks: PickResult[] = [];

    for (const it of items) {
      const candidates = filterCandidates(it);
      const safeCandidates = getSafeCandidatesForPick(it);
      const legacy = it.legacyPicked;
      const legacyHref = legacyUrl(legacy);
      if (candidates.length === 0) {
        if (legacyHref) {
          const num = legacy?.price ? parseFloat(String(legacy.price).replace(",", ".")) : undefined;
          picks.push({
            item: it.item,
            pickedUrl: legacyHref,
            pickedTitle: legacy?.title,
            pickedPrice: typeof num === "number" && !Number.isNaN(num) ? { value: num, currency: "EUR" } : null,
            confidence: "low",
            reason: "No candidates after filter; using legacy SERP pick",
            selectionSource: "legacy",
          });
        } else {
          picks.push({
            item: it.item,
            pickedUrl: null,
            confidence: "low",
            reason: "No candidates after filter (e.g. tool-intent rejected for home item)",
            selectionSource: "legacy",
          });
        }
        continue;
      }
      if (safeCandidates.length === 0) {
        if (legacyHref) {
          const num = legacy?.price ? parseFloat(String(legacy.price).replace(",", ".")) : undefined;
          picks.push({
            item: it.item,
            pickedUrl: legacyHref,
            pickedTitle: legacy?.title,
            pickedPrice: typeof num === "number" && !Number.isNaN(num) ? { value: num, currency: "EUR" } : null,
            confidence: "low",
            reason: "No safe candidates (tool/mustTokens/pdf/budget); using legacy",
            selectionSource: "legacy",
          });
        } else {
          picks.push({
            item: it.item,
            pickedUrl: null,
            confidence: "low",
            reason: "No safe candidates (tool/mustTokens/pdf/budget)",
            selectionSource: "legacy",
          });
        }
        continue;
      }

      const systemPrompt = `You are choosing the best product match for a renovation item from a list of SERP candidates.
Output valid JSON only: { "pickedUrl": string | null, "pickedTitle": string | null, "pickedPrice": { "value": number, "currency": "EUR" } | null, "confidence": "high"|"medium"|"low", "reason": string }

Rules:
- Prefer product pages (isProductLikeUrl=true) over category/listing pages.
- NEVER pick a candidate with hasToolIntent=true for home/bathroom items (e.g. telescopic tool mirror for "Kopalniško stensko ogledalo").
- For bathroom mirror / decor items, prefer hasHomeIntent=true or title/snippet containing bathroom/wall/LED/mirror (kopal, stensk, ogledal, LED).
- If candidate price exceeds a "max X EUR" in the item spec, deprioritize or reject unless no alternative.
- If no safe match, return pickedUrl: null with reason explaining why.
- Use only URLs and data from the provided candidates. Do not invent.`;

      const candidatesJson = JSON.stringify(
        safeCandidates.map((c) => ({
          title: c.title,
          url: c.url,
          domain: c.domain,
          snippet: c.snippet?.slice(0, 200),
          price: c.price,
          score: c.score,
          flags: c.flags,
        })),
        null,
        2
      );

      const userPrompt = `Item spec: "${it.item}"
Category: ${it.category ?? "—"}

Candidates (safe, max 3):
${candidatesJson}

Choose the single best candidate or null. Return JSON: { "pickedUrl", "pickedTitle", "pickedPrice", "confidence", "reason" }`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: 400,
        response_format: { type: "json_object" },
      });

      const raw = completion.choices[0]?.message?.content?.trim();
      if (!raw) {
        const fallback = safeFallbackBest(it.item, safeCandidates);
        if (fallback) {
          picks.push({
            item: it.item,
            pickedUrl: fallback.url,
            pickedTitle: fallback.title,
            pickedPrice: fallback.price ?? null,
            confidence: "low",
            reason: "Empty LLM response; fallback best by score (must-hit + overlap)",
            selectionSource: "fallback",
          });
        } else if (legacyHref) {
          const l = it.legacyPicked;
          const num = l?.price ? parseFloat(String(l.price).replace(",", ".")) : undefined;
          picks.push({
            item: it.item,
            pickedUrl: legacyHref,
            pickedTitle: l?.title,
            pickedPrice: typeof num === "number" && !Number.isNaN(num) ? { value: num, currency: "EUR" } : null,
            confidence: "low",
            reason: "Empty LLM response; using legacy pick",
            selectionSource: "legacy",
          });
        } else {
          picks.push({
            item: it.item,
            pickedUrl: null,
            confidence: "low",
            reason: "Empty LLM response",
            selectionSource: "legacy",
          });
        }
        continue;
      }

      try {
        const parsedJson = gptPickJsonSchema.safeParse(JSON.parse(raw));
        const parsed = parsedJson.success ? parsedJson.data : null;
        const pickedUrl =
          parsed?.pickedUrl && parsed.pickedUrl.trim() ? parsed.pickedUrl.trim() : null;
        const match = pickedUrl ? safeCandidates.find((c) => c.url === pickedUrl) : undefined;
        const confidence =
          parsed?.confidence && ["high", "medium", "low"].includes(parsed.confidence)
            ? parsed.confidence
            : "low";
        const reason = parsed?.reason ?? "";

        const urlInSafe = Boolean(match);
        const useGptPick = Boolean(pickedUrl && urlInSafe && confidence !== "low" && match);
        if (useGptPick && match) {
          picks.push({
            item: it.item,
            pickedUrl: match.url,
            pickedTitle: match.title,
            pickedPrice: match.price ?? null,
            confidence,
            reason,
            selectionSource: "gpt",
          });
        } else if (pickedUrl && !urlInSafe) {
          const fallback = safeFallbackBest(it.item, safeCandidates);
          if (fallback) {
            picks.push({
              item: it.item,
              pickedUrl: fallback.url,
              pickedTitle: fallback.title,
              pickedPrice: fallback.price ?? null,
              confidence: "low",
              reason: "GPT picked unsafe URL; using safe fallback",
              selectionSource: "fallback",
            });
          } else if (legacyHref) {
            const l = it.legacyPicked;
            const num = l?.price ? parseFloat(String(l.price).replace(",", ".")) : undefined;
            picks.push({
              item: it.item,
              pickedUrl: legacyHref,
              pickedTitle: l?.title,
              pickedPrice: typeof num === "number" && !Number.isNaN(num) ? { value: num, currency: "EUR" } : null,
              confidence: "low",
              reason: "GPT picked unsafe URL; using legacy",
              selectionSource: "legacy",
            });
          } else {
            picks.push({
              item: it.item,
              pickedUrl: null,
              confidence: "low",
              reason: "GPT picked unsafe URL",
              selectionSource: "legacy",
            });
          }
        } else {
          const fallback = safeFallbackBest(it.item, safeCandidates);
          if (fallback) {
            picks.push({
              item: it.item,
              pickedUrl: fallback.url,
              pickedTitle: fallback.title,
              pickedPrice: fallback.price ?? null,
              confidence: "low",
              reason: `GPT returned null: ${reason?.slice(0, 80) ?? "no reason"}; fallback best by score (must-hit + overlap)`,
              selectionSource: "fallback",
            });
          } else if (legacyHref) {
            const l = it.legacyPicked;
            const num = l?.price ? parseFloat(String(l.price).replace(",", ".")) : undefined;
            picks.push({
              item: it.item,
              pickedUrl: legacyHref,
              pickedTitle: l?.title,
              pickedPrice: typeof num === "number" && !Number.isNaN(num) ? { value: num, currency: "EUR" } : null,
              confidence: "low",
              reason: "GPT returned null; using legacy pick",
              selectionSource: "legacy",
            });
          } else {
            picks.push({
              item: it.item,
              pickedUrl: null,
              confidence: "low",
              reason: reason || "GPT returned null",
              selectionSource: "legacy",
            });
          }
        }
      } catch {
        const fallback = safeFallbackBest(it.item, safeCandidates);
        if (fallback) {
          picks.push({
            item: it.item,
            pickedUrl: fallback.url,
            pickedTitle: fallback.title,
            pickedPrice: fallback.price ?? null,
            confidence: "low",
            reason: "Invalid JSON from LLM; fallback best by score (must-hit + overlap)",
            selectionSource: "fallback",
          });
        } else if (legacyHref) {
          const l = it.legacyPicked;
          const num = l?.price ? parseFloat(String(l.price).replace(",", ".")) : undefined;
          picks.push({
            item: it.item,
            pickedUrl: legacyHref,
            pickedTitle: l?.title,
            pickedPrice: typeof num === "number" && !Number.isNaN(num) ? { value: num, currency: "EUR" } : null,
            confidence: "low",
            reason: "Invalid JSON from LLM; using legacy pick",
            selectionSource: "legacy",
          });
        } else {
          picks.push({
            item: it.item,
            pickedUrl: null,
            confidence: "low",
            reason: "Invalid JSON from LLM",
            selectionSource: "legacy",
          });
        }
      }
    }

    const response: PickCandidatesResponse = { picks };
    return NextResponse.json(response);
  } catch (error: unknown) {
    return sanitizedInternalErrorResponse("pick-candidates error:", error);
  }
}

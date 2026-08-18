/**
 * Normalize SerpAPI JSON into internal organic rows.
 * Provider-specific fields stay here; the rest of the app never sees raw SerpAPI.
 */

import { serpApiResponseSchema } from "@/lib/schemas/serp";
import type { SerpOrganicResult } from "./pickBest";

function extractPriceString(item: {
  price?: unknown;
  rich_snippet?: unknown;
  rich_snippets?: unknown;
}): string | undefined {
  const fromPrice = item.price;
  if (typeof fromPrice === "string" && fromPrice.trim()) return fromPrice.trim();
  if (fromPrice && typeof fromPrice === "object" && "value" in fromPrice) {
    const v = (fromPrice as { value: unknown }).value;
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  const rich = item.rich_snippet as { price?: unknown } | undefined;
  if (rich && typeof rich.price === "string") return rich.price;
  const richTop = item.rich_snippets as { top?: { price?: unknown } } | undefined;
  if (richTop?.top && typeof richTop.top.price === "string") return richTop.top.price;
  return undefined;
}

export function normalizeSerpApiResponse(data: unknown): SerpOrganicResult[] {
  const parsed = serpApiResponseSchema.safeParse(data);
  if (!parsed.success) return [];
  const rows = parsed.data.organic_results ?? [];
  const organic: SerpOrganicResult[] = [];
  for (const item of rows) {
    const link = (item.link ?? "").trim();
    if (!link) continue;
    const priceStr = extractPriceString(item);
    organic.push({
      title: (item.title ?? "").trim(),
      link,
      snippet: item.snippet ?? "",
      price: priceStr,
      image: item.thumbnail ?? item.image,
      richSnippetPrice: priceStr,
    });
  }
  return organic;
}

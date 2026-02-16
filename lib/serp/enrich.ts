/**
 * Optional enrichment: fetch product page to extract price and image.
 * Gated by ENRICH_PRODUCT_PAGE=true; timeout 2.5s; fail gracefully.
 */

const ENRICH_TIMEOUT_MS = 2500;

export async function enrichProductPage(
  url: string
): Promise<{ price: number | null; currency: "EUR" | null; image: string | null }> {
  if (process.env.ENRICH_PRODUCT_PAGE !== "true") {
    return { price: null, currency: null, image: null };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ENRICH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SerpEnrich/1.0)" },
      redirect: "follow",
    });
    clearTimeout(timeout);
    if (!res.ok) return { price: null, currency: null, image: null };
    const html = await res.text();
    const price = parsePriceFromHtml(html);
    const image = parseOgImageFromHtml(html);
    return { price: price?.value ?? null, currency: price?.currency ?? null, image };
  } catch {
    clearTimeout(timeout);
    return { price: null, currency: null, image: null };
  }
}

function parsePriceFromHtml(html: string): PriceValue | null {
  const metaPrice = html.match(/<meta[^>]+property=["']product:price:amount["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']product:price:amount["']/i);
  if (metaPrice) {
    const num = parseFloat(metaPrice[1].replace(",", "."));
    if (!Number.isNaN(num) && num > 0) return { value: num, currency: "EUR" };
  }
  const schemaPrice = html.match(/"price"\s*:\s*["']?(\d+[,.]?\d*)["']?/i)
    || html.match(/"priceAmount"\s*:\s*(\d+[,.]?\d*)/i)
    || html.match(/itemprop=["']price["'][^>]*content=["']([^"']+)["']/i);
  if (schemaPrice) {
    const num = parseFloat((schemaPrice[1] ?? "").replace(",", "."));
    if (!Number.isNaN(num) && num > 0) return { value: num, currency: "EUR" };
  }
  const dataPrice = html.match(/data-price=["']([^"']+)["']/i) || html.match(/data-price=["']?(\d+[,.]?\d*)/i);
  if (dataPrice) {
    const num = parseFloat((dataPrice[1] ?? "").replace(",", "."));
    if (!Number.isNaN(num) && num > 0) return { value: num, currency: "EUR" };
  }
  const eurMatch = html.match(/(?:€|EUR)\s*(\d+[,.]?\d*)/i) || html.match(/(\d+[,.]?\d*)\s*(?:€|EUR)/i);
  if (eurMatch) {
    const num = parseFloat(eurMatch[1].replace(",", "."));
    if (!Number.isNaN(num) && num > 0) return { value: num, currency: "EUR" };
  }
  return null;
}

function parseOgImageFromHtml(html: string): string | null {
  const match = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  return match ? match[1].trim() : null;
}

/** Price unit for totals: only "item" (or missing) is summed; m2/from/set go to unit costs section */
export type PriceUnit = "item" | "m2" | "from" | "set";

/** Normalized EUR price for API */
export type PriceValue = { value: number; currency: "EUR"; unit?: PriceUnit };

/** Units that indicate the number is NOT a price (reject match if near these). */
const PRICE_UNIT_REJECT = /\b(lm|lumen|watts?|w\s*\d|k\s*\d|\d+\s*k\b|cm|mm|m\s*\d|\d+\s*m\b)\b/i;

/** True if text looks like a price context: contains € or EUR (strict; no lumens/W as price). */
function hasPriceContext(text: string): boolean {
  if (!text || !text.trim()) return false;
  return /€|EUR/i.test(text.trim());
}

/** Reject if the number is adjacent to unit-like tokens (e.g. "2.200 lm" => not price). */
function isNearUnit(text: string, numMatch: { index: number; 0: string }): boolean {
  const start = Math.max(0, numMatch.index - 25);
  const end = Math.min(text.length, numMatch.index + numMatch[0].length + 25);
  const slice = text.slice(start, end);
  return PRICE_UNIT_REJECT.test(slice);
}

/**
 * Robust EUR parser: only accepts numbers when text contains €/EUR or "Vaša cena"/DDV.
 * Rejects matches near units: lm, lumen, W, K, cm, mm (stops e.g. "2.200 lm" → 2.2 EUR).
 */
function parseEurFromText(text: string): { value: number; currency: "EUR" } | null {
  if (!text || !text.trim()) return null;
  const normalized = text.trim();
  if (!hasPriceContext(normalized)) return null;

  const withEur = /(?:€|EUR)\s*(\d+[,.]?\d*)/i.exec(normalized) ?? /(\d+[,.]?\d*)\s*(?:€|EUR)/i.exec(normalized);
  if (withEur?.[1]) {
    if (isNearUnit(normalized, withEur)) return null;
    const num = parseFloat(withEur[1].replace(",", "."));
    if (!Number.isNaN(num) && num >= 0 && num < 100000) return { value: num, currency: "EUR" };
  }
  return null;
}

/** Detect unit from text: "€/m2", "na m2" => m2; "od", "from" => from; "komplet", "set" => set; else item */
function detectUnitFromText(text: string): PriceUnit {
  if (!text || !text.trim()) return "item";
  const lower = text.toLowerCase().trim();
  if (/\€\/\s*m2|na\s*m2|\/m2|eur\/m2|euro\/m2|po\s*m2/i.test(lower)) return "m2";
  if (/\bod\s+\d|from\s+\d|ab\s+\d/i.test(lower)) return "from";
  if (/\bkomplet\b|\bset\b|\bkomplet\b/i.test(lower)) return "set";
  return "item";
}

/**
 * Parse price with precedence and unit: explicit price -> richSnippetPrice -> snippet.
 * Unit: "€/m2" => m2, "od X" / "from X" => from, else item.
 */
export function parsePriceFromAny(
  snippet: string | undefined,
  priceStr: string | undefined,
  richSnippetPrice?: string | undefined
): PriceValue | null {
  const sources = [priceStr, richSnippetPrice, snippet].filter(Boolean) as string[];
  for (const src of sources) {
    if (!src?.trim()) continue;
    const p = parseEurFromText(src);
    if (p) {
      const unit = detectUnitFromText(src);
      return { ...p, unit };
    }
  }
  const combined = [snippet].filter(Boolean).join(" ");
  if (combined) {
    const p = parseEurFromText(combined);
    if (p) {
      const unit = detectUnitFromText(combined);
      return { ...p, unit };
    }
  }
  return null;
}

/**
 * Parse price and currency from snippet or price string (from SERP response).
 */
export function parsePriceFromSnippet(
  snippet: string | undefined,
  priceStr: string | undefined
): { price: number | null; currency: "EUR" | null } {
  const p = parsePriceFromAny(snippet, priceStr);
  if (p) return { price: p.value, currency: "EUR" };
  return { price: null, currency: null };
}

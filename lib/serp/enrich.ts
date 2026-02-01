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

function parsePriceFromHtml(html: string): { value: number; currency: "EUR" } | null {
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

/**
 * Parse price and currency from snippet or price string (from SERP response).
 */
export function parsePriceFromSnippet(
  snippet: string | undefined,
  priceStr: string | undefined
): { price: number | null; currency: "EUR" | null } {
  const text = [priceStr, snippet].filter(Boolean).join(" ");
  const eurMatch = text.match(/(?:€|EUR)\s*(\d+[,.]?\d*)/i) || text.match(/(\d+[,.]?\d*)\s*(?:€|EUR)/i);
  if (eurMatch) {
    const num = parseFloat(eurMatch[1].replace(",", "."));
    if (!Number.isNaN(num) && num >= 0) return { price: num, currency: "EUR" };
  }
  if (/\d+[,.]\d{2}/.test(text)) {
    const m = text.match(/(\d+[,.]\d{2})/);
    if (m) {
      const num = parseFloat(m[1].replace(",", "."));
      if (!Number.isNaN(num) && num >= 0) return { price: num, currency: "EUR" };
    }
  }
  return { price: null, currency: null };
}

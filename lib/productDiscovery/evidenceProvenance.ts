/**
 * Compact, sanitized provenance for trusted merchant facts.
 * Never stores full HTML, scripts, cookies, or headers.
 */

export const MAX_EVIDENCE_EXCERPT_CHARS = 400;

export type EvidenceExtractionMethod =
  | "json_ld"
  | "meta"
  | "itemprop"
  | "data_attribute"
  | "spec_table"
  | "definition_list"
  | "product_attribute"
  | "product_text"
  | "url";

export function sanitizeEvidenceExcerpt(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const text = raw
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/\b(?:authorization|cookie|set-cookie|session(?:id)?|csrf|bearer)\b[^\n]{0,120}/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;
  return text.length > MAX_EVIDENCE_EXCERPT_CHARS
    ? text.slice(0, MAX_EVIDENCE_EXCERPT_CHARS)
    : text;
}

/** Provenance paths must not claim nav/footer/CSS/cookie chrome. */
export function isChromeEvidencePath(path: string | null | undefined): boolean {
  if (!path) return false;
  return /\b(nav|footer|header|style|script|cookie|consent|gdpr|megamenu|flyout|filter[-_]?menu|breadcrumb)\b/i.test(
    path
  );
}

export function safeSourcePath(path: string | null | undefined): string | null {
  if (!path?.trim()) return null;
  if (isChromeEvidencePath(path)) return null;
  return path.trim();
}

export function extractionMethodFromPriceSource(
  source: string,
  sourcePath?: string | null
): EvidenceExtractionMethod {
  if (source === "json_ld") return "json_ld";
  if (source === "meta") return "meta";
  if (source === "microdata") return "itemprop";
  if (source === "embedded_state" || source === "same_origin_product_data") {
    return "product_attribute";
  }
  const path = sourcePath ?? "";
  if (/\btable\b/i.test(path) || /^table\s*>/i.test(path)) return "spec_table";
  if (/\bdl\b/i.test(path) || /^dl\s*>/i.test(path)) return "definition_list";
  if (/data-|class_price|html_product_price/i.test(path) || source === "html_product_price") {
    return "data_attribute";
  }
  return "product_text";
}

export function extractionMethodFromSpecOrigin(
  origin: string | null | undefined
): EvidenceExtractionMethod {
  if (origin === "json_ld") return "json_ld";
  if (origin === "meta") return "meta";
  if (origin === "product_spec_table") return "spec_table";
  if (origin === "product_attribute") return "product_attribute";
  return "product_text";
}

/** Convert a single labeled length to cm. Ambiguous pairs (800 x 600) return null. */
export function normalizeDimensionToCm(raw: string): string | null {
  if (/\d+(?:[.,]\d+)?\s*[x×]\s*\d+/i.test(raw)) return null;
  const match = raw.trim().match(/(\d+(?:[.,]\d+)?)\s*(mm|cm|m)\b/i);
  if (!match) return null;
  const n = Number(match[1]!.replace(",", "."));
  if (!Number.isFinite(n)) return null;
  const unit = match[2]!.toLowerCase();
  const cm = unit === "mm" ? n / 10 : unit === "m" ? n * 100 : n;
  const rounded = Math.round(cm * 1000) / 1000;
  const text = Number.isInteger(rounded) ? String(rounded) : String(rounded);
  return `${text} cm`;
}

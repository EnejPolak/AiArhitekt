import type { Response } from "openai/resources/responses/responses";
import { normalizeDomainToRoot } from "@/lib/serp/domains";
import type { ProductDiscoverySource } from "./types";
import { normalizeUrlForEvidenceMatch, urlsEvidenceMatch } from "./domains";

export type PrimarySearchDiagnostics = {
  webSearchCallCount: number;
  searchQueries: string[];
  sourceCount: number;
  distinctSourceDomains: string[];
};

export type OpenAiUsageDiagnostics = {
  inputTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
  webSearchCalls: number | null;
};

export function emptyOpenAiUsage(): OpenAiUsageDiagnostics {
  return {
    inputTokens: null,
    cachedInputTokens: null,
    outputTokens: null,
    webSearchCalls: null,
  };
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function addNullable(a: number | null, b: number | null): number | null {
  if (a == null && b == null) return null;
  return (a ?? 0) + (b ?? 0);
}

/** Sum usage from multiple already-completed Responses API calls. */
export function addOpenAiUsage(
  a: OpenAiUsageDiagnostics | null | undefined,
  b: OpenAiUsageDiagnostics | null | undefined
): OpenAiUsageDiagnostics {
  return {
    inputTokens: addNullable(a?.inputTokens ?? null, b?.inputTokens ?? null),
    cachedInputTokens: addNullable(a?.cachedInputTokens ?? null, b?.cachedInputTokens ?? null),
    outputTokens: addNullable(a?.outputTokens ?? null, b?.outputTokens ?? null),
    webSearchCalls: addNullable(a?.webSearchCalls ?? null, b?.webSearchCalls ?? null),
  };
}

/**
 * Read usage already present on an OpenAI Responses payload.
 * Does not call the API.
 */
export function extractOpenAiResponseUsage(response: unknown): OpenAiUsageDiagnostics {
  const record = response && typeof response === "object" ? (response as Record<string, unknown>) : null;
  const usage =
    record && typeof record.usage === "object" && record.usage
      ? (record.usage as Record<string, unknown>)
      : null;
  const details =
    usage && typeof usage.input_tokens_details === "object" && usage.input_tokens_details
      ? (usage.input_tokens_details as Record<string, unknown>)
      : null;
  const webSearchCalls = Array.isArray(record?.output)
    ? (record.output as Array<{ type?: string }>).filter((item) => item?.type === "web_search_call")
        .length
    : null;
  return {
    inputTokens: asFiniteNumber(usage?.input_tokens),
    cachedInputTokens: asFiniteNumber(details?.cached_tokens),
    outputTokens: asFiniteNumber(usage?.output_tokens),
    webSearchCalls: webSearchCalls != null && webSearchCalls > 0 ? webSearchCalls : webSearchCalls === 0 ? 0 : null,
  };
}

function readOptionalString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function addSource(
  map: Map<string, ProductDiscoverySource>,
  url: string,
  title: string | null,
  snippet: string | null = null
): void {
  if (!url?.startsWith("http")) return;
  const key = normalizeUrlForEvidenceMatch(url);
  if (!key) return;

  const existing = map.get(key);
  if (existing) {
    map.set(key, {
      url: existing.url,
      title: existing.title ?? title,
      snippet: existing.snippet ?? snippet,
    });
    return;
  }

  map.set(key, { url, title, snippet });
}

function walkUnknown(value: unknown, map: Map<string, ProductDiscoverySource>): void {
  if (!value) return;
  if (Array.isArray(value)) {
    for (const item of value) walkUnknown(item, map);
    return;
  }
  if (typeof value !== "object") return;
  const record = value as Record<string, unknown>;

  if (typeof record.url === "string" && (record.type === "url" || record.type === "url_citation")) {
    addSource(
      map,
      record.url,
      readOptionalString(record, ["title", "name"]),
      readOptionalString(record, ["snippet", "description", "text"])
    );
  }

  if (record.type === "url_citation" && typeof record.url === "string") {
    addSource(
      map,
      record.url,
      readOptionalString(record, ["title", "name"]),
      readOptionalString(record, ["snippet", "description", "text"])
    );
  }

  if (Array.isArray(record.sources)) {
    for (const source of record.sources) {
      if (source && typeof source === "object") {
        const entry = source as Record<string, unknown>;
        if (typeof entry.url === "string") {
          addSource(
            map,
            entry.url,
            readOptionalString(entry, ["title", "name"]),
            readOptionalString(entry, ["snippet", "description", "text"])
          );
        }
      }
    }
  }

  if (record.action && typeof record.action === "object") {
    walkUnknown(record.action, map);
  }

  for (const nested of Object.values(record)) {
    if (nested && typeof nested === "object") walkUnknown(nested, map);
  }
}

export function extractWebSearchSources(response: Response): ProductDiscoverySource[] {
  const map = new Map<string, ProductDiscoverySource>();

  for (const item of response.output ?? []) {
    if (item.type === "web_search_call") {
      walkUnknown(item, map);
    }
    if (item.type === "message") {
      for (const part of item.content ?? []) {
        if (part.type === "output_text") {
          for (const annotation of part.annotations ?? []) {
            if (annotation.type === "url_citation") {
              const ann = annotation as {
                url: string;
                title?: string | null;
                snippet?: string | null;
              };
              addSource(map, ann.url, ann.title ?? null, ann.snippet ?? null);
            }
          }
        }
      }
    }
  }

  walkUnknown(response, map);
  return [...map.values()];
}

/**
 * Provider-visible primary web_search diagnostics only (no chain-of-thought).
 * Extracts query text from web_search_call.action when present.
 */
export function extractPrimarySearchDiagnostics(
  response: Response,
  sources?: ProductDiscoverySource[]
): PrimarySearchDiagnostics {
  const searchQueries: string[] = [];
  let webSearchCallCount = 0;

  for (const item of response.output ?? []) {
    if (item.type !== "web_search_call") continue;
    webSearchCallCount += 1;

    const action = (item as { action?: { type?: string; query?: string } }).action;
    if (action?.type === "search" && typeof action.query === "string") {
      const query = action.query.trim();
      if (query && !searchQueries.includes(query)) searchQueries.push(query);
    }
  }

  const resolvedSources = sources ?? extractWebSearchSources(response);
  const domains = new Set<string>();
  for (const source of resolvedSources) {
    const domain = normalizeDomainToRoot(source.url);
    if (domain) domains.add(domain);
  }

  return {
    webSearchCallCount,
    searchQueries,
    sourceCount: resolvedSources.length,
    distinctSourceDomains: [...domains].sort(),
  };
}

export function responseUsedWebSearch(response: Response): boolean {
  return (response.output ?? []).some((item) => item.type === "web_search_call");
}

export function isProductUrlEvidenceBacked(
  productUrl: string,
  sources: ProductDiscoverySource[]
): boolean {
  return sources.some((source) => urlsEvidenceMatch(productUrl, source.url));
}

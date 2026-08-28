import type { Response } from "openai/resources/responses/responses";
import type { ProductDiscoverySource } from "./types";
import { normalizeUrlForEvidenceMatch, urlsEvidenceMatch } from "./domains";

function addSource(map: Map<string, ProductDiscoverySource>, url: string, title: string | null): void {
  if (!url?.startsWith("http")) return;
  const key = normalizeUrlForEvidenceMatch(url);
  if (!key || map.has(key)) return;
  map.set(key, { url, title });
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
    addSource(map, record.url, typeof record.title === "string" ? record.title : null);
  }

  if (record.type === "url_citation" && typeof record.url === "string") {
    addSource(map, record.url, typeof record.title === "string" ? record.title : null);
  }

  if (Array.isArray(record.sources)) {
    for (const source of record.sources) {
      if (source && typeof source === "object" && typeof (source as Record<string, unknown>).url === "string") {
        addSource(map, (source as Record<string, unknown>).url as string, null);
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
              addSource(map, annotation.url, annotation.title ?? null);
            }
          }
        }
      }
    }
  }

  walkUnknown(response, map);
  return [...map.values()];
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

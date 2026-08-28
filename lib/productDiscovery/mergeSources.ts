import { normalizeUrlForEvidenceMatch } from "./domains";
import type { ProductDiscoverySource } from "./types";

export type SourcePass = "primary" | "targeted" | "both";

export type TaggedSource = ProductDiscoverySource & {
  sourcePass: SourcePass;
};

export function mergeProductDiscoverySources(
  primary: ProductDiscoverySource[],
  targeted: ProductDiscoverySource[]
): TaggedSource[] {
  const map = new Map<string, TaggedSource>();

  for (const source of primary) {
    const key = normalizeUrlForEvidenceMatch(source.url);
    if (!key) continue;
    map.set(key, { ...source, sourcePass: "primary" });
  }

  for (const source of targeted) {
    const key = normalizeUrlForEvidenceMatch(source.url);
    if (!key) continue;
    const existing = map.get(key);
    if (existing) {
      map.set(key, { ...existing, sourcePass: "both", title: existing.title ?? source.title });
    } else {
      map.set(key, { ...source, sourcePass: "targeted" });
    }
  }

  return [...map.values()];
}

export function toPlainSources(tagged: TaggedSource[]): ProductDiscoverySource[] {
  return tagged.map(({ url, title }) => ({ url, title }));
}

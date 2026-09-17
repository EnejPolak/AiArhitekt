import { normalizeDomainToRoot } from "@/lib/serp/domains";
import { bauhausAcquisitionAdapter } from "./bauhaus";
import { obiAcquisitionAdapter } from "./obi";
import { xxxlesninaAcquisitionAdapter } from "./xxxlesnina";
import type { MerchantAcquisitionAdapter, MerchantAdapterResult } from "./types";

const ADAPTERS: MerchantAcquisitionAdapter[] = [
  bauhausAcquisitionAdapter,
  xxxlesninaAcquisitionAdapter,
  obiAcquisitionAdapter,
];

export function findMerchantAcquisitionAdapter(
  pageUrl: string
): MerchantAcquisitionAdapter | null {
  let root: string;
  try {
    root = normalizeDomainToRoot(new URL(pageUrl).hostname);
  } catch {
    return null;
  }
  return ADAPTERS.find((a) => a.matches(root)) ?? null;
}

export function runMerchantAcquisitionAdapter(input: {
  pageUrl: string;
  html: string;
}): MerchantAdapterResult | null {
  const adapter = findMerchantAcquisitionAdapter(input.pageUrl);
  if (!adapter) return null;
  let domainRoot = "";
  try {
    domainRoot = normalizeDomainToRoot(new URL(input.pageUrl).hostname);
  } catch {
    domainRoot = "";
  }
  return adapter.enrichFromHtml({
    pageUrl: input.pageUrl,
    html: input.html,
    domainRoot,
  });
}

export { bauhausAcquisitionAdapter, obiAcquisitionAdapter, xxxlesninaAcquisitionAdapter };
export type { MerchantAcquisitionAdapter, MerchantAdapterResult };

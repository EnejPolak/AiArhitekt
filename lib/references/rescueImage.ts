const IMAGE_URL_RE = /https:\/\/[^\s"'<>]+/gi;
const IMAGE_PATH_RE = /\.(?:jpe?g|png|webp)(?:$|[?#])/i;

export type ImageRescueInput = {
  productTitle: string;
  merchantDomain: string;
  productUrl: string;
  sku?: string | null;
  existingEvidence: string[];
  rescueAlreadyAttempted: boolean;
};

export type ImageRescueSearch = (input: ImageRescueInput) => Promise<string[]>;

export type ImageRescueResult = {
  urls: string[];
  attempted: boolean;
};

export function extractHttpImageUrlsFromEvidence(evidence: string[]): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const text of evidence) {
    const matches = text.match(IMAGE_URL_RE) ?? [];
    for (const raw of matches) {
      const url = raw.replace(/[),.;]+$/, "");
      if (seen.has(url)) continue;
      if (!IMAGE_PATH_RE.test(url) && !/\/(?:image|images|img|media|photo)\b/i.test(url)) continue;
      seen.add(url);
      urls.push(url);
    }
  }
  return urls;
}

/**
 * One bounded rescue: collect candidate URLs for the already-selected product.
 * Does not change acceptance, merchant, price, or product identity.
 * Optional search is injected; the default path never calls a provider.
 */
export async function runBoundedImageRescue(
  input: ImageRescueInput,
  search?: ImageRescueSearch
): Promise<ImageRescueResult> {
  if (input.rescueAlreadyAttempted) {
    return { urls: [], attempted: false };
  }
  const fromEvidence = extractHttpImageUrlsFromEvidence(input.existingEvidence);
  const fromSearch = search ? await search(input) : [];
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const url of [...fromEvidence, ...fromSearch]) {
    if (!url.startsWith("https://") || seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
  }
  return { urls, attempted: true };
}

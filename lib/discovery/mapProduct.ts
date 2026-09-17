import { serpPickedSchema } from "@/lib/schemas/serp";
import { normalizeDomainToRoot } from "@/lib/serp/domains";
import type { PlaceResult } from "@/lib/places/placesService";
import type { CanonicalSerpPicked } from "@/lib/serp/search";
import {
  associateProductImage,
  mergeImageEvidence,
  type ProductImageEvidence,
} from "@/lib/references/imageEvidence";

export function isHttpUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function usableProductImageUrl(value: string | null | undefined): string | null {
  if (!value || !isHttpUrl(value)) return null;
  if (value.startsWith("data:")) return null;
  return value;
}

export type CanonicalSelectionFields = {
  productTitle: string;
  productSnippet: string | null;
  productUrl: string;
  productImageUrl: string | null;
  price: number | null;
  currency: "EUR" | null;
  retailerDomain: string;
  retailerName: string | null;
  hasReferenceImage: boolean;
  imageEvidence?: ProductImageEvidence[];
};

export function mapCanonicalPickedToSelection(
  picked: CanonicalSerpPicked | null | undefined,
  stores: PlaceResult[]
): CanonicalSelectionFields | null {
  if (!picked) return null;
  const parsed = serpPickedSchema.safeParse(picked);
  if (!parsed.success) return null;
  if (!isHttpUrl(parsed.data.url)) return null;
  const title = parsed.data.title.trim();
  if (!title) return null;

  const image = usableProductImageUrl(parsed.data.image);
  const domain =
    normalizeDomainToRoot(parsed.data.domain) || normalizeDomainToRoot(parsed.data.url);
  if (!domain) return null;
  const imageEvidence = mergeImageEvidence(
    [],
    [
      image
        ? associateProductImage({
            url: image,
            source: "search_evidence",
            productUrl: parsed.data.url,
            merchantDomain: domain,
            sourcePageUrl: parsed.data.url,
          })
        : null,
    ]
  );

  const retailer = stores.find(
    (store) => normalizeDomainToRoot(store.websiteDomain) === domain
  );
  const price =
    typeof parsed.data.price === "number" && Number.isFinite(parsed.data.price)
      ? parsed.data.price
      : null;

  return {
    productTitle: title,
    productSnippet: parsed.data.snippet?.trim() ? parsed.data.snippet.trim() : null,
    productUrl: parsed.data.url,
    productImageUrl: image,
    price,
    currency: parsed.data.currency === "EUR" ? "EUR" : null,
    retailerDomain: domain,
    retailerName: retailer?.name?.trim() ? retailer.name.trim() : null,
    hasReferenceImage: image !== null,
    imageEvidence,
  };
}

type TopCandidateSource = {
  title: string;
  url: string;
  domain: string;
  snippet?: string | null;
  score: number;
  image?: string | null;
  price?: number | null;
  currency?: "EUR" | null;
};

export function mapTopCandidateToSelection(
  candidate: TopCandidateSource,
  stores: PlaceResult[]
): CanonicalSelectionFields | null {
  if (!isHttpUrl(candidate.url)) return null;
  const title = candidate.title.trim();
  if (!title) return null;

  const image = usableProductImageUrl(candidate.image);
  const domain =
    normalizeDomainToRoot(candidate.domain) || normalizeDomainToRoot(candidate.url);
  if (!domain) return null;
  const imageEvidence = mergeImageEvidence(
    [],
    [
      image
        ? associateProductImage({
            url: image,
            source: "search_evidence",
            productUrl: candidate.url,
            merchantDomain: domain,
            sourcePageUrl: candidate.url,
          })
        : null,
    ]
  );

  const retailer = stores.find(
    (store) => normalizeDomainToRoot(store.websiteDomain) === domain
  );
  const price =
    typeof candidate.price === "number" && Number.isFinite(candidate.price)
      ? candidate.price
      : null;

  return {
    productTitle: title,
    productSnippet: candidate.snippet?.trim() ? candidate.snippet.trim() : null,
    productUrl: candidate.url,
    productImageUrl: image,
    price,
    currency: candidate.currency === "EUR" ? "EUR" : null,
    retailerDomain: domain,
    retailerName: retailer?.name?.trim() ? retailer.name.trim() : null,
    hasReferenceImage: image !== null,
    imageEvidence,
  };
}

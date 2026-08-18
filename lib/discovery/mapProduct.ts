import { serpPickedSchema } from "@/lib/schemas/serp";
import { normalizeDomainToRoot } from "@/lib/serp/domains";
import type { PlaceResult } from "@/lib/places/placesService";
import type { CanonicalSerpPicked } from "@/lib/serp/search";

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
  productUrl: string;
  productImageUrl: string | null;
  price: number | null;
  currency: "EUR" | null;
  retailerDomain: string;
  retailerName: string | null;
  hasReferenceImage: boolean;
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

  const retailer = stores.find(
    (store) => normalizeDomainToRoot(store.websiteDomain) === domain
  );
  const price =
    typeof parsed.data.price === "number" && Number.isFinite(parsed.data.price)
      ? parsed.data.price
      : null;

  return {
    productTitle: title,
    productUrl: parsed.data.url,
    productImageUrl: image,
    price,
    currency: parsed.data.currency === "EUR" ? "EUR" : null,
    retailerDomain: domain,
    retailerName: retailer?.name?.trim() ? retailer.name.trim() : null,
    hasReferenceImage: image !== null,
  };
}

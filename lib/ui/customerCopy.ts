import { discoveryErrorMessage, type DiscoveryErrorCode } from "@/lib/discovery/errors";
import { GEOCODING_ERROR_CODES } from "@/lib/geocode/types";
import { renderErrorMessage, type RenderErrorCode } from "@/lib/render/errors";

const PROVIDER_LEAK =
  /openai|serpapi|google|googleapis|over_query|quota exceeded|stack|aborterror|failed to fetch|504|econnreset|enotfound/i;

export type DiscoveryUiKind = "location" | "empty_search" | "retryable" | "safe";

export function leaksProviderText(text: string): boolean {
  return PROVIDER_LEAK.test(text);
}

export function networkCustomerMessage(error: unknown): string {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : String(error);
  if (name === "AbortError" || /timeout|aborterror|504/i.test(`${name} ${message}`)) {
    return "The request timed out. Try again.";
  }
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(message)) {
    return "We couldn't reach the service. Try again.";
  }
  return "Something went wrong. Try again.";
}

export function geocodeCustomerMessage(code?: string | null): string {
  switch (code) {
    case GEOCODING_ERROR_CODES.NOT_FOUND:
      return "We couldn't find that address. Try a city or a fuller address.";
    case GEOCODING_ERROR_CODES.INVALID_REQUEST:
      return "Check the address and try again.";
    case GEOCODING_ERROR_CODES.QUOTA_REACHED:
    case GEOCODING_ERROR_CODES.DISABLED:
    case GEOCODING_ERROR_CODES.NOT_CONFIGURED:
    case GEOCODING_ERROR_CODES.REQUEST_DENIED:
      return "Location search is temporarily unavailable. Try again later.";
    case GEOCODING_ERROR_CODES.TIMEOUT:
      return "Location search timed out. Try again.";
    default:
      return "Could not find that location. Try a fuller address.";
  }
}

export function contractorCustomerMessage(kind: "empty" | "provider" | "location"): string {
  switch (kind) {
    case "empty":
      return "No contractors were found in this search area.";
    case "location":
      return "Save a search location before finding contractors.";
    default:
      return "We couldn't load nearby businesses right now.";
  }
}

export function discoveryUiKind(code: string | null | undefined): DiscoveryUiKind {
  switch (code) {
    case "location_required":
    case "location_invalid":
      return "location";
    case "no_place_candidates":
    case "no_local_retailers":
    case "stores_found_but_filtered":
    case "no_valid_store_domains":
      return "empty_search";
    case undefined:
    case null:
    case "":
      return "safe";
    default:
      return "retryable";
  }
}

export function discoveryCustomerMessage(code: string | null | undefined): string {
  if (!code) return discoveryErrorMessage("failed");
  return discoveryErrorMessage(code as DiscoveryErrorCode);
}

export function discoveryRetryLabel(code: string | null | undefined): string | null {
  const kind = discoveryUiKind(code);
  if (kind === "retryable") return "Retry";
  if (kind === "empty_search") return "Search again";
  return null;
}

export function discoveryLoadingStage(elapsedMs: number): string {
  if (elapsedMs < 1_500) return "Preparing your location";
  if (elapsedMs < 8_000) return "Finding nearby stores";
  if (elapsedMs < 25_000) return "Searching for matching products";
  if (elapsedMs < 45_000) return "Verifying product details";
  return "Saving your results";
}

export function renderTimeoutCustomerMessage(): string {
  return renderErrorMessage("provider_timeout");
}

export const APP_ERROR_TITLE = "Something went wrong";
export const APP_ERROR_BODY =
  "This page hit an unexpected problem. Your project is saved — try again, or go back to your workspace.";

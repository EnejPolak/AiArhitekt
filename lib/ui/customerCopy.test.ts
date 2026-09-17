import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { discoveryErrorMessage } from "@/lib/discovery/errors";
import { renderErrorMessage } from "@/lib/render/errors";
import { GEOCODING_ERROR_CODES } from "@/lib/geocode/types";
import {
  APP_ERROR_BODY,
  contractorCustomerMessage,
  discoveryCustomerMessage,
  discoveryLoadingStage,
  discoveryRetryLabel,
  discoveryUiKind,
  geocodeCustomerMessage,
  leaksProviderText,
  networkCustomerMessage,
} from "./customerCopy";

describe("customer copy sanitization", () => {
  it("maps discovery codes to safe messages without provider internals", () => {
    const codes = [
      "location_required",
      "location_invalid",
      "no_place_candidates",
      "stores_found_but_filtered",
      "provider_timeout",
      "discovery_timeout",
      "places_failed",
      "failed",
    ] as const;
    for (const code of codes) {
      const message = discoveryCustomerMessage(code);
      expect(leaksProviderText(message)).toBe(false);
      expect(message).toBe(discoveryErrorMessage(code));
    }
    expect(discoveryErrorMessage("discovery_timeout")).toMatch(/project is safe/i);
    expect(discoveryErrorMessage("places_failed")).toMatch(/nearby businesses/i);
  });

  it("treats product not-found as a valid result, not an infrastructure retry", () => {
    expect(discoveryUiKind(null)).toBe("safe");
    expect(discoveryRetryLabel(null)).toBeNull();
    expect(discoveryUiKind("no_place_candidates")).toBe("empty_search");
    expect(discoveryRetryLabel("no_place_candidates")).toBe("Search again");
    expect(discoveryUiKind("discovery_timeout")).toBe("retryable");
    expect(discoveryRetryLabel("discovery_timeout")).toBe("Retry");
    expect(discoveryUiKind("location_required")).toBe("location");
    expect(discoveryRetryLabel("location_required")).toBeNull();
  });

  it("uses honest coarse discovery loading stages", () => {
    expect(discoveryLoadingStage(0)).toBe("Preparing your location");
    expect(discoveryLoadingStage(3_000)).toBe("Finding nearby stores");
    expect(discoveryLoadingStage(12_000)).toBe("Searching for matching products");
    expect(discoveryLoadingStage(30_000)).toBe("Verifying product details");
    expect(discoveryLoadingStage(50_000)).toBe("Saving your results");
  });

  it("maps geocode and network failures without Google or fetch text", () => {
    expect(geocodeCustomerMessage(GEOCODING_ERROR_CODES.NOT_FOUND)).toMatch(/address/i);
    expect(geocodeCustomerMessage(GEOCODING_ERROR_CODES.DISABLED)).not.toMatch(/google/i);
    expect(geocodeCustomerMessage("OVER_QUERY_LIMIT")).not.toMatch(/google|over_query/i);
    expect(leaksProviderText(geocodeCustomerMessage(GEOCODING_ERROR_CODES.QUOTA_REACHED))).toBe(
      false
    );
    const abort = new Error("Aborted");
    abort.name = "AbortError";
    expect(networkCustomerMessage(abort)).not.toMatch(/AbortError|fetch failed|504/i);
    expect(networkCustomerMessage(new Error("Failed to fetch"))).not.toMatch(/Failed to fetch/i);
    expect(networkCustomerMessage(new Error("504 Gateway Timeout"))).not.toMatch(/504/);
  });

  it("separates contractor empty results from provider failure", () => {
    expect(contractorCustomerMessage("empty")).toMatch(/no contractors/i);
    expect(contractorCustomerMessage("provider")).toMatch(/nearby businesses/i);
    expect(leaksProviderText(contractorCustomerMessage("provider"))).toBe(false);
  });

  it("keeps render timeout copy provider-free", () => {
    expect(renderErrorMessage("provider_timeout")).toMatch(/couldn't finish the render/i);
    expect(leaksProviderText(renderErrorMessage("provider_timeout"))).toBe(false);
    expect(leaksProviderText(APP_ERROR_BODY)).toBe(false);
  });

  it("does not surface raw error.message in app error boundaries", () => {
    const files = [
      "app/error.tsx",
      "app/global-error.tsx",
      "app/app/error.tsx",
    ];
    for (const file of files) {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      expect(source).not.toContain("error.message");
      expect(source).not.toContain("error.stack");
      expect(source).toContain("console.error");
    }
  });

  it("keeps discovery retry distinct from all-not-found and preserves in-flight guards", () => {
    const step9a = readFileSync(
      join(process.cwd(), "components/app/room-renovation/steps/Step9aStoreDiscovery.tsx"),
      "utf8"
    );
    const step6b = readFileSync(
      join(process.cwd(), "components/app/room-renovation/steps/Step6bLocation.tsx"),
      "utf8"
    );
    const step9d = readFileSync(
      join(process.cwd(), "components/app/room-renovation/steps/Step9dContractors.tsx"),
      "utf8"
    );
    expect(step9a).toContain("discoveryRetryLabel");
    expect(step9a).not.toContain("Retry error");
    expect(step9a).toContain("not a system error");
    expect(step9a).toContain("inFlight.current");
    expect(step9a).toContain("discoveryLoadingStage");
    expect(step6b).toContain("geocodeCustomerMessage");
    expect(step6b).toContain("inFlight.current");
    expect(step9d).toContain('phase === "empty"');
    expect(step9d).toContain('phase === "error"');
    expect(step9d).toContain("Retry");
  });
});

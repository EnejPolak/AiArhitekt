import { describe, expect, it } from "vitest";
import { DiscoveryError, discoveryErrorMessage } from "./errors";

describe("discovery errors", () => {
  it("does not leak provider internals", () => {
    expect(discoveryErrorMessage("serp_quota")).not.toMatch(/serpapi|google/i);
    expect(discoveryErrorMessage("places_quota")).not.toMatch(/google|places api|over_query/i);
    expect(discoveryErrorMessage("places_rate_limited")).toBe(discoveryErrorMessage("places_quota"));
    expect(discoveryErrorMessage("places_failed")).not.toMatch(/Could not find local stores\. Try again\./);
    expect(discoveryErrorMessage("no_place_candidates")).toMatch(/50 km/);
    expect(discoveryErrorMessage("stores_found_but_filtered")).toMatch(/retailer websites/i);
    expect(discoveryErrorMessage("no_local_retailers")).toMatch(/store/i);
    const err = new DiscoveryError("serp_failed", discoveryErrorMessage("serp_failed"));
    expect(err.code).toBe("serp_failed");
  });
});

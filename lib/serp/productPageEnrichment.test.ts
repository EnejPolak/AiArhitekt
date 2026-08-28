import { describe, expect, it, vi } from "vitest";
import { fetchTrustedProductPageEnrichment } from "./productPageEnrichment";

describe("trusted product page enrichment SSRF", () => {
  it("rejects localhost URLs without fetching", async () => {
    const fetchFn = vi.fn();
    const result = await fetchTrustedProductPageEnrichment("http://127.0.0.1/product", {
      allowlistDomains: ["127.0.0.1"],
      fetchFn,
    });
    expect(result.price).toBeNull();
    expect(result.image).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("rejects non-allowlisted domains without fetching", async () => {
    const fetchFn = vi.fn();
    const result = await fetchTrustedProductPageEnrichment("https://evil.example/product", {
      allowlistDomains: ["trusted-retailer.si"],
      fetchFn,
    });
    expect(result.price).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

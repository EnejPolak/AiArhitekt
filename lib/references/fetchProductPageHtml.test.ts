import { describe, expect, it } from "vitest";
import { MAX_PRODUCT_PAGE_HTML_BYTES } from "./constants";
import { fetchProductPageHtmlResult } from "./extractProductImages";

const PUBLIC_LOOKUP = async () => ({ address: "203.0.113.10", family: 4 });
const PAGE_URL = "https://shop.example/p/oak-floor";

function htmlResponse(
  body: string | Uint8Array | ReadableStream<Uint8Array>,
  headers: Record<string, string> = {},
  status = 200
) {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=UTF-8",
      ...headers,
    },
  });
}

describe("fetchProductPageHtmlResult bounds", () => {
  it("accepts a product page below the HTML limit", async () => {
    const html = `<html><script type="application/ld+json">{"@type":"Product","image":"https://cdn.example/floor.jpg"}</script></html>`;
    const result = await fetchProductPageHtmlResult(PAGE_URL, {
      lookup: PUBLIC_LOOKUP,
      maxBytes: 4_000,
      fetch: async () => htmlResponse(html, { "content-length": String(Buffer.byteLength(html)) }),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.html).toContain("application/ld+json");
      expect(result.finalUrl).toBe(PAGE_URL);
    }
  });

  it("accepts a large valid product page within the new hard bound", async () => {
    const prefix =
      `<html><head><script type="application/ld+json">{"@type":"Product","name":"Oak","image":"https://cdn.example/oak.jpg"}</script></head><body>`;
    const html = `${prefix}${"x".repeat(600_000)}</body></html>`;
    expect(Buffer.byteLength(html)).toBeGreaterThan(512_000);
    expect(Buffer.byteLength(html)).toBeLessThan(MAX_PRODUCT_PAGE_HTML_BYTES);
    const result = await fetchProductPageHtmlResult(PAGE_URL, {
      lookup: PUBLIC_LOOKUP,
      fetch: async () => htmlResponse(html),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.html).toContain('"@type":"Product"');
      expect(result.html).toContain("https://cdn.example/oak.jpg");
    }
  });

  it("rejects a page above the hard bound without truncating HTML", async () => {
    const maxBytes = 4_000;
    const html = `<html>${"y".repeat(maxBytes + 50)}</html>`;
    const result = await fetchProductPageHtmlResult(PAGE_URL, {
      lookup: PUBLIC_LOOKUP,
      maxBytes,
      fetch: async () => htmlResponse(html),
    });
    expect(result).toMatchObject({
      ok: false,
      reason: "fetch_failed",
      detail: "streamed_content_too_large",
    });
    expect("html" in result ? result.html : undefined).toBeUndefined();
  });

  it("rejects identity content-length above the bound before reading the body", async () => {
    const result = await fetchProductPageHtmlResult(PAGE_URL, {
      lookup: PUBLIC_LOOKUP,
      maxBytes: 1_000,
      fetch: async () =>
        htmlResponse("<html>too big</html>", {
          "content-length": "1001",
          "content-encoding": "identity",
        }),
    });
    expect(result).toMatchObject({
      ok: false,
      reason: "fetch_failed",
      detail: "declared_content_too_large",
    });
  });

  it("does not trust gzip Content-Length as the decompressed budget", async () => {
    const html = `<html><script type="application/ld+json">{"@type":"Product","image":"https://cdn.example/a.jpg"}</script>${"z".repeat(20_000)}</html>`;
    const result = await fetchProductPageHtmlResult(PAGE_URL, {
      lookup: PUBLIC_LOOKUP,
      maxBytes: 30_000,
      fetch: async () =>
        htmlResponse(html, {
          "content-length": "800",
          "content-encoding": "gzip",
        }),
    });
    expect(result.ok).toBe(true);
  });

  it("rejects a streamed body that exceeds the bound", async () => {
    const maxBytes = 2_000;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(maxBytes - 10).fill(97));
        controller.enqueue(new Uint8Array(40).fill(98));
        controller.close();
      },
    });
    const result = await fetchProductPageHtmlResult(PAGE_URL, {
      lookup: PUBLIC_LOOKUP,
      maxBytes,
      fetch: async () => htmlResponse(stream),
    });
    expect(result).toMatchObject({
      ok: false,
      reason: "fetch_failed",
      detail: "streamed_content_too_large",
    });
  });

  it("keeps SSRF rejection on a private hop without fetching", async () => {
    const result = await fetchProductPageHtmlResult("https://127.0.0.1/p/1", {
      lookup: async () => ({ address: "127.0.0.1", family: 4 }),
      fetch: async () => {
        throw new Error("should not fetch");
      },
    });
    expect(result).toMatchObject({
      ok: false,
      reason: "merchant_blocked",
      detail: "ssrf_rejected",
    });
  });

  it("validates SSRF on every redirect hop", async () => {
    const fetches: string[] = [];
    const result = await fetchProductPageHtmlResult(PAGE_URL, {
      lookup: async (hostname) =>
        hostname === "private.internal" ? { address: "10.0.0.4", family: 4 } : { address: "203.0.113.10", family: 4 },
      fetch: async (input) => {
        fetches.push(String(input));
        return new Response(null, {
          status: 302,
          headers: { location: "https://private.internal/secret" },
        });
      },
    });
    expect(fetches).toEqual([PAGE_URL]);
    expect(result).toMatchObject({
      ok: false,
      reason: "merchant_blocked",
      detail: "ssrf_rejected",
    });
  });
});

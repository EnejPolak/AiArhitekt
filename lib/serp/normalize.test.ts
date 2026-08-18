import { describe, it, expect } from "vitest";
import { normalizeSerpApiResponse } from "./normalize";

describe("normalizeSerpApiResponse", () => {
  it("maps SerpAPI organic_results into internal rows with link as the URL", () => {
    const organic = normalizeSerpApiResponse({
      organic_results: [
        {
          title: "Stenska barva",
          link: "https://www.merkur.si/p/barva",
          snippet: "29,90 €",
          thumbnail: "https://img.example/a.jpg",
          price: "29.90",
        },
      ],
      search_metadata: { status: "Success" },
    });

    expect(organic).toHaveLength(1);
    expect(organic[0]).toMatchObject({
      title: "Stenska barva",
      link: "https://www.merkur.si/p/barva",
      snippet: "29,90 €",
      image: "https://img.example/a.jpg",
      price: "29.90",
    });
  });

  it("drops rows without a link and returns [] for invalid payloads", () => {
    expect(normalizeSerpApiResponse(null)).toEqual([]);
    expect(normalizeSerpApiResponse({})).toEqual([]);
    expect(
      normalizeSerpApiResponse({
        organic_results: [{ title: "No URL" }],
      })
    ).toEqual([]);
  });

  it("extracts price from rich_snippet when price is missing", () => {
    const organic = normalizeSerpApiResponse({
      organic_results: [
        {
          title: "Lamp",
          link: "https://www.jysk.si/p/lamp",
          rich_snippet: { price: "19,99 €" },
        },
      ],
    });
    expect(organic[0].price).toBe("19,99 €");
  });
});

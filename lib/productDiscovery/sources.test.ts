import { describe, expect, it } from "vitest";
import type { Response } from "openai/resources/responses/responses";
import {
  extractWebSearchSources,
  isProductUrlEvidenceBacked,
  responseUsedWebSearch,
} from "./sources";

describe("productDiscovery sources", () => {
  it("extracts web_search_call action sources and url_citation annotations", () => {
    const response = {
      output: [
        {
          type: "web_search_call",
          action: {
            sources: [{ url: "https://merkur.si/p/laminat" }],
          },
        },
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: "result",
              annotations: [
                {
                  type: "url_citation",
                  url: "https://merkur.si/p/laminat",
                  title: "Laminat",
                },
              ],
            },
          ],
        },
      ],
    } as unknown as Response;

    const sources = extractWebSearchSources(response);
    expect(sources).toHaveLength(1);
    expect(sources[0]?.url).toBe("https://merkur.si/p/laminat");
    expect(responseUsedWebSearch(response)).toBe(true);
  });

  it("rejects product URLs that are not present in search sources", () => {
    const sources = [{ title: "Other", url: "https://merkur.si/p/other" }];
    expect(isProductUrlEvidenceBacked("https://merkur.si/p/laminat", sources)).toBe(false);
    expect(isProductUrlEvidenceBacked("https://merkur.si/p/other", sources)).toBe(true);
  });
});

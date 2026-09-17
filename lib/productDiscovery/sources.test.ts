import { describe, expect, it } from "vitest";
import { extractWebSearchSources } from "./sources";
import type { Response } from "openai/resources/responses/responses";

describe("extractWebSearchSources", () => {
  it("merges titles onto earlier title-less action.sources entries", () => {
    const response = {
      output: [
        {
          type: "web_search_call",
          action: {
            sources: [{ url: "https://obi.si/p/pendant" }],
          },
        },
        {
          type: "message",
          content: [
            {
              type: "output_text",
              annotations: [
                {
                  type: "url_citation",
                  url: "https://obi.si/p/pendant",
                  title: "Black pendant €99",
                },
              ],
            },
          ],
        },
      ],
    } as unknown as Response;

    const sources = extractWebSearchSources(response);
    expect(sources).toHaveLength(1);
    expect(sources[0]?.title).toBe("Black pendant €99");
  });

  it("captures provider-visible title/snippet from action.sources when present", () => {
    const response = {
      output: [
        {
          type: "web_search_call",
          action: {
            sources: [
              {
                url: "https://merkur.si/p/sink",
                title: "Sink 600x500",
                snippet: "Stainless steel €124.99",
              },
            ],
          },
        },
      ],
    } as unknown as Response;

    const sources = extractWebSearchSources(response);
    expect(sources[0]?.title).toBe("Sink 600x500");
    expect(sources[0]?.snippet).toBe("Stainless steel €124.99");
  });
});

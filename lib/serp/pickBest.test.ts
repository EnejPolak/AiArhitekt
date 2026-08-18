import { describe, it, expect } from "vitest";
import { pickBestCandidate, PICK_SCORE_THRESHOLD, type SerpOrganicResult } from "./pickBest";

const tokens = ["stenska", "barva"];

describe("pickBestCandidate", () => {
  it("prefers a product /p/ URL over a category listing", () => {
    const results: SerpOrganicResult[] = [
      {
        title: "Stenska barva kategorija",
        link: "https://www.merkur.si/category/stenske-barve",
        snippet: "Pregled stenskih barv",
      },
      {
        title: "Stenska barva bela 10L",
        link: "https://www.merkur.si/p/stenska-barva-bela",
        snippet: "Stenska barva 29,90 €",
      },
    ];

    const { picked, topCandidates } = pickBestCandidate(tokens, results, 5);

    expect(picked).not.toBeNull();
    expect(picked!.url).toContain("/p/");
    expect(picked!.score).toBeGreaterThanOrEqual(PICK_SCORE_THRESHOLD);
    expect(topCandidates[0].url).toContain("/p/");
  });

  it("rejects a category-only result as the picked product", () => {
    const results: SerpOrganicResult[] = [
      {
        title: "Jedilni stoli",
        link: "https://www.jysk.si/c/jedilni-stoli",
        snippet: "Izberi jedilne stole",
      },
    ];

    const { picked } = pickBestCandidate(["jedilni", "stoli"], results, 5);
    expect(picked).toBeNull();
  });

  it("returns null when the best score is below the threshold", () => {
    const results: SerpOrganicResult[] = [
      {
        title: "Unrelated page",
        link: "https://www.merkur.si/about",
        snippet: "Company info",
      },
    ];

    const { picked, topCandidates } = pickBestCandidate(tokens, results, 5);
    expect(picked).toBeNull();
    expect(topCandidates.length).toBeGreaterThan(0);
    expect(topCandidates[0].score).toBeLessThan(PICK_SCORE_THRESHOLD);
  });
});

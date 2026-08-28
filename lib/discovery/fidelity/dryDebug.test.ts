/**
 * Zero-provider P1.6.6 dry evaluation — run with:
 * npx vitest run lib/discovery/fidelity/dryDebug.test.ts
 */
import { describe, expect, it } from "vitest";
import { evaluateCandidateHardGate } from "../categoryGate";
import { resolveShoppingRequirements } from "../resolveRequirements";
import { withLocalizedQueryPlan, buildLocalizedQueryPlan } from "../locales";
import { parsePaintPreference } from "../paintParser";
import { localizeSlColor } from "../locales/lexicon";
import { debugRankMaterialCandidates } from "../style/rankCandidates";
import { normalizeSelectedStyles } from "../style/normalizeStyles";

const styles = normalizeSelectedStyles(["luxury", "minimal", "modern"]);

function marbleRequirement() {
  const { searched } = resolveShoppingRequirements({
    analysisRequirements: {
      furnitureNeeds: [],
      materialNeeds: [],
      constraints: [],
      preserve: [],
      replaceOrRemove: [],
    },
    preferences: { flooring: "marble" },
  });
  return withLocalizedQueryPlan(searched.find((i) => i.provenance?.concept === "marble")!, "sl", "SI");
}

function blackMattePaintRequirement() {
  const { searched } = resolveShoppingRequirements({
    analysisRequirements: {
      furnitureNeeds: [],
      materialNeeds: [],
      constraints: [],
      preserve: [],
      replaceOrRemove: [],
    },
    preferences: { wallMainColor: "matte black", wallAccentColor: "olive green" },
  });
  return searched.find((i) => i.provenance?.paintHue === "black")!;
}

describe("P1.6.6 zero-provider dry evaluation", () => {
  it("prints marble, paint, query-plan, and accent-color audit expectations", () => {
    const marble = marbleRequirement();
    const marbleCases = [
      "Max Zagozda za ploščice",
      "Max Distančnik za ploščice 1 mm",
      "Ceresit CE 40 Silica Active",
      "Cersanit Stenska ploščica Exclusive Marble",
      "Talna ploščica Exclusive Marble",
    ];
    const marbleResults = marbleCases.map((title) => {
      const gate = evaluateCandidateHardGate(marble, { title });
      return { title, hardValid: gate.hardValid, reasons: gate.hardGateReasons };
    });
    const marbleRanked = debugRankMaterialCandidates(marble, marbleCases.map((title, index) => ({
      title,
      score: [65, 65, 27, 57, 57][index] ?? 40,
    })));

    const paint = blackMattePaintRequirement();
    const paintRanked = debugRankMaterialCandidates(paint, [
      { title: "JUB Dekorativna barva Decor Desert izgled puščavskega", score: 63 },
      { title: "Dulux Lateks za stene črna mat 1 l", score: 59 },
      { title: "Jub Barva za odtenke (Črna)", score: 53 },
    ]);

    const { searched } = resolveShoppingRequirements({
      analysisRequirements: {
        furnitureNeeds: [],
        materialNeeds: [],
        constraints: [],
        preserve: [],
        replaceOrRemove: [],
      },
      preferences: { notes: "gaming chair", selectedStyles: styles, wallAccentColor: "olive green" },
    });
    const gaming = {
      ...withLocalizedQueryPlan(searched.find((i) => i.provenance?.concept === "gaming_chair")!, "sl", "SI"),
      selectedStyles: styles,
    };
    const desk = {
      ...withLocalizedQueryPlan(
        resolveShoppingRequirements({
          analysisRequirements: {
            furnitureNeeds: [{ category: "desk", quantity: 1, placementNotes: null, constraints: ["computer desk"] }],
            materialNeeds: [],
            constraints: [],
            preserve: [],
            replaceOrRemove: [],
          },
          preferences: { selectedStyles: styles },
        }).searched[0]!,
        "sl",
        "SI"
      ),
      selectedStyles: styles,
    };

    const accentParsed = parsePaintPreference("olive green");
    const accentLocalized = localizeSlColor(accentParsed?.hue ?? "olive-green");

    // eslint-disable-next-line no-console -- intentional dry-run audit output
    console.info("[dry-debug]", {
      marble: marbleResults,
      marbleWinner: marbleRanked[0]?.title,
      paintWinner: paintRanked[0]?.title,
      gamingQueries: buildLocalizedQueryPlan(gaming, "sl"),
      deskQueries: buildLocalizedQueryPlan(desk, "sl"),
      accentColorAudit: {
        persistedWallAccentColor: "olive green",
        canonicalHue: accentParsed?.hue,
        localizedAccentQueryHue: accentLocalized,
      },
      failureRootCause:
        "Historical exact root cause of the ~3.8min failed refresh cannot be reconstructed from preserved logs. Proven facts only: POST logged 200 after ~3.8min while Step9a catch showed generic failure; persist runs only on full success so prior discovery was preserved; pre-P1.6.6.1 SERP planning could exceed caller maxRequests and run up to 3 passes with fastMode disabled.",
    });

    expect(marbleResults.find((row) => row.title.includes("Zagozda"))?.hardValid).toBe(false);
    expect(marbleResults.find((row) => row.title.includes("Distančnik"))?.hardValid).toBe(false);
    expect(marbleResults.find((row) => row.title.includes("Silica"))?.hardValid).toBe(false);
    expect(marbleResults.find((row) => row.title.includes("Stenska"))?.hardValid).toBe(false);
    expect(marbleRanked[0]?.title).toMatch(/Talna ploščica Exclusive Marble/i);
    expect(paintRanked[0]?.title).toMatch(/Dulux Lateks/i);
    expect(buildLocalizedQueryPlan(gaming, "sl")[0]).toMatch(/minimalističen gaming stol/i);
    expect(buildLocalizedQueryPlan(desk, "sl")[1]).toBe("računalniška miza");
    expect(accentParsed?.hue).toBe("olive-green");
    expect(accentLocalized).toMatch(/olivno zelena/i);
  });
});

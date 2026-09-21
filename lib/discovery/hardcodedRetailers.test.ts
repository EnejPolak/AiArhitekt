import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const discoveryDir = dirname(fileURLToPath(import.meta.url));

const HARDCODED_RETAILERS = [
  "ikea.com",
  "jysk.si",
  "merkur.si",
  "hornbach.si",
  "bauhaus.si",
];

describe("no hardcoded retailer allowlist", () => {
  it("does not maintain a retailer/domain list in product discovery", () => {
    const files = [
      "discover.ts",
      "itemSpecs.ts",
      "mapProduct.ts",
      "actions.ts",
      "queries.ts",
      "constants.ts",
      "completeRoom.ts",
      "candidatePageEnrichment.ts",
      "noteIntents.ts",
    ];
    const combined = files
      .map((name) => readFileSync(join(discoveryDir, name), "utf8"))
      .join("\n")
      .toLowerCase();

    for (const domain of HARDCODED_RETAILERS) {
      expect(combined).not.toContain(domain);
    }
    expect(combined).not.toMatch(/const\s+stores\s*=\s*\[/);
    expect(combined).not.toMatch(/allowlist\s*=\s*\["ikea/);
    expect(combined).not.toMatch(/harveynorman|xxxlesnina|querySelectorAll\(/i);
  });
});

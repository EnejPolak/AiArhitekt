import { describe, expect, it } from "vitest";
import {
  buildProductReferencePath,
  parseProductReferencePath,
  candidateProductReferencePaths,
} from "./path";

const PROJECT_ID = "2cc85a10-1111-4111-8111-abcdef000001";
const SELECTION_ID = "90e41b20-2222-4222-8222-abcdef000002";

describe("product reference storage paths", () => {
  it("builds the canonical project-scoped path", () => {
    expect(buildProductReferencePath(PROJECT_ID, SELECTION_ID, "image/jpeg")).toBe(
      `projects/${PROJECT_ID}/product-references/${SELECTION_ID}.jpg`
    );
  });

  it("parses a valid path and lists candidate extensions", () => {
    const parsed = parseProductReferencePath(
      `projects/${PROJECT_ID}/product-references/${SELECTION_ID}.webp`
    );
    expect(parsed?.projectId).toBe(PROJECT_ID);
    expect(parsed?.selectionId).toBe(SELECTION_ID);
    expect(parsed?.ext).toBe("webp");
    expect(candidateProductReferencePaths(PROJECT_ID, SELECTION_ID)).toHaveLength(3);
  });

  it("rejects path traversal, uploads folder, and extra segments", () => {
    expect(
      parseProductReferencePath(`projects/${PROJECT_ID}/product-references/../../etc/passwd`)
    ).toBeNull();
    expect(
      parseProductReferencePath(`projects/${PROJECT_ID}/uploads/${SELECTION_ID}.jpg`)
    ).toBeNull();
    expect(
      parseProductReferencePath(
        `projects/${PROJECT_ID}/product-references/${SELECTION_ID}.jpg/extra`
      )
    ).toBeNull();
    expect(
      parseProductReferencePath(`projects/${PROJECT_ID}/product-references/${SELECTION_ID}.svg`)
    ).toBeNull();
  });
});

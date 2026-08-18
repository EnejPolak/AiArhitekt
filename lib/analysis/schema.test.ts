import { describe, expect, it } from "vitest";
import { validRoomAnalysisResult } from "./fixtures";
import {
  parseRoomAnalysisResult,
  roomAnalysisObservationSchema,
  roomAnalysisProviderResultSchema,
} from "./schema";

describe("room analysis schema", () => {
  it("accepts a valid structured result", () => {
    const parsed = parseRoomAnalysisResult(validRoomAnalysisResult);
    expect(parsed.analysis.roomType).toBe("living-room");
    expect(parsed.designRequirements.furnitureNeeds[0]?.category).toBe("sofa");
    expect(parsed.analysis.measurementStatus.exactDimensionsKnown).toBe(false);
  });

  it("rejects malformed JSON objects", () => {
    expect(roomAnalysisProviderResultSchema.safeParse("not-json").success).toBe(false);
    expect(roomAnalysisProviderResultSchema.safeParse({}).success).toBe(false);
  });

  it("rejects missing required fields", () => {
    const { analysis: _analysis, ...rest } = validRoomAnalysisResult;
    expect(roomAnalysisProviderResultSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects wrong types", () => {
    const result = roomAnalysisProviderResultSchema.safeParse({
      ...validRoomAnalysisResult,
      analysis: {
        ...validRoomAnalysisResult.analysis,
        roomType: 12,
      },
    });
    expect(result.success).toBe(false);
  });

  it("does not trust unexpected commerce fields as app data", () => {
    const parsed = parseRoomAnalysisResult({
      ...validRoomAnalysisResult,
      productUrl: "https://example.com/sofa",
      store: "Fake Store",
      price: 199,
      SKU: "ABC",
      affiliateUrl: "https://aff.example/x",
      analysis: {
        ...validRoomAnalysisResult.analysis,
        productUrl: "https://example.com/sofa",
        price: 12.5,
      },
      designRequirements: {
        ...validRoomAnalysisResult.designRequirements,
        furnitureNeeds: [
          {
            ...validRoomAnalysisResult.designRequirements.furnitureNeeds[0],
            store: "IKEA",
            productUrl: "https://example.com/p",
            price: 499,
          },
        ],
      },
    });
    const json = JSON.stringify(parsed);
    expect(json).not.toContain("productUrl");
    expect(json).not.toContain("affiliateUrl");
    expect(json).not.toContain("Fake Store");
    expect(json).not.toMatch(/"price":/);
    expect(json).not.toMatch(/"SKU":/);
    expect(parsed.designRequirements.furnitureNeeds[0]).toEqual(
      validRoomAnalysisResult.designRequirements.furnitureNeeds[0]
    );
  });

  it("does not require invented exact room measurements", () => {
    expect(Object.keys(roomAnalysisObservationSchema.shape)).not.toContain("areaM2");
    expect(Object.keys(roomAnalysisObservationSchema.shape)).not.toContain("widthMeters");
    const withGuess = parseRoomAnalysisResult({
      ...validRoomAnalysisResult,
      analysis: {
        ...validRoomAnalysisResult.analysis,
        wallWidthMeters: 4.2,
        roomAreaM2: 18.7,
        sofaSpaceCm: 235,
        measurementStatus: {
          exactDimensionsKnown: true,
          qualitativeNotes: ["large open wall"],
        },
      },
    });
    expect(withGuess.analysis.measurementStatus.exactDimensionsKnown).toBe(false);
    const json = JSON.stringify(withGuess);
    expect(json).not.toContain("4.2");
    expect(json).not.toContain("18.7");
    expect(json).not.toContain("235");
    expect(json).not.toContain("wallWidthMeters");
    expect(json).not.toContain("roomAreaM2");
  });
});

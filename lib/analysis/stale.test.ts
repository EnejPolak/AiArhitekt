import { describe, expect, it } from "vitest";
import { validRoomAnalysisResult } from "./fixtures";
import { ROOM_ANALYSIS_SCHEMA_VERSION } from "./constants";
import type { ProjectRoomAnalysisRow } from "./queries";
import { isCurrentRoomAnalysis, isStaleRoomAnalysis } from "./stale";

const analysis: ProjectRoomAnalysisRow = {
  id: "11111111-1111-4111-8111-111111111111",
  project_id: "22222222-2222-4222-8222-222222222222",
  source_upload_id: "33333333-3333-4333-8333-333333333333",
  source_storage_path:
    "projects/22222222-2222-4222-8222-222222222222/uploads/33333333-3333-4333-8333-333333333333.jpg",
  schema_version: ROOM_ANALYSIS_SCHEMA_VERSION,
  provider: "openai",
  model: "gpt-4o",
  analysis: validRoomAnalysisResult.analysis,
  design_requirements: validRoomAnalysisResult.designRequirements,
  created_at: "2026-08-18T00:00:00.000Z",
  updated_at: "2026-08-18T00:00:00.000Z",
};

describe("stale room analysis", () => {
  it("is current when upload id, path, and schema version match", () => {
    expect(
      isCurrentRoomAnalysis(analysis, {
        id: analysis.source_upload_id,
        storage_path: analysis.source_storage_path,
      })
    ).toBe(true);
    expect(
      isStaleRoomAnalysis(analysis, {
        id: analysis.source_upload_id,
        storage_path: analysis.source_storage_path,
      })
    ).toBe(false);
  });

  it("is stale when the current photo path differs", () => {
    expect(
      isStaleRoomAnalysis(analysis, {
        id: analysis.source_upload_id,
        storage_path:
          "projects/22222222-2222-4222-8222-222222222222/uploads/44444444-4444-4444-8444-444444444444.jpg",
      })
    ).toBe(true);
    expect(
      isCurrentRoomAnalysis(analysis, {
        id: analysis.source_upload_id,
        storage_path:
          "projects/22222222-2222-4222-8222-222222222222/uploads/44444444-4444-4444-8444-444444444444.jpg",
      })
    ).toBe(false);
  });

  it("is stale when there is no current photo", () => {
    expect(isStaleRoomAnalysis(analysis, null)).toBe(true);
    expect(isCurrentRoomAnalysis(analysis, null)).toBe(false);
  });

  it("does not treat a previous analysis schema version as current", () => {
    const photo = {
      id: analysis.source_upload_id,
      storage_path: analysis.source_storage_path,
    };
    expect(isCurrentRoomAnalysis({ ...analysis, schema_version: 1 }, photo)).toBe(false);
    expect(isCurrentRoomAnalysis(analysis, photo)).toBe(true);
  });
});

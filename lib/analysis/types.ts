import type { DesignRequirements, RoomAnalysisObservation } from "./schema";

export type RoomAnalysisView = {
  id: string;
  schemaVersion: number;
  provider: string;
  model: string;
  sourceUploadId: string;
  sourceStoragePath: string;
  analysis: RoomAnalysisObservation;
  designRequirements: DesignRequirements;
  createdAt: string;
  updatedAt: string;
};

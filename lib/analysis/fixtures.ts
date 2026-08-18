import type { RoomAnalysisProviderResult } from "./schema";

export const validRoomAnalysisResult: RoomAnalysisProviderResult = {
  analysis: {
    roomType: "living-room",
    architecture: {
      walls: ["large open wall opposite the camera"],
      floor: "wood-look planks",
      windows: ["one window on the left wall"],
      doors: ["door on the right"],
      fixedElements: ["radiator under the window"],
    },
    existingElements: [
      {
        description: "dark fabric sofa on the back wall",
        disposition: "likely_replace",
      },
      {
        description: "ceiling light fixture",
        disposition: "likely_keep",
      },
    ],
    visualCondition: {
      lighting: "daylight from the left",
      colors: ["beige walls", "dark sofa"],
      overall: "dated finishes",
    },
    constraints: ["sofa sits against the only long wall"],
    preserve: ["window", "radiator", "door swing"],
    replaceOrRemove: ["existing sofa"],
    measurementStatus: {
      exactDimensionsKnown: false,
      qualitativeNotes: ["large open wall", "narrow passage to the right"],
    },
    uncertainties: ["true floor material under the rug"],
  },
  designRequirements: {
    furnitureNeeds: [
      {
        category: "sofa",
        quantity: 1,
        placementNotes: "back wall",
        constraints: ["must not block the door"],
      },
    ],
    materialNeeds: [
      {
        surface: "floor",
        category: "wood-look flooring",
        finishDirection: "matte",
        constraints: [],
      },
    ],
    constraints: ["keep radiator accessible"],
    preserve: ["window and radiator"],
    replaceOrRemove: ["existing sofa"],
  },
};

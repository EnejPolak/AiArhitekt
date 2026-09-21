import type { FurnitureQueryContext, MaterialQueryContext, ProductConcept } from "./types";
import { localizeSlColor } from "./lexicon";

export function slFurnitureQueries(concept: ProductConcept, ctx: FurnitureQueryContext): string[] {
  switch (concept) {
    case "gaming_chair":
      return ctx.ergonomic
        ? ["gaming stol", "gaming stol", "gaming chair"]
        : ["gaming stol", "gaming stol", "gaming chair"];
    case "office_chair":
      return ctx.ergonomic
        ? ["ergonomski pisarniški stol", "pisarniški stol"]
        : ["pisarniški stol", "računalniški stol"];
    case "desk":
      return ctx.monitors
        ? ["računalniška miza za več monitorjev", "računalniška miza", "computer desk"]
        : ["računalniška miza", "computer desk"];
    case "sofa":
      return ["sedežna garnitura", "kavč"];
    case "coffee_table":
      return ["klubska miza"];
    case "bed":
      return ["postelja"];
    case "wardrobe":
      return ["omara", "garderobna omara"];
    case "lighting": {
      const category = ctx.category.trim().toLowerCase();
      const generic =
        category === "lighting" ||
        category === "lamp" ||
        category === "light" ||
        category === "svetilo" ||
        category === "svetilka";
      if (!generic) return [];
      return ["stropna svetilka", "svetilo"];
    }
    case "chair":
      return ["stol"];
    case "reading_chair":
      return ["reading chair", "naslanjač"];
    case "dining_chair":
      return ["dining chair", "jedilni stol"];
    case "dining_table":
      return ["dining table", "jedilna miza"];
    case "bedside":
      return ["bedside table", "nočna omarica"];
    case "storage":
      return ["storage", "predalnik"];
    case "tv_console":
      return ["TV console", "TV omarica"];
    case "rug":
      return ["rug", "preproga"];
    case "window_treatment":
      return ["curtains", "zavese"];
    default:
      return [];
  }
}

export function slMaterialQueries(concept: ProductConcept, ctx: MaterialQueryContext): string[] {
  switch (concept) {
    case "wall_paint": {
      const paintHue = ctx.paintHue ?? null;
      const hue = paintHue ? localizeSlColor(paintHue) : localizeSlColor(ctx.color);
      const genericGreenFallback = "zelena stenska barva";
      const specificGreenHue = paintHue === "olive-green" || paintHue === "dark-green";

      if (ctx.paintFinish === "matte" && hue) {
        return [`mat ${hue} notranja barva za stene`, `${hue} mat stenska barva`];
      }
      if (hue) {
        if (specificGreenHue) {
          return [
            `${hue} notranja barva za stene`,
            `${hue} stenska barva`,
            genericGreenFallback,
          ];
        }
        return [`${hue} notranja barva za stene`, `${hue} stenska barva`];
      }
      return ["notranja barva za stene", "stenska barva"];
    }
    case "marble":
      return ["marmorne talne ploščice", "talne ploščice marmor"];
    case "tiles":
      return ["talne ploščice", "keramične ploščice"];
    case "laminate":
      return ["laminat", "talne obloge laminat"];
    case "hardwood":
      return ["parket", "lesena talna obloga"];
    case "flooring":
      return ["talne obloge"];
    default:
      return [];
  }
}

import type { MaterialNeed } from "./itemSpecs";
import { normalizeMatchText } from "@/lib/text/diacritics";

const FLOOR_SURFACE = /\bfloor\b|taln|oblog|talna\b/i;
const FLOOR_CATEGORY =
  /\bfloor\b|\bflooring\b|floor covering|floor finish|floor tile|wood-look|laminate floor|hardwood floor|parket|talne obloge|talne ploscice|talne ploščice|keramic|vinyl|laminat|marble|marmor|tile|tiles|hardwood|oak|hrast|wood look/i;

export function isFloorMaterialNeed(need: MaterialNeed): boolean {
  const blob = normalizeMatchText(
    `${need.surface} ${need.category} ${need.finishDirection ?? ""} ${need.constraints.join(" ")}`
  );
  return FLOOR_SURFACE.test(blob) || FLOOR_CATEGORY.test(blob);
}

export function explicitFlooringNeed(
  flooring: "marble" | "laminate" | "hardwood" | "tiles"
): MaterialNeed {
  switch (flooring) {
    case "marble":
      return {
        surface: "floor",
        category: "marble flooring",
        finishDirection: "marble",
        constraints: ["marble"],
      };
    case "laminate":
      return {
        surface: "floor",
        category: "laminate flooring",
        finishDirection: null,
        constraints: ["laminate"],
      };
    case "hardwood":
      return {
        surface: "floor",
        category: "hardwood flooring",
        finishDirection: null,
        constraints: ["hardwood"],
      };
    case "tiles":
      return {
        surface: "floor",
        category: "floor tiles",
        finishDirection: null,
        constraints: ["tiles"],
      };
  }
}

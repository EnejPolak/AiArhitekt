import { isDeskRequirement, isWallPaintMaterial, type SearchableRequirement } from "../itemSpecs";
import type { FurnitureNeed, MaterialNeed } from "../itemSpecs";
import { normalizeMatchText } from "@/lib/text/diacritics";
import type { ProductConcept } from "./types";

function furnitureBlob(need: FurnitureNeed): string {
  return normalizeMatchText(`${need.category} ${need.constraints.join(" ")}`);
}

function materialBlob(need: MaterialNeed): string {
  return normalizeMatchText(
    `${need.surface} ${need.category} ${need.finishDirection ?? ""} ${need.constraints.join(" ")}`
  );
}

function isGamingChair(blob: string): boolean {
  return /gaming\s+chair|gaming\s+stol|igricarsk|igralni\s+stol/.test(blob);
}

function isOfficeChair(blob: string): boolean {
  if (/office chair|pisarnisk|racunalnisk stol|computer chair/.test(blob)) return true;
  return /office/.test(blob) && /\bstol\b|\bchair\b/.test(blob);
}

function isCoffeeTable(blob: string): boolean {
  return /coffee table|klubsk/.test(blob);
}

export function resolveProductConcept(requirement: SearchableRequirement): ProductConcept {
  if (requirement.provenance?.concept && requirement.provenance.concept !== "other") {
    return requirement.provenance.concept;
  }

  if (requirement.requirementType === "furniture") {
    const snapshot = requirement.snapshot as FurnitureNeed;
    const blob = furnitureBlob(snapshot);
    if (isGamingChair(blob)) return "gaming_chair";
    if (isOfficeChair(blob)) return "office_chair";
    if (
      isDeskRequirement(snapshot.category, snapshot.constraints) ||
      /\bdesk\b|workstation|pisalna miza|racunalniska miza/.test(blob)
    ) {
      return "desk";
    }
    if (/\bsofa\b|\bcouch\b|sedezn|kavc/.test(blob)) return "sofa";
    if (/\bbed\b|postelj/.test(blob) && !/cover|pregrinjal|sheet/.test(blob)) return "bed";
    if (/wardrobe|storage|garderob|omara|\bomar\b/.test(blob)) return "wardrobe";
    if (/\blamp\b|lighting|svetil|\blight fixture|\blight fitting/.test(blob)) return "lighting";
    if (/\bchair\b|\bstol\b/.test(blob)) return "chair";
    return "other";
  }

  const snapshot = requirement.snapshot as MaterialNeed;
  if (isWallPaintMaterial(snapshot)) return "wall_paint";
  const blob = materialBlob(snapshot);
  if (/marmor|marble/.test(blob)) return "marble";
  if (/laminat|laminate/.test(blob)) return "laminate";
  if (/hardwood|parket|lesena taln/.test(blob)) return "hardwood";
  if (/\btile\b|\btiles\b|ploscic|keramic/.test(blob)) return "tiles";
  if (/floor/.test(blob)) return "flooring";
  return "other";
}

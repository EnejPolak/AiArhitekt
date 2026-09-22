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
  return /coffee table|centre table|center table|klubsk/.test(blob);
}

export function inferFurnitureConceptFromText(text: string): ProductConcept {
  const blob = normalizeMatchText(text);
  if (!blob) return "other";
  if (isGamingChair(blob)) return "gaming_chair";
  if (isOfficeChair(blob)) return "office_chair";
  if (/reading\s+chair|accent\s+chair|naslanjac/.test(blob)) return "reading_chair";
  if (/dining\s+chair|jediln\w*\s+stol/.test(blob)) return "dining_chair";
  if (
    isDeskRequirement(blob, []) ||
    /\bdesk\b|workstation|pisalna miza|racunalniska miza/.test(blob)
  ) {
    return "desk";
  }
  if (isCoffeeTable(blob)) return "coffee_table";
  if (/dining\s+table|jediln\w*\s+miz/.test(blob)) return "dining_table";
  if (/\bsofa\b|\bcouch\b|sectional|sedezn|kavc/.test(blob)) return "sofa";
  if (/bedside|nightstand|nocn\w*\s+omar/.test(blob)) return "bedside";
  if (/\bbed\b|postelj/.test(blob) && !/cover|pregrinjal|sheet|bedside/.test(blob)) return "bed";
  if (/tv\s+(?:unit|console|stand|cabinet)|media\s+unit|media\s+console/.test(blob)) {
    return "tv_console";
  }
  if (/wardrobe|garderob|omara|\bomar\b/.test(blob) && !/bedside|nocn/.test(blob)) return "wardrobe";
  if (/\bstorage\b|predalnik|sideboard|komod/.test(blob)) return "storage";
  if (/\brug\b|\bcarpet\b|preproga/.test(blob)) return "rug";
  if (/curtain|drape|window\s+treatment|zaves/.test(blob)) return "window_treatment";
  const ceilingHint = /ceiling|stropn|plafon/.test(blob) && /lamp|light|fixture|fitting|svetil/.test(blob);
  const floorLampHint = /floor\s+lamp|standing\s+lamp|stoje[cč]a\s+svetil/.test(blob);
  if (
    (ceilingHint && floorLampHint) ||
    (ceilingHint && /\bfloor\b/.test(blob) && /\blamp/.test(blob))
  ) {
    return "lighting";
  }
  if (/pendant\s+(?:light|lamp)|\bpendant\b/.test(blob) && /light|lamp|svetil|dining/.test(blob)) {
    return "pendant_light";
  }
  if (floorLampHint) return "floor_lamp";
  if (/table\s+lamp|namizn\w*\s+svetil/.test(blob)) return "table_lamp";
  if (/wall\s+(?:light|lamp|sconce)|stenska\s+svetil/.test(blob)) return "wall_light";
  if (ceilingHint || /ceiling\s+(?:light|lamp|fixture|fitting)/.test(blob)) return "ceiling_light";
  if (/\blamp\b|lighting|svetil|\blight fixture|\blight fitting/.test(blob)) return "lighting";
  if (/\bchair\b|\bstol\b/.test(blob)) return "chair";
  return "other";
}

export function isDefaultDecorText(text: string): boolean {
  const blob = normalizeMatchText(text);
  if (!blob) return false;
  if (/\bfloor\s+lamp\b|\btable\s+lamp\b|\bpendant\b/.test(blob)) return false;
  return (
    /\bplants?\b|\bartwork\b|\bpaintings?\b|\bbooks?\b|\bcushions?\b|\bthrow\s+pillows?\b|\bvases?\b|\bsculptures?\b|\bfigurines?\b|\bcandles?\b|\bdecor(?:ative)?(?:\s+accessories?)?\b|\baccessories\b/.test(
      blob
    ) && !/\bchair\b|\bsofa\b|\btable\b|\bdesk\b|\bbed\b|\brug\b|\blamp\b/.test(blob)
  );
}

export function isArchitecturalFinishText(text: string): boolean {
  const blob = normalizeMatchText(text);
  if (!blob) return false;
  if (/\bfloor\s+lamp\b|\bfloor\s+lighting\b/.test(blob)) return false;
  return (
    /\bwall\s+paint\b|\bflooring\b|\bfloor\s+finish\b|\bceiling\s+finish\b|\binterior\s+wall\s+paint\b/.test(
      blob
    ) || /^(walls?|floor|ceiling|paint)$/.test(blob)
  );
}

export function resolveProductConcept(requirement: SearchableRequirement): ProductConcept {
  if (requirement.provenance?.concept && requirement.provenance.concept !== "other") {
    return requirement.provenance.concept;
  }

  if (requirement.requirementType === "furniture") {
    const snapshot = requirement.snapshot as FurnitureNeed;
    const blob = furnitureBlob(snapshot);
    if (
      isDeskRequirement(snapshot.category, snapshot.constraints) &&
      inferFurnitureConceptFromText(blob) === "other"
    ) {
      return "desk";
    }
    return inferFurnitureConceptFromText(blob);
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

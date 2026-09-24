import type { ProductConcept } from "@/lib/discovery/locales/types";
import type { RoomPreferenceRoomType } from "@/lib/project-preferences/types";
import type { CanonicalStyleId } from "@/lib/discovery/style/types";
import { normalizeSelectedStyles } from "@/lib/discovery/style/normalizeStyles";
import type { DesignBriefAnswer, DesignBriefDocument } from "./schema";
import { getAnswer } from "./engine";
import { answerList, isAffirmative, isAiDecide, isDeclined } from "./types";

export type ConceptIntent = "required" | "suggested" | "exclude" | "already_have" | "ai_decide" | "needs_preference";

export type BriefPlannerIntent = {
  roomType: RoomPreferenceRoomType | null;
  customPurpose: string | null;
  customPurposeText: string | null;
  selectedStyles: CanonicalStyleId[];
  budgetLevel: "budget-friendly" | "balanced" | "premium" | "not-sure" | null;
  colorsLike: string[];
  colorsDislike: string[];
  materials: string[];
  priorities: string[];
  lightingTemp: "warm" | "neutral" | "mixed" | null;
  atmosphere: string | null;
  keepText: string;
  excludeText: string;
  extraNotes: string;
  functions: string[];
  tvWanted: boolean | null;
  tvSize: string | null;
  mediaFurniture: string | null;
  curtainKind: string | null;
  concepts: Partial<Record<ProductConcept, ConceptIntent>>;
  plumbingUnverified: boolean;
};

function modeIntent(answer: DesignBriefAnswer | undefined): ConceptIntent | null {
  if (!answer) return null;
  if (answer.mode === "already_have") return "already_have";
  if (answer.mode === "ai_decide") return "ai_decide";
  if (answer.mode === "not_applicable") return "exclude";
  if (answer.mode === "skipped") return null;
  return null;
}

function setConcept(
  concepts: BriefPlannerIntent["concepts"],
  concept: ProductConcept,
  intent: ConceptIntent
) {
  concepts[concept] = intent;
}

function fromYesNo(
  concepts: BriefPlannerIntent["concepts"],
  answer: DesignBriefAnswer | undefined,
  concept: ProductConcept,
  yesIntent: ConceptIntent = "required"
) {
  const mode = modeIntent(answer);
  if (mode) {
    setConcept(concepts, concept, mode === "exclude" ? "exclude" : mode);
    return;
  }
  if (isAffirmative(answer)) setConcept(concepts, concept, yesIntent);
  else if (isDeclined(answer)) setConcept(concepts, concept, "exclude");
}

export function briefPlannerIntent(doc: DesignBriefDocument): BriefPlannerIntent {
  const concepts: BriefPlannerIntent["concepts"] = {};
  const styles = normalizeSelectedStyles(answerList(getAnswer(doc, "shared.style")));
  const budgetRaw = getAnswer(doc, "shared.budget")?.value;
  const budgetLevel =
    budgetRaw === "budget-friendly" || budgetRaw === "balanced" || budgetRaw === "premium" || budgetRaw === "not-sure"
      ? budgetRaw
      : null;

  const tv = doc.roomType === "living-room" ? getAnswer(doc, "living.tv") : undefined;
  if (tv) {
    if (isAiDecide(tv)) setConcept(concepts, "tv_console", "ai_decide");
    else if (isDeclined(tv) || tv.mode === "not_applicable") setConcept(concepts, "tv_console", "exclude");
    else if (isAffirmative(tv) || tv.value === "yes") {
      // Wall-mounted TV with minimal furniture does not require a console product.
      const mediaFurniture = getAnswer(doc, "living.mediaFurniture")?.value;
      if (mediaFurniture === "wall-mount") setConcept(concepts, "tv_console", "exclude");
      else setConcept(concepts, "tv_console", "required");
    }
  } else if (doc.roomType === "living-room" && !doc.completed) {
    setConcept(concepts, "tv_console", "needs_preference");
  } else if (doc.roomType === "living-room" && doc.completed && !tv) {
    setConcept(concepts, "tv_console", "needs_preference");
  }

  if (doc.roomType === "living-room") {
    const seating = answerList(getAnswer(doc, "living.seating"));
    const seatingAnswer = getAnswer(doc, "living.seating");
    if (seatingAnswer?.mode === "already_have") setConcept(concepts, "sofa", "already_have");
    if (seating.includes("sofa")) setConcept(concepts, "sofa", seatingAnswer?.mode === "already_have" ? "already_have" : "required");
    if (seating.includes("reading-chair") || seating.includes("armchairs")) {
      setConcept(concepts, "reading_chair", "required");
    }

    const tables = answerList(getAnswer(doc, "living.tables"));
    if (tables.includes("coffee")) setConcept(concepts, "coffee_table", "required");
    if (getAnswer(doc, "living.tables")?.mode === "already_have") setConcept(concepts, "coffee_table", "already_have");

    const storage = getAnswer(doc, "living.storage");
    if (storage) {
      if (storage.mode === "already_have") setConcept(concepts, "storage", "already_have");
      else if (storage.value === "none") setConcept(concepts, "storage", "exclude");
      else if (storage.mode === "ai_decide") setConcept(concepts, "storage", "ai_decide");
      else if (typeof storage.value === "string" && storage.value !== "none") {
        setConcept(concepts, "storage", "suggested");
      }
    }

    const livingLight = answerList(getAnswer(doc, "living.lighting"));
    if (livingLight.includes("ambient")) setConcept(concepts, "floor_lamp", "suggested");
    if (livingLight.includes("task")) setConcept(concepts, "table_lamp", "suggested");
  }

  const curtains =
    doc.roomType === "living-room"
      ? getAnswer(doc, "living.curtains")
      : doc.roomType === "bedroom"
        ? getAnswer(doc, "bedroom.curtains")
        : doc.roomType === "other"
          ? getAnswer(doc, "other.curtains")
          : undefined;
  if (curtains && curtains.mode !== "skipped") {
    if (curtains.mode === "already_have") setConcept(concepts, "window_treatment", "already_have");
    else if (curtains.value === "none" || curtains.mode === "not_applicable") {
      setConcept(concepts, "window_treatment", "exclude");
    } else if (curtains.mode === "ai_decide") setConcept(concepts, "window_treatment", "ai_decide");
    else setConcept(concepts, "window_treatment", "required");
  }

  if (doc.roomType === "bedroom") {
    fromYesNo(concepts, getAnswer(doc, "bedroom.reading"), "reading_chair");
    const bed = getAnswer(doc, "bedroom.bed");
    if (bed) {
      if (bed.mode === "already_have" || bed.value === "none") {
        setConcept(concepts, "bed", bed.value === "none" && bed.mode === "value" ? "exclude" : "already_have");
      } else if (bed.mode === "ai_decide") setConcept(concepts, "bed", "ai_decide");
      else setConcept(concepts, "bed", "required");
    }
    const wardrobe = getAnswer(doc, "bedroom.wardrobe");
    if (wardrobe) {
      if (wardrobe.mode === "already_have" || wardrobe.value === "built-in") setConcept(concepts, "wardrobe", "already_have");
      else if (wardrobe.value === "no") setConcept(concepts, "wardrobe", "exclude");
      else if (wardrobe.mode === "ai_decide") setConcept(concepts, "wardrobe", "ai_decide");
      else setConcept(concepts, "wardrobe", "required");
    }
    const bedside = getAnswer(doc, "bedroom.bedside");
    if (bedside) {
      if (bedside.mode === "already_have") setConcept(concepts, "bedside", "already_have");
      else if (bedside.value === "none") setConcept(concepts, "bedside", "exclude");
      else if (bedside.mode === "ai_decide") setConcept(concepts, "bedside", "ai_decide");
      else setConcept(concepts, "bedside", "required");
    }
    if (isAffirmative(getAnswer(doc, "bedroom.extraStorage"))) setConcept(concepts, "storage", "suggested");
    const bedroomLight = answerList(getAnswer(doc, "bedroom.lighting"));
    if (bedroomLight.includes("bedside")) setConcept(concepts, "table_lamp", "required");
    if (bedroomLight.includes("ambient")) setConcept(concepts, "floor_lamp", "suggested");
  }

  if (doc.roomType === "kitchen") {
    const kitchenDining = getAnswer(doc, "kitchen.dining");
    if (kitchenDining?.value === "table") {
      setConcept(concepts, "dining_table", "required");
      setConcept(concepts, "dining_chair", "required");
    } else if (kitchenDining?.value === "none") {
      setConcept(concepts, "dining_table", "exclude");
      setConcept(concepts, "dining_chair", "exclude");
    } else if (kitchenDining?.mode === "ai_decide") {
      setConcept(concepts, "dining_table", "ai_decide");
    }
    const kitchenLight = answerList(getAnswer(doc, "kitchen.lighting"));
    if (kitchenLight.includes("pendant")) setConcept(concepts, "pendant_light", "required");
    if (kitchenLight.includes("general")) setConcept(concepts, "ceiling_light", "suggested");
    const kitchenStorage = getAnswer(doc, "kitchen.storage");
    if (kitchenStorage?.value === "open" || kitchenStorage?.value === "mix") {
      setConcept(concepts, "storage", "suggested");
    }
  }

  if (doc.roomType === "bathroom") {
    fromYesNo(concepts, getAnswer(doc, "bathroom.mirrorLight"), "wall_light", "suggested");
    const bathroomStorage = answerList(getAnswer(doc, "bathroom.storage"));
    if (bathroomStorage.includes("tall") || bathroomStorage.includes("vanity") || bathroomStorage.includes("towels")) {
      setConcept(concepts, "storage", "suggested");
    }
    const bathroomLight = answerList(getAnswer(doc, "bathroom.lighting"));
    if (bathroomLight.includes("general")) setConcept(concepts, "ceiling_light", "suggested");
    if (bathroomLight.includes("mirror")) setConcept(concepts, "wall_light", "suggested");
  }

  if (doc.roomType === "other") {
    fromYesNo(concepts, getAnswer(doc, "other.desk"), "desk");
    if (isAffirmative(getAnswer(doc, "other.desk"))) setConcept(concepts, "office_chair", "required");
    const sleep = getAnswer(doc, "other.sleep");
    if (sleep?.value === "bed") setConcept(concepts, "bed", "required");
    else if (sleep?.value === "sofa-bed") setConcept(concepts, "sofa", "required");
    else if (sleep?.value === "none") setConcept(concepts, "bed", "exclude");
    fromYesNo(concepts, getAnswer(doc, "other.dining"), "dining_table");
    if (isAffirmative(getAnswer(doc, "other.dining"))) setConcept(concepts, "dining_chair", "required");
    fromYesNo(concepts, getAnswer(doc, "other.storage"), "storage", "suggested");
    const otherLight = answerList(getAnswer(doc, "other.lighting"));
    if (otherLight.includes("task")) setConcept(concepts, "table_lamp", "suggested");
    if (otherLight.includes("ambient")) setConcept(concepts, "floor_lamp", "suggested");
    if (otherLight.includes("general")) setConcept(concepts, "ceiling_light", "suggested");
  }

  const excludeText = typeof getAnswer(doc, "shared.exclude")?.value === "string"
    ? String(getAnswer(doc, "shared.exclude")?.value)
    : "";
  if (/\bno\s+(?:tv|television)\b/i.test(excludeText)) setConcept(concepts, "tv_console", "exclude");
  if (/\bno\s+rug\b/i.test(excludeText)) setConcept(concepts, "rug", "exclude");
  if (/\bno\s+curtains?\b/i.test(excludeText)) setConcept(concepts, "window_treatment", "exclude");

  const keepText = typeof getAnswer(doc, "shared.keep")?.value === "string"
    ? String(getAnswer(doc, "shared.keep")?.value)
    : "";
  const extraNotes = typeof getAnswer(doc, "shared.notes")?.value === "string"
    ? String(getAnswer(doc, "shared.notes")?.value)
    : "";

  const atmosphere =
    (getAnswer(doc, "living.atmosphere")?.value as string | undefined) ??
    (getAnswer(doc, "bedroom.atmosphere")?.value as string | undefined) ??
    null;

  const lightingTempRaw = getAnswer(doc, "shared.lightingTemp")?.value;
  const lightingTemp =
    lightingTempRaw === "warm" || lightingTempRaw === "neutral" || lightingTempRaw === "mixed"
      ? lightingTempRaw
      : null;

  const curtainKind =
    typeof curtains?.value === "string" && curtains.mode === "value" ? curtains.value : null;

  return {
    roomType: doc.roomType,
    customPurpose: doc.customPurpose,
    customPurposeText: doc.customPurposeText,
    selectedStyles: styles,
    budgetLevel,
    colorsLike: answerList(getAnswer(doc, "shared.colorsLike")),
    colorsDislike: answerList(getAnswer(doc, "shared.colorsDislike")),
    materials: answerList(getAnswer(doc, "shared.materials")),
    priorities: answerList(getAnswer(doc, "shared.priorities")),
    lightingTemp,
    atmosphere,
    keepText,
    excludeText,
    extraNotes,
    functions: answerList(getAnswer(doc, "other.functions")),
    tvWanted: concepts.tv_console === "required" ? true : concepts.tv_console === "exclude" ? false : null,
    tvSize:
      concepts.tv_console === "required" && typeof getAnswer(doc, "living.tvSize")?.value === "string"
        ? String(getAnswer(doc, "living.tvSize")?.value)
        : null,
    mediaFurniture:
      concepts.tv_console === "required" && typeof getAnswer(doc, "living.mediaFurniture")?.value === "string"
        ? String(getAnswer(doc, "living.mediaFurniture")?.value)
        : null,
    curtainKind,
    concepts,
    plumbingUnverified: doc.roomType === "kitchen" || doc.roomType === "bathroom",
  };
}

export function synthesizedNotes(intent: BriefPlannerIntent, existingNotes = ""): string {
  const parts = [
    existingNotes.trim(),
    intent.keepText.trim(),
    intent.excludeText.trim(),
    intent.extraNotes.trim(),
    intent.tvWanted === false ? "no television" : "",
    intent.tvWanted === true && intent.tvSize ? `television size ${intent.tvSize}` : "",
  ].filter(Boolean);
  const joined = parts.join(". ");
  return joined.slice(0, 400);
}

export function designBriefIdentity(doc: DesignBriefDocument): string | undefined {
  if (!doc.completed) return undefined;
  const intent = briefPlannerIntent(doc);
  const payload = {
    roomType: intent.roomType,
    purpose: intent.customPurpose,
    concepts: intent.concepts,
    styles: intent.selectedStyles,
    tv: intent.tvWanted,
    curtains: intent.curtainKind,
    exclude: intent.excludeText,
    keep: intent.keepText,
  };
  return JSON.stringify(payload);
}

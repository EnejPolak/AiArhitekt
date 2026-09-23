import type { ProjectRoomPreferences } from "@/lib/project-preferences/types";
import { EMPTY_DESIGN_BRIEF, type DesignBriefDocument } from "./schema";
import { applyAnswer } from "./engine";
import { questionsForRoom } from "./packs";

export function seedDesignBriefFromPreferences(
  prefs: Pick<
    ProjectRoomPreferences,
    "roomType" | "selectedStyles" | "budgetLevel" | "bedType" | "notes" | "wallMainColor" | "wallAccentColor"
  >,
  existing?: DesignBriefDocument | null
): DesignBriefDocument {
  const questions = questionsForRoom(prefs.roomType);
  let doc: DesignBriefDocument = {
    ...(existing && existing.schemaVersion === 1 ? existing : EMPTY_DESIGN_BRIEF),
    roomType: prefs.roomType,
    answers: { ...(existing?.answers ?? {}) },
  };
  const stamp = (questionId: string, value: DesignBriefDocument["answers"][string]["value"]) => {
    if (doc.answers[questionId]) return;
    doc = applyAnswer({
      document: doc,
      questions,
      questionId,
      answer: { questionId, mode: "value", value },
    });
  };
  if (prefs.selectedStyles.length > 0) stamp("shared.style", [...prefs.selectedStyles]);
  if (prefs.budgetLevel) stamp("shared.budget", prefs.budgetLevel);
  if (prefs.bedType && prefs.bedType !== "none" && prefs.roomType === "bedroom") {
    stamp("bedroom.bed", prefs.bedType);
  }
  const colors = [prefs.wallMainColor, prefs.wallAccentColor].map((item) => item.trim()).filter(Boolean);
  if (colors.length > 0) stamp("shared.colorsLike", colors.slice(0, 4));
  if (prefs.notes.trim() && !doc.answers["shared.notes"]) {
    stamp("shared.notes", prefs.notes.trim().slice(0, 400));
  }
  return doc;
}

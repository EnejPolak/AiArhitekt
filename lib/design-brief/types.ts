import type { ObservedRoomType } from "@/lib/analysis/schema";
import type { RoomPreferenceRoomType } from "@/lib/project-preferences/types";
import type { AnswerMode, DesignBriefAnswer, DesignBriefDocument } from "./schema";

export type QuestionType =
  | "single"
  | "multi"
  | "yesno"
  | "numeric"
  | "text"
  | "colors"
  | "priority";

export type QuestionOption = {
  id: string;
  label: string;
  description?: string;
};

export type ObservationFlag =
  | "hasWindows"
  | "hasDoors"
  | "unfinished"
  | "hasCeilingWiring"
  | "hasBuiltInStorage"
  | "hasToilet"
  | "hasBed"
  | "hasShower"
  | "hasBathtub"
  | "roomTypeMismatch";

export type BriefObservationContext = {
  userRoomType: RoomPreferenceRoomType | null;
  analysisRoomType: ObservedRoomType | null;
  hasWindows: boolean;
  hasDoors: boolean;
  unfinished: boolean;
  hasCeilingWiring: boolean;
  hasBuiltInStorage: boolean;
  hasToilet: boolean;
  hasBed: boolean;
  hasShower: boolean;
  hasBathtub: boolean;
  roomTypeMismatch: boolean;
};

export type AnswerCondition =
  | { answer: string; equals: string | number | boolean }
  | { answer: string; includes: string }
  | { answer: string; mode: AnswerMode }
  | { answer: string; unanswered: true }
  | { observation: ObservationFlag; is: boolean }
  | { roomType: RoomPreferenceRoomType }
  | { customPurposeIn: string[] };

export type QuestionDef = {
  id: string;
  pack: "shared" | RoomPreferenceRoomType;
  type: QuestionType;
  title: string;
  explanation?: string;
  options?: QuestionOption[];
  allowAiDecide?: boolean;
  allowNotApplicable?: boolean;
  allowAlreadyHave?: boolean;
  optional?: boolean;
  maxSelect?: number;
  numericMin?: number;
  numericMax?: number;
  placeholder?: string;
  visibleIf?: AnswerCondition[];
  visibleIfAny?: AnswerCondition[];
  invalidates?: string[];
};

export type BriefEngineContext = {
  observation: BriefObservationContext;
  document: DesignBriefDocument;
};

export function answerValue(answer: DesignBriefAnswer | undefined): string | string[] | number | boolean | null {
  if (!answer || answer.mode !== "value") return null;
  return answer.value ?? null;
}

export function answerList(answer: DesignBriefAnswer | undefined): string[] {
  const value = answerValue(answer);
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim()) return [value];
  return [];
}

export function isAffirmative(answer: DesignBriefAnswer | undefined): boolean {
  if (!answer) return false;
  if (answer.mode === "already_have") return true;
  if (answer.mode !== "value") return false;
  const value = answer.value;
  if (value === true || value === "yes") return true;
  if (Array.isArray(value)) return value.length > 0;
  return false;
}

export function isDeclined(answer: DesignBriefAnswer | undefined): boolean {
  if (!answer) return false;
  if (answer.mode === "not_applicable") return true;
  if (answer.mode !== "value") return false;
  return answer.value === false || answer.value === "no" || answer.value === "none";
}

export function isAiDecide(answer: DesignBriefAnswer | undefined): boolean {
  return answer?.mode === "ai_decide";
}

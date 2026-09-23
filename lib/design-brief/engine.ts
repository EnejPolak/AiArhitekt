import type { DesignBriefAnswer, DesignBriefDocument } from "./schema";
import { EMPTY_DESIGN_BRIEF } from "./schema";
import type {
  AnswerCondition,
  BriefEngineContext,
  BriefObservationContext,
  ObservationFlag,
  QuestionDef,
} from "./types";
import { answerList } from "./types";

export function getAnswer(doc: DesignBriefDocument, questionId: string): DesignBriefAnswer | undefined {
  return doc.answers[questionId];
}

function observationFlag(ctx: BriefObservationContext, flag: ObservationFlag): boolean {
  return Boolean(ctx[flag]);
}

export function matchesCondition(
  condition: AnswerCondition,
  doc: DesignBriefDocument,
  observation: BriefObservationContext
): boolean {
  if ("observation" in condition) {
    return observationFlag(observation, condition.observation) === condition.is;
  }
  if ("roomType" in condition) {
    return (doc.roomType ?? observation.userRoomType) === condition.roomType;
  }
  if ("customPurposeIn" in condition) {
    const purpose = doc.customPurpose ?? (getAnswer(doc, "other.purpose")?.value as string | undefined) ?? null;
    return Boolean(purpose && condition.customPurposeIn.includes(purpose));
  }
  const answer = getAnswer(doc, condition.answer);
  if ("unanswered" in condition) {
    return !answer;
  }
  if ("mode" in condition) {
    return answer?.mode === condition.mode;
  }
  if ("includes" in condition) {
    return answerList(answer).includes(condition.includes);
  }
  if ("equals" in condition) {
    if (!answer || answer.mode !== "value") return false;
    return answer.value === condition.equals;
  }
  return false;
}

export function isQuestionVisible(
  question: QuestionDef,
  doc: DesignBriefDocument,
  observation: BriefObservationContext
): boolean {
  if (question.visibleIf && question.visibleIf.length > 0) {
    if (!question.visibleIf.every((condition) => matchesCondition(condition, doc, observation))) {
      return false;
    }
  }
  if (question.visibleIfAny && question.visibleIfAny.length > 0) {
    if (!question.visibleIfAny.some((condition) => matchesCondition(condition, doc, observation))) {
      return false;
    }
  }
  return true;
}

export function visibleQuestions(
  questions: QuestionDef[],
  doc: DesignBriefDocument,
  observation: BriefObservationContext
): QuestionDef[] {
  return questions.filter((question) => isQuestionVisible(question, doc, observation));
}

export function isQuestionAnswered(question: QuestionDef, doc: DesignBriefDocument): boolean {
  const answer = getAnswer(doc, question.id);
  if (!answer) return Boolean(question.optional);
  return answer.mode !== undefined;
}

export function firstUnanswered(
  questions: QuestionDef[],
  doc: DesignBriefDocument,
  observation: BriefObservationContext
): QuestionDef | null {
  return visibleQuestions(questions, doc, observation).find((question) => !getAnswer(doc, question.id)) ?? null;
}

export function progress(
  questions: QuestionDef[],
  doc: DesignBriefDocument,
  observation: BriefObservationContext
): { current: number; total: number; remaining: number; answered: number } {
  const visible = visibleQuestions(questions, doc, observation);
  const required = visible.filter((question) => !question.optional);
  const answered = required.filter((question) => getAnswer(doc, question.id)).length;
  return {
    current: Math.min(answered + 1, Math.max(required.length, 1)),
    total: required.length,
    remaining: Math.max(0, required.length - answered),
    answered,
  };
}

function visibilityDependsOnAnswers(question: QuestionDef): boolean {
  const conditions = [...(question.visibleIf ?? []), ...(question.visibleIfAny ?? [])];
  return conditions.some((condition) => "answer" in condition || "customPurposeIn" in condition);
}

function pruneObservation(roomType: DesignBriefDocument["roomType"]): BriefObservationContext {
  return {
    userRoomType: roomType,
    analysisRoomType: null,
    hasWindows: true,
    hasDoors: true,
    unfinished: false,
    hasCeilingWiring: false,
    hasBuiltInStorage: false,
    hasToilet: false,
    hasBed: false,
    hasShower: false,
    hasBathtub: false,
    roomTypeMismatch: false,
  };
}

export function applyAnswer(input: {
  document: DesignBriefDocument;
  questions: QuestionDef[];
  questionId: string;
  answer: Omit<DesignBriefAnswer, "answeredAt"> & { answeredAt?: string };
}): DesignBriefDocument {
  const question = input.questions.find((item) => item.id === input.questionId);
  const nextAnswers = { ...input.document.answers };
  nextAnswers[input.questionId] = {
    ...input.answer,
    questionId: input.questionId,
    answeredAt: input.answer.answeredAt ?? new Date().toISOString(),
  };
  if (question?.invalidates) {
    for (const id of question.invalidates) {
      delete nextAnswers[id];
    }
  }
  const customPurpose =
    input.questionId === "other.purpose"
      ? input.answer.mode === "value" && typeof input.answer.value === "string"
        ? input.answer.value
        : null
      : input.document.customPurpose;
  const customPurposeText =
    input.questionId === "other.purposeText"
      ? input.answer.mode === "value" && typeof input.answer.value === "string"
        ? input.answer.value
        : input.document.customPurposeText
      : input.questionId === "other.purpose"
        ? null
        : input.document.customPurposeText;
  const nextDocument: DesignBriefDocument = {
    ...input.document,
    customPurpose,
    customPurposeText,
    currentQuestionId: input.questionId,
    completed: false,
    answers: nextAnswers,
  };
  const observation = pruneObservation(nextDocument.roomType);
  for (const item of input.questions) {
    if (item.id === input.questionId) continue;
    if (!nextAnswers[item.id] || !visibilityDependsOnAnswers(item)) continue;
    if (!isQuestionVisible(item, nextDocument, observation)) {
      delete nextAnswers[item.id];
    }
  }
  return { ...nextDocument, answers: nextAnswers };
}

export function markBriefComplete(document: DesignBriefDocument): DesignBriefDocument {
  return { ...document, completed: true };
}

export function reopenBrief(document: DesignBriefDocument, questionId?: string | null): DesignBriefDocument {
  return {
    ...document,
    completed: false,
    currentQuestionId: questionId ?? document.currentQuestionId,
  };
}

export function engineContext(
  document: DesignBriefDocument,
  observation: BriefObservationContext
): BriefEngineContext {
  return { document, observation };
}

export function cloneEmptyBrief(roomType: DesignBriefDocument["roomType"]): DesignBriefDocument {
  return { ...EMPTY_DESIGN_BRIEF, roomType, answers: {} };
}

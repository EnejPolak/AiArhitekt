export { DESIGN_BRIEF_SCHEMA_VERSION, EMPTY_DESIGN_BRIEF, parseDesignBriefAnswers, isEmptyDesignBrief } from "./schema";
export type { DesignBriefDocument, DesignBriefAnswer, AnswerMode } from "./schema";
export { questionsForRoom } from "./packs";
export {
  applyAnswer,
  firstUnanswered,
  visibleQuestions,
  progress,
  isQuestionVisible,
  markBriefComplete,
  reopenBrief,
  getAnswer,
  cloneEmptyBrief,
} from "./engine";
export { briefObservationContext } from "./observation";
export { briefPlannerIntent, synthesizedNotes, designBriefIdentity } from "./apply";
export type { BriefPlannerIntent } from "./apply";
export { seedDesignBriefFromPreferences } from "./seed";
export type { QuestionDef, BriefObservationContext } from "./types";

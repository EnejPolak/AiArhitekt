"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import type { RoomAnalysisView } from "@/lib/analysis/types";
import type { ProjectRoomPreferences, ProjectRoomPreferencesPatch } from "@/lib/project-preferences/types";
import {
  applyAnswer,
  briefObservationContext,
  firstUnanswered,
  markBriefComplete,
  progress,
  questionsForRoom,
  reopenBrief,
  seedDesignBriefFromPreferences,
  briefPlannerIntent,
  visibleQuestions,
  type DesignBriefDocument,
  type QuestionDef,
} from "@/lib/design-brief";
import { wizardPanelClass } from "../wizardUi";

export function DesignBriefStep({
  roomType,
  analysis,
  preferences,
  saving,
  error,
  onSave,
  onComplete,
}: {
  roomType: ProjectRoomPreferences["roomType"];
  analysis: RoomAnalysisView | null;
  preferences: ProjectRoomPreferences | null;
  saving?: boolean;
  error?: string | null;
  onSave: (patch: ProjectRoomPreferencesPatch) => Promise<boolean>;
  onComplete: () => void;
}) {
  const questions = React.useMemo(() => questionsForRoom(roomType), [roomType]);
  const observation = React.useMemo(
    () =>
      briefObservationContext({
        userRoomType: roomType,
        observation: analysis?.analysis ?? null,
      }),
    [roomType, analysis]
  );
  const [doc, setDoc] = React.useState<DesignBriefDocument>(() =>
    seedDesignBriefFromPreferences(
      {
        roomType,
        selectedStyles: preferences?.selectedStyles ?? [],
        budgetLevel: preferences?.budgetLevel ?? null,
        bedType: preferences?.bedType ?? "none",
        notes: preferences?.notes ?? "",
        wallMainColor: preferences?.wallMainColor ?? "",
        wallAccentColor: preferences?.wallAccentColor ?? "",
      },
      preferences?.designBriefAnswers ?? null
    )
  );
  const [summary, setSummary] = React.useState(Boolean(preferences?.designBriefAnswers?.completed));
  const [draftText, setDraftText] = React.useState("");
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const busy = Boolean(saving || pending);

  const visible = visibleQuestions(questions, doc, observation);
  const unanswered = firstUnanswered(questions, doc, observation);
  const editing = editingId ? visible.find((item) => item.id === editingId) ?? null : null;
  const current = summary ? null : editing ?? unanswered;
  const stats = progress(questions, doc, observation);

  React.useEffect(() => {
    if (!current) return;
    const existing = doc.answers[current.id];
    if (current.type === "text" && existing?.mode === "value" && typeof existing.value === "string") {
      setDraftText(existing.value);
    } else if (current.type === "numeric" && existing?.mode === "value" && typeof existing.value === "number") {
      setDraftText(String(existing.value));
    } else {
      setDraftText("");
    }
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const persist = async (next: DesignBriefDocument, extra: ProjectRoomPreferencesPatch = {}) => {
    const intent = briefPlannerIntent(next);
    const mismatch = next.answers["shared.roomTypeMismatch"]?.value;
    const detected = analysis?.analysis.roomType;
    const patch: ProjectRoomPreferencesPatch = {
      ...extra,
      designBriefAnswers: next,
    };
    if (intent.selectedStyles.length) patch.selectedStyles = intent.selectedStyles;
    if (intent.budgetLevel) patch.budgetLevel = intent.budgetLevel;
    if (
      typeof next.answers["bedroom.bed"]?.value === "string" &&
      ["king", "queen", "bunk", "single", "none"].includes(String(next.answers["bedroom.bed"]?.value))
    ) {
      patch.bedType = next.answers["bedroom.bed"]?.value as ProjectRoomPreferences["bedType"];
    }
    if (mismatch === "use_detected" && detected && detected !== "unknown") {
      patch.roomType = detected;
    }
    const extraNotes = typeof next.answers["shared.notes"]?.value === "string"
      ? String(next.answers["shared.notes"].value).slice(0, 400)
      : undefined;
    if (extraNotes !== undefined) patch.notes = extraNotes;
    return onSave(patch);
  };

  const commit = async (question: QuestionDef, mode: DesignBriefDocument["answers"][string]["mode"], value?: DesignBriefDocument["answers"][string]["value"]) => {
    const next = applyAnswer({
      document: doc,
      questions,
      questionId: question.id,
      answer: { questionId: question.id, mode, value },
    });
    setDoc(next);
    setEditingId(null);
    setPending(true);
    try {
      await persist(next);
    } finally {
      setPending(false);
    }
  };

  const goBack = () => {
    if (summary) {
      setSummary(false);
      const last = [...visible].reverse().find((item) => doc.answers[item.id]);
      if (last) {
        setEditingId(last.id);
        setDoc(reopenBrief(doc, last.id));
      }
      return;
    }
    const index = current ? visible.findIndex((item) => item.id === current.id) : visible.length;
    const previous = [...visible].slice(0, Math.max(index, 0)).reverse().find((item) => doc.answers[item.id]);
    if (previous) {
      setEditingId(previous.id);
      setDoc((prev) => reopenBrief(prev, previous.id));
    }
  };

  const finish = async () => {
    const next = markBriefComplete(doc);
    setDoc(next);
    setPending(true);
    try {
      const saved = await persist(next);
      if (saved) onComplete();
    } finally {
      setPending(false);
    }
  };

  const selectedIds = (question: QuestionDef): string[] => {
    const answer = doc.answers[question.id];
    if (!answer || answer.mode !== "value") return [];
    if (Array.isArray(answer.value)) return answer.value;
    if (typeof answer.value === "string") return [answer.value];
    return [];
  };

  return (
    <div className={cn(wizardPanelClass, "space-y-5")}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[12px] uppercase tracking-[0.08em] text-[rgba(255,255,255,0.45)]">
            Design brief
          </div>
          <div className="text-[18px] font-medium text-white mt-1">
            {summary || !current ? "Review your brief" : current.title}
          </div>
        </div>
        <div className="text-[12px] text-[rgba(255,255,255,0.50)] whitespace-nowrap">
          {stats.answered} / {stats.total}
        </div>
      </div>
      <div className="h-[3px] rounded-full bg-[rgba(255,255,255,0.08)] overflow-hidden">
        <div
          className="h-full bg-[#3B82F6] transition-[width] duration-300"
          style={{ width: `${Math.round((Math.min(stats.current, stats.total) / Math.max(stats.total, 1)) * 100)}%` }}
        />
      </div>

      {current?.explanation ? (
        <p className="text-[14px] text-[rgba(255,255,255,0.65)] leading-relaxed">{current.explanation}</p>
      ) : null}

      {current && (current.type === "single" || current.type === "yesno" || current.type === "multi" || current.type === "colors" || current.type === "priority") ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(current.options ?? []).map((option) => {
            const selected = selectedIds(current).includes(option.id);
            return (
              <button
                key={option.id}
                type="button"
                disabled={busy}
                onClick={() => {
                  if (current.type === "multi" || current.type === "colors" || current.type === "priority") {
                    const next = selected
                      ? selectedIds(current).filter((id) => id !== option.id)
                      : [...selectedIds(current), option.id].slice(0, current.maxSelect ?? 8);
                    void commit(current, "value", next);
                    return;
                  }
                  void commit(current, "value", option.id);
                }}
                className={cn(
                  "p-4 rounded-[14px] text-left border transition-all duration-200 disabled:opacity-40",
                  selected
                    ? "border-[#3B82F6] bg-[rgba(59,130,246,0.10)]"
                    : "border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] hover:border-[rgba(255,255,255,0.15)]"
                )}
              >
                <div className={cn("text-[15px] font-medium", selected ? "text-white" : "text-[rgba(255,255,255,0.88)]")}>
                  {option.label}
                </div>
                {option.description ? (
                  <div className="text-[12px] text-[rgba(255,255,255,0.55)] mt-1">{option.description}</div>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}

      {current?.type === "text" || current?.type === "numeric" ? (
        <input
          value={draftText}
          onChange={(event) => setDraftText(event.target.value)}
          inputMode={current.type === "numeric" ? "numeric" : "text"}
          placeholder={current.placeholder}
          className="w-full px-4 py-3 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.08)] text-white text-sm focus:outline-none focus:border-[#3B82F6]"
        />
      ) : null}

      {summary || !current ? (
        <ul className="space-y-2">
          {visible
            .filter((item) => doc.answers[item.id])
            .map((item) => {
              const answer = doc.answers[item.id]!;
              const label =
                answer.mode === "ai_decide"
                  ? "Let AI decide"
                  : answer.mode === "already_have"
                    ? "I already have this"
                    : answer.mode === "not_applicable"
                      ? "Not applicable"
                      : answer.mode === "skipped"
                        ? "Skipped"
                        : Array.isArray(answer.value)
                        ? answer.value.join(", ")
                        : String(answer.value ?? "");
              return (
                <li key={item.id} className="flex items-start justify-between gap-3 text-[13px]">
                  <span className="text-[rgba(255,255,255,0.55)]">{item.title}</span>
                  <button
                    type="button"
                    className="text-right text-white hover:text-[#93C5FD]"
                    onClick={() => {
                      setSummary(false);
                      setEditingId(item.id);
                      setDoc(reopenBrief(doc, item.id));
                    }}
                  >
                    {label || "Edit"}
                  </button>
                </li>
              );
            })}
        </ul>
      ) : null}

      {error ? (
        <p className="text-[13px] text-[#E5484D]" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          onClick={goBack}
          disabled={busy}
          className="px-4 py-2 rounded-lg border border-[rgba(255,255,255,0.12)] text-[13px] text-[rgba(255,255,255,0.75)] disabled:opacity-40"
        >
          Back
        </button>
        {current?.allowAiDecide ? (
          <button type="button" disabled={busy} onClick={() => void commit(current, "ai_decide")} className="px-4 py-2 text-[13px] text-[rgba(255,255,255,0.70)] disabled:opacity-40">
            Let AI decide
          </button>
        ) : null}
        {current?.allowAlreadyHave ? (
          <button type="button" disabled={busy} onClick={() => void commit(current, "already_have")} className="px-4 py-2 text-[13px] text-[rgba(255,255,255,0.70)] disabled:opacity-40">
            I already have this
          </button>
        ) : null}
        {current?.allowNotApplicable || current?.optional ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void commit(current, current.allowNotApplicable ? "not_applicable" : "skipped")}
            className="px-4 py-2 text-[13px] text-[rgba(255,255,255,0.70)] disabled:opacity-40"
          >
            {current.allowNotApplicable ? "Not applicable" : "Skip"}
          </button>
        ) : null}
        {current && (current.type === "text" || current.type === "numeric" || current.type === "multi" || current.type === "colors" || current.type === "priority") ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (current.type === "text") {
                void commit(current, draftText.trim() ? "value" : "skipped", draftText.trim() || null);
                return;
              }
              if (current.type === "numeric") {
                const n = Number(draftText);
                void commit(current, Number.isFinite(n) ? "value" : "skipped", Number.isFinite(n) ? n : null);
                return;
              }
              void commit(current, "value", selectedIds(current));
            }}
            className="px-5 py-2 rounded-lg bg-[#3B82F6] text-white text-[13px] font-medium disabled:opacity-40"
          >
            Continue
          </button>
        ) : null}
        {!current || summary ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void finish()}
            className="px-5 py-2 rounded-lg bg-[#3B82F6] text-white text-[13px] font-medium disabled:opacity-40"
          >
            Confirm brief
          </button>
        ) : null}
      </div>
    </div>
  );
}

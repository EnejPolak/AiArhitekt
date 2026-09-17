"use client";

import * as React from "react";
import { analyzeRoom } from "@/lib/analysis/actions";
import type { RoomAnalysisView } from "@/lib/analysis/types";
import type { DesignRequirements, RoomAnalysisObservation } from "@/lib/analysis/schema";
import { wizardPanelClass } from "../wizardUi";

export interface Step3AIObservationProps {
  projectId: string;
  hasPersistedPhoto: boolean;
  initialAnalysis: RoomAnalysisView | null;
  onContinue: (analysis: RoomAnalysisView) => void;
}

type Status = "ready" | "analyzing" | "complete" | "error";

const ROOM_TYPE_LABEL: Record<RoomAnalysisObservation["roomType"], string> = {
  kitchen: "Kitchen",
  bathroom: "Bathroom",
  bedroom: "Bedroom",
  "living-room": "Living room",
  other: "Other",
  unknown: "Uncertain",
};

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-4">
      <div className="text-[12px] uppercase tracking-[0.08em] text-[rgba(255,255,255,0.45)] mb-2">
        {title}
      </div>
      <div className="text-[14px] text-[rgba(255,255,255,0.82)] leading-relaxed">
        {children}
      </div>
    </div>
  );
}

function List({ items }: { items: string[] }) {
  if (items.length === 0) {
    return <span className="text-[rgba(255,255,255,0.45)]">None noted</span>;
  }
  return (
    <ul className="list-disc pl-4 space-y-1">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function AnalysisBody({
  analysis,
  requirements,
}: {
  analysis: RoomAnalysisObservation;
  requirements: DesignRequirements;
}) {
  const existing = analysis.existingElements.map((item) => item.description);
  const furniture = requirements.furnitureNeeds.map((item) => {
    const qty = item.quantity != null ? ` × ${item.quantity}` : "";
    const place = item.placementNotes ? ` — ${item.placementNotes}` : "";
    return `${item.category}${qty}${place}`;
  });
  const materials = requirements.materialNeeds.map((item) => {
    const finish = item.finishDirection ? ` (${item.finishDirection})` : "";
    return `${item.surface}: ${item.category}${finish}`;
  });

  return (
    <>
      <Section title="Room detected">
        {ROOM_TYPE_LABEL[analysis.roomType]}
        {analysis.visualCondition.overall ? ` · ${analysis.visualCondition.overall}` : ""}
      </Section>
      <Section title="Existing space">
        <List
          items={[
            ...analysis.architecture.fixedElements,
            ...existing,
            ...(analysis.visualCondition.colors.length
              ? [`Colors: ${analysis.visualCondition.colors.join(", ")}`]
              : []),
            ...(analysis.visualCondition.lighting
              ? [`Lighting: ${analysis.visualCondition.lighting}`]
              : []),
          ]}
        />
      </Section>
      <Section title="What should stay">
        <List items={analysis.preserve.length ? analysis.preserve : requirements.preserve} />
      </Section>
      <Section title="What could change">
        <List
          items={
            analysis.replaceOrRemove.length
              ? analysis.replaceOrRemove
              : requirements.replaceOrRemove
          }
        />
      </Section>
      <Section title="Furniture needed">
        <List items={furniture} />
      </Section>
      <Section title="Materials needed">
        <List items={materials} />
      </Section>
      <Section title="Constraints / uncertainties">
        <List
          items={[
            ...analysis.constraints,
            ...analysis.measurementStatus.qualitativeNotes,
            ...analysis.uncertainties,
          ]}
        />
      </Section>
    </>
  );
}

export const Step3AIObservation: React.FC<Step3AIObservationProps> = ({
  projectId,
  hasPersistedPhoto,
  initialAnalysis,
  onContinue,
}) => {
  const [analysis, setAnalysis] = React.useState<RoomAnalysisView | null>(initialAnalysis);
  const [status, setStatus] = React.useState<Status>(
    initialAnalysis ? "complete" : "ready"
  );
  const [error, setError] = React.useState<string | null>(null);
  const inFlightRef = React.useRef(false);

  React.useEffect(() => {
    setAnalysis(initialAnalysis);
    setStatus(initialAnalysis ? "complete" : "ready");
    setError(null);
  }, [initialAnalysis]);

  const runAnalysis = async (reanalyze: boolean) => {
    if (inFlightRef.current) return;
    if (!hasPersistedPhoto) {
      setError("Upload a room photo before analyzing.");
      setStatus("error");
      return;
    }
    inFlightRef.current = true;
    setStatus("analyzing");
    setError(null);
    const result = await analyzeRoom({ projectId, reanalyze });
    inFlightRef.current = false;
    if (!result.ok) {
      setError(result.message);
      setStatus(analysis ? "complete" : "error");
      return;
    }
    setAnalysis(result.analysis);
    setStatus("complete");
  };

  const cardClass = wizardPanelClass;

  if (status === "analyzing") {
    return (
      <div className="flex justify-start mb-6">
        <div className={cardClass}>
          <div className="text-[15px] text-[rgba(255,255,255,0.85)] leading-relaxed">
            Analyzing your space…
          </div>
          <div className="flex items-center gap-2 mt-3 text-[rgba(255,255,255,0.50)]">
            <div className="w-2 h-2 bg-[rgba(255,255,255,0.50)] rounded-full animate-pulse" />
            <div className="w-2 h-2 bg-[rgba(255,255,255,0.50)] rounded-full animate-pulse delay-75" />
            <div className="w-2 h-2 bg-[rgba(255,255,255,0.50)] rounded-full animate-pulse delay-150" />
          </div>
        </div>
      </div>
    );
  }

  if (status === "complete" && analysis) {
    return (
      <div className="flex justify-start mb-6">
        <div className={cardClass}>
          <div className="text-[15px] text-[rgba(255,255,255,0.85)] leading-relaxed">
            Here is a structured reading of the current room. Style and budget come next —
            this is observation and requirements, not a product list or a render.
          </div>
          <AnalysisBody
            analysis={analysis.analysis}
            requirements={analysis.designRequirements}
          />
          {error ? (
            <p className="mt-4 text-[13px] text-[#E5484D]" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-3 mt-5">
            <button
              type="button"
              onClick={() => onContinue(analysis)}
              className="text-[14px] text-[rgba(0,230,204,0.85)] hover:text-[rgba(0,230,204,1)]"
            >
              Continue
            </button>
            <button
              type="button"
              disabled={status === "analyzing"}
              onClick={() => void runAnalysis(true)}
              className="text-[14px] text-[rgba(255,255,255,0.70)] hover:text-white"
            >
              Re-analyze
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start mb-6">
      <div className={cardClass}>
        <div className="text-[15px] text-[rgba(255,255,255,0.85)] leading-relaxed">
          {hasPersistedPhoto
            ? "The room photo is saved. I can analyze the existing space and prepare design requirements. This does not search products or generate a render."
            : "Upload a room photo first, then analyze the space."}
        </div>
        {error ? (
          <p className="mt-3 text-[13px] text-[#E5484D]" role="alert">
            {error}
          </p>
        ) : null}
        <div className="mt-5">
            <button
              type="button"
              disabled={!hasPersistedPhoto || status === "analyzing"}
              onClick={() => void runAnalysis(false)}
            className="text-[14px] text-[rgba(0,230,204,0.85)] hover:text-[rgba(0,230,204,1)] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Analyze Room
          </button>
        </div>
      </div>
    </div>
  );
};

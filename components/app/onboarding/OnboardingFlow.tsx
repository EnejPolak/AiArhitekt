"use client";

import * as React from "react";
import { OnboardingStepper } from "./OnboardingStepper";
import { ChatMessage } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { StepLocation } from "./steps/StepLocation";
import { StepPlotSize } from "./steps/StepPlotSize";
import { StepProjectType } from "./steps/StepProjectType";
import { StepDocuments } from "./steps/StepDocuments";
import { StepUpload } from "./steps/StepUpload";
import { StepReview } from "./steps/StepReview";
import { StepGenerate } from "./steps/StepGenerate";

export interface ProjectData {
  location: {
    country: string;
    city: string;
    street?: string;
  } | null;
  plotSize: {
    size: number | null;
    approximate: boolean;
  } | null;
  projectType: {
    type: "new-build" | "renovation" | "interior-only" | null;
    livesInBuilding: boolean | null;
  } | null;
  documents: {
    hasOfficialPlans: boolean;
    hasSketch: boolean;
    hasNoPlans: boolean;
    hasPermitDrawings: boolean;
  } | null;
  uploads: {
    files: File[];
    notes: string;
  } | null;
}

const STEPS = [
  { id: 1, label: "Location" },
  { id: 2, label: "Plot size" },
  { id: 3, label: "Project type" },
  { id: 4, label: "Documents & permits" },
  { id: 5, label: "Upload plans & photos" },
  { id: 6, label: "Review" },
  { id: 7, label: "Generate 3D" },
];

export const OnboardingFlow: React.FC = () => {
  const [currentStep, setCurrentStep] = React.useState(1);
  const [onboardingCompleted, setOnboardingCompleted] = React.useState(false);
  const [projectData, setProjectData] = React.useState<ProjectData>({
    location: null,
    plotSize: null,
    projectType: null,
    documents: null,
    uploads: null,
  });
  const [messages, setMessages] = React.useState<Array<{ type: "ai" | "user"; content: string; timestamp: Date }>>([]);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, currentStep]);

  const handleStepComplete = (step: number, data: any) => {
    setProjectData((prev) => ({ ...prev, ...data }));
    
    // Add AI acknowledgment message
    const acknowledgment = getAcknowledgmentMessage(step, data);
    if (acknowledgment) {
      setMessages((prev) => [
        ...prev,
        { type: "ai", content: acknowledgment, timestamp: new Date() },
      ]);
    }

    // Advance to next step
    if (step < 7) {
      setTimeout(() => {
        setCurrentStep(step + 1);
      }, 500);
    }
  };

  const handleChatSubmit = (message: string) => {
    if (!message.trim()) return;

    setMessages((prev) => [
      ...prev,
      { type: "user", content: message, timestamp: new Date() },
    ]);

    // Simulate AI response
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          type: "ai",
          content: "I understand. How can I help you with your project?",
          timestamp: new Date(),
        },
      ]);
    }, 1000);
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <StepLocation
            data={projectData.location}
            onComplete={(data) => handleStepComplete(1, { location: data })}
          />
        );
      case 2:
        return (
          <StepPlotSize
            data={projectData.plotSize}
            onComplete={(data) => handleStepComplete(2, { plotSize: data })}
          />
        );
      case 3:
        return (
          <StepProjectType
            data={projectData.projectType}
            onComplete={(data) => handleStepComplete(3, { projectType: data })}
          />
        );
      case 4:
        return (
          <StepDocuments
            data={projectData.documents}
            onComplete={(data) => handleStepComplete(4, { documents: data })}
          />
        );
      case 5:
        return (
          <StepUpload
            data={projectData.uploads}
            onComplete={(data) => handleStepComplete(5, { uploads: data })}
          />
        );
      case 6:
        return (
          <StepReview
            projectData={projectData}
            onComplete={() => handleStepComplete(6, {})}
            onEdit={(step) => setCurrentStep(step)}
          />
        );
      case 7:
        return (
          <StepGenerate
            projectData={projectData}
            onComplete={() => {
              setOnboardingCompleted(true);
            }}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Stepper */}
      <div className="px-6 md:px-8 pt-6 pb-4 border-b border-[rgba(255,255,255,0.08)] flex-shrink-0">
        <OnboardingStepper steps={STEPS} currentStep={currentStep} />
      </div>

      {/* Main Content Area */}
      {!onboardingCompleted ? (
        /* Onboarding Mode - Centered Content */
        <div className="flex-1 overflow-y-auto flex items-center justify-center">
          <div className="w-full max-w-[600px] px-6 md:px-8 py-12 space-y-6">
            {renderStepContent()}
          </div>
        </div>
      ) : (
        /* Chat Mode - Full Conversation */
        <>
          <div className="flex-1 overflow-y-auto px-6 md:px-8 py-6">
            <div className="max-w-[900px] mx-auto space-y-6">
              {/* Render step content as AI message */}
              {renderStepContent()}

              {/* Additional chat messages */}
              {messages.map((message, index) => (
                <ChatMessage
                  key={index}
                  type={message.type}
                  content={message.content}
                />
              ))}

              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Chat Input - Only visible after onboarding */}
          <div className="px-6 md:px-8 py-4 border-t border-[rgba(255,255,255,0.08)] flex-shrink-0">
            <div className="max-w-[900px] mx-auto">
              <ChatInput onSubmit={handleChatSubmit} />
            </div>
          </div>
        </>
      )}
    </div>
  );
};

function getAcknowledgmentMessage(step: number, data: any): string | null {
  switch (step) {
    case 1:
      return data?.city && data?.country
        ? `Got it, ${data.city}, ${data.country}.`
        : null;
    case 2:
      return data?.size
        ? `Perfect, ${data.size}m² plot size noted.`
        : null;
    case 3:
      const typeLabels: Record<string, string> = {
        "new-build": "New build",
        renovation: "Renovation",
        "interior-only": "Interior only",
      };
      return data?.type
        ? `Understood, ${typeLabels[data.type] || data.type} project.`
        : null;
    case 4:
      return "Thanks for sharing what documentation you have.";
    case 5:
      return data?.files?.length
        ? `Great, I've got ${data.files.length} file${data.files.length > 1 ? "s" : ""} uploaded.`
        : null;
    default:
      return null;
  }
}



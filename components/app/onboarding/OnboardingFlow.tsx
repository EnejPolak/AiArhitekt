"use client";

import * as React from "react";
import { OnboardingStepper } from "./OnboardingStepper";
import { ChatMessage } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { StepLocation } from "./steps/StepLocation";
import { StepProjectType } from "./steps/StepProjectType";
import { StepPlotSize } from "./steps/StepPlotSize";
import { StepProjectSize } from "./steps/StepProjectSize";
import { StepDocuments } from "./steps/StepDocuments";
import { StepUpload } from "./steps/StepUpload";
import { StepInteriorStyle } from "./steps/StepInteriorStyle";
import { StepMaterialGrade } from "./steps/StepMaterialGrade";
import { StepFurnitureStyle } from "./steps/StepFurnitureStyle";
import { StepShoppingPreferences } from "./steps/StepShoppingPreferences";
import { StepRenderAngle } from "./steps/StepRenderAngle";
import { StepBudgetRange } from "./steps/StepBudgetRange";
import { StepSpecialRequirements } from "./steps/StepSpecialRequirements";
import { StepReview } from "./steps/StepReview";
import { StepGenerate } from "./steps/StepGenerate";

export interface ProjectData {
  location: {
    address: string;
    radius: number; // 30, 50, or 100 km
    useGeolocation: boolean;
  } | null;
  projectType: {
    type: "new-construction" | "renovation" | "extension" | null;
    renovationCondition?: "poor" | "medium" | "good" | null;
  } | null;
  plotSize: {
    size: number | null;
    buildingFootprint?: number | null;
    terrainType: "flat" | "slope" | "unknown" | null;
  } | null;
  projectSize: {
    size: number | null;
    rooms: number | null;
    ceilingHeight: "standard" | "high" | null;
  } | null;
  documents: {
    hasNoDocuments: boolean;
    hasFloorPlan: boolean;
    hasMeasurements: boolean;
    hasPhotos: boolean;
    needsPermitHelp: boolean;
  } | null;
  uploads: {
    floorplanImage?: File | null;
    roomPhotos: File[];
    sketches?: File[];
    googleMapsScreenshot?: File | null;
  } | null;
  interiorStyle: "modern" | "scandinavian" | "minimalist" | "industrial" | "luxury" | "rustic" | "japandi" | "mediterranean" | null;
  materialGrade: "budget" | "mid-range" | "premium" | null;
  furnitureStyle: "minimalist" | "cozy" | "luxury" | "functional" | "scandinavian" | "industrial" | null;
  renderAngle: "eye-level" | "bird-eye" | "corner-view" | "straight-perspective" | "isometric" | null;
  shoppingPreferences: {
    flooring: "local" | "online" | "mixed" | "inspiration_only";
    paint: "local" | "online" | "mixed" | "inspiration_only";
    lighting: "local" | "online" | "mixed" | "inspiration_only";
    kitchen: "local" | "online" | "mixed" | "inspiration_only";
    bathroom: "local" | "online" | "mixed" | "inspiration_only";
    furniture: "local" | "online" | "mixed" | "inspiration_only";
    decor: "local" | "online" | "mixed" | "inspiration_only";
  } | null;
  budgetRange: {
    min: number;
    max: number;
    strictness: "strict" | "flexible" | null;
  } | null;
  specialRequirements: {
    heating?: string;
    flooring?: string;
    colors?: string;
    furnitureMustHave?: string;
    kitchenBathroomNeeds?: string;
  } | null;
}

const STEPS = [
  { id: 1, label: "Location" },
  { id: 2, label: "Project type" },
  { id: 3, label: "Plot size" },
  { id: 4, label: "Project size" },
  { id: 5, label: "Documents" },
  { id: 6, label: "Upload files" },
  { id: 7, label: "Interior style" },
  { id: 8, label: "Material grade" },
  { id: 9, label: "Furniture style" },
  { id: 10, label: "Shopping preferences" },
  { id: 11, label: "Render angle" },
  { id: 12, label: "Budget range" },
  { id: 13, label: "Special requirements" },
  { id: 14, label: "Review" },
];

export const OnboardingFlow: React.FC = () => {
  const [currentStep, setCurrentStep] = React.useState(1);
  const [onboardingCompleted, setOnboardingCompleted] = React.useState(false);
  const [projectData, setProjectData] = React.useState<ProjectData>({
    location: null,
    projectType: null,
    plotSize: null,
    projectSize: null,
    documents: null,
    uploads: null,
    interiorStyle: null,
    materialGrade: null,
    furnitureStyle: null,
    renderAngle: null,
    shoppingPreferences: null,
    budgetRange: null,
    specialRequirements: null,
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
    if (step < 14) {
      setTimeout(() => {
        setCurrentStep(step + 1);
      }, 500);
    } else if (step === 14) {
      // Review step - handled in StepReview component
    }
  };

  const handleChatSubmit = async (message: string) => {
    if (!message.trim()) return;

    // Add user message immediately
    const userMessage = { type: "user" as const, content: message, timestamp: new Date() };
    setMessages((prev) => [...prev, userMessage]);

    // Add loading message
    const loadingMessageId = Date.now();
    setMessages((prev) => [
      ...prev,
      { type: "ai" as const, content: "Thinking...", timestamp: new Date() },
    ]);

    try {
      // TODO: Implement API call
      throw new Error("API not implemented yet");

      // Replace loading message with actual response
      // Note: This code is unreachable until API is implemented
      // setMessages((prev) => {
      //   const filtered = prev.filter((msg, idx) => {
      //     // Remove the loading message
      //     return !(idx === prev.length - 1 && msg.content === "Thinking...");
      //   });
      //   return [
      //     ...filtered,
      //     { type: "ai" as const, content: data.reply, timestamp: new Date() },
      //   ];
      // });
    } catch (error: any) {
      // Replace loading message with error
      setMessages((prev) => {
        const filtered = prev.filter((msg, idx) => {
          return !(idx === prev.length - 1 && msg.content === "Thinking...");
        });
        return [
          ...filtered,
          {
            type: "ai" as const,
            content: "Sorry, I encountered an error. Please try again.",
            timestamp: new Date(),
          },
        ];
      });
      console.error("Chat error:", error);
    }
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
          <StepProjectType
            data={projectData.projectType}
            onComplete={(data) => handleStepComplete(2, { projectType: data })}
          />
        );
      case 3:
        return (
          <StepPlotSize
            data={projectData.plotSize}
            onComplete={(data) => handleStepComplete(3, { plotSize: data })}
          />
        );
      case 4:
        return (
          <StepProjectSize
            data={projectData.projectSize}
            onComplete={(data) => handleStepComplete(4, { projectSize: data })}
          />
        );
      case 5:
        return (
          <StepDocuments
            data={projectData.documents}
            onComplete={(data) => handleStepComplete(5, { documents: data })}
          />
        );
      case 6:
        return (
          <StepUpload
            data={projectData.uploads}
            onComplete={(data) => handleStepComplete(6, { uploads: data })}
          />
        );
      case 7:
        return (
          <StepInteriorStyle
            data={projectData.interiorStyle}
            onComplete={(data) => handleStepComplete(7, { interiorStyle: data })}
          />
        );
      case 8:
        return (
          <StepMaterialGrade
            data={projectData.materialGrade}
            onComplete={(data) => handleStepComplete(8, { materialGrade: data })}
          />
        );
      case 9:
        return (
          <StepFurnitureStyle
            data={projectData.furnitureStyle}
            onComplete={(data) => handleStepComplete(9, { furnitureStyle: data })}
          />
        );
      case 10:
        return (
          <StepShoppingPreferences
            data={projectData.shoppingPreferences}
            onComplete={(data) => handleStepComplete(10, { shoppingPreferences: data })}
          />
        );
      case 11:
        return (
          <StepRenderAngle
            data={projectData.renderAngle}
            onComplete={(data) => handleStepComplete(11, { renderAngle: data })}
          />
        );
      case 12:
        return (
          <StepBudgetRange
            data={projectData.budgetRange}
            onComplete={(data) => handleStepComplete(12, { budgetRange: data })}
          />
        );
      case 13:
        return (
          <StepSpecialRequirements
            data={projectData.specialRequirements}
            onComplete={(data) => handleStepComplete(13, { specialRequirements: data })}
          />
        );
      case 14:
        return (
          <StepReview
            projectData={projectData}
            onComplete={() => {
              // After review, go to generate step
              setCurrentStep(15);
            }}
            onEdit={(step) => setCurrentStep(step)}
          />
        );
      case 15:
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
        /* Onboarding Mode - Scrollable Content */
        <div className="flex-1 overflow-y-auto">
          <div className="w-full max-w-[600px] mx-auto px-6 md:px-8 py-6 space-y-6">
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
      return data?.address ? `Got it, ${data.address}.` : null;
    case 2:
      return data?.type ? `Understood, ${data.type} project.` : null;
    case 3:
      return data?.size ? `Perfect, ${data.size}m² plot size noted.` : null;
    case 4:
      return data?.size ? `Great, ${data.size}m² project with ${data.rooms} rooms.` : null;
    case 5:
      return "Thanks for sharing what documentation you have.";
    case 6:
      return data?.floorplanImage ? "Great, I've got your files uploaded." : null;
    case 7:
      return data ? `Perfect, ${data} style selected.` : null;
    case 8:
      return data ? `Got it, ${data} material grade.` : null;
    case 9:
      return data ? `Understood, ${data} furniture style.` : null;
    case 10:
      return "Shopping preferences saved.";
    case 11:
      return data ? `Perfect, ${data} render angle.` : null;
    case 12:
      return data?.min && data?.max
        ? `Budget range set: ${data.min}€ - ${data.max}€.`
        : null;
    case 13:
      return "Special requirements noted.";
    default:
      return null;
  }
}



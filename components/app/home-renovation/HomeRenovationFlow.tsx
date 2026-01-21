"use client";

import * as React from "react";
import { ConversationMessage } from "../room-renovation/ConversationMessage";
import { Step0Greeting } from "./steps/Step0Greeting";
import { Step1HomeType } from "./steps/Step1HomeType";
import { Step2RenovationScope } from "./steps/Step2RenovationScope";
import { Step3FloorPlanUpload } from "./steps/Step3FloorPlanUpload";
import { Step4AIObservation } from "./steps/Step4AIObservation";
import { Step5StyleDirection } from "./steps/Step5StyleDirection";
import { Step6BudgetLevel } from "./steps/Step6BudgetLevel";
import { Step7DesignConceptGeneration } from "./steps/Step7DesignConceptGeneration";
import { Step8ConceptSelection } from "./steps/Step8ConceptSelection";
import { Step9CostEstimate } from "./steps/Step9CostEstimate";
import { Step10MaterialGuidance } from "./steps/Step10MaterialGuidance";
import { Step11FinalReport } from "./steps/Step11FinalReport";

export interface HomeRenovationData {
  userName?: string;
  homeType: "apartment" | "house" | "townhouse" | "other" | null;
  renovationScope: string[]; // Kitchen, Bathroom(s), Bedrooms, etc.
  floorPlans: File[]; // PDFs or images
  photos: File[]; // Room photos (1-5)
  aiObservation: string | null;
  selectedStyles: string[]; // Up to 3 global styles
  budgetLevel: "essential" | "balanced" | "high-end" | "not-sure" | null;
  generatedConcepts: Array<{
    id: string;
    url: string;
    area: string; // "Living area", "Kitchen", etc.
  }>;
  selectedConcept: string | null;
  costEstimate: {
    rooms: Array<{ name: string; min: number; max: number }>;
    systems: Array<{ name: string; min: number; max: number }>;
    labor: { min: number; max: number };
    materials: { min: number; max: number };
    total: { min: number; max: number };
  } | null;
  materialGuidance: Array<{
    category: string;
    items: Array<{ name: string; description: string }>;
  }> | null;
}

export interface ConversationEntry {
  id: string;
  type: "ai" | "user";
  content: string | React.ReactNode;
  timestamp: Date;
  isTyping?: boolean;
  hasTyped?: boolean;
  displayedText?: string;
}

export interface HomeRenovationFlowProps {
  projectId: string;
  onComplete?: () => void;
}

export const HomeRenovationFlow: React.FC<HomeRenovationFlowProps> = ({
  projectId,
  onComplete,
}) => {
  const [currentStep, setCurrentStep] = React.useState(0);
  const [conversation, setConversation] = React.useState<ConversationEntry[]>([]);
  const [data, setData] = React.useState<HomeRenovationData>({
    homeType: null,
    renovationScope: [],
    floorPlans: [],
    photos: [],
    aiObservation: null,
    selectedStyles: [],
    budgetLevel: null,
    generatedConcepts: [],
    selectedConcept: null,
    costEstimate: null,
    materialGuidance: null,
  });
  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const scrollIntervalRef = React.useRef<NodeJS.Timeout | null>(null);

  // Auto-scroll during typing
  React.useEffect(() => {
    const hasTypingMessage = conversation.some(
      (entry) => entry.type === "ai" && entry.isTyping && !entry.hasTyped
    );

    if (hasTypingMessage) {
      scrollIntervalRef.current = setInterval(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    } else {
      if (scrollIntervalRef.current) {
        clearInterval(scrollIntervalRef.current);
        scrollIntervalRef.current = null;
      }
    }

    return () => {
      if (scrollIntervalRef.current) {
        clearInterval(scrollIntervalRef.current);
      }
    };
  }, [conversation]);

  // Typewriter effect management
  const typingTimersRef = React.useRef<Map<string, NodeJS.Timeout>>(new Map());

  const markTypingComplete = React.useCallback((messageId: string) => {
    setConversation((prev) =>
      prev.map((entry) =>
        entry.id === messageId
          ? { ...entry, isTyping: false, hasTyped: true }
          : entry
      )
    );
    const timer = typingTimersRef.current.get(messageId);
    if (timer) {
      clearTimeout(timer);
      typingTimersRef.current.delete(messageId);
    }
  }, []);

  const startTypewriter = React.useCallback((messageId: string, fullText: string) => {
    let currentIndex = 0;
    const typingSpeed = 22;

    const typeNextChar = () => {
      if (currentIndex < fullText.length) {
        setConversation((prev) =>
          prev.map((entry) =>
            entry.id === messageId
              ? { ...entry, displayedText: fullText.slice(0, currentIndex + 1) }
              : entry
          )
        );
        currentIndex++;
        const timer = setTimeout(typeNextChar, typingSpeed);
        typingTimersRef.current.set(messageId, timer);
      } else {
        markTypingComplete(messageId);
      }
    };

    typeNextChar();
  }, [markTypingComplete]);

  const addAIMessage = React.useCallback((content: string | React.ReactNode) => {
    const messageId = `ai-${Date.now()}-${Math.random()}`;
    const isStringContent = typeof content === "string";
    const fullText = isStringContent ? (content as string) : "";
    
    setConversation((prev) => [
      ...prev,
      {
        id: messageId,
        type: "ai",
        content,
        timestamp: new Date(),
        isTyping: isStringContent,
        hasTyped: false,
        displayedText: "",
      },
    ]);

    if (isStringContent && fullText) {
      setTimeout(() => {
        startTypewriter(messageId, fullText);
      }, 50);
    }
  }, [startTypewriter]);

  const addUserMessage = React.useCallback((content: string) => {
    setConversation((prev) => [
      ...prev,
      {
        id: `user-${Date.now()}-${Math.random()}`,
        type: "user",
        content,
        timestamp: new Date(),
      },
    ]);
  }, []);

  const updateData = (updates: Partial<HomeRenovationData>) => {
    setData((prev) => ({ ...prev, ...updates }));
  };

  const nextStep = () => {
    setCurrentStep((prev) => Math.min(prev + 1, 11));
  };

  // Cleanup typing timers on unmount
  React.useEffect(() => {
    return () => {
      typingTimersRef.current.forEach((timer) => clearTimeout(timer));
      typingTimersRef.current.clear();
      if (scrollIntervalRef.current) {
        clearInterval(scrollIntervalRef.current);
      }
    };
  }, []);

  // Initialize with greeting
  const hasInitialized = React.useRef(false);
  
  React.useEffect(() => {
    if (!hasInitialized.current) {
      hasInitialized.current = true;
      const loadGreeting = async () => {
        try {
          const response = await fetch("/api/generate-greeting", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ context: "home-renovation" }),
          });
          const result = await response.json();
          const greeting = result.greeting || `Hello 👋\n\nI'll help you plan a complete home renovation, step by step.\n\nLet's start with the basics.`;
          addAIMessage(greeting);
        } catch (error) {
          addAIMessage(
            "Hello 👋\n\nI'll help you plan a complete home renovation, step by step.\n\nLet's start with the basics."
          );
        }
        setCurrentStep(1);
      };
      loadGreeting();
    }
  }, [addAIMessage]);

  // Add step-specific AI messages when steps change
  const stepMessagesRef = React.useRef<Set<number>>(new Set());
  
  React.useEffect(() => {
    const stepMessages: Record<number, string> = {
      1: "What type of home are you renovating?",
      2: "Which areas of the home will be renovated?",
      3: "Please upload any floor plans or photos of the home in its current state.",
      4: "Reviewing your home layout…",
      5: "What overall style direction would you like for the entire home?",
      6: "Which renovation budget level should I design within?",
      7: "Creating a cohesive renovation concept for your home…",
      8: "Here is a cohesive design concept for your home.\nChoose the direction you'd like to continue with.",
      9: "Based on your home type, renovation scope, and design direction, here's an estimated cost range.",
      10: "These materials and systems align with your renovation concept.",
      11: "Your home renovation overview is ready.",
    };

    if (stepMessages[currentStep] && !stepMessagesRef.current.has(currentStep)) {
      stepMessagesRef.current.add(currentStep);
      const messageText = stepMessages[currentStep];
      const messageId = `step${currentStep}-ai`;
      
      setConversation((prev) => [
        ...prev,
        {
          id: messageId,
          type: "ai",
          content: messageText,
          timestamp: new Date(),
          isTyping: true,
          hasTyped: false,
          displayedText: "",
        },
      ]);

      setTimeout(() => {
        startTypewriter(messageId, messageText);
      }, 50);
    }
  }, [currentStep, startTypewriter]);

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <Step1HomeType
            selectedHomeType={data.homeType}
            onSelect={(homeType) => {
              const labels: Record<string, string> = {
                apartment: "Apartment",
                house: "House",
                townhouse: "Townhouse",
                other: "Other",
              };
              addUserMessage(labels[homeType]);
              updateData({ homeType });
              nextStep();
            }}
          />
        );
      case 2:
        return (
          <Step2RenovationScope
            selectedScope={data.renovationScope}
            onScopeChange={(scope) => {
              updateData({ renovationScope: scope });
            }}
            onContinue={() => {
              addUserMessage(
                data.renovationScope.length === 1
                  ? data.renovationScope[0]
                  : `${data.renovationScope.length} areas selected`
              );
              nextStep();
            }}
          />
        );
      case 3:
        return (
          <Step3FloorPlanUpload
            floorPlans={data.floorPlans}
            photos={data.photos}
            onFloorPlansChange={(files) => updateData({ floorPlans: files })}
            onPhotosChange={(files) => updateData({ photos: files })}
            onContinue={() => {
              const uploads = [];
              if (data.floorPlans.length > 0) {
                uploads.push(`${data.floorPlans.length} floor plan${data.floorPlans.length > 1 ? "s" : ""}`);
              }
              if (data.photos.length > 0) {
                uploads.push(`${data.photos.length} photo${data.photos.length > 1 ? "s" : ""}`);
              }
              addUserMessage(uploads.length > 0 ? uploads.join(", ") : "Skipped upload");
              nextStep();
            }}
          />
        );
      case 4:
        return (
          <Step4AIObservation
            floorPlans={data.floorPlans}
            photos={data.photos}
            onObservationComplete={(observation) => {
              updateData({ aiObservation: observation });
              addAIMessage(observation);
              nextStep();
            }}
          />
        );
      case 5:
        return (
          <Step5StyleDirection
            selectedStyles={data.selectedStyles}
            onStylesChange={(styles) => {
              updateData({ selectedStyles: styles });
            }}
            onContinue={() => {
              addUserMessage(data.selectedStyles.join(", "));
              nextStep();
            }}
          />
        );
      case 6:
        return (
          <Step6BudgetLevel
            selectedBudget={data.budgetLevel}
            onSelect={(budget) => {
              const labels: Record<string, string> = {
                essential: "Essential renovation",
                balanced: "Balanced renovation",
                "high-end": "High-end renovation",
                "not-sure": "Not sure yet",
              };
              addUserMessage(labels[budget]);
              updateData({ budgetLevel: budget });
              nextStep();
            }}
          />
        );
      case 7:
        return (
          <Step7DesignConceptGeneration
            homeType={data.homeType!}
            renovationScope={data.renovationScope}
            styles={data.selectedStyles}
            budget={data.budgetLevel!}
            observation={data.aiObservation}
            onConceptsGenerated={(concepts) => {
              updateData({ generatedConcepts: concepts });
              nextStep();
            }}
          />
        );
      case 8:
        return (
          <Step8ConceptSelection
            concepts={data.generatedConcepts}
            selectedConcept={data.selectedConcept}
            onSelect={(conceptId) => {
              updateData({ selectedConcept: conceptId });
              const concept = data.generatedConcepts.find((c) => c.id === conceptId);
              addUserMessage(concept ? `Selected ${concept.area} concept` : "Selected concept");
              nextStep();
            }}
          />
        );
      case 9:
        return (
          <Step9CostEstimate
            homeType={data.homeType!}
            renovationScope={data.renovationScope}
            budget={data.budgetLevel!}
            onEstimateComplete={(estimate) => {
              updateData({ costEstimate: estimate });
              // Add cost breakdown to conversation
              const formatCurrency = (amount: number) =>
                new Intl.NumberFormat("sl-SI", {
                  style: "currency",
                  currency: "EUR",
                  minimumFractionDigits: 0,
                }).format(amount);
              
              setConversation((prev) => [
                ...prev,
                {
                  id: `step9-cost-${Date.now()}`,
                  type: "ai",
                  content: (
                    <div>
                      <div className="space-y-4 mt-4">
                        {estimate.rooms.length > 0 && (
                          <div>
                            <div className="text-[14px] font-medium text-white mb-2">Rooms:</div>
                            {estimate.rooms.map((room, idx) => (
                              <div key={idx} className="flex justify-between text-[14px] mb-1">
                                <span className="text-[rgba(255,255,255,0.70)]">{room.name}:</span>
                                <span className="text-white">
                                  {formatCurrency(room.min)} - {formatCurrency(room.max)}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                        {estimate.systems.length > 0 && (
                          <div>
                            <div className="text-[14px] font-medium text-white mb-2">Systems:</div>
                            {estimate.systems.map((system, idx) => (
                              <div key={idx} className="flex justify-between text-[14px] mb-1">
                                <span className="text-[rgba(255,255,255,0.70)]">{system.name}:</span>
                                <span className="text-white">
                                  {formatCurrency(system.min)} - {formatCurrency(system.max)}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="flex justify-between text-[14px]">
                          <span className="text-[rgba(255,255,255,0.70)]">Labor:</span>
                          <span className="text-white">
                            {formatCurrency(estimate.labor.min)} - {formatCurrency(estimate.labor.max)}
                          </span>
                        </div>
                        <div className="flex justify-between text-[14px]">
                          <span className="text-[rgba(255,255,255,0.70)]">Materials:</span>
                          <span className="text-white">
                            {formatCurrency(estimate.materials.min)} - {formatCurrency(estimate.materials.max)}
                          </span>
                        </div>
                        <div className="flex justify-between text-[16px] font-medium pt-2 border-t border-[rgba(255,255,255,0.1)]">
                          <span className="text-white">Total:</span>
                          <span className="text-white">
                            {formatCurrency(estimate.total.min)} - {formatCurrency(estimate.total.max)}
                          </span>
                        </div>
                        <div className="text-[12px] text-[rgba(255,255,255,0.50)] mt-2">
                          * Estimated values ±15%
                        </div>
                      </div>
                    </div>
                  ),
                  timestamp: new Date(),
                },
              ]);
              nextStep();
            }}
          />
        );
      case 10:
        return (
          <Step10MaterialGuidance
            styles={data.selectedStyles}
            scope={data.renovationScope}
            onGuidanceComplete={(guidance) => {
              updateData({ materialGuidance: guidance });
              // Add material guidance to conversation
              setConversation((prev) => [
                ...prev,
                {
                  id: `step10-materials-${Date.now()}`,
                  type: "ai",
                  content: (
                    <div className="space-y-4 mt-4">
                      {guidance.map((category, idx) => (
                        <div key={idx}>
                          <div className="text-[14px] font-medium text-white mb-2">{category.category}:</div>
                          {category.items.map((item, itemIdx) => (
                            <div key={itemIdx} className="text-[13px] mb-2">
                              <div className="text-white font-medium">{item.name}</div>
                              <div className="text-[rgba(255,255,255,0.60)]">{item.description}</div>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  ),
                  timestamp: new Date(),
                },
              ]);
              nextStep();
            }}
          />
        );
      case 11:
        return (
          <Step11FinalReport
            data={data}
            onStartAnother={onComplete ?? (() => {})}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#0D0D0F]">
      {/* Conversation Timeline */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[900px] mx-auto px-6 md:px-8 py-6 md:py-8">
          {/* Conversation History */}
          {conversation.map((entry) => {
            const displayContent = 
              entry.type === "ai" && 
              typeof entry.content === "string" && 
              entry.displayedText !== undefined
                ? entry.displayedText
                : entry.content;

            return (
              <ConversationMessage
                key={entry.id}
                type={entry.type}
                content={displayContent}
                isTyping={entry.isTyping}
                hasTyped={entry.hasTyped}
              />
            );
          })}

          {/* Current Step Interactive Content */}
          {renderCurrentStep()}

          {/* Scroll anchor */}
          <div ref={messagesEndRef} />
        </div>
      </div>
    </div>
  );
};

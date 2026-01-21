"use client";

import * as React from "react";
import { ConversationMessage } from "./ConversationMessage";
import { Step1RoomType } from "./steps/Step1RoomType";
import { Step2PhotoUpload } from "./steps/Step2PhotoUpload";
import { Step3AIObservation } from "./steps/Step3AIObservation";
import { Step4StyleSelection } from "./steps/Step4StyleSelection";
import { Step5BudgetSignal } from "./steps/Step5BudgetSignal";
import { Step6DesignGeneration } from "./steps/Step6DesignGeneration";
import { Step6DesignPreferences, type RoomDesignPreferences } from "./steps/Step6DesignPreferences";
import { Step7FinalDesignSelection } from "./steps/Step7FinalDesignSelection";
import { Step8CostEstimate } from "./steps/Step8CostEstimate";
import { Step9MaterialSuggestions } from "./steps/Step9MaterialSuggestions";
import { Step10FinalReport } from "./steps/Step10FinalReport";

export interface RoomRenovationData {
  roomType: "kitchen" | "bathroom" | "bedroom" | "living-room" | "other" | null;
  photos: File[];
  aiObservation: string | null;
  selectedStyles: string[];
  budgetLevel: "budget-friendly" | "balanced" | "premium" | "not-sure" | null;
  preferences: RoomDesignPreferences | null;
  generatedDesigns: string[]; // URLs of generated images
  selectedDesign: string | null;
  costEstimate: {
    materials: { min: number; max: number };
    furniture: { min: number; max: number };
    labor: { min: number; max: number };
    total: { min: number; max: number };
  } | null;
  materialSuggestions: Array<{
    category: string;
    productType: string;
    brandOrStore: string;
  }> | null;
}

export interface ConversationEntry {
  id: string;
  type: "ai" | "user";
  content: string | React.ReactNode;
  timestamp: Date;
  // Typing state for AI messages
  isTyping?: boolean;
  hasTyped?: boolean;
  displayedText?: string; // For typewriter effect
}

export interface RoomRenovationFlowProps {
  projectId: string;
  onComplete?: () => void;
}

export const RoomRenovationFlow: React.FC<RoomRenovationFlowProps> = ({
  projectId,
  onComplete,
}) => {
  const [currentStep, setCurrentStep] = React.useState(0);
  const [conversation, setConversation] = React.useState<ConversationEntry[]>([]);
  const [data, setData] = React.useState<RoomRenovationData>({
    roomType: null,
    photos: [],
    aiObservation: null,
    selectedStyles: [],
    budgetLevel: null,
    preferences: {
      wallMainColor: "warm greige",
      wallAccentColor: "olive green",
      flooring: "keep",
      underfloorHeating: false,
      bedType: "none",
      notes: "",
    },
    generatedDesigns: [],
    selectedDesign: null,
    costEstimate: null,
    materialSuggestions: null,
  });
  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const scrollIntervalRef = React.useRef<NodeJS.Timeout | null>(null);

  // Auto-scroll during typing
  React.useEffect(() => {
    // Check if any message is currently typing
    const hasTypingMessage = conversation.some(
      (entry) => entry.type === "ai" && entry.isTyping && !entry.hasTyped
    );

    if (hasTypingMessage) {
      // Auto-scroll every 100ms while typing
      scrollIntervalRef.current = setInterval(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    } else {
      // Clear interval when no messages are typing
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
    // Clean up timer
    const timer = typingTimersRef.current.get(messageId);
    if (timer) {
      clearTimeout(timer);
      typingTimersRef.current.delete(messageId);
    }
  }, []);

  // Start typewriter effect for a message
  const startTypewriter = React.useCallback((messageId: string, fullText: string) => {
    let currentIndex = 0;
    const typingSpeed = 22; // 20-25ms average (22ms)

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
        // Typing complete
        markTypingComplete(messageId);
      }
    };

    // Start typing immediately
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
        // Initialize typing state for string content
        isTyping: isStringContent,
        hasTyped: false,
        displayedText: "",
      },
    ]);

    // Start typewriter effect for string content
    if (isStringContent && fullText) {
      // Small delay to ensure message is in state
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

  const updateData = (updates: Partial<RoomRenovationData>) => {
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

  // Initialize with greeting and advance to step 1
  const hasInitialized = React.useRef(false);
  
  React.useEffect(() => {
    if (!hasInitialized.current) {
      hasInitialized.current = true;
      const loadGreeting = async () => {
        try {
          const response = await fetch("/api/generate-greeting", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
          });
          const data = await response.json();
          addAIMessage(data.greeting);
        } catch (error) {
          addAIMessage(
            "Hello 👋\n\nI'll help you redesign your space step by step.\n\nLet's start simple.\nWhich room would you like to renovate today?"
          );
        }
        // Advance to step 1 immediately after greeting
        setCurrentStep(1);
      };
      loadGreeting();
    }
  }, [addAIMessage]);

  // Add step-specific AI messages when steps change
  const stepMessagesRef = React.useRef<Set<number>>(new Set());
  
  React.useEffect(() => {
    const stepMessages: Record<number, string> = {
      1: "Which room would you like to renovate today?",
      2: "Great.\n\nPlease upload a photo of the room as it looks right now.",
      4: "What style would you like this room to have?",
      5: "To guide the design choices, what budget level should I aim for?",
      6: "Great. Tell me your preferences (colors, floor, heating, key furniture) so I don’t guess.",
      11: "Your renovation project is ready.",
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
          // Initialize typing state
          isTyping: true,
          hasTyped: false,
          displayedText: "",
        },
      ]);

      // Start typewriter effect
      setTimeout(() => {
        startTypewriter(messageId, messageText);
      }, 50);
    }
  }, [currentStep, startTypewriter]);

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <Step1RoomType
            selectedRoomType={data.roomType}
            onSelect={(roomType) => {
              const roomLabels: Record<string, string> = {
                kitchen: "Kitchen",
                bathroom: "Bathroom",
                bedroom: "Bedroom",
                "living-room": "Living room",
                other: "Other",
              };
              addUserMessage(roomLabels[roomType]);
              updateData({ roomType });
              nextStep();
            }}
          />
        );
      case 2:
        return (
          <Step2PhotoUpload
            photos={data.photos}
            onPhotosChange={(photos) => {
              updateData({ photos });
            }}
            onContinue={() => {
              addUserMessage(`${data.photos.length} photo${data.photos.length > 1 ? "s" : ""} uploaded`);
              nextStep();
            }}
          />
        );
      case 3:
        return (
          <Step3AIObservation
            photos={data.photos}
            onObservationComplete={(observation) => {
              updateData({ aiObservation: observation });
              addAIMessage(observation);
              nextStep();
            }}
          />
        );
      case 4:
        return (
          <Step4StyleSelection
            selectedStyles={data.selectedStyles}
            onStylesChange={(styles) => {
              updateData({ selectedStyles: styles });
            }}
            onContinue={() => {
              addUserMessage(`Selected styles: ${data.selectedStyles.join(", ")}`);
              nextStep();
            }}
          />
        );
      case 5:
        return (
          <Step5BudgetSignal
            selectedBudget={data.budgetLevel}
            onSelect={(budget) => {
              const budgetLabels: Record<string, string> = {
                "budget-friendly": "Budget-friendly",
                balanced: "Balanced",
                premium: "Premium",
                "not-sure": "Not sure yet",
              };
              addUserMessage(budgetLabels[budget]);
              updateData({ budgetLevel: budget });
              nextStep();
            }}
          />
        );
      case 6:
        return (
          <Step6DesignPreferences
            roomType={data.roomType!}
            value={data.preferences!}
            onChange={(value) => updateData({ preferences: value })}
            onContinue={() => {
              const p = data.preferences!;
              const parts: string[] = [];
              if (p.wallMainColor) parts.push(`Wall main: ${p.wallMainColor}`);
              if (p.wallAccentColor) parts.push(`Accent: ${p.wallAccentColor}`);
              parts.push(`Floor: ${p.flooring}`);
              parts.push(`Underfloor heating: ${p.underfloorHeating ? "yes" : "no"}`);
              if (data.roomType === "bedroom") parts.push(`Bed: ${p.bedType}`);
              if (p.notes?.trim()) parts.push(`Notes: ${p.notes.trim()}`);
              addUserMessage(parts.join(" · "));
              nextStep();
            }}
          />
        );
      case 7:
        return (
          <Step6DesignGeneration
            roomType={data.roomType!}
            photos={data.photos}
            styles={data.selectedStyles}
            budget={data.budgetLevel!}
            preferences={data.preferences}
            observation={data.aiObservation}
            onDesignsGenerated={(designs) => {
              updateData({ generatedDesigns: designs });
              // Avoid duplicating the image grid here (it exists in the next step with zoom).
              addAIMessage("Here are your redesigned room concepts.\n\nChoose the one you like most to continue.");
              nextStep();
            }}
          />
        );
      case 8:
        return (
          <Step7FinalDesignSelection
            designs={data.generatedDesigns}
            selectedDesign={data.selectedDesign}
            onSelect={(design) => {
              addUserMessage("Selected design concept");
              updateData({ selectedDesign: design });
              addAIMessage(
                <div>
                  <div className="mb-3 text-[15px] text-[rgba(255,255,255,0.85)]">
                    Selected concept:
                  </div>
                  <img
                    src={design}
                    alt="Selected concept"
                    className="w-full max-w-[520px] h-auto max-h-[260px] object-contain rounded-[12px] border border-[rgba(255,255,255,0.10)]"
                  />
                </div>
              );
              nextStep();
            }}
          />
        );
      case 9:
        return (
          <Step8CostEstimate
            roomType={data.roomType!}
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
                  id: `step8-cost-${Date.now()}-${Math.random()}`,
                  type: "ai",
                  content: (
                    <div>
                      <div className="mb-4">
                        Based on this design and your preferences, here's an estimated renovation cost:
                      </div>
                      {data.selectedDesign ? (
                        <img
                          src={data.selectedDesign}
                          alt="Selected concept"
                          className="w-full max-w-[520px] h-auto max-h-[240px] object-contain rounded-[12px] border border-[rgba(255,255,255,0.10)] mb-4"
                        />
                      ) : null}
                      <div className="space-y-3 mt-4">
                        <div className="flex justify-between text-[14px]">
                          <span className="text-[rgba(255,255,255,0.70)]">Materials:</span>
                          <span className="text-white">
                            {formatCurrency(estimate.materials.min)} - {formatCurrency(estimate.materials.max)}
                          </span>
                        </div>
                        <div className="flex justify-between text-[14px]">
                          <span className="text-[rgba(255,255,255,0.70)]">Furniture:</span>
                          <span className="text-white">
                            {formatCurrency(estimate.furniture.min)} - {formatCurrency(estimate.furniture.max)}
                          </span>
                        </div>
                        <div className="flex justify-between text-[14px]">
                          <span className="text-[rgba(255,255,255,0.70)]">Labor:</span>
                          <span className="text-white">
                            {formatCurrency(estimate.labor.min)} - {formatCurrency(estimate.labor.max)}
                          </span>
                        </div>
                        <div className="flex justify-between text-[16px] font-medium pt-2 border-t border-[rgba(255,255,255,0.1)]">
                          <span className="text-white">Total:</span>
                          <span className="text-white">
                            {formatCurrency(estimate.total.min)} - {formatCurrency(estimate.total.max)}
                          </span>
                        </div>
                        <div className="text-[12px] text-[rgba(255,255,255,0.50)] mt-2">
                          * Estimated values ±10–15%
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
          <Step9MaterialSuggestions
            roomType={data.roomType!}
            style={data.selectedStyles[0]}
            onSuggestionsComplete={(suggestions) => {
              updateData({ materialSuggestions: suggestions });
              // Add material suggestions to conversation
              setConversation((prev) => [
                ...prev,
                {
                  id: `step9-materials-${Date.now()}-${Math.random()}`,
                  type: "ai",
                  content: (
                    <div>
                      <div className="mb-4">
                        These materials match your design and are commonly available locally:
                      </div>
                      <div className="space-y-2 mt-4">
                        {suggestions.map((s, idx) => (
                          <div key={idx} className="text-[14px]">
                            <span className="font-medium text-white">{s.category}:</span>{" "}
                            <span className="text-[rgba(255,255,255,0.85)]">{s.productType}</span>{" "}
                            <span className="text-[rgba(255,255,255,0.60)]">({s.brandOrStore})</span>
                          </div>
                        ))}
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
      case 11:
        return (
          <Step10FinalReport
            projectId={projectId}
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
            // For AI messages with string content, use displayedText if available
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

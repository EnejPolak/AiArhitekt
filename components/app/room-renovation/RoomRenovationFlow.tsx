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
import { Step6bLocation } from "./steps/Step6bLocation";
import { Step7FinalDesignSelection } from "./steps/Step7FinalDesignSelection";
import { Step8CostEstimate } from "./steps/Step8CostEstimate";
import { Step8bBudgetSplit } from "./steps/Step8bBudgetSplit";
import { Step9aStoreDiscovery } from "./steps/Step9aStoreDiscovery";
import { Step9bProductSourcing } from "./steps/Step9bProductSourcing";
import { Step9cShoppingList } from "./steps/Step9cShoppingList";
import { Step9dContractors } from "./steps/Step9dContractors";
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
  // New fields for local + budget + real products
  location: {
    lat: number;
    lng: number;
    label: string;
  } | null;
  radiusKm: number;
  budgetPlan: {
    caps: Record<string, { max: number; qty: number }>;
    reservedBufferRatio: number;
    totalBudget: number;
  } | null;
  localStores: Array<{
    name: string;
    address: string;
    website: string | null;
    placeId: string;
    categoriesHint: string[];
  }> | null;
  productCandidates: Record<string, Array<{
    name: string;
    price: number;
    url: string;
    imageUrl: string | null;
    store: string;
  }>> | null;
  shoppingList: Array<{
    name: string;
    price: number;
    url: string;
    imageUrl: string | null;
    store: string;
    category: string;
    qty: number;
  }> | null;
  contractors: Record<string, Array<{
    name: string;
    address: string;
    phone: string | null;
    website: string | null;
    rating: number | null;
    reviewsCount: number | null;
    placeId: string;
  }>> | null;
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
    location: null,
    radiusKm: 50,
    budgetPlan: null,
    localStores: null,
    productCandidates: null,
    shoppingList: null,
    contractors: null,
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
    setCurrentStep((prev) => Math.min(prev + 1, 16));
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
      7: "To find products in local stores near you, share your location.",
      11: "I'll allocate your budget into category caps so we don't overspend.",
      12: "Finding local stores within 50 km that match your needs…",
      13: "Now I'll pull real products (price + link + image) from local stores, staying within your category caps.",
      14: "Building a final shopping list that stays within your total budget…",
      15: "Do you want me to find local contractors (painters, flooring, assembly) within 50 km?",
      16: "Your renovation project is ready.",
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
          <Step6bLocation
            location={data.location}
            radiusKm={data.radiusKm}
            onLocationSet={(location, radiusKm) => {
              addUserMessage(`Location: ${location.label} (${radiusKm} km radius)`);
              updateData({ location, radiusKm });
              nextStep();
            }}
          />
        );
      case 8:
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
      case 9:
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
      case 10:
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
      case 11:
        return (
          <Step8bBudgetSplit
            roomType={data.roomType!}
            budgetLevel={data.budgetLevel!}
            totalBudget={data.costEstimate!.total}
            preferences={data.preferences}
            onBudgetPlanComplete={(plan) => {
              updateData({ budgetPlan: plan });
              // Add budget plan to conversation
              const formatCurrency = (amount: number) =>
                new Intl.NumberFormat("sl-SI", {
                  style: "currency",
                  currency: "EUR",
                  minimumFractionDigits: 0,
                }).format(amount);
              
              setConversation((prev) => [
                ...prev,
                {
                  id: `step11-budget-plan-${Date.now()}-${Math.random()}`,
                  type: "ai",
                  content: (
                    <div>
                      <div className="mb-4">
                        I've allocated your budget into category caps:
                      </div>
                      <div className="space-y-2 mt-4">
                        {Object.entries(plan.caps).map(([category, cap]) => (
                          <div key={category} className="flex justify-between text-[14px]">
                            <span className="text-[rgba(255,255,255,0.85)]">{category}:</span>
                            <span className="text-white">
                              {formatCurrency(cap.max)} (qty: {cap.qty})
                            </span>
                          </div>
                        ))}
                        <div className="pt-2 border-t border-[rgba(255,255,255,0.1)] mt-2">
                          <div className="flex justify-between text-[14px]">
                            <span className="text-[rgba(255,255,255,0.85)]">Total budget:</span>
                            <span className="text-white font-medium">
                              {formatCurrency(plan.totalBudget)}
                            </span>
                          </div>
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
      case 12:
        return (
          <Step9aStoreDiscovery
            location={data.location!}
            radiusKm={data.radiusKm}
            roomType={data.roomType!}
            onStoresFound={(stores) => {
              updateData({ localStores: stores });
              addAIMessage(`Found ${stores.length} local stores within ${data.radiusKm} km.`);
              nextStep();
            }}
          />
        );
      case 13:
        return (
          <Step9bProductSourcing
            roomType={data.roomType!}
            selectedDesign={data.selectedDesign}
            preferences={data.preferences}
            budgetPlan={data.budgetPlan!}
            localStores={data.localStores!}
            onProductsFound={(candidates) => {
              updateData({ productCandidates: candidates });
              const totalCandidates = Object.values(candidates).reduce((sum, arr) => sum + arr.length, 0);
              addAIMessage(`Found ${totalCandidates} product candidates across all categories.`);
              nextStep();
            }}
          />
        );
      case 14:
        return (
          <Step9cShoppingList
            productCandidates={data.productCandidates!}
            budgetPlan={data.budgetPlan!}
            onShoppingListComplete={(shoppingList) => {
              updateData({ shoppingList });
              // Add shopping list to conversation
              const formatCurrency = (amount: number) =>
                new Intl.NumberFormat("sl-SI", {
                  style: "currency",
                  currency: "EUR",
                  minimumFractionDigits: 0,
                }).format(amount);
              
              const total = shoppingList.reduce((sum, item) => sum + item.price * item.qty, 0);
              
              setConversation((prev) => [
                ...prev,
                {
                  id: `step14-shopping-list-${Date.now()}-${Math.random()}`,
                  type: "ai",
                  content: (
                    <div>
                      <div className="mb-4">
                        Final shopping list ({shoppingList.length} items):
                      </div>
                      <div className="space-y-3 mt-4">
                        {shoppingList.map((item, idx) => (
                          <div key={idx} className="border border-[rgba(255,255,255,0.10)] rounded-lg p-3">
                            <div className="flex items-start gap-3">
                              {item.imageUrl && (
                                <img
                                  src={item.imageUrl}
                                  alt={item.name}
                                  className="w-16 h-16 object-cover rounded"
                                />
                              )}
                              <div className="flex-1">
                                <div className="text-[14px] font-medium text-white">{item.name}</div>
                                <div className="text-[12px] text-[rgba(255,255,255,0.60)] mt-1">
                                  {item.store}
                                </div>
                                <div className="flex justify-between items-center mt-2">
                                  <span className="text-[14px] text-white font-medium">
                                    {formatCurrency(item.price)}
                                  </span>
                                  <a
                                    href={item.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[12px] text-[#3B82F6] hover:underline"
                                  >
                                    View product →
                                  </a>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                        <div className="pt-3 border-t border-[rgba(255,255,255,0.1)] mt-3">
                          <div className="flex justify-between text-[16px] font-medium">
                            <span className="text-white">Total:</span>
                            <span className="text-white">{formatCurrency(total)}</span>
                          </div>
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
      case 15:
        return (
          <Step9dContractors
            location={data.location!}
            radiusKm={data.radiusKm}
            roomType={data.roomType!}
            preferences={data.preferences}
            onContractorsFound={(contractors) => {
              updateData({ contractors });
              const totalContractors = Object.values(contractors).reduce((sum, arr) => sum + arr.length, 0);
              if (totalContractors > 0) {
                addAIMessage(`Found ${totalContractors} local contractors.`);
              }
              nextStep();
            }}
            onSkip={() => {
              updateData({ contractors: {} });
              nextStep();
            }}
          />
        );
      case 16:
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

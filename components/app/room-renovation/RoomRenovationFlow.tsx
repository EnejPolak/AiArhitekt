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
import { stepIndexFromKey, stepKeyFromIndex } from "@/lib/projects/steps";
import type { RoomAnalysisView } from "@/lib/analysis/types";
import type { ProductDiscoveryView, ProductSelectionView } from "@/lib/discovery/types";
import { DEFAULT_DISCOVERY_RADIUS_KM } from "@/lib/discovery/constants";
import { toProjectProductShoppingState } from "@/lib/discovery/shoppingState";
import {
  parseProjectLocation,
  projectLocationLabel,
  type ProjectLocation,
} from "@/lib/project-location/parse";
import { loadStoredShoppingPreferenceSnapshot, shoppingPreferenceInputFromSnapshot } from "@/lib/discovery/preferences";
import { saveProjectRoomPreferencesAction } from "@/lib/project-preferences/actions";
import { projectRoomPreferencesToShoppingPreferences } from "@/lib/project-preferences/adapter";
import {
  EMPTY_PROJECT_ROOM_PREFERENCES,
  type ProjectRoomPreferences,
  type ProjectRoomPreferencesPatch,
} from "@/lib/project-preferences/types";

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
  initialStepKey?: string;
  onStepChange?: (key: string) => void;
  roomPhoto?: { previewUrl: string | null; filename: string | null } | null;
  roomAnalysis?: RoomAnalysisView | null;
  productDiscovery?: {
    discovery: ProductDiscoveryView;
    selections: ProductSelectionView[];
  } | null;
  initialRoomPreferences?: ProjectRoomPreferences | null;
}

function wizardStateFromPreferences(prefs: ProjectRoomPreferences | null): Pick<
  RoomRenovationData,
  "roomType" | "selectedStyles" | "budgetLevel" | "preferences"
> {
  if (!prefs) {
    return {
      roomType: EMPTY_PROJECT_ROOM_PREFERENCES.roomType,
      selectedStyles: [...EMPTY_PROJECT_ROOM_PREFERENCES.selectedStyles],
      budgetLevel: EMPTY_PROJECT_ROOM_PREFERENCES.budgetLevel,
      preferences: {
        wallMainColor: EMPTY_PROJECT_ROOM_PREFERENCES.wallMainColor,
        wallAccentColor: EMPTY_PROJECT_ROOM_PREFERENCES.wallAccentColor,
        flooring: EMPTY_PROJECT_ROOM_PREFERENCES.flooring,
        underfloorHeating: EMPTY_PROJECT_ROOM_PREFERENCES.underfloorHeating,
        bedType: EMPTY_PROJECT_ROOM_PREFERENCES.bedType,
        notes: EMPTY_PROJECT_ROOM_PREFERENCES.notes,
        keepExistingWalls: EMPTY_PROJECT_ROOM_PREFERENCES.keepExistingWalls,
      },
    };
  }
  return {
    roomType: prefs.roomType,
    selectedStyles: prefs.selectedStyles,
    budgetLevel: prefs.budgetLevel,
    preferences: {
      wallMainColor: prefs.wallMainColor,
      wallAccentColor: prefs.wallAccentColor,
      flooring: prefs.flooring,
      underfloorHeating: prefs.underfloorHeating,
      bedType: prefs.bedType,
      notes: prefs.notes,
      keepExistingWalls: prefs.keepExistingWalls,
    },
  };
}

function wizardLocationFromProject(location: ProjectLocation) {
  return {
    lat: location.latitude,
    lng: location.longitude,
    label: projectLocationLabel(location),
  };
}

export const RoomRenovationFlow: React.FC<RoomRenovationFlowProps> = ({
  projectId,
  onComplete,
  initialStepKey,
  onStepChange,
  roomPhoto,
  roomAnalysis = null,
  productDiscovery = null,
  initialRoomPreferences = null,
}) => {
  const [currentAnalysis, setCurrentAnalysis] = React.useState<RoomAnalysisView | null>(
    roomAnalysis
  );
  const [persistedDiscovery, setPersistedDiscovery] = React.useState<ProductDiscoveryView | null>(
    productDiscovery?.discovery ?? null
  );
  const [persistedSelections, setPersistedSelections] = React.useState<ProductSelectionView[]>(
    productDiscovery?.selections ?? []
  );
  const [hasPersistedPhoto, setHasPersistedPhoto] = React.useState(
    Boolean(roomPhoto?.previewUrl || roomPhoto?.filename)
  );
  const [currentStep, setCurrentStep] = React.useState(() =>
    stepIndexFromKey("room-renovation", initialStepKey ?? "greeting")
  );
  const [conversation, setConversation] = React.useState<ConversationEntry[]>([]);
  const restored = wizardStateFromPreferences(initialRoomPreferences);
  const initialProjectLocation = parseProjectLocation(initialRoomPreferences);
  const [roomPrefs, setRoomPrefs] = React.useState<ProjectRoomPreferences | null>(
    initialRoomPreferences
  );
  const [preferenceSaveError, setPreferenceSaveError] = React.useState<string | null>(null);
  const [preferenceSaving, setPreferenceSaving] = React.useState(false);
  const [data, setData] = React.useState<RoomRenovationData>({
    roomType: restored.roomType,
    photos: [],
    aiObservation: null,
    selectedStyles: restored.selectedStyles,
    budgetLevel: restored.budgetLevel,
    preferences: restored.preferences,
    generatedDesigns: [],
    selectedDesign: null,
    costEstimate: null,
    materialSuggestions: null,
    location: initialProjectLocation ? wizardLocationFromProject(initialProjectLocation) : null,
    radiusKm: initialProjectLocation?.radiusKm ?? DEFAULT_DISCOVERY_RADIUS_KM,
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

  const persistRoomPreferences = async (patch: ProjectRoomPreferencesPatch): Promise<boolean> => {
    if (preferenceSaving) return false;
    setPreferenceSaving(true);
    setPreferenceSaveError(null);
    try {
      const result = await saveProjectRoomPreferencesAction({ projectId, patch });
      if (!result.ok) {
        setPreferenceSaveError(result.message);
        return false;
      }
      setRoomPrefs(result.preferences);
      return true;
    } catch {
      setPreferenceSaveError("Could not save your preferences. Try again.");
      return false;
    } finally {
      setPreferenceSaving(false);
    }
  };

  const shoppingPreferences = React.useMemo(() => {
    if (roomPrefs) {
      return projectRoomPreferencesToShoppingPreferences(roomPrefs);
    }
    if (persistedDiscovery?.sourcePreferences) {
      return shoppingPreferenceInputFromSnapshot(
        loadStoredShoppingPreferenceSnapshot(persistedDiscovery.sourcePreferences)
      );
    }
    return projectRoomPreferencesToShoppingPreferences({
      ...EMPTY_PROJECT_ROOM_PREFERENCES,
      selectedStyles: data.selectedStyles,
      wallMainColor: data.preferences?.wallMainColor ?? "",
      wallAccentColor: data.preferences?.wallAccentColor ?? "",
      flooring: data.preferences?.flooring ?? "keep",
      underfloorHeating: data.preferences?.underfloorHeating ?? false,
      bedType: data.preferences?.bedType ?? "none",
      keepExistingWalls: data.preferences?.keepExistingWalls ?? false,
    });
  }, [roomPrefs, persistedDiscovery?.sourcePreferences, data.selectedStyles, data.preferences]);

  const productShoppingState = React.useMemo(
    () => toProjectProductShoppingState(persistedDiscovery, persistedSelections),
    [persistedDiscovery, persistedSelections]
  );
  const persistedProjectLocation = parseProjectLocation(roomPrefs);
  const searchLocation = persistedProjectLocation
    ? wizardLocationFromProject(persistedProjectLocation)
    : data.location;
  const searchRadiusKm = persistedProjectLocation?.radiusKm ?? data.radiusKm;

  const nextStep = () => {
    const next = Math.min(currentStep + 1, 16);
    setCurrentStep(next);
    onStepChange?.(stepKeyFromIndex("room-renovation", next));
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
      if (currentStep > 0) {
        return;
      }
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
        setCurrentStep(1);
        onStepChange?.(stepKeyFromIndex("room-renovation", 1));
      };
      void loadGreeting();
    }
  }, [addAIMessage, currentStep, onStepChange]);

  // Add step-specific AI messages when steps change
  const stepMessagesRef = React.useRef<Set<number>>(new Set());
  
  React.useEffect(() => {
    const stepMessages: Record<number, string> = {
      1: "Which room would you like to renovate today?",
      2: "Great.\n\nPlease upload a photo of the room as it looks right now.",
      3: "When you are ready, I will analyze the saved photo of this room and prepare design requirements. I will not search products or generate a render yet.",
      4: "What style would you like this room to have?",
      5: "To guide the design choices, what budget level should I aim for?",
      6: "Great. Tell me your preferences (colors, floor, heating, key furniture) so I don’t guess.",
      7: "To find products in local stores near you, share your location.",
      11: "I'll allocate your budget into category caps so we don't overspend.",
      12: "When you are ready, I will search nearby stores for real products from the room analysis. This does not generate a render.",
      13: "Review the persisted products. Confirm the ones to use in the future design.",
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
            onSelect={async (roomType) => {
              const roomLabels: Record<string, string> = {
                kitchen: "Kitchen",
                bathroom: "Bathroom",
                bedroom: "Bedroom",
                "living-room": "Living room",
                other: "Other",
              };
              const saved = await persistRoomPreferences({ roomType });
              if (!saved) return;
              addUserMessage(roomLabels[roomType]);
              updateData({ roomType });
              nextStep();
            }}
          />
        );
      case 2:
        return (
          <Step2PhotoUpload
            projectId={projectId}
            persistedPreviewUrl={roomPhoto?.previewUrl}
            persistedFilename={roomPhoto?.filename}
            onPersistedChange={(next) => {
              setHasPersistedPhoto(Boolean(next.previewUrl || next.filename));
              setCurrentAnalysis(null);
              updateData({ photos: [], aiObservation: null });
              if (!next.previewUrl) {
                const photoStep = stepIndexFromKey("room-renovation", "photo-upload");
                setCurrentStep(photoStep);
                onStepChange?.(stepKeyFromIndex("room-renovation", photoStep));
              }
            }}
            onContinue={() => {
              addUserMessage("Room photo uploaded");
              nextStep();
            }}
          />
        );
      case 3:
        return (
          <Step3AIObservation
            projectId={projectId}
            hasPersistedPhoto={hasPersistedPhoto}
            initialAnalysis={currentAnalysis}
            onContinue={(observation) => {
              setCurrentAnalysis(observation);
              const summary = `Room detected: ${observation.analysis.roomType}. Requirements prepared for later product discovery.`;
              updateData({ aiObservation: summary });
              addUserMessage("Continue");
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
            onContinue={async () => {
              const saved = await persistRoomPreferences({ selectedStyles: data.selectedStyles });
              if (!saved) return;
              addUserMessage(`Selected styles: ${data.selectedStyles.join(", ")}`);
              nextStep();
            }}
          />
        );
      case 5:
        return (
          <Step5BudgetSignal
            selectedBudget={data.budgetLevel}
            onSelect={async (budget) => {
              const budgetLabels: Record<string, string> = {
                "budget-friendly": "Budget-friendly",
                balanced: "Balanced",
                premium: "Premium",
                "not-sure": "Not sure yet",
              };
              const saved = await persistRoomPreferences({ budgetLevel: budget });
              if (!saved) return;
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
            onContinue={async () => {
              const p = data.preferences!;
              const saved = await persistRoomPreferences({
                wallMainColor: p.wallMainColor,
                wallAccentColor: p.wallAccentColor,
                flooring: p.flooring,
                underfloorHeating: p.underfloorHeating,
                bedType: p.bedType,
                notes: p.notes,
                keepExistingWalls: p.keepExistingWalls ?? false,
              });
              if (!saved) return;
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
            projectId={projectId}
            location={searchLocation}
            radiusKm={searchRadiusKm}
            onLocationSaved={(location, preferences) => {
              addUserMessage(
                `Location: ${projectLocationLabel(location)} (${location.radiusKm} km radius)`
              );
              setRoomPrefs(preferences);
              updateData({
                location: wizardLocationFromProject(location),
                radiusKm: location.radiusKm,
              });
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
            onContinueWithoutRender={() => {
              addAIMessage("The room visualization comes after real products are selected.");
              nextStep();
            }}
            onDesignsGenerated={(designs) => {
              updateData({ generatedDesigns: designs });
              nextStep();
            }}
          />
        );
      case 9:
        return (
          <Step7FinalDesignSelection
            designs={data.generatedDesigns}
            selectedDesign={data.selectedDesign}
            onContinueWithoutRender={() => {
              nextStep();
            }}
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
            projectId={projectId}
            location={searchLocation}
            radiusKm={searchRadiusKm}
            initialDiscovery={persistedDiscovery}
            initialSelections={persistedSelections}
            shoppingPreferences={shoppingPreferences}
            onDiscoveryUpdated={({ discovery, selections }) => {
              setPersistedDiscovery(discovery);
              setPersistedSelections(selections);
            }}
            onComplete={({ discovery, selections }) => {
              setPersistedDiscovery(discovery);
              setPersistedSelections(selections);
              addAIMessage(
                selections.length > 0
                  ? `Found ${selections.length} real product${selections.length === 1 ? "" : "s"} from nearby stores.`
                  : "No matching products were found for this search."
              );
              nextStep();
            }}
          />
        );
      case 13:
        return (
          <Step9bProductSourcing
            projectId={projectId}
            selections={persistedSelections}
            preferences={{
              selectedStyles: data.selectedStyles,
              budgetLevel: data.budgetLevel,
              wallMainColor: data.preferences?.wallMainColor ?? "",
              wallAccentColor: data.preferences?.wallAccentColor ?? "",
              flooring: data.preferences?.flooring ?? "keep",
              underfloorHeating: data.preferences?.underfloorHeating ?? false,
              bedType: data.preferences?.bedType ?? "none",
              notes: data.preferences?.notes ?? "",
            }}
            roomPhotoPreviewUrl={roomPhoto?.previewUrl ?? null}
            onContinue={() => {
              nextStep();
            }}
          />
        );
      case 14:
        return (
          <Step9cShoppingList
            shoppingState={productShoppingState}
            onContinue={() => {
              addAIMessage(
                productShoppingState.foundSelections.length > 0
                  ? `Shopping list saved: ${productShoppingState.foundSelections.length} found product${productShoppingState.foundSelections.length === 1 ? "" : "s"}${
                      productShoppingState.missingRequirements.length > 0
                        ? `, ${productShoppingState.missingRequirements.length} unresolved`
                        : ""
                    }.`
                  : "No verified products were found for these requirements."
              );
              nextStep();
            }}
          />
        );
      case 15:
        return (
          <Step9dContractors
            location={searchLocation}
            radiusKm={searchRadiusKm}
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
            shoppingState={productShoppingState}
            onStartAnother={onComplete ?? (() => {})}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 min-w-0 overflow-hidden bg-background">
      {/* Conversation Timeline */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[900px] mx-auto px-4 md:px-8 py-6 md:py-8 min-w-0">
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

          {preferenceSaveError ? (
            <p className="mb-4 text-[13px] text-[#E5484D]" role="alert">
              {preferenceSaveError}
            </p>
          ) : null}

          {/* Current Step Interactive Content */}
          {renderCurrentStep()}

          {/* Scroll anchor */}
          <div ref={messagesEndRef} />
        </div>
      </div>
    </div>
  );
};

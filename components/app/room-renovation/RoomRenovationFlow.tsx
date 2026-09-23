"use client";

import * as React from "react";
import { ConversationMessage } from "./ConversationMessage";
import { Step1RoomType } from "./steps/Step1RoomType";
import { Step2PhotoUpload } from "./steps/Step2PhotoUpload";
import { Step3AIObservation } from "./steps/Step3AIObservation";
import { DesignBriefStep } from "./design-brief/DesignBriefStep";
import { type RoomDesignPreferences } from "./steps/Step6DesignPreferences";
import { Step6bLocation } from "./steps/Step6bLocation";
import { Step9aStoreDiscovery } from "./steps/Step9aStoreDiscovery";
import { Step9bProductSourcing } from "./steps/Step9bProductSourcing";
import { Step9cShoppingList } from "./steps/Step9cShoppingList";
import { Step9dContractors } from "./steps/Step9dContractors";
import { Step10FinalReport } from "./steps/Step10FinalReport";
import { stepIndexFromKey, stepKeyFromIndex, ROOM_STEP_KEYS, type RoomStepKey } from "@/lib/projects/steps";
import type { RoomAnalysisView } from "@/lib/analysis/types";
import type { ProductDiscoveryView, ProductSelectionView } from "@/lib/discovery/types";
import { DEFAULT_DISCOVERY_RADIUS_KM } from "@/lib/discovery/constants";
import { toProjectProductShoppingState } from "@/lib/discovery/shoppingState";
import {
  removeRequirementFromDesignAction,
  retryUnresolvedRequirementAction,
} from "@/lib/discovery/actions";
import {
  parseProjectLocation,
  projectLocationLabel,
  type ProjectLocation,
} from "@/lib/project-location/parse";
import { loadStoredShoppingPreferenceSnapshot, shoppingPreferenceInputFromSnapshot } from "@/lib/discovery/preferences";
import { saveProjectRoomPreferencesAction } from "@/lib/project-preferences/actions";
import { projectRoomPreferencesToShoppingPreferences } from "@/lib/project-preferences/adapter";
import { EMPTY_PROJECT_ROOM_PREFERENCES, type ProjectRoomPreferences, type ProjectRoomPreferencesPatch } from "@/lib/project-preferences/types";
import {
  isFloorFinishRequirementKey,
  isWallFinishRequirementKey,
} from "@/lib/render/finishes";
import { inferLegacyFloorFinishMode, inferLegacyWallFinishMode, keepExistingWallsFromWallFinishMode } from "@/lib/render/preferences";

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

function wizardStateFromPreferences(
  prefs: ProjectRoomPreferences | null,
  ready: { wall: boolean; floor: boolean } = { wall: false, floor: false }
): Pick<RoomRenovationData, "roomType" | "selectedStyles" | "budgetLevel" | "preferences"> {
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
        keepExistingWalls: true,
        wallFinishMode: "keep_existing",
        floorFinishMode: "keep_existing",
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
      wallFinishMode: prefs.wallFinishModeExplicit
        ? prefs.wallFinishMode
        : inferLegacyWallFinishMode({
            keepExistingWalls: prefs.keepExistingWalls,
            wallMainColor: prefs.wallMainColor,
            wallAccentColor: prefs.wallAccentColor,
            hasReadyExactWallProduct: ready.wall,
          }),
      floorFinishMode: prefs.floorFinishModeExplicit
        ? prefs.floorFinishMode
        : inferLegacyFloorFinishMode({
            flooring: prefs.flooring,
            hasReadyExactFloorProduct: ready.floor,
          }),
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
  const [retryBusyKey, setRetryBusyKey] = React.useState<string | null>(null);
  const [hasPersistedPhoto, setHasPersistedPhoto] = React.useState(
    Boolean(roomPhoto?.previewUrl || roomPhoto?.filename)
  );
  const [currentStep, setCurrentStep] = React.useState(() =>
    stepIndexFromKey("room-renovation", initialStepKey ?? "greeting")
  );
  const [conversation, setConversation] = React.useState<ConversationEntry[]>([]);
  const restored = wizardStateFromPreferences(initialRoomPreferences, {
    wall: Boolean(
      productDiscovery?.selections.some(
        (item) => item.referenceStatus === "ready" && isWallFinishRequirementKey(item.requirementKey)
      )
    ),
    floor: Boolean(
      productDiscovery?.selections.some(
        (item) => item.referenceStatus === "ready" && isFloorFinishRequirementKey(item.requirementKey)
      )
    ),
  });
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

  const persistChainRef = React.useRef(Promise.resolve());

  const persistRoomPreferences = (patch: ProjectRoomPreferencesPatch): Promise<boolean> => {
    const run = async () => {
      setPreferenceSaving(true);
      setPreferenceSaveError(null);
      try {
        const result = await saveProjectRoomPreferencesAction({ projectId, patch });
        if (!result.ok) {
          setPreferenceSaveError(result.message);
          return false;
        }
        setRoomPrefs(result.preferences);
        setData((prev) => ({
          ...prev,
          roomType: result.preferences.roomType,
          selectedStyles: result.preferences.selectedStyles,
          budgetLevel: result.preferences.budgetLevel,
          preferences: prev.preferences
            ? {
                ...prev.preferences,
                bedType: result.preferences.bedType,
                notes: result.preferences.notes,
                wallMainColor: result.preferences.wallMainColor,
                wallAccentColor: result.preferences.wallAccentColor,
              }
            : prev.preferences,
        }));
        return true;
      } catch {
        setPreferenceSaveError("Could not save your preferences. Try again.");
        return false;
      } finally {
        setPreferenceSaving(false);
      }
    };
    const next = persistChainRef.current.then(run, run);
    persistChainRef.current = next.then(
      () => undefined,
      () => undefined
    );
    return next;
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
      keepExistingWalls: data.preferences?.keepExistingWalls ?? EMPTY_PROJECT_ROOM_PREFERENCES.keepExistingWalls,
      wallFinishMode: data.preferences?.wallFinishMode ?? EMPTY_PROJECT_ROOM_PREFERENCES.wallFinishMode,
      floorFinishMode: data.preferences?.floorFinishMode ?? EMPTY_PROJECT_ROOM_PREFERENCES.floorFinishMode,
    });
  }, [roomPrefs, persistedDiscovery?.sourcePreferences, data.selectedStyles, data.preferences]);

  const productShoppingState = React.useMemo(
    () => toProjectProductShoppingState(persistedDiscovery, persistedSelections),
    [persistedDiscovery, persistedSelections]
  );
  const goToStepKey = React.useCallback(
    (key: RoomStepKey) => {
      const index = stepIndexFromKey("room-renovation", key);
      setCurrentStep(index);
      onStepChange?.(stepKeyFromIndex("room-renovation", index));
    },
    [onStepChange]
  );
  const handleRetryRequirement = React.useCallback(
    async (requirementKey: string) => {
      if (retryBusyKey) return;
      setRetryBusyKey(requirementKey);
      try {
        const result = await retryUnresolvedRequirementAction({ projectId, requirementKey });
        if (result.ok) {
          setPersistedDiscovery(result.discovery);
          setPersistedSelections(result.selections);
        }
      } finally {
        setRetryBusyKey(null);
      }
    },
    [projectId, retryBusyKey]
  );
  const handleRemoveRequirement = React.useCallback(
    async (requirementKey: string) => {
      const result = await removeRequirementFromDesignAction({ projectId, requirementKey });
      if (result.ok) {
        setPersistedDiscovery(result.discovery);
        setPersistedSelections(result.selections);
      }
    },
    [projectId]
  );
  const persistKeepExistingFloor = async () => {
    const saved = await persistRoomPreferences({ flooring: "keep", floorFinishMode: "keep_existing" });
    if (saved) {
      updateData({
        preferences: {
          ...(data.preferences ?? {
            wallMainColor: "",
            wallAccentColor: "",
            flooring: "keep",
            underfloorHeating: false,
            bedType: "none",
            notes: "",
            keepExistingWalls: true,
            wallFinishMode: "keep_existing",
            floorFinishMode: "keep_existing",
          }),
          flooring: "keep",
          floorFinishMode: "keep_existing",
        },
      });
    }
  };

  const persistWallFinishMode = async (mode: "keep_existing" | "concept_color") => {
    const saved = await persistRoomPreferences({
      wallFinishMode: mode,
      keepExistingWalls: keepExistingWallsFromWallFinishMode(mode),
    });
    if (saved && data.preferences) {
      updateData({
        preferences: {
          ...data.preferences,
          wallFinishMode: mode,
          keepExistingWalls: keepExistingWallsFromWallFinishMode(mode),
        },
      });
    }
  };

  const persistedProjectLocation = parseProjectLocation(roomPrefs);
  const searchLocation = persistedProjectLocation
    ? wizardLocationFromProject(persistedProjectLocation)
    : data.location;
  const searchRadiusKm = persistedProjectLocation?.radiusKm ?? data.radiusKm;

  const skipStepKeys = React.useMemo(
    () =>
      new Set<RoomStepKey>([
        "design-generation",
        "final-design-selection",
        "cost-estimate",
        "budget-split",
      ]),
    []
  );

  const nextStep = () => {
    let next = currentStep + 1;
    while (next < ROOM_STEP_KEYS.length && skipStepKeys.has(ROOM_STEP_KEYS[next]!)) {
      next += 1;
    }
    const bounded = Math.min(next, ROOM_STEP_KEYS.length - 1);
    setCurrentStep(bounded);
    onStepChange?.(stepKeyFromIndex("room-renovation", bounded));
  };

  React.useEffect(() => {
    const key = ROOM_STEP_KEYS[currentStep];
    if (!key || !skipStepKeys.has(key)) return;
    const briefDone = Boolean(roomPrefs?.designBriefAnswers?.completed);
    if (!briefDone) {
      goToStepKey("design-brief");
      return;
    }
    goToStepKey(searchLocation ? "store-discovery" : "location");
  }, [currentStep, searchLocation, goToStepKey, skipStepKeys, roomPrefs?.designBriefAnswers?.completed]);

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
    const stepMessages: Partial<Record<RoomStepKey, string>> = {
      "room-type": "Which room would you like to renovate today?",
      "photo-upload": "Great.\n\nPlease upload a photo of the room as it looks right now.",
      "ai-observation":
        "When you are ready, I will analyze the saved photo of this room and prepare design requirements. I will not search products or generate a render yet.",
      "design-brief":
        "I’ll ask a few focused questions so the design follows how you live in this room — not assumptions from an empty photograph.",
      "style-selection":
        "I’ll ask a few focused questions so the design follows how you live in this room — not assumptions from an empty photograph.",
      "budget-signal":
        "I’ll ask a few focused questions so the design follows how you live in this room — not assumptions from an empty photograph.",
      "design-preferences":
        "I’ll ask a few focused questions so the design follows how you live in this room — not assumptions from an empty photograph.",
      location: "To find products in local stores near you, share your location.",
      "store-discovery":
        "When you are ready, I will search nearby stores for real products from the room analysis. This does not generate a render.",
      "product-sourcing": "Review the persisted products. Confirm the ones to use in the future design.",
      "shopping-list": "Building a final shopping list that stays within your total budget…",
      contractors: "Do you want me to find local contractors (painters, flooring, assembly) within 50 km?",
      "final-report": "Your renovation project is ready.",
    };

    const key = ROOM_STEP_KEYS[currentStep];
    if (key && stepMessages[key] && !stepMessagesRef.current.has(currentStep)) {
      stepMessagesRef.current.add(currentStep);
      const messageText = stepMessages[key];
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

  const renderDesignBrief = () => (
    <DesignBriefStep
      roomType={roomPrefs?.roomType ?? data.roomType}
      analysis={currentAnalysis}
      preferences={roomPrefs}
      saving={preferenceSaving}
      error={preferenceSaveError}
      onSave={persistRoomPreferences}
      onComplete={() => {
        addUserMessage("Design brief confirmed");
        goToStepKey("location");
      }}
    />
  );

  const renderCurrentStep = () => {
    switch (ROOM_STEP_KEYS[currentStep]) {
      case "room-type":
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
      case "photo-upload":
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
      case "ai-observation":
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
      case "design-brief":
      case "style-selection":
      case "budget-signal":
      case "design-preferences":
        return renderDesignBrief();
      case "location":
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
      case "design-generation":
      case "final-design-selection":
      case "cost-estimate":
      case "budget-split":
        return null;
      case "store-discovery":
        return (
          <Step9aStoreDiscovery
            projectId={projectId}
            location={searchLocation}
            radiusKm={searchRadiusKm}
            initialDiscovery={persistedDiscovery}
            initialSelections={persistedSelections}
            shoppingPreferences={shoppingPreferences}
            analysis={currentAnalysis}
            furnishingPlan={roomPrefs?.furnishingPlan}
            onFurnishingPlanChange={(next) => {
              void persistRoomPreferences({ furnishingPlan: next });
            }}
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
      case "product-sourcing":
        return (
          <Step9bProductSourcing
            projectId={projectId}
            selections={persistedSelections}
            discovery={persistedDiscovery}
            unmatchedRequirements={persistedDiscovery?.unmatchedRequirements ?? []}
            preferences={{
              selectedStyles: data.selectedStyles,
              budgetLevel: data.budgetLevel,
              wallMainColor: data.preferences?.wallMainColor ?? "",
              wallAccentColor: data.preferences?.wallAccentColor ?? "",
              flooring: data.preferences?.flooring ?? "keep",
              underfloorHeating: data.preferences?.underfloorHeating ?? false,
              bedType: data.preferences?.bedType ?? "none",
              keepExistingWalls: data.preferences?.keepExistingWalls ?? EMPTY_PROJECT_ROOM_PREFERENCES.keepExistingWalls,
              wallFinishMode: data.preferences?.wallFinishMode ?? EMPTY_PROJECT_ROOM_PREFERENCES.wallFinishMode,
              floorFinishMode: data.preferences?.floorFinishMode ?? EMPTY_PROJECT_ROOM_PREFERENCES.floorFinishMode,
              notes: data.preferences?.notes ?? "",
            }}
            roomPhotoPreviewUrl={roomPhoto?.previewUrl ?? null}
            analysis={currentAnalysis}
            shoppingPreferences={shoppingPreferences}
            planOverrides={roomPrefs?.furnishingPlan ?? null}
            onRetryRequirement={(requirementKey) => void handleRetryRequirement(requirementKey)}
            onChangeConstraints={() => goToStepKey("design-preferences")}
            onIncreaseBudget={() => goToStepKey("budget-signal")}
            onRemoveRequirement={(requirementKey) => void handleRemoveRequirement(requirementKey)}
            onKeepExistingFloor={() => void persistKeepExistingFloor()}
            onSwitchWallToConceptColor={() => void persistWallFinishMode("concept_color")}
            onKeepExistingWalls={() => void persistWallFinishMode("keep_existing")}
            retryBusyKey={retryBusyKey}
            onContinue={() => {
              nextStep();
            }}
          />
        );
      case "shopping-list":
        return (
          <Step9cShoppingList
            shoppingState={productShoppingState}
            onRetryRequirement={(requirementKey) => void handleRetryRequirement(requirementKey)}
            onChangeConstraints={() => goToStepKey("design-preferences")}
            onIncreaseBudget={() => goToStepKey("budget-signal")}
            onRemoveRequirement={(requirementKey) => void handleRemoveRequirement(requirementKey)}
            retryBusyKey={retryBusyKey}
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
      case "contractors":
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
      case "final-report":
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

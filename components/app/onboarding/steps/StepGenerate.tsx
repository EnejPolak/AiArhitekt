"use client";

import * as React from "react";
import { Button } from "@/components/ui/Button";
import { ChatMessage } from "../ChatMessage";
import { ProjectData } from "../OnboardingFlow";
import { Loader2, Check, AlertCircle } from "lucide-react";

export interface StepGenerateProps {
  projectData: ProjectData;
  onComplete: () => void;
}

interface GenerateResponse {
  products: Array<{
    category: string;
    name: string;
    store: string;
    price: string;
    link: string;
    justification: string;
  }>;
  summary: string;
  renderImage: string;
  storesMap: Array<{
    store: string;
    address: string;
    lat: number;
    lng: number;
  }>;
}

const GENERATION_STEPS = [
  "Določanje iskalnih poizvedb...",
  "Iskanje produktov na slovenskem spletu...",
  "Razlaga produktov...",
  "Generiranje 3D renderja...",
  "Priprava lokacij trgovin...",
];

export const StepGenerate: React.FC<StepGenerateProps> = ({ projectData, onComplete }) => {
  const [currentStepIndex, setCurrentStepIndex] = React.useState(0);
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<GenerateResponse | null>(null);
  const hasStartedRef = React.useRef(false); // Prevent multiple calls

  const handleGenerate = React.useCallback(async () => {
    // Prevent multiple simultaneous calls
    if (isGenerating) {
      console.log("[StepGenerate] Already generating, skipping...");
      return;
    }
    
    console.log("[StepGenerate] Starting generation...");
    setIsGenerating(true);
    setError(null);
    setCurrentStepIndex(0);
    hasStartedRef.current = true;

    try {
      // Prepare uploads
      let floorPlanBase64: string | undefined;
      if (projectData.uploads?.floorplanImage) {
        floorPlanBase64 = await fileToBase64(projectData.uploads.floorplanImage);
      }

      // Prepare project data for API
      const apiData = {
        projectData: {
          location: projectData.location,
          projectType: projectData.projectType,
          interiorStyle: projectData.interiorStyle,
          materialGrade: projectData.materialGrade,
          furnitureStyle: projectData.furnitureStyle,
          shoppingPreferences: projectData.shoppingPreferences,
          uploads: floorPlanBase64
            ? {
                floorPlan: floorPlanBase64,
              }
            : undefined,
          specialRequirements: projectData.specialRequirements,
        },
      };

      // Step 1: Intent
      setCurrentStepIndex(0);
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Step 2: Search
      setCurrentStepIndex(1);
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Step 3: Curate
      setCurrentStepIndex(2);
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Call API
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(apiData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Napaka pri generiranju");
      }

      // Step 4: Render
      setCurrentStepIndex(3);
      const data: GenerateResponse = await response.json();

      // Step 5: Map
      setCurrentStepIndex(4);
      await new Promise((resolve) => setTimeout(resolve, 500));

      setResult(data);
      setIsGenerating(false);

      // Auto-complete after showing results
      setTimeout(() => {
        onComplete();
      }, 2000);
    } catch (err: any) {
      console.error("Generate error:", err);
      setError(err.message || "Napaka pri generiranju. Poskusite znova.");
      setIsGenerating(false);
      hasStartedRef.current = false; // Allow retry on error
    }
  }, [projectData, onComplete, isGenerating]);

  // Convert File to base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        resolve(base64String);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // Auto-start generation on mount (only once)
  React.useEffect(() => {
    // Only start if we haven't started yet
    if (hasStartedRef.current) {
      console.log("[StepGenerate] Already started, skipping useEffect");
      return; // Already started, don't run again
    }
    
    if (!isGenerating && !result && !error) {
      console.log("[StepGenerate] Starting from useEffect");
      handleGenerate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps - only run once on mount

  if (error) {
    return (
      <div className="space-y-6">
        <ChatMessage
          type="ai"
          content={`**Napaka pri generiranju**

${error}`}
        />
        <div className="flex justify-start">
          <div className="max-w-[85%] rounded-[16px] px-5 py-5 bg-red-500/10 border border-red-500/30">
            <div className="flex items-center gap-3 text-red-400">
              <AlertCircle className="w-5 h-5" />
              <span className="text-[14px]">{error}</span>
            </div>
            <Button
              type="button"
              onClick={() => {
                hasStartedRef.current = false; // Reset for retry
                handleGenerate();
              }}
              className="mt-4 w-full bg-gradient-to-br from-[#3B82F6] to-[#2563EB] text-white border-0 h-[44px] text-[14px] font-medium rounded-[12px]"
            >
              Poskusi znova
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (result) {
    return (
      <div className="space-y-6">
        <ChatMessage
          type="ai"
          content={`**Generiranje končano!**

Našli smo ${result.products.length} produktov z verifikovanimi povezavami.

${result.summary}`}
        />

        {/* Render Image */}
        {result.renderImage && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-[16px] overflow-hidden border border-[rgba(255,255,255,0.08)]">
              <img src={result.renderImage} alt="Generated 3D render" className="w-full" />
            </div>
          </div>
        )}

        {/* Products */}
        {result.products.length > 0 && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-[16px] px-5 py-5 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)]">
              <div className="text-[14px] font-medium text-white mb-4">Izbrani produkti:</div>
              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {result.products.map((product, idx) => (
                  <div key={idx} className="pb-3 border-b border-[rgba(255,255,255,0.08)] last:border-0">
                    <div className="text-[13px] font-medium text-white mb-1">{product.name}</div>
                    <div className="text-[11px] text-[rgba(255,255,255,0.60)] mb-1">
                      {product.store} • {product.price}
                    </div>
                    <a
                      href={product.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-blue-400 hover:underline break-all"
                    >
                      {product.link}
                    </a>
                    <div className="text-[11px] text-[rgba(255,255,255,0.50)] mt-1">
                      {product.justification}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-start">
          <div className="max-w-[85%] rounded-[16px] px-5 py-5 bg-green-500/10 border border-green-500/30">
            <div className="flex items-center gap-3 text-green-400">
              <Check className="w-5 h-5" />
              <span className="text-[14px]">Generiranje uspešno končano!</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ChatMessage
        type="ai"
        content={`**Generiranje 3D koncepta**

Procesiram vaše preference in generiram 3D render, seznam produktov in lokacije trgovin...`}
      />
      <div className="flex justify-start">
        <div className="max-w-[85%] rounded-[16px] px-5 py-5 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)]">
          <div className="space-y-3">
            {GENERATION_STEPS.map((step, idx) => (
              <div
                key={idx}
                className={`flex items-center gap-3 text-[13px] ${
                  idx < currentStepIndex
                    ? "text-green-400"
                    : idx === currentStepIndex
                    ? "text-blue-400"
                    : "text-[rgba(255,255,255,0.40)]"
                }`}
              >
                {idx < currentStepIndex ? (
                  <Check className="w-4 h-4" />
                ) : idx === currentStepIndex ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <div className="w-4 h-4 rounded-full border-2 border-[rgba(255,255,255,0.20)]" />
                )}
                <span>{step}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

"use client";

import * as React from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { ChatMessage } from "../ChatMessage";
import { ProjectData } from "../OnboardingFlow";
import { Check, Loader2, Download, RefreshCw } from "lucide-react";
import { FormattedSummary } from "./FormattedSummary";
import { StoreMap } from "./StoreMap";

export interface StepGenerateProps {
  projectData: ProjectData;
  onComplete: () => void;
}

const GENERATION_STEPS = [
  "Reading your floor plan…",
  "Building the 3D volume…",
  "Generating realistic render…",
  "Estimating cost range…",
];

// Style options removed - using interiorStyle from projectData instead

// Global lock to prevent concurrent requests
let isGlobalGenerating = false;
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 10000; // 10 seconds minimum between requests

export const StepGenerate: React.FC<StepGenerateProps> = ({ projectData, onComplete }) => {
  const [currentStep, setCurrentStep] = React.useState(0);
  const [isComplete, setIsComplete] = React.useState(false);
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [generatedImageUrl, setGeneratedImageUrl] = React.useState<string | null>(null);
  const [selectedMode, setSelectedMode] = React.useState<"normal" | "floorplan">("normal");
  const [error, setError] = React.useState<string | null>(null);
  const [retryAfter, setRetryAfter] = React.useState<number | null>(null);
  const [analysisResult, setAnalysisResult] = React.useState<{ json: any; summary: string } | null>(null);
  
  // Ref to prevent stale closures
  const generateRenderRef = React.useRef<(() => Promise<void>) | null>(null);
  const debounceTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  // Convert File to base64 data URL
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64 = reader.result as string;
        resolve(base64);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  // Convert PDF to image (first page)
  const pdfToImage = async (file: File): Promise<string> => {
    try {
      const pdfjsLib = await import("pdfjs-dist");
      pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const page = await pdf.getPage(1);
      const scale = 2.0;
      const viewport = page.getViewport({ scale });
      
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (!context) {
        throw new Error("Could not get canvas context");
      }
      
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      
      await page.render({
        // pdfjs v5 RenderParameters requires `canvas`
        canvas,
        canvasContext: context,
        viewport,
      } as any).promise;
      
      return canvas.toDataURL("image/png");
    } catch (error) {
      console.error("PDF to image conversion error:", error);
      throw new Error("Failed to convert PDF to image. Please try uploading an image file instead.");
    }
  };

  // Generate analysis using ChatGPT API
  const generateRender = React.useCallback(async () => {

    // Protection 1: Check if already generating
    if (isGenerating || isGlobalGenerating) {
      console.warn("⚠️ [RATE LIMIT] generateRender() called but already generating. Ignoring request.");
      return;
    }

    // Protection 2: Check minimum interval
    const timeSinceLastRequest = Date.now() - lastRequestTime;
    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
      const waitTime = Math.ceil((MIN_REQUEST_INTERVAL - timeSinceLastRequest) / 1000);
      console.warn(`⚠️ [RATE LIMIT] Too soon since last request. Please wait ${waitTime} seconds.`);
      setError(`Please wait ${waitTime} seconds before generating again.`);
      return;
    }

    // Protection 3: Check retry_after if set
    if (retryAfter && Date.now() < retryAfter) {
      const waitTime = Math.ceil((retryAfter - Date.now()) / 1000);
      console.warn(`⚠️ [RATE LIMIT] Rate limit active. Please wait ${waitTime} seconds.`);
      setError(`Rate limit active. Please wait ${waitTime} seconds before trying again.`);
      return;
    }

    // Set locks
    setIsGenerating(true);
    isGlobalGenerating = true;
    lastRequestTime = Date.now();
    setError(null);
    setCurrentStep(0);
    setRetryAfter(null);
    setAnalysisResult(null);

    try {
      // Call ChatGPT Analyze API
      setCurrentStep(1);
      console.log("🚀 [API] Sending request to /api/analyze");
      console.log("📤 [API] Project data:", projectData);
      
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectData: projectData,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to analyze project. Please try again.");
      }

      setCurrentStep(2);
      setAnalysisResult({
        json: data.json,
        summary: data.summary,
      });
      setIsComplete(true);
      console.log("✅ [API] Successfully analyzed project");
      console.log("📥 [API] JSON result:", data.json ? "✓" : "✗");
      console.log("📥 [API] Summary:", data.summary ? "✓" : "✗");
    } catch (err: any) {
      console.error("❌ [API] Analysis error:", err);
      setError(err.message || "Failed to analyze project. Please try again.");
      setIsComplete(false);
    } finally {
      setIsGenerating(false);
      isGlobalGenerating = false;
    }
  }, [projectData, isGenerating, retryAfter]);

  // Store ref for stable access
  React.useEffect(() => {
    generateRenderRef.current = generateRender;
  }, [generateRender]);

  // Debounced version for style changes
  const debouncedGenerateRender = React.useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    
    debounceTimerRef.current = setTimeout(() => {
      if (generateRenderRef.current) {
        generateRenderRef.current();
      }
    }, 1000); // 1 second debounce
  }, []);

  // Simulate step progression during generation
  React.useEffect(() => {
    if (isGenerating && !isComplete) {
      const interval = setInterval(() => {
        setCurrentStep((prev) => {
          if (prev < GENERATION_STEPS.length - 1) {
            return prev + 1;
          }
          return prev;
        });
      }, 3000);

      return () => clearInterval(interval);
    }
  }, [isGenerating, isComplete]);

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      isGlobalGenerating = false;
    };
  }, []);

  const handleRegenerate = React.useCallback(() => {
    if (isGenerating || isGlobalGenerating) {
      console.warn("⚠️ [RATE LIMIT] handleRegenerate() called but already generating. Ignoring.");
      return;
    }

    setAnalysisResult(null);
    setIsComplete(false);
    setCurrentStep(0);
    setError(null);
    setRetryAfter(null);
    
    // Use debounced version to prevent spam
    debouncedGenerateRender();
  }, [isGenerating, debouncedGenerateRender]);

  // Style change handler removed - using interiorStyle from projectData

  // Model type change handler removed - only SDXL is used

  return (
    <div className="space-y-6 w-full">
      {!isGenerating && !isComplete ? (
        <>
          <ChatMessage
            type="ai"
            content={`**Step 15 — Analyze Project**

Ready to analyze your project! Click "Analyze Project" to get AI insights, cost estimates, and recommendations.`}
          />
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-[16px] px-5 py-5 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)] space-y-4">
              {/* Mode Selector */}
              <div>
                <h3 className="text-[16px] font-semibold text-white mb-3">Render Mode</h3>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      if (isGenerating || isGlobalGenerating) return;
                      setSelectedMode("normal");
                      // Auto-regeneration disabled to prevent credit usage
                      // if (generatedImageUrl) handleRegenerate();
                    }}
                    disabled={isGenerating || isGlobalGenerating}
                    className={cn(
                      "px-4 py-2 rounded-lg text-[14px] font-medium transition-all text-left",
                      selectedMode === "normal"
                        ? "bg-[#3B82F6] text-white"
                        : "bg-[rgba(255,255,255,0.05)] text-[rgba(255,255,255,0.70)] hover:bg-[rgba(255,255,255,0.10)]",
                      (isGenerating || isGlobalGenerating) && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    <div className="font-semibold">Normal Render</div>
                    <div className="text-[12px] opacity-80">High quality interior</div>
                  </button>
                  <button
                    onClick={() => {
                      if (isGenerating || isGlobalGenerating) return;
                      setSelectedMode("floorplan");
                      // Auto-regeneration disabled to prevent credit usage
                      // if (generatedImageUrl) handleRegenerate();
                    }}
                    disabled={isGenerating || isGlobalGenerating}
                    className={cn(
                      "px-4 py-2 rounded-lg text-[14px] font-medium transition-all text-left",
                      selectedMode === "floorplan"
                        ? "bg-[#3B82F6] text-white"
                        : "bg-[rgba(255,255,255,0.05)] text-[rgba(255,255,255,0.70)] hover:bg-[rgba(255,255,255,0.10)]",
                      (isGenerating || isGlobalGenerating) && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    <div className="font-semibold">Floorplan</div>
                    <div className="text-[12px] opacity-80">Structure-aware</div>
                  </button>
                </div>
              </div>

              {/* Generate Button */}
              <Button
                onClick={generateRender}
                disabled={
                  isGenerating || 
                  isGlobalGenerating ||
                  (retryAfter !== null && Date.now() < retryAfter)
                }
                className={cn(
                  "w-full bg-gradient-to-br from-[#3B82F6] to-[#2563EB]",
                  "text-white border-0",
                  "shadow-[0_4px_16px_rgba(59,130,246,0.25)]",
                  "hover:from-[#2563EB] hover:to-[#1D4ED8]",
                  "h-[44px] text-[14px] font-medium rounded-[12px]",
                  "transition-all duration-200",
                  (isGenerating || isGlobalGenerating) && "opacity-50 cursor-not-allowed"
                )}
              >
                {isGenerating || isGlobalGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  "Analyze Project"
                )}
              </Button>

              {error && (
                <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20">
                  <p className="text-[14px] text-red-400">{error}</p>
                  {retryAfter && Date.now() < retryAfter && (
                    <p className="text-[12px] text-red-300 mt-2">
                      Retry available in {Math.ceil((retryAfter - Date.now()) / 1000)} seconds
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      ) : isGenerating ? (
        <>
          <ChatMessage
            type="ai"
            content={`**Step 15 — Analyze Project**

Analyzing your project using AI...`}
          />
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-[16px] px-5 py-5 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)]">
              {error ? (
                <div className="space-y-4">
                  <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20">
                    <p className="text-[14px] text-red-400">{error}</p>
                    {retryAfter && Date.now() < retryAfter && (
                      <p className="text-[12px] text-red-300 mt-2">
                        Retry available in {Math.ceil((retryAfter - Date.now()) / 1000)} seconds
                      </p>
                    )}
                  </div>
                  <Button
                    onClick={generateRender}
                    disabled={isGenerating || isGlobalGenerating || (retryAfter !== null && Date.now() < retryAfter)}
                    className={cn(
                      "w-full bg-gradient-to-br from-[#3B82F6] to-[#2563EB]",
                      "text-white border-0",
                      "h-[44px] text-[14px] font-medium rounded-[12px]",
                      (isGenerating || isGlobalGenerating || (retryAfter !== null && Date.now() < retryAfter)) && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    {retryAfter && Date.now() < retryAfter ? (
                      `Wait ${Math.ceil((retryAfter - Date.now()) / 1000)}s`
                    ) : (
                      "Try Again"
                    )}
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {GENERATION_STEPS.map((step, index) => (
                    <div key={index} className="flex items-center gap-3">
                      {index < currentStep ? (
                        <Check className="w-5 h-5 text-[#4CAF50] flex-shrink-0" />
                      ) : index === currentStep ? (
                        <Loader2 className="w-5 h-5 text-[#3B82F6] animate-spin flex-shrink-0" />
                      ) : (
                        <div className="w-5 h-5 rounded-full border-2 border-[rgba(255,255,255,0.20)] flex-shrink-0" />
                      )}
                      <span
                        className={cn(
                          "text-[14px]",
                          index < currentStep
                            ? "text-[rgba(255,255,255,0.60)]"
                            : index === currentStep
                            ? "text-white"
                            : "text-[rgba(255,255,255,0.40)]"
                        )}
                      >
                        {step}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        <>
          <ChatMessage
            type="ai"
            content={`**Project Analysis Complete**

Your project has been analyzed! Here's what I found.`}
          />
          <div className="w-full">
            <div className="w-full rounded-[16px] px-5 py-5 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)] space-y-6">
              {/* AI Summary - User View */}
              {analysisResult?.summary && (
                <div className="w-full space-y-4">
                  <FormattedSummary content={analysisResult.summary} />
                </div>
              )}

              {/* Store Map */}
              {analysisResult?.json?.store_locations && analysisResult.json.store_locations.length > 0 && (
                <div className="w-full">
                  <StoreMap 
                    stores={analysisResult.json.store_locations}
                    userLocation={projectData.location}
                  />
                </div>
              )}

              {!analysisResult && (
                <div className="text-center py-8">
                  <p className="text-[14px] text-[rgba(255,255,255,0.60)]">
                    No analysis results available.
                  </p>
                </div>
              )}

              {/* Continue Button */}
              <Button
                onClick={onComplete}
                className={cn(
                  "w-full bg-gradient-to-br from-[#3B82F6] to-[#2563EB]",
                  "text-white border-0",
                  "shadow-[0_4px_16px_rgba(59,130,246,0.25)]",
                  "hover:from-[#2563EB] hover:to-[#1D4ED8]",
                  "h-[44px] text-[14px] font-medium rounded-[12px]",
                  "transition-all duration-200"
                )}
              >
                Continue to Project
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

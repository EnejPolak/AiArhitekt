"use client";

import * as React from "react";

export interface Step3AIObservationProps {
  photos: File[];
  onObservationComplete: (observation: string) => void;
}

export const Step3AIObservation: React.FC<Step3AIObservationProps> = ({
  photos,
  onObservationComplete,
}) => {
  const [isAnalyzing, setIsAnalyzing] = React.useState(true);
  const [observation, setObservation] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const completedRef = React.useRef(false);
  const lastRunKeyRef = React.useRef<string>("");

  const photosKey = React.useMemo(() => {
    return photos
      .map((p) => `${p.name}:${p.size}:${p.lastModified}`)
      .join("|");
  }, [photos]);

  React.useEffect(() => {
    // Prevent double-run in React StrictMode for same inputs
    if (lastRunKeyRef.current === photosKey) return;
    lastRunKeyRef.current = photosKey;

    const analyzePhotos = async () => {
      if (photos.length === 0) {
        setError("No photos to analyze");
        setIsAnalyzing(false);
        return;
      }

      try {
        // Convert files to base64
        const imagePromises = photos.map((file) => {
          return new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const result = reader.result as string;
              resolve(result);
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
        });

        const base64Images = await Promise.all(imagePromises);

        // Call API to analyze images
        const response = await fetch("/api/analyze-room", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            images: base64Images,
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to analyze room");
        }

        const data = await response.json();
        setObservation(data.observation);
      } catch (err: any) {
        console.error("Error analyzing photos:", err);
        setError(err.message || "Failed to analyze room photos");
        // Fallback observation
        setObservation(
          "The room appears to be in need of renovation. I can see the current layout and finishes."
        );
      } finally {
        setIsAnalyzing(false);
      }
    };

    analyzePhotos();
  }, [photos, photosKey]);

  // Auto-advance when observation is ready (no manual Continue)
  React.useEffect(() => {
    if (completedRef.current) return;
    if (!observation) return;
    completedRef.current = true;
    const t = setTimeout(() => onObservationComplete(observation), 150);
    return () => clearTimeout(t);
  }, [observation, onObservationComplete]);

  if (isAnalyzing) {
    return (
      <div className="flex justify-start mb-6">
        <div className="max-w-[85%] rounded-[16px] px-6 py-5 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)]">
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

  if (error && !observation) {
    return (
      <div className="flex justify-start mb-6">
        <div className="max-w-[85%] rounded-[16px] px-6 py-5 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)]">
          <div className="text-[15px] text-[rgba(255,255,255,0.85)] leading-relaxed">
            {error}
          </div>
        </div>
      </div>
    );
  }

  if (observation) return null;

  return null;
};

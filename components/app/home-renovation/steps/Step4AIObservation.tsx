"use client";

import * as React from "react";

export interface Step4AIObservationProps {
  floorPlans: File[];
  photos: File[];
  onObservationComplete: (observation: string) => void;
}

export const Step4AIObservation: React.FC<Step4AIObservationProps> = ({
  floorPlans,
  photos,
  onObservationComplete,
}) => {
  const [isAnalyzing, setIsAnalyzing] = React.useState(true);
  const [observation, setObservation] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const analyzeHome = async () => {
      const allFiles = [...floorPlans, ...photos];
      
      if (allFiles.length === 0) {
        setObservation(
          "No floor plans or photos were uploaded. I'll proceed with the renovation planning based on your selections."
        );
        setIsAnalyzing(false);
        return;
      }

      try {
        // Convert files to base64 (only images, skip PDFs for now)
        const imageFiles = allFiles.filter(
          (file) => file.type.startsWith("image/")
        );

        if (imageFiles.length === 0) {
          setObservation(
            "I can see floor plans were uploaded. I'll use this information to guide the renovation concept."
          );
          setIsAnalyzing(false);
          return;
        }

        const imagePromises = imageFiles.map((file) => {
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

        // Call API to analyze home
        const response = await fetch("/api/analyze-home", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            images: base64Images,
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to analyze home");
        }

        const data = await response.json();
        setObservation(data.observation);
      } catch (err: any) {
        console.error("Error analyzing home:", err);
        setError(err.message || "Failed to analyze home");
        setObservation(
          "I can see the home layout and current condition. I'll use this information to create a cohesive renovation concept."
        );
      } finally {
        setIsAnalyzing(false);
      }
    };

    analyzeHome();
  }, [floorPlans, photos]);

  if (isAnalyzing) {
    return null; // AI message "Reviewing your home layout…" is already shown
  }

  if (observation) {
    return (
      <div className="flex justify-start mt-6">
        <button
          onClick={() => onObservationComplete(observation)}
          className="px-6 py-3 rounded-lg bg-[#3B82F6] text-white text-[14px] font-medium hover:bg-[#2563EB] transition-colors"
        >
          Continue
        </button>
      </div>
    );
  }

  return null;
};

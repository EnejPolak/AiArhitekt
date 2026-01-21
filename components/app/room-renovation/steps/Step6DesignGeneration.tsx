"use client";

import * as React from "react";

export interface Step6DesignGenerationProps {
  roomType: string;
  photos: File[];
  styles: string[];
  budget: string;
  preferences?: any;
  observation?: string | null;
  onDesignsGenerated: (designs: string[]) => void;
}

export const Step6DesignGeneration: React.FC<Step6DesignGenerationProps> = ({
  roomType,
  photos,
  styles,
  budget,
  preferences,
  observation,
  onDesignsGenerated,
}) => {
  const [isGenerating, setIsGenerating] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const lastRunKeyRef = React.useRef<string>("");

  const runKey = React.useMemo(() => {
    const photo = photos?.[0];
    const photoKey = photo ? `${photo.name}:${photo.size}:${photo.lastModified}` : "no-photo";
    let prefKey = "";
    try {
      prefKey = JSON.stringify(preferences ?? {});
    } catch {
      prefKey = "prefs";
    }
    const obsKey = (observation ?? "").slice(0, 200);
    return `${roomType}|${styles.join(",")}|${budget}|${photoKey}|${prefKey}|${obsKey}`;
  }, [roomType, photos, styles, budget, preferences, observation]);

  const resizeImage = React.useCallback(
    (file: File, maxWidth = 1920, maxHeight = 1920, targetSizeMB = 9.5): Promise<string> => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const img = new Image();
          img.onload = () => {
            const targetSizeBytes = targetSizeMB * 1024 * 1024;

            let width = img.width;
            let height = img.height;

            if (width > maxWidth || height > maxHeight) {
              if (width > height) {
                height = (height * maxWidth) / width;
                width = maxWidth;
              } else {
                width = (width * maxHeight) / height;
                height = maxHeight;
              }
            }

            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");
            if (!ctx) {
              reject(new Error("Could not create canvas context"));
              return;
            }

            const tryCompress = (w: number, h: number, q: number): string => {
              canvas.width = w;
              canvas.height = h;
              ctx.drawImage(img, 0, 0, w, h);
              return canvas.toDataURL("image/jpeg", q);
            };

            let currentWidth = width;
            let currentHeight = height;
            let quality = 0.85;
            let result = tryCompress(currentWidth, currentHeight, quality);

            while (result.length > targetSizeBytes && quality > 0.5) {
              quality -= 0.05;
              result = tryCompress(currentWidth, currentHeight, quality);
            }

            if (result.length > targetSizeBytes) {
              let scale = 0.9;
              while (result.length > targetSizeBytes && scale > 0.5) {
                currentWidth = Math.floor(width * scale);
                currentHeight = Math.floor(height * scale);
                quality = 0.75;
                result = tryCompress(currentWidth, currentHeight, quality);
                while (result.length > targetSizeBytes && quality > 0.5) {
                  quality -= 0.05;
                  result = tryCompress(currentWidth, currentHeight, quality);
                }
                scale -= 0.1;
              }
            }

            resolve(result);
          };
          img.onerror = () => reject(new Error("Failed to load image"));
          img.src = e.target?.result as string;
        };
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsDataURL(file);
      });
    },
    []
  );

  React.useEffect(() => {
    // Prevent double-run in React StrictMode for same inputs
    if (lastRunKeyRef.current === runKey) return;
    lastRunKeyRef.current = runKey;

    const generateDesigns = async () => {
      try {
        setError(null);
        const photo = photos?.[0];
        if (!photo) throw new Error("No photo provided.");

        // Always resize to keep payload + processing stable.
        const imageDataUrl = await resizeImage(photo, 1920, 1920, 9.5);

        const styleText = styles.length ? styles.join(", ") : "modern";
        // Build prompt server-side (Vision + preferences) so we don't guess.
        const promptRes = await fetch("/api/prompt-room-render", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image: imageDataUrl,
            roomType,
            styles,
            budget,
            preferences: preferences || {},
            observation: observation || "",
          }),
        });
        const promptData = await promptRes.json().catch(() => ({}));
        if (!promptRes.ok) {
          throw new Error(promptData?.error || "Failed to build prompt.");
        }

        const prompt = String(promptData?.prompt || "");
        const negativePrompt = String(promptData?.negativePrompt || "");

        const response = await fetch("/api/test-render", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image: imageDataUrl,
            prompt,
            negativePrompt,
            n: 3,
            size: "auto",
          }),
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data?.error || "Failed to generate designs.");
        }

        const designs: string[] = Array.isArray(data?.images) && data.images.length > 0
          ? data.images
          : data?.imageUrl
            ? [data.imageUrl]
            : [];

        if (designs.length === 0) throw new Error("No designs returned.");
        onDesignsGenerated(designs);
      } catch (e: any) {
        const msg = e?.message || "Failed to generate designs.";
        setError(msg);
        // Keep flow moving with placeholders if provider is not available (e.g. org not verified).
        onDesignsGenerated([
          "https://via.placeholder.com/800x600/1a1a1a/ffffff?text=Design+1",
          "https://via.placeholder.com/800x600/2a2a2a/ffffff?text=Design+2",
          "https://via.placeholder.com/800x600/3a3a3a/ffffff?text=Design+3",
        ]);
      } finally {
        setIsGenerating(false);
      }
    };

    generateDesigns();
  }, [runKey, roomType, photos, styles, budget, preferences, onDesignsGenerated, resizeImage]);

  if (isGenerating) {
    return (
      <div className="flex justify-start mb-6">
        <div className="max-w-[85%] rounded-[16px] px-6 py-5 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)]">
          <div className="text-[15px] text-[rgba(255,255,255,0.85)] leading-relaxed mb-3">
            Designing your new {roomType}…
          </div>
          <div className="flex items-center justify-center">
            <div className="w-12 h-12 border-4 border-[rgba(255,255,255,0.1)] border-t-[#3B82F6] rounded-full animate-spin" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-start mb-6">
        <div className="max-w-[85%] rounded-[16px] px-6 py-5 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)]">
          <div className="text-[15px] text-[rgba(255,255,255,0.85)] leading-relaxed">
            I couldn’t generate designs right now.
          </div>
          <div className="text-[13px] text-[rgba(255,255,255,0.60)] mt-2">
            {error}
          </div>
          <div className="text-[13px] text-[rgba(255,255,255,0.60)] mt-2">
            If you see a 403 about `gpt-image-1`, verify your OpenAI organization and retry.
          </div>
        </div>
      </div>
    );
  }

  return null; // This step will transition to Step7 automatically
};

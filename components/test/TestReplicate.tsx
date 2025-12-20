"use client";

import * as React from "react";
import { Button } from "@/components/ui/Button";

export const TestReplicate: React.FC = () => {
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [imageUrl, setImageUrl] = React.useState<string | null>(null);
  const [logs, setLogs] = React.useState<string[]>([]);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, `[${timestamp}] ${message}`]);
    console.log(`[TEST] ${message}`);
  };

  const handleTest = async () => {
    setIsGenerating(true);
    setError(null);
    setImageUrl(null);
    setLogs([]);

    try {
      addLog("🧪 Začenjam test Replicate AI...");
      addLog("");

      // Step 1: Load test floorplan
      addLog("📥 Korak 1: Nalaganje test floorplan slike (IMG_1479.png)...");
      const imageResponse = await fetch("/test-assets/floorplan-test.png");
      if (!imageResponse.ok) {
        throw new Error("Napaka pri nalaganju test slike");
      }

      const imageBlob = await imageResponse.blob();
      addLog(`✅ Slika naložena: ${(imageBlob.size / 1024).toFixed(2)} KB`);
      addLog("");

      // Step 2: Convert to base64
      addLog("🔄 Korak 2: Pretvarjanje v base64...");
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onloadend = () => {
          const base64String = reader.result as string;
          resolve(base64String);
        };
        reader.onerror = reject;
        reader.readAsDataURL(imageBlob);
      });

      const base64Image = await base64Promise;
      addLog("✅ Slika pretvorjena v base64");
      addLog("");

      // Step 3: Prepare prompt
      addLog("📝 Korak 3: Priprava prompta...");
      const renderPrompt = `Generate a full-color, photorealistic interior render based on the provided floor plan.

IMPORTANT RULES:
- This must be a COLOR image, not black and white.
- Do NOT generate outlines, sketches, or edge-only visuals.
- The floor plan lines must be interpreted into a realistic 3D interior.
- Walls, floors, ceiling, furniture, and lighting must all have realistic colors and materials.

STYLE:
- modern interior design
- mid-range materials
- minimalist furniture
- Photorealistic interior design
- Real-world materials and lighting
- Soft natural daylight
- Global illumination
- Interior design photography style

COLORS & MATERIALS:
- Walls: soft warm white or light neutral tone
- Floor: natural wood or realistic flooring material
- Ceiling: matte white
- Furniture: modern, minimalist, realistic colors
- Lighting: warm white light (3000–4000K)

FLOOR PLAN HANDLING:
- Use the floor plan ONLY as spatial guidance
- Convert 2D lines into a realistic 3D room
- Preserve room proportions, windows, and doors
- Do NOT display floor plan lines in final image

QUALITY:
- High detail
- Sharp focus
- Realistic shadows
- No stylization
- 4k quality`;

      const negativePrompt = `black and white, monochrome, sketch, outline, edge detection, canny, hed, wireframe, line art, technical drawing, blueprint, floor plan drawing, diagram, cartoon, illustration, neon lines, chalk drawing, cluttered, outdated, dark, cramped, old-fashioned, ornate`;

      addLog(`✅ Prompt pripravljen (${renderPrompt.length} znakov)`);
      addLog(`✅ Negative prompt pripravljen (${negativePrompt.length} znakov)`);
      addLog("");

      // Step 4: Call Replicate API
      addLog("🚀 Korak 4: Klicanje Replicate API...");
      addLog("   Model: sdxl-based/realvisxl-v3-multi-controlnet-lora");
      addLog("   Mode: floorplan");

      const response = await fetch("/api/generate/render", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          image: base64Image,
          prompt: renderPrompt,
          negativePrompt: negativePrompt,
          mode: "floorplan",
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Napaka pri generiranju");
      }

      addLog("✅ Replicate API uspešen!");
      addLog(`   Image URL: ${data.imageUrl}`);
      addLog("");

      setImageUrl(data.imageUrl);
      addLog("🎉 Test uspešno končan!");
    } catch (err: any) {
      const errorMessage = err.message || "Neznana napaka";
      addLog(`❌ NAPAKA: ${errorMessage}`);
      setError(errorMessage);
      console.error("Test error:", err);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-6 space-y-6">
      <div className="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)] rounded-[16px] p-6">
        <h1 className="text-2xl font-bold text-white mb-4">
          🧪 Test Replicate AI
        </h1>
        
        <p className="text-[rgba(255,255,255,0.70)] mb-6">
          Test komponenta za testiranje Replicate AI renderja:
          <br />
          - Nalaga test floorplan sliko
          <br />
          - Pretvori v base64
          <br />
          - Pošlje v Replicate API
          <br />
          - Prikaže generirano sliko
        </p>

        <Button
          onClick={handleTest}
          disabled={isGenerating}
          className={`
            px-6 py-3 rounded-lg font-medium transition-all w-full
            ${isGenerating
              ? "bg-[rgba(255,255,255,0.1)] text-[rgba(255,255,255,0.5)] cursor-not-allowed"
              : "bg-white text-black hover:bg-[rgba(255,255,255,0.9)]"
            }
          `}
        >
          {isGenerating ? "⏳ Generiranje..." : "🚀 Zaženi Test Replicate AI"}
        </Button>
      </div>

      {/* Logs */}
      {logs.length > 0 && (
        <div className="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)] rounded-[16px] p-6">
          <h2 className="text-xl font-semibold text-white mb-4">📋 Console Logs</h2>
          <div className="bg-black/50 rounded-lg p-4 font-mono text-sm max-h-[400px] overflow-y-auto">
            {logs.map((log, idx) => (
              <div
                key={idx}
                className={`
                  mb-1
                  ${log.includes("ERROR") || log.includes("❌") || log.includes("NAPAKA")
                    ? "text-red-400" 
                    : log.includes("SUCCESS") || log.includes("✅") || log.includes("uspešno")
                    ? "text-green-400"
                    : log.includes("Korak") || log.includes("Step")
                    ? "text-blue-400 font-semibold"
                    : "text-[rgba(255,255,255,0.70)]"
                  }
                `}
              >
                {log}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="bg-red-500/20 border border-red-500/50 rounded-[16px] p-6">
          <h2 className="text-xl font-semibold text-red-400 mb-2">❌ Napaka</h2>
          <p className="text-red-300">{error}</p>
        </div>
      )}

      {/* Generated Image */}
      {imageUrl && (
        <div className="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)] rounded-[16px] p-6">
          <h2 className="text-xl font-semibold text-white mb-4">🖼️ Generirana Slika</h2>
          <div className="bg-black/50 rounded-lg p-4">
            <img
              src={imageUrl}
              alt="Generated render"
              className="w-full max-w-4xl mx-auto rounded-lg border border-[rgba(255,255,255,0.1)]"
            />
          </div>
          <div className="mt-3 text-sm text-[rgba(255,255,255,0.60)] break-all">
            <strong>Image URL:</strong>{" "}
            <a
              href={imageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:underline"
            >
              {imageUrl}
            </a>
          </div>
        </div>
      )}
    </div>
  );
};

"use client";

import * as React from "react";
import { Upload, Loader2, Download, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

type PipelineResponse = {
  designDecisions?: any;
  render?: { imageUrl?: string | null; mode?: string; maskMeta?: any };
};

export const TestShoppingLivingUI: React.FC = () => {
  const [selectedImage, setSelectedImage] = React.useState<File | null>(null);
  const [imagePreview, setImagePreview] = React.useState<string | null>(null);
  const [isRunning, setIsRunning] = React.useState(false);
  const [isResizing, setIsResizing] = React.useState(false);
  const [status, setStatus] = React.useState<string>("Idle");
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<PipelineResponse | null>(null);
  const [finalImage, setFinalImage] = React.useState<string | null>(null);
  const [rawGeneratedImage, setRawGeneratedImage] = React.useState<string | null>(null);
  const [lastSentImageDataUrl, setLastSentImageDataUrl] = React.useState<string | null>(null);
  // Off by default: user wants the AI to edit the whole image naturally.
  // When enabled, we "hard lock" geometry by compositing only the furniture zone.
  const [hardLockGeometry, setHardLockGeometry] = React.useState<boolean>(false);

  const [userDirection, setUserDirection] = React.useState<string>(
    "Create a modern luxurious living room with elegant neutral color palette and one accent wall (choose a tasteful color), premium finishes, clean minimal decor, and a cohesive designer look. Keep geometry and camera identical."
  );
  const [wallMain, setWallMain] = React.useState<string>("warm greige");
  const [wallAccent, setWallAccent] = React.useState<string>("deep olive green");

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // same resize strategy as TestRenderUI (stable uploads)
  const resizeImage = React.useCallback(
    (file: File, maxWidth: number = 1920, maxHeight: number = 1920, targetSizeMB: number = 9.5): Promise<string> => {
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
            let out = tryCompress(currentWidth, currentHeight, quality);

            while (out.length > targetSizeBytes && quality > 0.5) {
              quality -= 0.05;
              out = tryCompress(currentWidth, currentHeight, quality);
            }

            if (out.length > targetSizeBytes) {
              let scale = 0.9;
              while (out.length > targetSizeBytes && scale > 0.5) {
                currentWidth = Math.floor(width * scale);
                currentHeight = Math.floor(height * scale);
                quality = 0.75;
                out = tryCompress(currentWidth, currentHeight, quality);
                while (out.length > targetSizeBytes && quality > 0.5) {
                  quality -= 0.05;
                  out = tryCompress(currentWidth, currentHeight, quality);
                }
                scale -= 0.1;
              }
            }

            resolve(out);
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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file");
      return;
    }
    setSelectedImage(file);
    setError(null);
    setResult(null);
    setFinalImage(null);

    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleRun = async () => {
    if (!selectedImage) {
      setError("Please upload an image first.");
      return;
    }
    setIsRunning(true);
    setIsResizing(true);
    setStatus("Optimizing image…");
    setError(null);
    setResult(null);
    setFinalImage(null);

    try {
      const imageDataUrl = await resizeImage(selectedImage, 1920, 1920, 9.5);
      setLastSentImageDataUrl(imageDataUrl);
      setIsResizing(false);
      setStatus("Running: OpenAI image edit (preserve geometry) …");

      const res = await fetch("/api/test-shopping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: imageDataUrl,
          userDirection:
            `${userDirection}\n\n` +
            `Walls: main=${wallMain}, accent=${wallAccent}.`,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Pipeline failed");

      setResult(data);
      const img = data?.render?.imageUrl || null;
      setRawGeneratedImage(img);

      // Optional HARD LOCK: composite original + AI only inside furniture rect
      if (hardLockGeometry && imageDataUrl && img && data?.render?.maskMeta) {
        try {
          const meta = data.render.maskMeta;
          const composed = await compositeInsideRect({
            originalUrl: imageDataUrl,
            generatedUrl: img,
            rect: { x0: meta.x0, x1: meta.x1, y0: meta.y0, y1: meta.y1 },
          });
          setFinalImage(composed);
        } catch {
          // fallback to raw
          setFinalImage(img);
        }
      } else {
        setFinalImage(img);
      }
      setStatus("Done");
    } catch (e: any) {
      setError(e?.message || "Pipeline failed.");
      setStatus("Failed");
    } finally {
      setIsRunning(false);
    }
  };

  const loadImage = (src: string) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });

  const compositeInsideRect = async (args: {
    originalUrl: string;
    generatedUrl: string;
    rect: { x0: number; x1: number; y0: number; y1: number };
  }) => {
    const orig = await loadImage(args.originalUrl);
    const gen = await loadImage(args.generatedUrl);

    const canvas = document.createElement("canvas");
    canvas.width = orig.naturalWidth || orig.width;
    canvas.height = orig.naturalHeight || orig.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No canvas context");

    const ow = canvas.width;
    const oh = canvas.height;
    const gw = gen.naturalWidth || gen.width;
    const gh = gen.naturalHeight || gen.height;

    // Draw original first (full, pixel-accurate)
    ctx.drawImage(orig, 0, 0, ow, oh);

    // Map rect from original space into generated space if sizes differ.
    const sx = (args.rect.x0 / ow) * gw;
    const sy = (args.rect.y0 / oh) * gh;
    const sw = ((args.rect.x1 - args.rect.x0) / ow) * gw;
    const sh = ((args.rect.y1 - args.rect.y0) / oh) * gh;

    const dx = args.rect.x0;
    const dy = args.rect.y0;
    const dw = args.rect.x1 - args.rect.x0;
    const dh = args.rect.y1 - args.rect.y0;

    // Paste ONLY the edited zone from the generated image.
    ctx.drawImage(gen, sx, sy, sw, sh, dx, dy, dw, dh);

    return canvas.toDataURL("image/png");
  };

  const handleDownload = () => {
    if (!finalImage) return;
    const a = document.createElement("a");
    a.href = finalImage;
    a.download = `living-room-render-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="min-h-screen bg-[#0D0D0F] py-8 px-4 md:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">Test Shopping → Render (Living Room)</h1>
          <p className="text-[rgba(255,255,255,0.60)]">
            Upload a photo → OpenAI image edit (preserve geometry).
          </p>
          <p className="text-[rgba(255,255,255,0.40)] mt-2 text-sm">
            Note: `gpt-image-1` may require OpenAI org verification (403).
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-white mb-3">Upload Living Room Photo</label>
              {!imagePreview ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    "border-2 border-dashed rounded-[16px] p-12 text-center cursor-pointer transition-all",
                    "border-[rgba(255,255,255,0.15)] bg-[rgba(255,255,255,0.02)]",
                    "hover:border-[rgba(255,255,255,0.25)] hover:bg-[rgba(255,255,255,0.04)]"
                  )}
                >
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />
                  <Upload className="w-12 h-12 mx-auto mb-4 text-[rgba(255,255,255,0.40)]" />
                  <div className="text-[16px] font-medium text-white mb-2">Click to upload</div>
                  <div className="text-[14px] text-[rgba(255,255,255,0.50)]">PNG, JPEG, WebP supported</div>
                </div>
              ) : (
                <img
                  src={imagePreview}
                  alt="Preview"
                  className="w-full h-auto rounded-[16px] border border-[rgba(255,255,255,0.08)]"
                />
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-white mb-2">Direction</label>
              <textarea
                value={userDirection}
                onChange={(e) => setUserDirection(e.target.value)}
                rows={6}
                className={cn(
                  "w-full px-4 py-3 rounded-lg",
                  "bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.08)]",
                  "text-white text-sm focus:outline-none focus:border-[#3B82F6] resize-none"
                )}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-white mb-2">Wall colors</label>
              <input
                value={wallMain}
                onChange={(e) => setWallMain(e.target.value)}
                className={cn(
                  "w-full px-4 py-3 rounded-lg",
                  "bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.08)]",
                  "text-white text-sm focus:outline-none focus:border-[#3B82F6]"
                )}
              />
              <div className="text-xs text-[rgba(255,255,255,0.45)] mt-1">
                Main wall color (example: warm greige).
              </div>
            </div>

            <div>
              <input
                value={wallAccent}
                onChange={(e) => setWallAccent(e.target.value)}
                className={cn(
                  "w-full px-4 py-3 rounded-lg",
                  "bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.08)]",
                  "text-white text-sm focus:outline-none focus:border-[#3B82F6]"
                )}
              />
              <div className="text-xs text-[rgba(255,255,255,0.45)] mt-1">
                Accent wall color (example: deep olive green).
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-[rgba(255,255,255,0.75)]">
              <input
                type="checkbox"
                checked={hardLockGeometry}
                onChange={(e) => setHardLockGeometry(e.target.checked)}
                className="accent-[#3B82F6]"
              />
              Hard-lock geometry (composite floor zone only)
            </label>
            {rawGeneratedImage ? (
              <button
                type="button"
                onClick={() => setFinalImage(rawGeneratedImage)}
                className="text-xs text-[#3B82F6] hover:underline self-start"
              >
                Show raw AI output
              </button>
            ) : null}

            <button
              onClick={handleRun}
              disabled={!selectedImage || isRunning}
              className={cn(
                "w-full px-6 py-4 rounded-lg bg-[#3B82F6] text-white font-medium",
                "hover:bg-[#2563EB] transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                "flex items-center justify-center gap-2"
              )}
            >
              {isRunning ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>{isResizing ? "Optimizing…" : "Running pipeline…"}</span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-5 h-5" />
                  <span>Run pipeline</span>
                </>
              )}
            </button>

            <div className="text-xs text-[rgba(255,255,255,0.60)]">Status: {status}</div>

            {error && (
              <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-white mb-3">Final Render</label>
              {finalImage ? (
                <div className="space-y-4">
                  <img
                    src={finalImage}
                    alt="Final"
                    className="w-full h-auto rounded-[16px] border border-[rgba(255,255,255,0.08)]"
                  />
                  <button
                    onClick={handleDownload}
                    className="w-full px-6 py-3 rounded-lg bg-[#3B82F6] text-white font-medium hover:bg-[#2563EB] transition-colors flex items-center justify-center gap-2"
                  >
                    <Download className="w-5 h-5" />
                    <span>Download</span>
                  </button>
                </div>
              ) : (
                <div className="w-full aspect-video rounded-[16px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] flex items-center justify-center">
                  <div className="text-center text-[rgba(255,255,255,0.60)]">
                    {isRunning ? "Generating…" : "Result will appear here"}
                  </div>
                </div>
              )}
            </div>

            {result?.designDecisions ? (
              <div className="p-4 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.08)]">
                <div className="text-sm font-medium text-white mb-2">What changed in the render (design)</div>
                <div className="text-xs text-[rgba(255,255,255,0.70)] space-y-1">
                  <div><span className="text-[rgba(255,255,255,0.50)]">Wall main:</span> {String(result.designDecisions.wall_main || "")}</div>
                  <div><span className="text-[rgba(255,255,255,0.50)]">Wall accent:</span> {String(result.designDecisions.wall_accent || "")}</div>
                  <div><span className="text-[rgba(255,255,255,0.50)]">Lighting:</span> {String(result.designDecisions.lighting_temperature || "")}</div>
                  <div><span className="text-[rgba(255,255,255,0.50)]">Style:</span> {String(result.designDecisions.overall_style || "")}</div>
                </div>
              </div>
            ) : null}

          </div>
        </div>
      </div>
    </div>
  );
};


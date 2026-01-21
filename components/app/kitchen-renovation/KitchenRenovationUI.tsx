"use client";

import * as React from "react";
import { Upload, X, Brush, Wand2, Download, Settings2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Zone = "cabinets" | "countertop" | "backsplash" | "appliances" | "floor";

type StyleOptions = {
  style: "luxury-modern";
  wallColor: "medium grey";
  materials: "marble";
  budgetTier: "premium";
};

const DEFAULT_STYLE: StyleOptions = {
  style: "luxury-modern",
  wallColor: "medium grey",
  materials: "marble",
  budgetTier: "premium",
};

function dataUrlToImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

async function loadMaskToCanvas(maskDataUrl: string, canvas: HTMLCanvasElement) {
  const img = await dataUrlToImage(maskDataUrl);
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0);
}

export const KitchenRenovationUI: React.FC = () => {
  const [step, setStep] = React.useState<0 | 1 | 2 | 3>(0);
  const [imagePreview, setImagePreview] = React.useState<string | null>(null);
  const [selectedZones, setSelectedZones] = React.useState<Zone[]>([
    "cabinets",
    "countertop",
    "backsplash",
    "appliances",
  ]);

  // Fully automatic mask (default) + optional brush refine
  const [maskDataUrl, setMaskDataUrl] = React.useState<string | null>(null);
  const [maskMeta, setMaskMeta] = React.useState<{ coveragePct: number; classesUsed: string[] } | null>(null);
  const [isMasking, setIsMasking] = React.useState(false);
  const [showAdvanced, setShowAdvanced] = React.useState(false);
  const [brushEnabled, setBrushEnabled] = React.useState(false);
  const [brushSize, setBrushSize] = React.useState(28);
  const [isPainting, setIsPainting] = React.useState(false);

  const imgRef = React.useRef<HTMLImageElement | null>(null);
  const maskCanvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const [styleOptions] = React.useState<StyleOptions>(DEFAULT_STYLE);
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [finalImageUrl, setFinalImageUrl] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const resetAll = () => {
    setImagePreview(null);
    setMaskDataUrl(null);
    setMaskMeta(null);
    setFinalImageUrl(null);
    setError(null);
    setStep(0);
    setShowAdvanced(false);
    setBrushEnabled(false);
    setIsPainting(false);
  };

  const toggleZone = (zone: Zone) => {
    setSelectedZones((prev) =>
      prev.includes(zone) ? prev.filter((z) => z !== zone) : [...prev, zone]
    );
  };

  const handleUpload = (file: File) => {
    setError(null);
    setFinalImageUrl(null);
    setMaskDataUrl(null);
    setMaskMeta(null);
    setBrushEnabled(false);
    setShowAdvanced(false);
    setStep(1);

    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  // FULLY AUTOMATIC masking on upload (zero clicks)
  React.useEffect(() => {
    const run = async () => {
      if (!imagePreview) return;
      setIsMasking(true);
      setError(null);
      setMaskMeta(null);
      try {
        const img = await dataUrlToImage(imagePreview);
        const res = await fetch("/api/mask/auto-kitchen", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageDataUrl: imagePreview,
            imageWidth: img.width,
            imageHeight: img.height,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Auto mask failed");

        const m = data.maskDataUrl as string;
        setMaskDataUrl(m);
        setMaskMeta({
          coveragePct: Number(data.meta?.coveragePct ?? 0),
          classesUsed: Array.isArray(data.meta?.classesUsed) ? data.meta.classesUsed : [],
        });

        const canvas = maskCanvasRef.current;
        if (canvas) await loadMaskToCanvas(m, canvas);
      } catch (err: any) {
        setError(err.message || "Auto mask failed");
      } finally {
        setIsMasking(false);
      }
    };
    run();
  }, [imagePreview]);

  const clearMask = () => {
    setMaskDataUrl(null);
    setMaskMeta(null);
    const canvas = maskCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };

  const paintAt = (clientX: number, clientY: number) => {
    const img = imgRef.current;
    const canvas = maskCanvasRef.current;
    if (!img || !canvas) return;
    const rect = img.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * img.naturalWidth;
    const y = ((clientY - rect.top) / rect.height) * img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.arc(x, y, brushSize, 0, Math.PI * 2);
    ctx.fill();
    setMaskDataUrl(canvas.toDataURL("image/png"));
  };

  const handleGenerate = async () => {
    if (!imagePreview) return setError("Upload an image first");
    if (!maskDataUrl) return setError("Auto mask is not ready yet. Please wait.");
    if (selectedZones.length === 0) return setError("Select at least one zone to change");

    setIsGenerating(true);
    setError(null);
    setFinalImageUrl(null);
    try {
      const res = await fetch("/api/renovate-kitchen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originalImage: imagePreview,
          maskImage: maskDataUrl,
          styleOptions,
          preserveGeometry: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Renovation failed");
      setFinalImageUrl(data.finalImageUrl);
      setStep(3);
    } catch (err: any) {
      setError(err.message || "Renovation failed");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = () => {
    if (!finalImageUrl) return;
    const a = document.createElement("a");
    a.href = finalImageUrl;
    a.download = `kitchen-renovation-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="max-w-[1100px] mx-auto px-6 md:px-8 py-10">
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <div className="text-[22px] font-semibold text-white">Renovate a Kitchen</div>
          <div className="text-[14px] text-[rgba(255,255,255,0.60)] mt-1">
            Fully automatic ADE20K masking → inpainting renovation (geometry preserved).
          </div>
        </div>
        <button
          onClick={resetAll}
          className="px-4 py-2 rounded-lg border border-[rgba(255,255,255,0.12)] text-[13px] text-[rgba(255,255,255,0.75)] hover:bg-[rgba(255,255,255,0.05)]"
        >
          Reset
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-lg border border-red-500/30 bg-red-500/10 text-red-200 text-[13px]">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT */}
        <div className="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)] rounded-[16px] p-6">
          <div className="text-[14px] font-medium text-white mb-4">1) Upload kitchen photo</div>

          {!imagePreview ? (
            <label className="block cursor-pointer">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUpload(f);
                }}
              />
              <div className="rounded-[16px] border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.02)] p-8 text-center">
                <Upload className="w-10 h-10 mx-auto text-[rgba(255,255,255,0.45)] mb-3" />
                <div className="text-white text-[14px] font-medium">Click to upload</div>
                <div className="text-[12px] text-[rgba(255,255,255,0.55)] mt-1">PNG/JPEG/WebP</div>
              </div>
            </label>
          ) : (
            <div className="relative">
              <img
                ref={imgRef}
                src={imagePreview}
                alt="Original"
                className="w-full h-auto rounded-[16px] border border-[rgba(255,255,255,0.08)]"
                onMouseDown={(e) => {
                  if (!brushEnabled) return;
                  setIsPainting(true);
                  paintAt(e.clientX, e.clientY);
                }}
                onMouseMove={(e) => {
                  if (!brushEnabled) return;
                  if (!isPainting) return;
                  paintAt(e.clientX, e.clientY);
                }}
                onMouseUp={() => setIsPainting(false)}
                onMouseLeave={() => setIsPainting(false)}
              />
              {maskDataUrl && (
                <img
                  src={maskDataUrl}
                  alt="Mask overlay"
                  className="absolute inset-0 w-full h-full rounded-[16px] pointer-events-none"
                  style={{ opacity: 0.35, mixBlendMode: "screen" }}
                />
              )}
              <button
                onClick={resetAll}
                className="absolute top-3 right-3 p-2 bg-black/60 rounded-full hover:bg-black/75"
                aria-label="Remove image"
              >
                <X className="w-4 h-4 text-white" />
              </button>
            </div>
          )}

          {imagePreview && (
            <div className="mt-6">
              <div className="text-[14px] font-medium text-white mb-3">2) Select what to change</div>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ["cabinets", "Cabinets"],
                    ["countertop", "Countertop"],
                    ["backsplash", "Backsplash"],
                    ["appliances", "Appliances"],
                    ["floor", "Floor (optional)"],
                  ] as Array<[Zone, string]>
                ).map(([id, label]) => {
                  const active = selectedZones.includes(id);
                  return (
                    <button
                      key={id}
                      onClick={() => toggleZone(id)}
                      className={cn(
                        "px-3 py-2 rounded-lg text-left border text-[13px] transition-colors",
                        active
                          ? "border-[#3B82F6]/50 bg-[#3B82F6]/10 text-white"
                          : "border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.02)] text-[rgba(255,255,255,0.75)] hover:bg-[rgba(255,255,255,0.05)]"
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {imagePreview && (
            <div className="mt-6">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="text-[14px] font-medium text-white">3) Auto mask (no clicks)</div>
                <button
                  onClick={() => setShowAdvanced((v) => !v)}
                  className="px-3 py-2 rounded-lg text-[12px] border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.02)] text-[rgba(255,255,255,0.70)] hover:bg-[rgba(255,255,255,0.05)] flex items-center gap-2"
                >
                  <Settings2 className="w-4 h-4" />
                  Advanced
                </button>
              </div>

              <div className="rounded-[16px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-4">
                <div className="text-[12px] text-[rgba(255,255,255,0.65)] mb-3">
                  White = regenerate (cabinets/countertop/island/stove/fridge/sink). Black = preserve (walls/windows/doors/camera geometry).
                </div>

                <div className="flex items-center gap-2">
                  {isMasking ? (
                    <div className="flex items-center gap-2 text-[12px] text-[rgba(255,255,255,0.75)]">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Auto-detecting kitchen elements…
                    </div>
                  ) : maskMeta ? (
                    <div className="text-[12px] text-[rgba(255,255,255,0.75)]">
                      Coverage: {maskMeta.coveragePct.toFixed(1)}% · Classes:{" "}
                      {maskMeta.classesUsed.join(", ") || "—"}
                    </div>
                  ) : (
                    <div className="text-[12px] text-[rgba(255,255,255,0.60)]">Waiting for mask…</div>
                  )}
                </div>

                {showAdvanced && (
                  <div className="mt-4 rounded-[12px] border border-[rgba(255,255,255,0.08)] p-4">
                    <div className="text-[13px] text-white font-medium mb-2">Advanced: refine mask (brush)</div>
                    <div className="text-[12px] text-[rgba(255,255,255,0.60)] mb-3">
                      Optional. Paint extra areas to regenerate (adds white only).
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={async () => {
                          const enable = !brushEnabled;
                          setBrushEnabled(enable);
                          if (enable && maskDataUrl && maskCanvasRef.current) {
                            await loadMaskToCanvas(maskDataUrl, maskCanvasRef.current);
                          }
                        }}
                        className={cn(
                          "px-3 py-2 rounded-lg text-[12px] border flex items-center gap-2",
                          brushEnabled
                            ? "border-[#3B82F6]/50 bg-[#3B82F6]/10 text-white"
                            : "border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.02)] text-[rgba(255,255,255,0.70)]"
                        )}
                      >
                        <Brush className="w-4 h-4" />
                        {brushEnabled ? "Brush enabled" : "Enable brush"}
                      </button>
                      <div className="text-[12px] text-[rgba(255,255,255,0.70)]">Size</div>
                      <input
                        type="range"
                        min={8}
                        max={60}
                        value={brushSize}
                        onChange={(e) => setBrushSize(Number(e.target.value))}
                        className="w-full"
                        disabled={!brushEnabled}
                      />
                      <div className="text-[12px] text-[rgba(255,255,255,0.70)] w-10 text-right">{brushSize}</div>
                      <button
                        onClick={clearMask}
                        className="px-3 py-2 rounded-lg text-[12px] border border-[rgba(255,255,255,0.12)] text-[rgba(255,255,255,0.75)] hover:bg-[rgba(255,255,255,0.05)]"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                )}

                <canvas ref={maskCanvasRef} className="hidden" />

                <div className="mt-4">
                  <button
                    onClick={() => setStep(2)}
                    disabled={!maskDataUrl || isMasking}
                    className={cn(
                      "w-full px-4 py-3 rounded-lg bg-[#3B82F6] text-white text-[14px] font-medium hover:bg-[#2563EB] transition-colors",
                      "disabled:opacity-60 disabled:cursor-not-allowed"
                    )}
                  >
                    Continue
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT */}
        <div className="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)] rounded-[16px] p-6">
          <div className="text-[14px] font-medium text-white mb-4">Result</div>

          {step < 2 && (
            <div className="w-full aspect-video rounded-[16px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] flex items-center justify-center text-[13px] text-[rgba(255,255,255,0.60)]">
              Upload an image — mask is created automatically.
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="rounded-[12px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-4">
                <div className="flex items-center gap-2 text-[13px] text-white font-medium mb-2">
                  <Wand2 className="w-4 h-4" />
                  Luxury-modern kitchen renovation (inpaint)
                </div>
                <div className="text-[12px] text-[rgba(255,255,255,0.65)]">
                  Medium grey walls · Marble countertop + backsplash · Premium cabinetry · Clean surfaces · Neutral lighting · Sharp focus
                </div>
              </div>

              <button
                onClick={handleGenerate}
                disabled={isGenerating || !maskDataUrl || isMasking}
                className={cn(
                  "w-full px-4 py-3 rounded-lg bg-[#3B82F6] text-white text-[14px] font-medium hover:bg-[#2563EB] transition-colors",
                  "disabled:opacity-60 disabled:cursor-not-allowed"
                )}
              >
                {isGenerating ? "Generating…" : "Generate renovated kitchen"}
              </button>
            </div>
          )}

          {step === 3 && finalImageUrl && (
            <div className="space-y-4">
              <img
                src={finalImageUrl}
                alt="Renovated kitchen"
                className="w-full h-auto rounded-[16px] border border-[rgba(255,255,255,0.08)]"
                style={{ imageRendering: "crisp-edges" }}
              />
              <button
                onClick={handleDownload}
                className="w-full px-4 py-3 rounded-lg bg-[#3B82F6] text-white text-[14px] font-medium hover:bg-[#2563EB] transition-colors flex items-center justify-center gap-2"
              >
                <Download className="w-5 h-5" />
                Download
              </button>
            </div>
          )}

          <div className="mt-6 text-[12px] text-[rgba(255,255,255,0.55)]">
            Auto-mask uses ADE20K semantic segmentation; inpainting regenerates only masked areas.
          </div>
        </div>
      </div>
    </div>
  );
};


"use client";

import * as React from "react";
import { Upload, X, Loader2, Download, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

export const TestRenderUI: React.FC = () => {
  const [selectedImage, setSelectedImage] = React.useState<File | null>(null);
  const [imagePreview, setImagePreview] = React.useState<string | null>(null);
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [isResizing, setIsResizing] = React.useState(false);
  const [generatedImage, setGeneratedImage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [prompt, setPrompt] = React.useState<string>("");
  const [negativePrompt, setNegativePrompt] = React.useState<string>("");
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Default prompts - ARCHITECTURAL VISUALIZATION (NO BLUR)
  React.useEffect(() => {
    setPrompt(`architectural interior redesign, photorealistic kitchen renovation, professional architectural photography, everything in sharp focus, no depth of field, no cinematic lighting, straight vertical walls, clean geometry, realistic neutral lighting, ultra sharp details, technical precision, architectural documentation quality

CRITICAL GEOMETRY PRESERVATION - DO NOT CHANGE ROOM:
- PRESERVE EXACT room dimensions (width, depth, height) from input image
- PRESERVE EXACT wall positions - walls must be in identical locations
- PRESERVE EXACT ceiling height - do not raise or lower ceiling
- PRESERVE EXACT window placement - windows must be in identical positions
- PRESERVE EXACT camera position and perspective - same viewing angle
- PRESERVE EXACT room shape - do not change room boundaries
- PRESERVE EXACT floor area - room size must be identical
- PRESERVE EXACT spatial relationships - distances between walls unchanged
- DO NOT change: room width, room depth, room height, wall positions, window positions, door positions, camera angle, perspective, room proportions, spatial structure
- The output room MUST have identical geometry to input room

ONLY CHANGE ALLOWED - FURNITURE AND MATERIALS:
- CHANGE kitchen furniture: cabinets, island, countertops, appliances
- CHANGE table and chairs: different styles, different materials
- CHANGE materials: wall colors, floor materials, cabinet finishes
- CHANGE style: modern, traditional, minimalist (but keep same room)
- CHANGE decorative elements: lighting fixtures, accessories
- DO NOT change: room dimensions, wall positions, window positions, camera position

CRITICAL QUALITY REQUIREMENTS - ARCHITECTURAL VISUALIZATION:
- CRYSTAL CLEAR, SHARP, DETAILED - every detail must be visible and crisp
- NO blur, NO blurry areas, NO soft focus, NO out of focus - everything must be pin-sharp
- NO depth of field, NO bokeh, NO cinematic effects, NO artistic softness
- Sharp focus throughout entire image - foreground and background both sharp
- High detail level: visible textures on all surfaces (wood grain, fabric weave, metal reflections, marble veining)
- Professional architectural documentation quality with sharp focus
- Technical precision, architectural line precision, CAD visualization quality
- Hard lighting with crisp shadows for maximum sharpness
- Sharp edges on all objects, no soft edges or blur
- Flat, even illumination - no moody or cinematic lighting

CRITICAL CLEANUP REQUIREMENTS - REMOVE CLUTTER:
- REMOVE all dishes, plates, bowls, cups from countertops and tables
- REMOVE all boxes (pizza boxes, cardboard boxes, storage boxes) - completely eliminate them
- REMOVE all trash, garbage, waste items - clean everything up
- REMOVE all unnecessary items, clutter, and mess
- REMOVE items stored on top of cabinets
- The output image must be CLEAN and TIDY - no clutter, no dishes, no boxes, no trash
- Only keep essential, decorative items that enhance the design (e.g., tasteful flowers, fruit bowls, modern decor)
- Countertops must be clean and minimal
- Tables must be clean and minimal
- All surfaces must be decluttered

CRITICAL COLOR & MATERIAL REQUIREMENTS:
- FULL COLOR RGB image (NOT grayscale, NOT monochrome, NOT black and white)
- WALLS: Grey walls (medium grey tone, not light white/grey, not dark - elegant medium grey)
- KITCHEN: Ultra-modern kitchen design with marble elements
- MARBLE: Marble countertops, marble backsplash, or marble accents (white/grey marble with natural veining)
- CHAIRS: Luxurious chairs (premium design, high-quality materials) but keep them RED (same red color as original)
- Rich, vibrant colors throughout entire image
- Realistic material colors: marble textures, wood tones, fabric textures, metal finishes
- Realistic neutral lighting (NOT soft, NOT cinematic, NOT moody - flat, even, architectural lighting)
- Realistic flooring with natural wood grain colors or modern tiles
- Furniture with real textures and colors (fabric, leather, wood, metal, marble)
- Professional architectural photography style
- Ultra-detailed, high resolution, photorealistic architectural visualization

TRANSFORMATION RULES:
- Input image provides the exact layout - preserve it completely
- Transform input into full-color photorealistic render
- WALLS: Change to medium grey (elegant, modern grey tone)
- KITCHEN: Make it ultra-modern with marble countertops/backsplash
- CHAIRS: Upgrade to luxurious design but maintain RED color
- CLEAN UP: Remove all dishes, boxes, trash, clutter
- Optimize furniture arrangement for best flow while preserving room structure
- Output MUST look like a professional architectural visualization with preserved layout
- Ultra-modern interior design style
- Premium, luxurious furniture and finishes
- Grey walls with marble accents
- Natural materials and textures
- Professional architectural visualization quality
- Sharp architectural documentation quality
- Technical precision, no artistic effects, no blur`);

    setNegativePrompt(`layout change, room size change, room dimension change, changed room width, changed room depth, changed room height, moved walls, moved windows, moved doors, changed wall positions, changed window positions, changed door positions, changed camera angle, changed perspective, changed room proportions, changed spatial structure, different room, new room, fantasy room, imaginary room, room expansion, room contraction, wider room, narrower room, taller room, shorter room, different ceiling height, different floor area, different room shape, different room boundaries, different spatial relationships, different distances, different proportions, architectural changes, structural changes, geometry changes, spatial changes, room redesign that changes dimensions, room redesign that changes layout, room redesign that changes structure, blur, blurry, blurred, depth of field, DOF, bokeh, haze, fog, dreamy, cinematic, film grain, vignette, tilt-shift, motion blur, painterly, illustration, concept art, soft focus, out of focus, unfocused, fuzzy, hazy, misty, soft edges, smooth edges, soft lighting, diffuse lighting, romantic lighting, moody lighting, artistic, post-processing, color grading, film look, cinematic look, dreamy atmosphere, soft atmosphere, hazy atmosphere, foggy, misty, soft shadows, smooth shadows, depth blur, background blur, foreground blur, selective focus, shallow depth of field, narrow depth of field, soft focus photography, portrait mode, beauty mode, Instagram filter, vintage filter, film photography, analog photography, soft image, low contrast, desaturated, washed out, faded, vintage, retro, nostalgic, artistic rendering, stylized, painterly style, illustration style, concept art style, 3D render style, CGI look, computer graphics, video game graphics, cartoon, anime, stylized art, artistic interpretation, creative interpretation, soft interpretation, dreamy interpretation, hazy interpretation, misty interpretation, foggy interpretation, cinematic interpretation, film-like interpretation, artistic photography, soft photography, dreamy photography, hazy photography, misty photography, foggy photography, cinematic photography, film photography, artistic style, soft style, dreamy style, hazy style, misty style, foggy style, cinematic style, film style, floorplan, blueprint, sketch, technical drawing, black and white, grayscale, desaturated, colorless, achromatic, single color, monotone, line art, edges, outlines, white background, black background, dishes, plates, bowls, cups, boxes, cardboard boxes, pizza boxes, trash, garbage, waste, clutter, mess, items on countertops, items on tables, items stored on cabinets, dirty surfaces, unorganized items`);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith("image/")) {
        setError("Please select an image file");
        return;
      }
      setSelectedImage(file);
      setError(null);
      setGeneratedImage(null);
      
      // Create preview
      const reader = new FileReader();
      reader.onload = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) {
      setSelectedImage(file);
      setError(null);
      setGeneratedImage(null);
      
      const reader = new FileReader();
      reader.onload = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const removeImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
    setGeneratedImage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Auto-resize image function - optimizes to ~9.5MB max
  // SDXL model works in latent space but still needs to load full image into GPU memory
  // Larger images = more VRAM needed, which causes CUDA out of memory errors
  const resizeImage = (file: File, maxWidth: number = 1920, maxHeight: number = 1920, targetSizeMB: number = 9.5): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const targetSizeBytes = targetSizeMB * 1024 * 1024;
          
          // Calculate new dimensions while maintaining aspect ratio
          let width = img.width;
          let height = img.height;

          // First, resize if dimensions are too large
          if (width > maxWidth || height > maxHeight) {
            if (width > height) {
              height = (height * maxWidth) / width;
              width = maxWidth;
            } else {
              width = (width * maxHeight) / height;
              height = maxHeight;
            }
          }

          // Create canvas
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          
          if (!ctx) {
            reject(new Error("Could not create canvas context"));
            return;
          }

          // Iterative optimization: try different quality levels until we're under target size
          const tryCompress = (w: number, h: number, q: number): string => {
            canvas.width = w;
            canvas.height = h;
            ctx.drawImage(img, 0, 0, w, h);
            return canvas.toDataURL("image/jpeg", q);
          };

          // Start with initial dimensions and quality
          let currentWidth = width;
          let currentHeight = height;
          let quality = 0.85;
          let result = tryCompress(currentWidth, currentHeight, quality);
          
          // If too large, iteratively reduce quality
          while (result.length > targetSizeBytes && quality > 0.5) {
            quality -= 0.05;
            result = tryCompress(currentWidth, currentHeight, quality);
          }

          // If still too large, reduce dimensions
          if (result.length > targetSizeBytes) {
            let scale = 0.9;
            while (result.length > targetSizeBytes && scale > 0.5) {
              currentWidth = Math.floor(width * scale);
              currentHeight = Math.floor(height * scale);
              quality = 0.75; // Reset quality when reducing dimensions
              result = tryCompress(currentWidth, currentHeight, quality);
              
              // If still too large, reduce quality further
              while (result.length > targetSizeBytes && quality > 0.5) {
                quality -= 0.05;
                result = tryCompress(currentWidth, currentHeight, quality);
              }
              scale -= 0.1;
            }
          }

          const finalSizeMB = (result.length * 3) / 4 / 1024 / 1024;
          console.log(`Image optimized: ${finalSizeMB.toFixed(2)} MB (target: ${targetSizeMB} MB)`);
          
          resolve(result);
        };
        img.onerror = () => reject(new Error("Failed to load image"));
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });
  };

  const handleGenerate = async () => {
    if (!selectedImage) {
      setError("Please select an image first");
      return;
    }

    setIsGenerating(true);
    setIsResizing(true);
    setError(null);
    setGeneratedImage(null);

    try {
      // Auto-resize image if needed - optimizes to ~9.5MB max
      // SDXL loads full image into GPU memory, so we need to keep it small
      const originalSizeMB = (selectedImage.size / 1024 / 1024).toFixed(2);
      console.log(`Original image size: ${originalSizeMB} MB`);
      
      // If image is larger than 10MB, resize it to ~9.5MB
      const targetSizeMB = parseFloat(originalSizeMB) > 10 ? 9.5 : undefined;
      const imageBase64 = await resizeImage(selectedImage, 1920, 1920, targetSizeMB || 9.5);
      setIsResizing(false);
      
      const resizedSizeMB = ((imageBase64.length * 3) / 4 / 1024 / 1024).toFixed(2);
      console.log(`Optimized image size: ${resizedSizeMB} MB`);
      
      if (parseFloat(originalSizeMB) > 10) {
        console.log(`Image automatically optimized from ${originalSizeMB} MB to ${resizedSizeMB} MB`);
      }

      // Call API
      const response = await fetch("/api/test-render", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          image: imageBase64,
          prompt: prompt,
          negativePrompt: negativePrompt,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to generate image");
      }

      const data = await response.json();
      setGeneratedImage(data.imageUrl);
    } catch (err: any) {
      console.error("Error generating image:", err);
      setError(err.message || "Failed to generate image. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = () => {
    if (generatedImage) {
      const link = document.createElement("a");
      link.href = generatedImage;
      link.download = `renovated-room-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleReset = () => {
    setSelectedImage(null);
    setImagePreview(null);
    setGeneratedImage(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="min-h-screen bg-[#0D0D0F] py-8 px-4 md:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">
            Test Room Renovation Render
          </h1>
          <p className="text-[rgba(255,255,255,0.60)]">
            Upload a room image and generate a renovated version. Layout (doors, windows, walls) will be preserved.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column: Input & Controls */}
          <div className="space-y-6">
            {/* Image Upload */}
            <div>
              <label className="block text-sm font-medium text-white mb-3">
                Upload Room Image
              </label>
              {!imagePreview ? (
                <div
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    "relative",
                    "border-2 border-dashed rounded-[16px]",
                    "p-12",
                    "text-center",
                    "cursor-pointer",
                    "transition-all",
                    "border-[rgba(255,255,255,0.15)] bg-[rgba(255,255,255,0.02)]",
                    "hover:border-[rgba(255,255,255,0.25)] hover:bg-[rgba(255,255,255,0.04)]"
                  )}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <Upload className="w-12 h-12 mx-auto mb-4 text-[rgba(255,255,255,0.40)]" />
                  <div className="text-[16px] font-medium text-white mb-2">
                    Drop image here or click to upload
                  </div>
                  <div className="text-[14px] text-[rgba(255,255,255,0.50)]">
                    PNG, JPEG, WebP supported
                  </div>
                </div>
              ) : (
                <div className="relative">
                  <img
                    src={imagePreview}
                    alt="Preview"
                    className="w-full h-auto rounded-[16px] border border-[rgba(255,255,255,0.08)]"
                  />
                  <button
                    onClick={removeImage}
                    className="absolute top-4 right-4 p-2 bg-black/50 rounded-full hover:bg-black/70 transition-colors"
                  >
                    <X className="w-5 h-5 text-white" />
                  </button>
                </div>
              )}
            </div>

            {/* Prompts */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Prompt (editable)
                </label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={12}
                  className={cn(
                    "w-full px-4 py-3 rounded-lg",
                    "bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.08)]",
                    "text-white text-sm",
                    "focus:outline-none focus:border-[#3B82F6]",
                    "resize-none font-mono"
                  )}
                  placeholder="Enter your prompt..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Negative Prompt (editable)
                </label>
                <textarea
                  value={negativePrompt}
                  onChange={(e) => setNegativePrompt(e.target.value)}
                  rows={4}
                  className={cn(
                    "w-full px-4 py-3 rounded-lg",
                    "bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.08)]",
                    "text-white text-sm",
                    "focus:outline-none focus:border-[#3B82F6]",
                    "resize-none font-mono"
                  )}
                  placeholder="Enter negative prompt..."
                />
              </div>
            </div>

            {/* Generate Button */}
            <button
              onClick={handleGenerate}
              disabled={!selectedImage || isGenerating}
              className={cn(
                "w-full px-6 py-4 rounded-lg",
                "bg-[#3B82F6] text-white font-medium",
                "hover:bg-[#2563EB] transition-colors",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                "flex items-center justify-center gap-2"
              )}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>{isResizing ? "Optimizing image..." : "Generating..."}</span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-5 h-5" />
                  <span>Generate Renovated Room</span>
                </>
              )}
            </button>
            
            {/* Info about auto-resize */}
            {selectedImage && (
              <div className="p-3 rounded-lg bg-[rgba(59,130,246,0.10)] border border-[rgba(59,130,246,0.20)]">
                <p className="text-xs text-[rgba(255,255,255,0.70)] mb-2">
                  ℹ️ <strong>Auto-optimization:</strong> Images larger than 10MB will be automatically resized to ~9.5MB.
                </p>
                <p className="text-xs text-[rgba(255,255,255,0.50)]">
                  SDXL AI model loads full image into GPU memory. Larger images require more VRAM and can cause "out of memory" errors.
                </p>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            {/* Reset Button */}
            {generatedImage && (
              <button
                onClick={handleReset}
                className="w-full px-6 py-3 rounded-lg border border-[rgba(255,255,255,0.15)] text-white font-medium hover:bg-[rgba(255,255,255,0.05)] transition-colors"
              >
                Reset & Try Another
              </button>
            )}
          </div>

          {/* Right Column: Result */}
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-white mb-3">
                Generated Result
              </label>
              {isGenerating ? (
                <div className="w-full aspect-video rounded-[16px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] flex items-center justify-center">
                  <div className="text-center">
                    <Loader2 className="w-12 h-12 mx-auto mb-4 text-[#3B82F6] animate-spin" />
                    <p className="text-[rgba(255,255,255,0.60)]">
                      Generating renovated room...
                    </p>
                    <p className="text-sm text-[rgba(255,255,255,0.40)] mt-2">
                      This may take 10-30 seconds
                    </p>
                  </div>
                </div>
              ) : generatedImage ? (
                <div className="space-y-4">
                  <div className="relative">
                    <img
                      src={generatedImage}
                      alt="Generated"
                      className="w-full h-auto rounded-[16px] border border-[rgba(255,255,255,0.08)]"
                      style={{ imageRendering: "crisp-edges" }}
                    />
                  </div>
                  <button
                    onClick={handleDownload}
                    className="w-full px-6 py-3 rounded-lg bg-[#3B82F6] text-white font-medium hover:bg-[#2563EB] transition-colors flex items-center justify-center gap-2"
                  >
                    <Download className="w-5 h-5" />
                    <span>Download Result</span>
                  </button>
                </div>
              ) : (
                <div className="w-full aspect-video rounded-[16px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] flex items-center justify-center">
                  <div className="text-center">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[rgba(255,255,255,0.05)] flex items-center justify-center">
                      <Upload className="w-8 h-8 text-[rgba(255,255,255,0.30)]" />
                    </div>
                    <p className="text-[rgba(255,255,255,0.60)]">
                      Generated image will appear here
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Info Box */}
            <div className="p-4 rounded-lg bg-[rgba(59,130,246,0.10)] border border-[rgba(59,130,246,0.20)]">
              <h3 className="text-sm font-medium text-white mb-2">
                What will be preserved:
              </h3>
              <ul className="text-xs text-[rgba(255,255,255,0.70)] space-y-1">
                <li>✓ Door positions and sizes</li>
                <li>✓ Window positions and sizes</li>
                <li>✓ Wall positions and room width</li>
                <li>✓ Room structure and proportions</li>
                <li>✓ Camera angle</li>
              </ul>
              <h3 className="text-sm font-medium text-white mt-4 mb-2">
                What will change:
              </h3>
              <ul className="text-xs text-[rgba(255,255,255,0.70)] space-y-1">
                <li>✓ Furniture styles and colors</li>
                <li>✓ Wall colors</li>
                <li>✓ Decorations and lighting</li>
                <li>✓ Materials and textures</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};


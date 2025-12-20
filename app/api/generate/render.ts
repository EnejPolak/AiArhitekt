/**
 * ============================================
 * RENDER MODULE (Replicate)
 * ============================================
 * 
 * Responsibility: Generate interior render image.
 * 
 * RULES:
 * - Replicate ONLY renders images
 * - No style decisions here
 */

import Replicate from "replicate";

const REPLICATE_MODEL = "sdxl-based/realvisxl-v3-multi-controlnet-lora:90a4a3604cd637cb9f1a2bdae1cfa9ed869362ca028814cdce310a78e27daade";

export interface RenderInput {
  image: string; // base64 data URL or URL
  prompt: string;
  negativePrompt: string;
}

/**
 * Generates render using Replicate
 */
export async function generateRender(
  input: RenderInput,
  apiToken: string
): Promise<string> {
  if (!apiToken) {
    throw new Error("Replicate API token is required");
  }

  const replicate = new Replicate({
    auth: apiToken,
  });

  // Prepare image - upload to Replicate Files API for ControlNet models
  let imageInput: string;
  
  if (input.image.startsWith("http")) {
    // Already a URL, use directly
    imageInput = input.image;
    console.log("[RENDER] Using existing image URL:", imageInput);
  } else {
    // Extract base64 data
    let base64Data: string;
    let mimeType = "image/png";
    
    if (input.image.startsWith("data:")) {
      const match = input.image.match(/data:([^;]+);base64,(.+)/);
      if (match) {
        mimeType = match[1];
        base64Data = match[2];
      } else {
        base64Data = input.image.split(",")[1];
      }
    } else {
      base64Data = input.image;
    }
    
    const imageBuffer = Buffer.from(base64Data, "base64");
    console.log("[RENDER] Image size:", imageBuffer.length, "bytes");
    
    // Upload to Replicate Files API using multipart/form-data
    try {
      console.log("[RENDER] Uploading image to Replicate Files API...");
      console.log("[RENDER] Buffer size:", imageBuffer.length, "bytes");
      console.log("[RENDER] MIME type:", mimeType);
      
      // Create multipart/form-data manually
      const boundary = `----WebKitFormBoundary${Math.random().toString(36).substring(2)}`;
      const formDataParts: string[] = [];
      
      // Add file content
      formDataParts.push(`--${boundary}`);
      formDataParts.push(`Content-Disposition: form-data; name="content"; filename="floorplan.png"`);
      formDataParts.push(`Content-Type: ${mimeType}`);
      formDataParts.push("");
      
      // Combine parts
      const headerBuffer = Buffer.from(formDataParts.join("\r\n") + "\r\n");
      const footerBuffer = Buffer.from(`\r\n--${boundary}--\r\n`);
      const fullBuffer = Buffer.concat([headerBuffer, imageBuffer, footerBuffer]);
      
      const uploadResponse = await fetch("https://api.replicate.com/v1/files", {
        method: "POST",
        headers: {
          Authorization: `Token ${apiToken}`,
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
        },
        body: fullBuffer,
      });
      
      console.log("[RENDER] Upload response status:", uploadResponse.status);
      
      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        console.error("[RENDER] Upload failed response:", errorText);
        throw new Error(`Upload failed: ${uploadResponse.status} ${errorText}`);
      }
      
      const uploadData = await uploadResponse.json();
      console.log("[RENDER] Upload response data:", JSON.stringify(uploadData, null, 2));
      
      // Try different possible URL fields
      imageInput = uploadData.urls?.get || uploadData.urls?.download || uploadData.url || uploadData.urls;
      
      if (!imageInput || typeof imageInput !== "string") {
        console.error("[RENDER] No valid URL found in upload response:", uploadData);
        throw new Error("No URL returned from Replicate Files API");
      }
      
      console.log("[RENDER] ✅ Image uploaded successfully to:", imageInput);
    } catch (uploadError: any) {
      console.error("[RENDER] ❌ Upload error:", uploadError.message);
      console.error("[RENDER] Upload error stack:", uploadError.stack);
      
      // Fallback: try data URI (might work for smaller files)
      const dataUri = input.image.startsWith("data:") 
        ? input.image 
        : `data:${mimeType};base64,${base64Data}`;
      
      console.log("[RENDER] ⚠️ Fallback: using data URI (may not work for ControlNet)");
      imageInput = dataUri;
    }
  }

  console.log("[RENDER] Generating render with Replicate...");
  console.log("[RENDER] Image input type:", typeof imageInput);
  console.log("[RENDER] Image input preview:", imageInput.substring(0, 150) + "...");
  console.log("[RENDER] Image input is URL:", imageInput.startsWith("http"));
  console.log("[RENDER] Image input is data URI:", imageInput.startsWith("data:"));

  // CRITICAL: Enhance prompt to preserve layout but change furniture and colors
  // The input image shows the exact layout - preserve it, change only furniture and wall colors
  const enhancedPrompt = `photorealistic interior design, full color RGB image, realistic interior photography, ${input.prompt}

CRITICAL LAYOUT PRESERVATION:
- PRESERVE the exact room layout and spatial arrangement from the input image
- KEEP the same furniture positions, room proportions, and spatial structure
- MAINTAIN the same camera angle and perspective
- KEEP the same room shape, windows, doors, and architectural elements
- ONLY CHANGE: furniture styles (bed, chair), wall colors, and decorative elements
- The layout must be IDENTICAL to the input image

CRITICAL COLOR REQUIREMENTS:
- FULL COLOR RGB image (NOT grayscale, NOT monochrome, NOT black and white)
- Rich, vibrant colors throughout entire image
- Realistic material colors: wood tones, fabric textures, metal finishes
- Natural lighting with warm color temperature (3000-4000K)
- CHANGE wall colors to different colors (not the same as input)
- CHANGE bed to a different style (different design, different color)
- CHANGE chair to a different style (different design, different color)
- Realistic flooring with natural wood grain colors or colored tiles
- Furniture with real textures and colors (fabric, leather, wood, metal)
- Visible light temperature and color grading
- Professional interior photography style
- Ultra-detailed, high resolution, 4k quality

TRANSFORMATION RULES:
- Input image provides the exact layout - preserve it completely
- Transform monochrome/grayscale input into full-color photorealistic render
- Change furniture styles and wall colors while keeping exact positions
- Output MUST look like a real, colored interior photograph with preserved layout`;

  // CRITICAL: Enhance negative prompt to prevent black and white AND floorplan interpretation
  const enhancedNegativePrompt = `${input.negativePrompt}, grayscale, desaturated, colorless, achromatic, single color, monotone, floorplan, floor plan, white edges, black background, technical drawing style`;

  // Prepare input - CRITICAL: Use img2img WITHOUT ControlNet for FULL COLOR output
  // ControlNet (depth/edge) generates grayscale depth maps - we need direct img2img for color
  // Image is used as reference - preserve layout, change furniture and colors
  const replicateInput: any = {
    prompt: enhancedPrompt,
    image: imageInput, // Direct img2img - image as reference, preserve layout
    negative_prompt: enhancedNegativePrompt,
    prompt_strength: 0.55, // Lower strength to PRESERVE layout while allowing furniture/color changes
    guidance_scale: 8.5, // High guidance for strong prompt adherence
    num_inference_steps: 40, // More steps for better quality and color accuracy
    lora_scale: 0.8,
    controlnet_1: "none", // CRITICAL: Explicitly disable ControlNet to avoid grayscale depth maps
    // NO ControlNet = FULL COLOR RGB output, not grayscale
    // Lower prompt_strength = better layout preservation
  };
  
  console.log("[RENDER] Enhanced prompt (first 200 chars):", enhancedPrompt.substring(0, 200));
  console.log("[RENDER] Enhanced negative prompt:", enhancedNegativePrompt);

  console.log("[RENDER] Replicate input prepared, calling replicate.run()...");

  const output = await replicate.run(REPLICATE_MODEL, {
    input: replicateInput,
  });

  // Extract URL from output
  const extractUrl = (val: unknown): string | null => {
    if (typeof val === "string") return val;
    if (val && typeof val === "object") {
      const anyVal = val as any;
      if (typeof anyVal.url === "function") return anyVal.url();
      if (typeof anyVal.url === "string") return anyVal.url;
    }
    return null;
  };

  const imageUrl = Array.isArray(output) ? extractUrl(output[0]) : extractUrl(output);

  if (!imageUrl) {
    throw new Error("No image generated from Replicate");
  }

  console.log("[RENDER] Render generated successfully");
  return imageUrl;
}

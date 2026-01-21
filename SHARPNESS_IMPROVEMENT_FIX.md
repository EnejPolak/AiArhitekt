# SHARPNESS IMPROVEMENT FIX - Architectural Visualization

## 1. ROOT CAUSES OF SLIGHT BLURRINESS

**Primary Issues:**
1. **CFG Scale Too High (12.0)** → Causes over-stylization, soft edges, reduced detail
2. **No Explicit Resolution** → Model defaults to lower resolution (1024x1024 or less)
3. **Prompt Strength Slightly High (0.52)** → Reduces preservation of real input detail
4. **Missing High-Frequency Detail Terms** → Prompt doesn't explicitly demand crisp edges

**Secondary Issues:**
- Frontend resizes input to 1920x1920 but output resolution not enforced
- No explicit sharpness parameters in prompt

---

## 2. EXACT PARAMETER CHANGES

### CURRENT (Suboptimal):
```javascript
{
  prompt_strength: 0.52,      // Slightly high - reduces real detail preservation
  guidance_scale: 12.0,       // TOO HIGH - causes softness and stylization
  num_inference_steps: 50,    // ✅ Good
  // No width/height specified → defaults to low resolution
}
```

### FIXED (Optimal):
```javascript
{
  prompt_strength: 0.48,      // 0.48-0.50 preserves more real detail while allowing redesign
  guidance_scale: 8.5,        // 7.5-9.0 optimal for architectural renders (was 12.0)
  num_inference_steps: 50,    // ✅ Keep (maximum detail refinement)
  width: 1536,                // High resolution for crisp details
  height: 1024,               // Kitchen aspect ratio (or match input aspect)
  sizing_strategy: "input_image", // Preserve input aspect ratio
}
```

**Why These Changes:**
- **prompt_strength: 0.48** → Preserves 52% of real input detail (more sharpness from source)
- **guidance_scale: 8.5** → Reduces stylization, maintains crisp edges, architectural quality
- **width: 1536, height: 1024** → Higher resolution = more pixels = sharper details
- **sizing_strategy: "input_image"** → Preserves aspect ratio, prevents distortion

---

## 3. IMPROVED FINAL POSITIVE PROMPT

```
architectural interior redesign, photorealistic kitchen renovation, professional architectural photography, ultra high resolution, 4K quality, everything in sharp focus, no depth of field, no cinematic lighting, straight vertical walls, clean geometry, realistic neutral lighting, ultra sharp details, technical precision, architectural documentation quality, crisp edges, hard edges, sharp edges, high-frequency detail, fine detail, micro detail, visible texture detail, sharp textures, crisp textures, hard textures, sharp wood grain, crisp wood grain, sharp fabric weave, crisp fabric weave, sharp metal edges, crisp metal edges, sharp marble veining, crisp marble veining, sharp reflections, crisp reflections, hard shadows, crisp shadows, sharp shadows, no soft edges, no smooth edges, no blurred edges, no anti-aliasing artifacts, pixel-perfect edges, razor-sharp focus, pin-sharp focus, maximum sharpness, crystal clear, ultra-detailed, high-frequency detail, fine detail, micro detail, professional architectural documentation quality, technical rendering, CAD visualization quality, architectural line precision, sharp architectural visualization, technical interior documentation, sharp professional photography, no artistic effects, no post-processing blur, no depth of field blur, sharp architectural render, professional interior photography, sharp focus, everything sharp, pin-sharp, razor-sharp, ultra-sharp, crystal clear, maximum sharpness, sharp architectural visualization, high-resolution rendering, 4K rendering, 8K rendering, ultra-high resolution, maximum detail level, fine detail level, micro detail level, visible texture detail, sharp texture detail, crisp texture detail, hard texture detail, sharp material detail, crisp material detail, hard material detail, sharp surface detail, crisp surface detail, hard surface detail, sharp edge detail, crisp edge detail, hard edge detail, sharp corner detail, crisp corner detail, hard corner detail, sharp line detail, crisp line detail, hard line detail, sharp geometric detail, crisp geometric detail, hard geometric detail, sharp architectural detail, crisp architectural detail, hard architectural detail, sharp interior detail, crisp interior detail, hard interior detail, sharp furniture detail, crisp furniture detail, hard furniture detail, sharp cabinet detail, crisp cabinet detail, hard cabinet detail, sharp countertop detail, crisp countertop detail, hard countertop detail, sharp appliance detail, crisp appliance detail, hard appliance detail, sharp lighting detail, crisp lighting detail, hard lighting detail, sharp shadow detail, crisp shadow detail, hard shadow detail, sharp reflection detail, crisp reflection detail, hard reflection detail, sharp material detail, crisp material detail, hard material detail, sharp texture detail, crisp texture detail, hard texture detail, sharp surface detail, crisp surface detail, hard surface detail, sharp edge detail, crisp edge detail, hard edge detail, sharp corner detail, crisp corner detail, hard corner detail, sharp line detail, crisp line detail, hard line detail, sharp geometric detail, crisp geometric detail, hard geometric detail, sharp architectural detail, crisp architectural detail, hard architectural detail, sharp interior detail, crisp interior detail, hard interior detail, sharp furniture detail, crisp furniture detail, hard furniture detail, sharp cabinet detail, crisp cabinet detail, hard cabinet detail, sharp countertop detail, crisp countertop detail, hard countertop detail, sharp appliance detail, crisp appliance detail, hard appliance detail, sharp lighting detail, crisp lighting detail, hard lighting detail, sharp shadow detail, crisp shadow detail, hard shadow detail, sharp reflection detail, crisp reflection detail, hard reflection detail

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

CRITICAL SHARPNESS REQUIREMENTS - ARCHITECTURAL VISUALIZATION:
- ULTRA HIGH RESOLUTION: 4K quality, maximum detail level, fine detail level, micro detail level
- CRISP EDGES: sharp edges, crisp edges, hard edges, no soft edges, no smooth edges, no blurred edges
- HIGH-FREQUENCY DETAIL: visible texture detail, sharp textures, crisp textures, hard textures
- PIN-SHARP FOCUS: razor-sharp focus, pin-sharp focus, maximum sharpness, crystal clear
- NO SOFTNESS: no soft edges, no smooth edges, no blurred edges, no anti-aliasing artifacts
- PIXEL-PERFECT: pixel-perfect edges, razor-sharp focus, pin-sharp focus, maximum sharpness
- MATERIAL DETAIL: sharp wood grain, crisp wood grain, sharp fabric weave, crisp fabric weave, sharp metal edges, crisp metal edges, sharp marble veining, crisp marble veining
- SHADOW DETAIL: hard shadows, crisp shadows, sharp shadows, no soft shadows, no smooth shadows
- REFLECTION DETAIL: sharp reflections, crisp reflections, hard reflections, no soft reflections
- TECHNICAL PRECISION: architectural line precision, CAD visualization quality, technical rendering

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
```

---

## 4. IMPROVED FINAL NEGATIVE PROMPT

```
soft edges, smooth edges, blurred edges, anti-aliasing artifacts, pixelated edges, jagged edges, aliased edges, soft focus, smooth focus, blurred focus, out of focus, unfocused, fuzzy, hazy, misty, soft textures, smooth textures, blurred textures, soft shadows, smooth shadows, blurred shadows, soft reflections, smooth reflections, blurred reflections, soft materials, smooth materials, blurred materials, soft surfaces, smooth surfaces, blurred surfaces, soft details, smooth details, blurred details, soft lines, smooth lines, blurred lines, soft corners, smooth corners, blurred corners, soft geometry, smooth geometry, blurred geometry, soft architecture, smooth architecture, blurred architecture, soft interior, smooth interior, blurred interior, soft furniture, smooth furniture, blurred furniture, soft cabinets, smooth cabinets, blurred cabinets, soft countertops, smooth countertops, blurred countertops, soft appliances, smooth appliances, blurred appliances, soft lighting, smooth lighting, blurred lighting, soft shadows, smooth shadows, blurred shadows, soft reflections, smooth reflections, blurred reflections, layout change, room size change, room dimension change, changed room width, changed room depth, changed room height, moved walls, moved windows, moved doors, changed wall positions, changed window positions, changed door positions, changed camera angle, changed perspective, changed room proportions, changed spatial structure, different room, new room, fantasy room, imaginary room, room expansion, room contraction, wider room, narrower room, taller room, shorter room, different ceiling height, different floor area, different room shape, different room boundaries, different spatial relationships, different distances, different proportions, architectural changes, structural changes, geometry changes, spatial changes, room redesign that changes dimensions, room redesign that changes layout, room redesign that changes structure, blur, blurry, blurred, depth of field, DOF, bokeh, haze, fog, dreamy, cinematic, film grain, vignette, tilt-shift, motion blur, painterly, illustration, concept art, soft focus, out of focus, unfocused, fuzzy, hazy, misty, soft edges, smooth edges, soft lighting, diffuse lighting, romantic lighting, moody lighting, artistic, post-processing, color grading, film look, cinematic look, dreamy atmosphere, soft atmosphere, hazy atmosphere, foggy, misty, soft shadows, smooth shadows, depth blur, background blur, foreground blur, selective focus, shallow depth of field, narrow depth of field, soft focus photography, portrait mode, beauty mode, Instagram filter, vintage filter, film photography, analog photography, soft image, low contrast, desaturated, washed out, faded, vintage, retro, nostalgic, artistic rendering, stylized, painterly style, illustration style, concept art style, 3D render style, CGI look, computer graphics, video game graphics, cartoon, anime, stylized art, artistic interpretation, creative interpretation, soft interpretation, dreamy interpretation, hazy interpretation, misty interpretation, foggy interpretation, cinematic interpretation, film-like interpretation, artistic photography, soft photography, dreamy photography, hazy photography, misty photography, foggy photography, cinematic photography, film photography, artistic style, soft style, dreamy style, hazy style, misty style, foggy style, cinematic style, film style, floorplan, blueprint, sketch, technical drawing, black and white, grayscale, desaturated, colorless, achromatic, single color, monotone, line art, edges, outlines, white background, black background, dishes, plates, bowls, cups, boxes, cardboard boxes, pizza boxes, trash, garbage, waste, clutter, mess, items on countertops, items on tables, items stored on cabinets, dirty surfaces, unorganized items
```

---

## 5. RECOMMENDED REPLICATE SETTINGS

```javascript
const replicateInput = {
  prompt: "[IMPROVED PROMPT FROM SECTION 3]",
  image: inputImage,
  negative_prompt: "[IMPROVED NEGATIVE PROMPT FROM SECTION 4]",
  
  // CRITICAL: Geometry preservation
  prompt_strength: 0.48,              // Reduced from 0.52 (preserves more real detail)
  guidance_scale: 8.5,                // Reduced from 12.0 (prevents softness)
  num_inference_steps: 50,            // Keep (maximum detail refinement)
  
  // CRITICAL: High resolution for sharpness
  width: 1536,                        // High resolution (was: not specified)
  height: 1024,                       // Kitchen aspect ratio (was: not specified)
  sizing_strategy: "input_image",     // Preserve input aspect ratio
  
  // ControlNet DEPTH
  controlnet_1: "depth_midas",
  controlnet_1_image: inputImage,
  controlnet_1_conditioning_scale: 1.0,
  
  // RealVisXL specific
  lora_scale: 0.8,
  scheduler: "DPMSolverMultistep",
  num_outputs: 1,
};
```

---

## 6. OPTIONAL UPSCALE STEP (POST-PROCESSING)

**Recommendation:** Use Real-ESRGAN 4x or similar AI upscaler AFTER generation.

**Why:**
- Upscaling 1536x1024 → 6144x4096 improves perceived sharpness
- AI upscalers add high-frequency detail without changing geometry
- Can be done client-side or via Replicate upscale API

**Implementation:**
```javascript
// After getting final image from Replicate
const upscaledImage = await upscaleWithRealESRGAN(imageUrl, {
  scale: 2, // 2x upscale (1536x1024 → 3072x2048)
  // OR scale: 4 for 4x upscale
});
```

**Important:**
- Upscaling does NOT change geometry (only adds detail)
- Upscaling improves perceived sharpness significantly
- Can be optional (user choice) or automatic

---

## SUMMARY OF CHANGES

1. ✅ **CFG Scale:** 12.0 → 8.5 (reduces softness)
2. ✅ **Prompt Strength:** 0.52 → 0.48 (preserves more real detail)
3. ✅ **Resolution:** Not specified → 1536x1024 (higher resolution = sharper)
4. ✅ **Prompt:** Added explicit sharpness terms (crisp edges, high-frequency detail)
5. ✅ **Negative Prompt:** Added softness prohibition terms
6. ✅ **Sizing Strategy:** Added to preserve aspect ratio

---

## EXPECTED RESULT

- ✅ Crisp, architectural quality (not soft or cinematic)
- ✅ Sharp edges on all objects
- ✅ High-frequency detail visible
- ✅ Professional documentation quality
- ✅ Geometry still preserved
- ✅ Redesign still happens

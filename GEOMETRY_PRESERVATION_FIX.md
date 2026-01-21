# GEOMETRY PRESERVATION FIX - Architectural Redesign

## CRITICAL ISSUES IDENTIFIED:

### 1. **CONTROLNET DISABLED** ❌
- **Current:** `controlnet_1: "none"`
- **Problem:** Without ControlNet, the model has NO spatial constraints
- **Result:** AI creates a new room instead of redesigning the existing one
- **Fix:** Enable ControlNet DEPTH with weight 1.0

### 2. **PROMPT_STRENGTH TOO HIGH** ❌
- **Current:** `prompt_strength: 0.7`
- **Problem:** 0.7 allows 70% change → room geometry changes
- **Optimal for interior redesign:** 0.5-0.55
- **Fix:** Reduce to 0.52 (preserves geometry, allows furniture changes)

### 3. **NO EXPLICIT GEOMETRY COMMANDS IN PROMPT** ❌
- **Current:** Generic "preserve layout" language
- **Problem:** Not strong enough for SDXL
- **Fix:** Add explicit "DO NOT CHANGE ROOM DIMENSIONS" commands

### 4. **RESOLUTION NOT ENFORCED** ❌
- **Problem:** Low resolution causes spatial drift
- **Minimum:** 1024x1024 (SDXL native)
- **Optimal:** 1024x1024 or 1024x768 (kitchen aspect)

### 5. **MULTIPLE CONTROLNETS NOT NEEDED** ✅
- **Rule:** Use ONLY ONE ControlNet (DEPTH)
- **Why:** Multiple ControlNets conflict and break geometry
- **Fix:** `controlnet_1: "depth"` with `controlnet_1_weight: 1.0`

---

## DENOISE / STRENGTH EXPLANATION:

### If denoise > 0.7:
- **Why AI changes room:** High denoise (0.7+) allows 70%+ of the image to be regenerated
- **Result:** Walls, ceiling, windows get repositioned
- **For interior redesign:** MUST be 0.5-0.55

### If denoise < 0.5:
- **Why nothing changes:** Low denoise (0.4-0.5) preserves too much of input
- **Result:** Furniture doesn't change, only colors shift slightly
- **For interior redesign:** 0.52 is optimal (52% change = furniture only)

### OPTIMAL RANGE FOR INTERIOR REDESIGN:
- **Exact value:** `prompt_strength: 0.52`
- **Why:** 
  - Preserves 48% of input (geometry, walls, windows, camera)
  - Changes 52% (furniture, materials, colors, style)
  - Perfect balance for TRUE REDESIGN

---

## RESOLUTION RULES:

### Why low resolution causes spatial drift:
- SDXL trained on 1024x1024
- Below 1024px: model struggles with spatial relationships
- Result: walls shift, perspective changes, room size changes

### Recommended resolutions for kitchen redesign:
- **Minimum:** 1024x1024 (square)
- **Optimal:** 1024x768 (kitchen aspect ratio)
- **Maximum:** 1536x1024 (if memory allows)

### Enforcement:
- Frontend must resize to minimum 1024px on longest edge
- Backend validates resolution before API call

---

## CONTROLNET CONFIGURATION:

### Single ControlNet DEPTH:
```javascript
{
  controlnet_1: "depth",              // DEPTH for photo-based redesigns
  controlnet_1_weight: 1.0,            // 0.9-1.1 range (1.0 = strict)
  controlnet_1_conditioning_scale: 1.0, // Full conditioning
}
```

### Why DEPTH (not edge/canny):
- **DEPTH:** Preserves 3D spatial structure (walls, ceiling, floor depth)
- **EDGE/CANNY:** Only preserves 2D outlines (can still change room size)
- **For photos:** DEPTH is mandatory

### Why NOT multiple ControlNets:
- Multiple ControlNets create conflicting constraints
- Model tries to satisfy both → geometry breaks
- Single DEPTH ControlNet is sufficient

---

## FINAL PRODUCTION-READY PROMPT:

```
architectural interior redesign, photorealistic kitchen renovation, professional architectural photography, everything in sharp focus, no depth of field, no cinematic lighting, straight vertical walls, clean geometry, realistic neutral lighting, ultra sharp details, technical precision, architectural documentation quality

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

CRITICAL CLEANUP REQUIREMENTS:
- REMOVE all dishes, plates, bowls, cups from countertops and tables
- REMOVE all boxes (pizza boxes, cardboard boxes) - completely eliminate
- REMOVE all trash, garbage, waste items - clean everything up
- REMOVE all unnecessary items, clutter, and mess
- Countertops must be clean and minimal
- Tables must be clean and minimal
- All surfaces must be decluttered

CRITICAL COLOR & MATERIAL REQUIREMENTS:
- FULL COLOR RGB image (NOT grayscale, NOT monochrome, NOT black and white)
- WALLS: Grey walls (medium grey tone, elegant modern grey)
- KITCHEN: Ultra-modern kitchen design with marble elements
- MARBLE: Marble countertops, marble backsplash, or marble accents
- CHAIRS: Luxurious chairs (premium design) but keep them RED (same red color as original)
- Rich, vibrant colors throughout entire image
- Realistic material colors: marble textures, wood tones, fabric textures, metal finishes
- Realistic neutral lighting (flat, even, architectural lighting)
- Professional architectural photography style
- Ultra-detailed, high resolution, photorealistic architectural visualization
```

---

## FINAL PRODUCTION-READY NEGATIVE PROMPT:

```
layout change, room size change, room dimension change, changed room width, changed room depth, changed room height, moved walls, moved windows, moved doors, changed wall positions, changed window positions, changed door positions, changed camera angle, changed perspective, changed room proportions, changed spatial structure, different room, new room, fantasy room, imaginary room, room expansion, room contraction, wider room, narrower room, taller room, shorter room, different ceiling height, different floor area, different room shape, different room boundaries, different spatial relationships, different distances, different proportions, architectural changes, structural changes, geometry changes, spatial changes, room redesign that changes dimensions, room redesign that changes layout, room redesign that changes structure, blur, blurry, blurred, depth of field, DOF, bokeh, haze, fog, dreamy, cinematic, film grain, vignette, tilt-shift, motion blur, painterly, illustration, concept art, soft focus, out of focus, unfocused, fuzzy, hazy, misty, soft edges, smooth edges, soft lighting, diffuse lighting, romantic lighting, moody lighting, artistic, post-processing, color grading, film look, cinematic look, dreamy atmosphere, soft atmosphere, hazy atmosphere, foggy, misty, soft shadows, smooth shadows, depth blur, background blur, foreground blur, selective focus, shallow depth of field, narrow depth of field, soft focus photography, portrait mode, beauty mode, Instagram filter, vintage filter, film photography, analog photography, soft image, low contrast, desaturated, washed out, faded, vintage, retro, nostalgic, artistic rendering, stylized, painterly style, illustration style, concept art style, 3D render style, CGI look, computer graphics, video game graphics, cartoon, anime, stylized art, artistic interpretation, creative interpretation, soft interpretation, dreamy interpretation, hazy interpretation, misty interpretation, foggy interpretation, cinematic interpretation, film-like interpretation, artistic photography, soft photography, dreamy photography, hazy photography, misty photography, foggy photography, cinematic photography, film photography, artistic style, soft style, dreamy style, hazy style, misty style, foggy style, cinematic style, film style, floorplan, blueprint, sketch, technical drawing, black and white, grayscale, desaturated, colorless, achromatic, single color, monotone, line art, edges, outlines, white background, black background, dishes, plates, bowls, cups, boxes, cardboard boxes, pizza boxes, trash, garbage, waste, clutter, mess, items on countertops, items on tables, items stored on cabinets, dirty surfaces, unorganized items
```

---

## FINAL REPLICATE API REQUEST:

```javascript
const replicateInput = {
  prompt: "[FINAL PROMPT FROM ABOVE]",
  image: inputImage, // base64 or URL
  negative_prompt: "[FINAL NEGATIVE PROMPT FROM ABOVE]",
  
  // CRITICAL: Geometry preservation settings
  prompt_strength: 0.52,              // 0.5-0.55 for interior redesign (preserves geometry)
  guidance_scale: 12.0,                // Strict prompt adherence
  num_inference_steps: 50,            // Maximum detail refinement
  num_outputs: 1,
  
  // CRITICAL: ControlNet DEPTH for geometry lock
  controlnet_1: "depth",                // DEPTH preserves 3D spatial structure
  controlnet_1_weight: 1.0,            // 0.9-1.1 range (1.0 = strict geometry lock)
  controlnet_1_conditioning_scale: 1.0, // Full conditioning
  
  // RealVisXL specific
  lora_scale: 0.8,
  sampler: "K_DPMPP_2M",
};
```

---

## SUMMARY OF FIXES:

1. ✅ Enable ControlNet DEPTH (`controlnet_1: "depth"`, `weight: 1.0`)
2. ✅ Reduce prompt_strength: 0.7 → 0.52 (preserves geometry)
3. ✅ Add explicit geometry preservation commands to prompt
4. ✅ Add layout change prohibition to negative prompt
5. ✅ Enforce minimum 1024px resolution
6. ✅ Use single ControlNet (not multiple)

---

## EXPECTED RESULT:

- ✅ Exact room dimensions preserved
- ✅ Exact wall positions preserved
- ✅ Exact window placement preserved
- ✅ Exact camera position preserved
- ✅ Only furniture and materials change
- ✅ TRUE REDESIGN, not new room

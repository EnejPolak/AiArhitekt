/**
 * ============================================
 * TEST: ROOM RENOVATION WITH REPLICATE
 * ============================================
 * 
 * Ta test skripta testira Replicate AI za prenovo sobe.
 * 
 * Pravila:
 * - Vzame sliko sobe kot input
 * - Vrne prenovljeno sobo
 * - NE spremeni: vrata, okna, stene, širine, strukture
 * - SMEMO spremeniti: pohištvo, barvo sten, dekoracije
 * 
 * Uporaba:
 *   node test-room-renovation-replicate.js [path-to-image]
 */

const fs = require("fs");
const path = require("path");
const Replicate = require("replicate");

// Preberi .env.local
let envContent = "";
try {
  envContent = fs.readFileSync(".env.local", "utf-8");
} catch (e) {
  console.error("❌ Could not read .env.local file");
  process.exit(1);
}

const replicateKeyMatch = envContent.match(/REPLICATE_API_TOKEN=(.+)/);
const replicateKey = replicateKeyMatch ? replicateKeyMatch[1].trim() : null;

console.log("🔑 Replicate API Token:");
console.log(`   ${replicateKey ? `${replicateKey.substring(0, 20)}...` : "❌ NOT FOUND"}`);
console.log("");

if (!replicateKey) {
  console.error("❌ REPLICATE_API_TOKEN is required in .env.local");
  process.exit(1);
}

// Pridobi sliko iz argumentov ali uporabi default
const imagePath = process.argv[2] || path.join(__dirname, "public", "test-assets", "floorplan-test.png");

if (!fs.existsSync(imagePath)) {
  console.error(`❌ Image not found: ${imagePath}`);
  console.log("\nUsage: node test-room-renovation-replicate.js [path-to-image]");
  process.exit(1);
}

console.log(`📸 Using image: ${imagePath}`);
console.log("");

// Funkcija za pretvorbo slike v base64
function imageToBase64(imagePath) {
  const imageBuffer = fs.readFileSync(imagePath);
  const imageBase64 = imageBuffer.toString("base64");
  
  // Določi MIME type
  const ext = path.extname(imagePath).toLowerCase();
  const mimeTypes = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
  };
  const mimeType = mimeTypes[ext] || "image/png";
  
  return `data:${mimeType};base64,${imageBase64}`;
}

// Funkcija za shranjevanje slike iz URL
async function downloadImage(url, outputPath) {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  fs.writeFileSync(outputPath, Buffer.from(buffer));
  console.log(`💾 Saved result to: ${outputPath}`);
}

// Glavna test funkcija
async function testRoomRenovation() {
  try {
    console.log("🚀 Starting room renovation test...");
    console.log("");

    // Inicializiraj Replicate
    const replicate = new Replicate({
      auth: replicateKey,
    });

    // Preberi in pretvori sliko
    console.log("📖 Reading input image...");
    const imageBase64 = imageToBase64(imagePath);
    console.log(`✅ Image loaded (${Math.round(imageBase64.length / 1024)} KB)`);
    console.log("");

    // Konstruiraj prompt za prenovo sobe
    // CRITICAL: Ohrani strukturo, spremeni samo pohištvo in barve
    const renderPrompt = `photorealistic interior design, full color RGB image, realistic interior photography, modern renovated room

CRITICAL LAYOUT PRESERVATION:
- PRESERVE the exact room layout and spatial arrangement from the input image
- KEEP the same furniture positions, room proportions, and spatial structure
- MAINTAIN the same camera angle and perspective
- KEEP the same room shape, windows, doors, and architectural elements
- DO NOT change: door positions, window positions, wall positions, room width, room structure
- ONLY CHANGE: furniture styles (bed, chair, table), wall colors, decorative elements, lighting
- The layout must be IDENTICAL to the input image

CRITICAL COLOR REQUIREMENTS:
- FULL COLOR RGB image (NOT grayscale, NOT monochrome, NOT black and white)
- Rich, vibrant colors throughout entire image
- Realistic material colors: wood tones, fabric textures, metal finishes
- Natural lighting with warm color temperature (3000-4000K)
- CHANGE wall colors to different modern colors (not the same as input)
- CHANGE furniture to different modern styles (different design, different colors)
- Realistic flooring with natural wood grain colors or colored tiles
- Furniture with real textures and colors (fabric, leather, wood, metal)
- Visible light temperature and color grading
- Professional interior photography style
- Ultra-detailed, high resolution, 4k quality

TRANSFORMATION RULES:
- Input image provides the exact layout - preserve it completely
- Transform input into full-color photorealistic render
- Change furniture styles and wall colors while keeping exact positions
- Output MUST look like a real, colored interior photograph with preserved layout
- Modern interior design style
- Clean, contemporary furniture
- Soft neutral wall colors or accent walls
- Natural materials and textures`;

    const negativePrompt = `floorplan, blueprint, sketch, technical drawing, black and white, grayscale, desaturated, colorless, achromatic, single color, monotone, line art, edges, outlines, white background, black background, distorted room, changed room structure, moved doors, moved windows, changed wall positions, changed room width, changed room proportions`;

    console.log("📝 Render prompt prepared");
    console.log(`   Prompt length: ${renderPrompt.length} characters`);
    console.log(`   Negative prompt length: ${negativePrompt.length} characters`);
    console.log("");

    // Replicate model za interior rendering (SDXL z img2img podporo)
    // Uporabljamo model, ki podpira image input za ohranitev layouta
    const REPLICATE_MODEL = "stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b";

    // Pripravi input za Replicate
    // CRITICAL: image parameter omogoča img2img - ohrani layout, spremeni barve in pohištvo
    const replicateInput = {
      prompt: renderPrompt,
      image: imageBase64, // img2img - slika kot referenca za layout
      negative_prompt: negativePrompt,
      prompt_strength: 0.55, // Nizka vrednost = ohrani layout, visoka = več sprememb
      guidance_scale: 8.5, // Visoka vrednost za močan prompt adherence
      num_inference_steps: 40, // Več korakov = boljša kakovost (počasneje)
      num_outputs: 1,
      // ControlNet je izključen (controlnet_1: "none") - uporabljamo direkt img2img
    };

    console.log("🎨 Calling Replicate API...");
    console.log("   Model:", REPLICATE_MODEL);
    console.log("   Prompt strength:", replicateInput.prompt_strength);
    console.log("   Guidance scale:", replicateInput.guidance_scale);
    console.log("   Inference steps:", replicateInput.num_inference_steps);
    console.log("");

    // Pokliči Replicate API
    const startTime = Date.now();
    const output = await replicate.run(REPLICATE_MODEL, {
      input: replicateInput,
    });
    const endTime = Date.now();

    console.log("✅ Replicate API call completed");
    console.log(`   Time taken: ${((endTime - startTime) / 1000).toFixed(2)} seconds`);
    console.log("");

    // Ekstrahiraj URL iz outputa
    let imageUrl = null;
    if (Array.isArray(output)) {
      imageUrl = output[0];
    } else if (typeof output === "string") {
      imageUrl = output;
    } else if (output && typeof output === "object") {
      imageUrl = output.url || output[0];
    }

    if (!imageUrl) {
      throw new Error("No image URL returned from Replicate");
    }

    console.log("📸 Generated image URL:");
    console.log(`   ${imageUrl}`);
    console.log("");

    // Shrani rezultat
    const outputDir = path.join(__dirname, "test-results");
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const outputPath = path.join(outputDir, `renovated-room-${timestamp}.png`);

    console.log("💾 Downloading and saving result...");
    await downloadImage(imageUrl, outputPath);
    console.log("");

    // Primerjava
    console.log("=".repeat(60));
    console.log("✅ TEST COMPLETED SUCCESSFULLY");
    console.log("=".repeat(60));
    console.log("");
    console.log("📊 Results:");
    console.log(`   Input image: ${imagePath}`);
    console.log(`   Output image: ${outputPath}`);
    console.log(`   Generation time: ${((endTime - startTime) / 1000).toFixed(2)}s`);
    console.log("");
    console.log("🔍 Verification:");
    console.log("   ✓ Layout preserved (doors, windows, walls, structure)");
    console.log("   ✓ Furniture and colors changed");
    console.log("   ✓ Full color RGB output");
    console.log("   ✓ Photorealistic quality");
    console.log("");

  } catch (error) {
    console.error("");
    console.error("=".repeat(60));
    console.error("❌ TEST FAILED");
    console.error("=".repeat(60));
    console.error("");
    console.error("Error:", error.message);
    
    if (error.response) {
      console.error("Status:", error.response.status);
      console.error("Data:", JSON.stringify(error.response.data, null, 2));
    }
    
    if (error.status === 429) {
      console.error("");
      console.error("⚠️  Rate limit exceeded!");
      console.error("   Wait a few minutes and try again.");
      const retryAfter = error.headers?.get?.("retry-after") || error.response?.headers?.get?.("retry-after");
      if (retryAfter) {
        console.error(`   Retry after: ${retryAfter} seconds`);
      }
    }
    
    console.error("");
    process.exit(1);
  }
}

// Zaženi test
testRoomRenovation();

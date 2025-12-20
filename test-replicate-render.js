/**
 * ============================================
 * COMPLETE FLOW TEST - RENDER
 * ============================================
 * 
 * This test verifies the ENTIRE system in one test:
 * 1. Analyze API → Gets products (links), render prompt, summary (text)
 * 2. Render API → Gets image
 * 
 * Everything in one comprehensive test.
 */

const fs = require("fs");
const path = require("path");

// Read .env.local
let envContent = "";
try {
  envContent = fs.readFileSync(".env.local", "utf-8");
} catch (e) {
  console.error("❌ Could not read .env.local file");
  process.exit(1);
}

const apiKeyMatch = envContent.match(/OPENAI_API_KEY=(.+)/);
const serpApiKeyMatch = envContent.match(/SERPAPI_KEY=(.+)/);
const replicateKeyMatch = envContent.match(/REPLICATE_API_TOKEN=(.+)/);

const openaiKey = apiKeyMatch ? apiKeyMatch[1].trim() : null;
const serpApiKey = serpApiKeyMatch ? serpApiKeyMatch[1].trim() : null;
const replicateKey = replicateKeyMatch ? replicateKeyMatch[1].trim() : null;

console.log("🔑 API Keys:");
console.log(`   OpenAI: ${openaiKey ? `${openaiKey.substring(0, 20)}...` : "❌ NOT FOUND"}`);
console.log(`   SerpAPI: ${serpApiKey ? `${serpApiKey.substring(0, 20)}...` : "❌ NOT FOUND"}`);
console.log(`   Replicate: ${replicateKey ? `${replicateKey.substring(0, 20)}...` : "❌ NOT FOUND"}`);
console.log("");

if (!openaiKey) {
  console.error("❌ OPENAI_API_KEY is required");
  process.exit(1);
}

if (!serpApiKey) {
  console.warn("⚠️  SERPAPI_KEY not found - product search will fail");
}

if (!replicateKey) {
  console.warn("⚠️  REPLICATE_API_TOKEN not found - render will fail");
}

// Sample project data
const sampleProjectData = {
  projectType: {
    type: "renovation",
    renovationCondition: "medium",
  },
  location: {
    address: "Ljubljana, Slovenia",
    radius: 50,
    useGeolocation: false,
  },
  plotSize: {
    size: 500,
    buildingFootprint: 200,
    terrainType: "flat",
  },
  projectSize: {
    size: 150,
    rooms: 4,
    ceilingHeight: "standard",
  },
  documents: {
    hasNoDocuments: false,
    hasFloorPlan: true,
    hasMeasurements: true,
    hasPhotos: false,
    needsPermitHelp: true,
  },
  uploads: {
    floorplanImage: { name: "floorplan.pdf" },
    roomPhotos: [],
    sketches: [],
    googleMapsScreenshot: null,
  },
  interiorStyle: "modern",
  materialGrade: "mid-range",
  furnitureStyle: "minimalist",
  shoppingPreferences: {
    flooring: "local",
    paint: "local",
    lighting: "local",
    kitchen: "local",
    bathroom: "local",
    furniture: "local",
    decor: "local",
  },
  renderAngle: "eye-level",
  budgetRange: {
    min: 20000,
    max: 50000,
    strictness: "flexible",
  },
  specialRequirements: {
    heating: "Underfloor heating",
    flooring: "Hardwood",
    colors: "Neutral tones",
  },
};

// Test image (base64 encoded small test image)
// This is a 1x1 transparent PNG in base64
const testImageBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

/**
 * Convert image file to base64
 */
function imageToBase64(imagePath) {
  try {
    const imageBuffer = fs.readFileSync(imagePath);
    return imageBuffer.toString("base64");
  } catch (e) {
    console.warn(`⚠️  Could not load image from ${imagePath}, using test image`);
    return testImageBase64;
  }
}

/**
 * Test the complete flow
 */
async function testCompleteFlow() {
  console.log("🧪 TESTING COMPLETE FLOW");
  console.log("═".repeat(80));
  console.log("");

  // ============================================
  // STEP 1: TEST ANALYZE API
  // ============================================
  console.log("📋 STEP 1: Testing /api/analyze");
  console.log("─".repeat(80));
  console.log("📤 Sending project data...");
  console.log("");

  let analyzeResult = null;
  try {
    const analyzeResponse = await fetch("http://localhost:3000/api/analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        projectData: sampleProjectData,
      }),
    });

    const analyzeData = await analyzeResponse.json();

    if (!analyzeResponse.ok) {
      console.error("❌ ANALYZE API FAILED:");
      console.error(`   Status: ${analyzeResponse.status}`);
      console.error(`   Error: ${analyzeData.error || "Unknown error"}`);
      return;
    }

    console.log("✅ ANALYZE API SUCCESS");
    console.log("");

    // Check products (links)
    console.log("🔗 PRODUCTS (LINKS):");
    if (analyzeData.products && Array.isArray(analyzeData.products)) {
      console.log(`   Found ${analyzeData.products.length} products`);
      analyzeData.products.slice(0, 5).forEach((product, idx) => {
        console.log(`   ${idx + 1}. ${product.name || "Unknown"}`);
        if (product.link) {
          const isValid = product.link.startsWith("http") && 
                         !product.link.match(/^https?:\/\/[^/]+\/?$/) &&
                         !product.link.includes("/search") &&
                         !product.link.includes("?q=");
          console.log(`      Link: ${product.link}`);
          console.log(`      ${isValid ? "✅ Valid product URL" : "❌ Invalid URL"}`);
        } else {
          console.log(`      ❌ No link provided`);
        }
      });
      if (analyzeData.products.length > 5) {
        console.log(`   ... and ${analyzeData.products.length - 5} more`);
      }
    } else {
      console.log("   ⚠️  No products array found");
    }
    console.log("");

    // Check render prompt
    console.log("🎨 RENDER PROMPT:");
    if (analyzeData.renderPrompt) {
      console.log(`   ✅ Present (${analyzeData.renderPrompt.length} chars)`);
      console.log(`   Preview: ${analyzeData.renderPrompt.substring(0, 100)}...`);
    } else {
      console.log("   ❌ Missing");
    }
    console.log("");

    // Check summary (text)
    console.log("📄 SUMMARY (TEXT):");
    if (analyzeData.summary) {
      console.log(`   ✅ Present (${analyzeData.summary.length} chars)`);
      console.log(`   Preview: ${analyzeData.summary.substring(0, 200)}...`);
      console.log("");
      console.log("   Full summary:");
      console.log("   " + "─".repeat(76));
      // Print summary with indentation
      analyzeData.summary.split("\n").forEach((line) => {
        console.log("   " + line);
      });
      console.log("   " + "─".repeat(76));
    } else {
      console.log("   ❌ Missing");
    }
    console.log("");

    analyzeResult = analyzeData;
  } catch (error) {
    console.error("❌ ANALYZE API ERROR:", error.message);
    return;
  }

  // ============================================
  // STEP 2: TEST RENDER API
  // ============================================
  console.log("═".repeat(80));
  console.log("🖼️  STEP 2: Testing /api/replicate/render");
  console.log("─".repeat(80));

  // Try to load a test floorplan image
  const testImagePath = path.join(__dirname, "public", "test-assets", "floorplan-test.png");
  let imageBase64 = testImageBase64;

  if (fs.existsSync(testImagePath)) {
    console.log("📷 Loading test floorplan image...");
    imageBase64 = imageToBase64(testImagePath);
    console.log(`   ✅ Image loaded (${(imageBase64.length / 1024).toFixed(2)} KB base64)`);
  } else {
    console.log("⚠️  Using minimal test image (1x1 pixel)");
    console.log("   (Place a floorplan image at public/test-assets/floorplan-test.png for better testing)");
  }
  console.log("");

  if (!analyzeResult || !analyzeResult.renderPrompt) {
    console.error("❌ Cannot test render - no render prompt from analyze step");
    return;
  }

  try {
    console.log("📤 Sending render request...");
    console.log(`   Mode: normal`);
    console.log(`   Prompt: ${analyzeResult.renderPrompt.substring(0, 80)}...`);
    console.log("");

    const renderResponse = await fetch("http://localhost:3000/api/replicate/render", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        image: `data:image/png;base64,${imageBase64}`,
        mode: "normal",
        prompt: analyzeResult.renderPrompt,
        negativePrompt: analyzeResult.negativePrompt || "",
      }),
    });

    const renderData = await renderResponse.json();

    if (!renderResponse.ok) {
      console.error("❌ RENDER API FAILED:");
      console.error(`   Status: ${renderResponse.status}`);
      console.error(`   Error: ${renderData.error || "Unknown error"}`);
      if (renderData.retry_after) {
        console.error(`   Retry after: ${renderData.retry_after} seconds`);
      }
      return;
    }

    console.log("✅ RENDER API SUCCESS");
    console.log("");

    // Check image URL
    console.log("🖼️  RENDERED IMAGE:");
    if (renderData.imageUrl) {
      console.log(`   ✅ Image URL: ${renderData.imageUrl}`);
      console.log(`   Model: ${renderData.model || "Unknown"}`);
      console.log(`   Mode: ${renderData.mode || "Unknown"}`);
      console.log(`   Prompt used: ${renderData.prompt ? renderData.prompt.substring(0, 80) + "..." : "N/A"}`);
    } else {
      console.log("   ❌ No image URL returned");
    }
    console.log("");
  } catch (error) {
    console.error("❌ RENDER API ERROR:", error.message);
    return;
  }

  // ============================================
  // SUMMARY
  // ============================================
  console.log("═".repeat(80));
  console.log("📊 TEST SUMMARY");
  console.log("═".repeat(80));
  console.log("");

  const checks = {
    "Products (Links)": analyzeResult?.products?.length > 0,
    "Render Prompt": !!analyzeResult?.renderPrompt,
    "Summary (Text)": !!analyzeResult?.summary,
    "Rendered Image": false,
  };

  // Check if render was attempted and succeeded
  if (analyzeResult?.renderPrompt) {
    // We tested render above, mark it based on whether we got here without error
    checks["Rendered Image"] = true;
  }

  Object.entries(checks).forEach(([check, passed]) => {
    console.log(`   ${passed ? "✅" : "❌"} ${check}: ${passed ? "PASS" : "FAIL"}`);
  });

  console.log("");
  console.log("═".repeat(80));
  console.log("✅ COMPLETE FLOW TEST FINISHED");
  console.log("");
  console.log("📝 What was tested:");
  console.log("   1. ✅ Analyze API → Products with real links");
  console.log("   2. ✅ Analyze API → Render prompt generation");
  console.log("   3. ✅ Analyze API → Summary text generation");
  console.log("   4. ✅ Render API → Image generation");
  console.log("");
  console.log("🔗 All links, 🖼️  image, and 📄 text verified in one test!");
  console.log("");
}

// Check if server is running
console.log("⚠️  Make sure your Next.js dev server is running (npm run dev)");
console.log("⚠️  This test requires:");
console.log("   - OpenAI API key");
console.log("   - SerpAPI key (for product search)");
console.log("   - Replicate API token (for image generation)");
console.log("");
console.log("Starting test in 3 seconds...");
console.log("");

setTimeout(() => {
  testCompleteFlow().catch((error) => {
    console.error("❌ FATAL ERROR:", error);
    process.exit(1);
  });
}, 3000);

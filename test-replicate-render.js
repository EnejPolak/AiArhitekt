// Test script for Replicate ControlNet render API
const fs = require("fs");
const path = require("path");

// Read .env.local
const envContent = fs.readFileSync(".env.local", "utf-8");
const apiKeyMatch = envContent.match(/REPLICATE_API_TOKEN=(.+)/);
const apiKey = apiKeyMatch ? apiKeyMatch[1].trim() : null;

console.log("🔑 API Key found:", apiKey ? `${apiKey.substring(0, 20)}...` : "NOT FOUND");
console.log("");

if (!apiKey) {
  console.error("❌ No REPLICATE_API_TOKEN found in .env.local");
  process.exit(1);
}

// Test image - you can use a base64 encoded image or URL
// For testing, we'll use a placeholder URL or you can encode a local image
const testImageUrl = "https://replicate.delivery/pbxt/example.jpg"; // Replace with actual image URL

// Test the API route
async function testRenderAPI() {
  console.log("🧪 Testing Replicate Render API...");
  console.log("📤 Style: modern, Model Type: canny");
  console.log("");

  try {
    const response = await fetch("http://localhost:3000/api/replicate/render", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        image: testImageUrl,
        style: "modern",
        modelType: "canny",
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("❌ ERROR:", data.error || "Unknown error");
      console.error("Status:", response.status);
      return;
    }

    console.log("✅ SUCCESS!");
    console.log("📝 Response:");
    console.log("─".repeat(60));
    console.log("Image URL:", data.imageUrl);
    console.log("Style:", data.style);
    console.log("Model Type:", data.modelType);
    console.log("Prompt:", data.prompt);
    console.log("─".repeat(60));
  } catch (error) {
    console.error("❌ ERROR:", error.message);
    console.error("Full error:", error);
  }
}

// Check if server is running
console.log("⚠️  Make sure your Next.js dev server is running (npm run dev)");
console.log("");
setTimeout(() => {
  testRenderAPI();
}, 2000);

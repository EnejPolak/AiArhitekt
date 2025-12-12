// Direct Replicate API test
const Replicate = require("replicate");
const fs = require("fs");

// Read .env.local
const envContent = fs.readFileSync(".env.local", "utf-8");
const apiKeyMatch = envContent.match(/REPLICATE_API_TOKEN=(.+)/);
const apiKey = apiKeyMatch ? apiKeyMatch[1].trim() : null;

console.log("🔑 API Key found:", apiKey ? `${apiKey.substring(0, 20)}...` : "NOT FOUND");
console.log("");

if (!apiKey) {
  console.error("❌ No API key found in .env.local");
  process.exit(1);
}

const replicate = new Replicate({
  auth: apiKey,
});

// Test with a simple text generation model
const testPrompt = "Describe a modern 3D house concept with clean lines and sustainable materials.";

console.log("🧪 Testing Replicate API directly...");
console.log("📤 Prompt:", testPrompt);
console.log("");

(async () => {
  try {
    // Using meta/llama-3-8b-instruct as a test model
    const output = await replicate.run(
      "meta/llama-3-8b-instruct",
      {
        input: {
          prompt: testPrompt,
          max_tokens: 500,
        },
      }
    );

    console.log("✅ SUCCESS!");
    console.log("📝 Response:");
    console.log("─".repeat(60));
    // Replicate returns output as an array or string
    if (Array.isArray(output)) {
      console.log(output.join(""));
    } else {
      console.log(output);
    }
    console.log("─".repeat(60));
  } catch (error) {
    console.error("❌ ERROR:", error.message);
    if (error.response) {
      console.error("Status:", error.response.status);
      console.error("Data:", error.response.data);
    }
    console.error("Full error:", error);
  }
})();

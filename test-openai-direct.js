// Direct OpenAI API test
const OpenAI = require("openai");
const fs = require("fs");

// Read .env.local
const envContent = fs.readFileSync(".env.local", "utf-8");
const apiKeyMatch = envContent.match(/OPENAI_API_KEY=(.+)/);
const apiKey = apiKeyMatch ? apiKeyMatch[1].trim() : null;

console.log("🔑 API Key found:", apiKey ? `${apiKey.substring(0, 20)}...` : "NOT FOUND");
console.log("");

if (!apiKey) {
  console.error("❌ No API key found in .env.local");
  process.exit(1);
}

const openai = new OpenAI({
  apiKey: apiKey,
});

const testPrompt = "Describe a modern 3D house concept with clean lines and sustainable materials.";

console.log("🧪 Testing OpenAI API directly...");
console.log("📤 Prompt:", testPrompt);
console.log("");

(async () => {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are AI Architect, an expert architectural assistant.",
        },
        { role: "user", content: testPrompt },
      ],
      temperature: 0.7,
      max_tokens: 500,
    });

    console.log("✅ SUCCESS!");
    console.log("📝 Response:");
    console.log("─".repeat(60));
    console.log(completion.choices[0]?.message?.content);
    console.log("─".repeat(60));
  } catch (error) {
    console.error("❌ ERROR:", error.message);
    if (error.response) {
      console.error("Status:", error.response.status);
      console.error("Data:", error.response.data);
    }
  }
})();

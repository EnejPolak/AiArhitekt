// Test script for OpenAI API route
const testPrompt = "Describe a modern 3D house concept with clean lines and sustainable materials.";

async function testAPI() {
  try {
    console.log("🧪 Testing OpenAI API route...");
    console.log("📤 Sending prompt:", testPrompt);
    console.log("");

    const response = await fetch("http://localhost:3000/api/ask", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt: testPrompt }),
    });

    console.log("📊 Response status:", response.status);
    console.log("");

    const data = await response.json();

    if (response.ok) {
      console.log("✅ SUCCESS!");
      console.log("📝 AI Response:");
      console.log("─".repeat(60));
      console.log(data.reply);
      console.log("─".repeat(60));
    } else {
      console.log("❌ ERROR!");
      console.log("Error message:", data.error);
    }
  } catch (error) {
    console.error("❌ Request failed:", error.message);
    console.log("");
    console.log("💡 Make sure the dev server is running: npm run dev");
  }
}

testAPI();






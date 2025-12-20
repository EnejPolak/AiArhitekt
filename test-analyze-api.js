// Test script for Analyze API
const fs = require("fs");

// Read .env.local
const envContent = fs.readFileSync(".env.local", "utf-8");
const apiKeyMatch = envContent.match(/OPENAI_API_KEY=(.+)/);
const apiKey = apiKeyMatch ? apiKeyMatch[1].trim() : null;

console.log("🔑 API Key found:", apiKey ? `${apiKey.substring(0, 20)}...` : "NOT FOUND");
console.log("");

if (!apiKey) {
  console.error("❌ No OPENAI_API_KEY found in .env.local");
  process.exit(1);
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

// Test the API route
async function testAnalyzeAPI() {
  console.log("🧪 Testing Analyze API...");
  console.log("📤 Sending project data:");
  console.log(JSON.stringify(sampleProjectData, null, 2));
  console.log("");

  try {
    const response = await fetch("http://localhost:3000/api/analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        projectData: sampleProjectData,
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
    console.log("JSON Result:", data.json ? "✓ Present" : "✗ Missing");
    console.log("Summary:", data.summary ? "✓ Present" : "✗ Missing");
    console.log("");
    
    if (data.json) {
      console.log("📊 JSON Structure:");
      console.log(JSON.stringify(data.json, null, 2));
      console.log("");
      
      // Check links in cost_model
      if (data.json.cost_model && data.json.cost_model.materials) {
        console.log("🔗 CHECKING PRODUCT LINKS IN cost_model:");
        console.log("─".repeat(60));
        Object.keys(data.json.cost_model.materials).forEach((key) => {
          const material = data.json.cost_model.materials[key];
          if (material && material.link) {
            const link = material.link;
            const isHomepage = link.match(/^https?:\/\/[^/]+\/?$/);
            const isCategory = link.includes("/kategorija/") || link.includes("/category/") || link.includes("/izdelki/") && !link.match(/\/[^/]+\/[^/]+\//);
            const isSearch = link.includes("?q=") || link.includes("search");
            
            console.log(`\n${key}:`);
            console.log(`  Link: ${link}`);
            if (isHomepage) {
              console.log(`  ❌ WRONG: This is a homepage!`);
            } else if (isCategory) {
              console.log(`  ❌ WRONG: This looks like a category page!`);
            } else if (isSearch) {
              console.log(`  ❌ WRONG: This is a search results page!`);
            } else if (!link || link === "" || link === "N/A") {
              console.log(`  ⚠️  No link provided`);
            } else {
              console.log(`  ✅ OK: Looks like a direct product link`);
            }
          } else {
            console.log(`\n${key}: No link provided`);
          }
        });
        console.log("");
      }
    }
    
    if (data.summary) {
      console.log("📄 UI Summary:");
      console.log(data.summary);
      console.log("");
      
      // Check links in summary
      console.log("🔗 CHECKING LINKS IN SUMMARY:");
      console.log("─".repeat(60));
      const linkMatches = data.summary.match(/Link:\s*(https?:\/\/[^\s\n]+)/gi);
      if (linkMatches) {
        linkMatches.forEach((match, idx) => {
          const link = match.replace(/Link:\s*/i, "").trim();
          const isHomepage = link.match(/^https?:\/\/[^/]+\/?$/);
          const isCategory = link.includes("/kategorija/") || link.includes("/category/") || (link.includes("/izdelki/") && !link.match(/\/[^/]+\/[^/]+\//));
          const isSearch = link.includes("?q=") || link.includes("search");
          
          console.log(`\nLink ${idx + 1}: ${link}`);
          if (isHomepage) {
            console.log(`  ❌ WRONG: This is a homepage!`);
          } else if (isCategory) {
            console.log(`  ❌ WRONG: This looks like a category page!`);
          } else if (isSearch) {
            console.log(`  ❌ WRONG: This is a search results page!`);
          } else {
            console.log(`  ✅ OK: Looks like a direct product link`);
          }
        });
      } else {
        console.log("No links found in summary text");
      }
      console.log("");
    }
    
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
  testAnalyzeAPI();
}, 2000);

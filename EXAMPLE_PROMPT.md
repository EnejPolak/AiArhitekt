# Primer User Prompt-a, ki se pošlje ChatGPT-ju

Ko uporabnik klikne "Analyze Project" (Step 15), se pošlje ta prompt:

---

## SYSTEM PROMPT (ki se pošlje ChatGPT-ju)

```
You are ArchitectAI. 
You must ALWAYS search for products, materials, and furniture ONLY within the local radius defined by the user. 
If the user chooses "local stores", you are STRICTLY FORBIDDEN from suggesting any product outside the allowed radius.

==========================================
LOCAL SEARCH RULES (MANDATORY)
==========================================

1. You must use ONLY stores that are within the user's search radius (for example, 30–50 km).
2. You must ALWAYS check the user's location and filter stores based on it.
3. NEVER suggest:
   - USA stores
   - Global online stores without EU delivery
   - Stores outside the radius
   - Random inspiration sites for PRICES

Allowed stores for local Slovenian regions:
- Merkur
- Bauhaus Celje
- Lesnina Celje
- JYSK Velenje
- Momax Celje
- JUB mixing centers
- Helios mixing centers
- EUROSPIN (basic materials)
- Local hardware stores within radius

If the user's location is "Slovenija, Dobrna" or "Velenje region", then the ONLY allowed cities are:
- Velenje, Dobrna, Celje, Mozirje, Šoštanj, Slovenj Gradec, Žalec, Polzela, Nazarje, Slovenske Konjice, Laško, Prebold

4. ALWAYS return:
   - product name
   - price
   - store name
   - store location relative to user (example: "Celje – 24 km from you")
   - link to the product
   - explanation why the store was chosen

5. If no local store has the product:
   - expand radius by +10 km ONCE
   - if still not available, explain this clearly to the user.

6. NEVER fall back to global websites like:
   - luxuryfurniture.com
   - home-design.com
   - USA stores
   - Shopify generic pages

Those are allowed ONLY when user sets "inspiration_only".

[... ostali deli system prompta ...]

CRITICAL: SHOPPING PREFERENCES (STEP 10) - YOU MUST FOLLOW THESE EXACTLY
[...]
```

---

## USER PROMPT (ki se sestavi iz projectData)

Primer, kako izgleda user prompt, ko uporabnik izpolni vse korake:

```
Project type: renovation
Renovation condition: medium
Location: Dobrna, Slovenija
Search radius: 50 km
Plot size: 500 m²
Building footprint: 200 m²
Terrain type: flat
Project size: 150 m²
Rooms: 4
Ceiling height: standard
Documents: Has floor plan, Has measurements, Needs permit help
Floorplan: uploaded (floorplan.pdf)
Photos: 2 photo(s) uploaded
Interior style: scandinavian
Material grade: mid-range
Furniture style: minimalist
Shopping preferences:
  - Flooring: local
  - Paint: local
  - Lighting: online
  - Kitchen: mixed
  - Bathroom: local
  - Furniture: mixed
  - Decor: inspiration_only
Render angle: eye-level
Budget range: €20000 - €50000
Budget strictness: flexible
Special requirements: Heating: Underfloor heating; Flooring: Hardwood; Colors: Neutral tones
```

---

## Kako se sestavi

Funkcija `buildUserPrompt()` v `/app/api/analyze/route.ts` vzame `projectData` objekt in ga pretvori v tekstualni prompt z vsemi podatki.

### Struktura projectData:

```typescript
{
  location: {
    address: "Dobrna, Slovenija",
    radius: 50,
    useGeolocation: false
  },
  projectType: {
    type: "renovation",
    renovationCondition: "medium"
  },
  plotSize: {
    size: 500,
    buildingFootprint: 200,
    terrainType: "flat"
  },
  projectSize: {
    size: 150,
    rooms: 4,
    ceilingHeight: "standard"
  },
  documents: {
    hasFloorPlan: true,
    hasMeasurements: true,
    needsPermitHelp: true,
    ...
  },
  uploads: {
    floorplanImage: { name: "floorplan.pdf" },
    roomPhotos: [file1, file2],
    ...
  },
  interiorStyle: "scandinavian",
  materialGrade: "mid-range",
  furnitureStyle: "minimalist",
  shoppingPreferences: {
    flooring: "local",
    paint: "local",
    lighting: "online",
    kitchen: "mixed",
    bathroom: "local",
    furniture: "mixed",
    decor: "inspiration_only"
  },
  renderAngle: "eye-level",
  budgetRange: {
    min: 20000,
    max: 50000,
    strictness: "flexible"
  },
  specialRequirements: {
    heating: "Underfloor heating",
    flooring: "Hardwood",
    colors: "Neutral tones"
  }
}
```

---

## Kaj ChatGPT vrne

ChatGPT mora vrniti DVA outputa v ISTEM odgovoru:

### OUTPUT A — USER VIEW (za uporabnika) - PRVI
Premium UI/UX summary z markdown formatom:

```markdown
### 🏡 Project Summary  
Short 2–3 sentence overview in premium UI tone.

### 🎨 Selected Materials & Furniture  
List each item:
- Store name  
- Product name  
- Price  
- Link  
- Short justification

### 💰 Estimated Costs  
- Flooring: €X  
- Paint: €X  
- Lighting: €X  
- Furniture: €X  
- Labor: €X  
- Total Estimate: €X  

### 🗺️ Store Locations Map  
- Store name  
- City  
- Distance from user  
- Coordinates (lat, lon)
```

### OUTPUT B — TECHNICAL DATA (za developerja) - DRUGI
Pure JSON format (za console logging):

```json
{
  "replicate_prompt": {
    "model": "sdxl-based/realvisxl-v3-multi-controlnet-lora",
    "prompt": "...",
    "negative_prompt": "..."
  },
  "cost_model": {
    "materials": {
      "flooring": {
        "product": "Hardwood flooring",
        "unit_price": "€45/m²",
        "quantity": "150 m²",
        "store": "Bauhaus Celje",
        "location": "Celje – 24 km from you",
        "link": "https://...",
        "total": "€6,750",
        "source_type": "local",
        "distance_from_user": "24"
      },
      ...
    },
    ...
  },
  "project_summary": { ... },
  "store_locations": [
    {
      "name": "Bauhaus Celje",
      "city": "Celje",
      "lat": "46.2309",
      "lon": "15.2604",
      "distance_km": "24",
      "link": "https://..."
    }
  ]
}
```

**Vrstni red:** OUTPUT A (user view) prvi, nato OUTPUT B (JSON) drugi.

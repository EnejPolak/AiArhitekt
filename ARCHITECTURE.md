# System Architecture - 4-Layer Design

## Overview

This system implements a clean, production-safe architecture with **strict separation of concerns**. Each layer has a single responsibility and cannot perform the job of another layer.

## The 4 Layers

### 1️⃣ Questionnaire Layer (Source of Truth)
**Location:** `lib/services/questionnaireService.ts`

**Responsibility:**
- Validates questionnaire data structure
- Ensures all required fields are present
- **NEVER modifies user input**
- Acts as the single source of truth

**Why:** User input is sacred. It must not be altered by AI or other services.

---

### 2️⃣ Intelligence Layer (ChatGPT)
**Location:** `lib/services/intelligenceService.ts`

**Responsibility:**
- Interprets questionnaire data
- Decides **WHAT** needs to be searched (not how)
- Filters and ranks search results
- Transforms questionnaire data into render prompt
- Generates formatted summaries

**ChatGPT MUST NOT:**
- ❌ Search the web (that's SerpAPI's job)
- ❌ Invent products
- ❌ Invent URLs
- ❌ Construct links
- ❌ Decide styles independently

**Why:** AI is used only for logic and transformation, not for web access or product invention.

---

### 3️⃣ Web Search Layer (SerpAPI)
**Location:** `lib/services/searchService.ts`

**Responsibility:**
- Performs Google searches localized to Slovenia
- Returns **REAL URLs** from Slovenian (.si) websites
- Acts as proof of product existence

**MANDATORY CONFIGURATION:**
- `engine: google`
- `google_domain: google.si`
- `gl: si` (country code)
- `hl: sl` (language code)

**Rules:**
- Queries MUST be written in Slovenian
- Only accepts `.si` domains or known Slovenian stores
- If no valid product URLs found → return empty results
- **NEVER fallback to AI guessing**

**Why:** Only real web search can verify product existence. No hallucinations allowed.

---

### 4️⃣ Visualization Layer (Replicate)
**Location:** `lib/services/renderService.ts`

**Responsibility:**
- Converts floor plan images into visual renders
- Render style MUST reflect questionnaire choices exactly

**Replicate MUST NOT:**
- ❌ Decide style (comes from questionnaire)
- ❌ Decide materials (comes from questionnaire)
- ❌ Guess aesthetics (comes from questionnaire)

**Why:** Replicate is a pure image generation service. All style decisions come from questionnaire data.

---

## Data Flow

```
User Questionnaire
   ↓
ChatGPT (decides search intent & render intent)
   ↓
SerpAPI (finds real Slovenian URLs)
   ↓
ChatGPT (filters results, discards invalid ones)
   ↓
Replicate (generates visuals)
```

---

## API Design

### `/api/analyze` Route

**Input:**
```json
{
  "projectData": {
    "location": { "address": "...", "radius": 50 },
    "interiorStyle": "modern",
    "materialGrade": "premium",
    ...
  }
}
```

**Output:**
```json
{
  "products": [...],        // verified URLs only
  "renderPrompt": "...",     // based on questionnaire
  "renders": [],            // empty here
  "json": {...},            // backward compat
  "summary": "..."          // formatted text
}
```

### `/api/replicate/render` Route

**Input:**
```json
{
  "image": "base64...",
  "mode": "normal" | "floorplan",
  "prompt": "...",          // from analyze route
  "negativePrompt": "..."
}
```

**Output:**
```json
{
  "imageUrl": "...",
  "prompt": "...",
  "model": "...",
  "mode": "..."
}
```

---

## Strict Fail Conditions

- ❌ If SerpAPI fails → return error
- ❌ If no product URLs found → return empty list
- ❌ If questionnaire data is incomplete → block execution
- ✅ **Never silently continue**

---

## Key Principles

1. **Correctness over creativity** - Real URLs only, no hallucinations
2. **Trust over guessing** - If we don't know, we don't return it
3. **Architecture over hacks** - Each layer has one job
4. **Deterministic behavior** - Same input = same output

---

## Environment Variables Required

```bash
OPENAI_API_KEY=...      # For intelligence layer
SERPAPI_KEY=...         # For web search layer
REPLICATE_API_TOKEN=... # For visualization layer
```

---

## Why This Architecture?

**Previous implementation failed because:**
- AI was overloaded with multiple responsibilities
- URLs were hallucinated
- Responsibilities were mixed
- Output was non-deterministic

**This rebuild enforces:**
- ✅ Single responsibility per layer
- ✅ Real web search for product verification
- ✅ Clear data flow
- ✅ Production-safe error handling

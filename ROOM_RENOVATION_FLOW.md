# Celoten Pogovorni Flow za Generiranje Sobe (Room Renovation)

## Pregled

Room renovation flow je interaktivni pogovorni proces, ki vodi uporabnika skozi 11 korakov za oblikovanje in generiranje novega dizajna sobe. Flow uporablja konverzacijski UI z AI sporočili in uporabniškimi interakcijami.

---

## Korak 0: Inicializacija in Pozdrav

**Komponenta:** `RoomRenovationFlow.tsx` (useEffect inicializacija)

**Proces:**
1. Komponenta se naloži in avtomatsko pokliče `/api/generate-greeting`
2. API generira personaliziran pozdrav z OpenAI GPT-4o-mini
3. Pozdrav se prikaže v konverzaciji z typewriter efektom
4. Flow se avtomatsko premakne na korak 1

**API Endpoint:** `POST /api/generate-greeting`
- Uporablja OpenAI GPT-4o-mini
- Generira profesionalen pozdrav za room renovation projekt

---

## Korak 1: Izbira Tipa Sobe

**Komponenta:** `Step1RoomType.tsx`

**Proces:**
1. AI sporočilo: "Which room would you like to renovate today?"
2. Uporabnik izbere tip sobe:
   - Kitchen
   - Bathroom
   - Bedroom
   - Living room
   - Other
3. Izbira se shrani v `data.roomType`
4. Uporabniško sporočilo se doda v konverzacijo
5. Flow se premakne na korak 2

**Shranjeno:** `roomType: "kitchen" | "bathroom" | "bedroom" | "living-room" | "other"`

---

## Korak 2: Nalaganje Fotografij

**Komponenta:** `Step2PhotoUpload.tsx`

**Proces:**
1. AI sporočilo: "Great.\n\nPlease upload a photo of the room as it looks right now."
2. Uporabnik naloži eno ali več fotografij trenutne sobe
3. Fotografije se shranijo v `data.photos` (File[])
4. Ko uporabnik klikne "Continue":
   - Uporabniško sporočilo: "X photo(s) uploaded"
   - Flow se premakne na korak 3

**Shranjeno:** `photos: File[]`

---

## Korak 3: AI Analiza Sobe

**Komponenta:** `Step3AIObservation.tsx`

**Proces:**
1. Komponenta se avtomatsko zažene, ko so fotografije naložene
2. Prikaže se loading stanje: "Analyzing your space…"
3. Fotografije se pretvorijo v base64 data URLs
4. API klic: `POST /api/analyze-room`
   - **API Endpoint:** `/app/api/analyze-room/route.ts`
   - Uporablja OpenAI GPT-4o Vision API
   - Analizira fotografije in generira objektivno opazovanje sobe
   - System prompt: "Describe only what you objectively see... Do not guess. Do not suggest improvements."
5. AI opazovanje se prikaže v konverzaciji
6. Flow se avtomatsko premakne na korak 4

**API Endpoint:** `POST /api/analyze-room`
- **Model:** GPT-4o (Vision)
- **Input:** Array of base64 image data URLs
- **Output:** `{ observation: string }` - 2-3 kratke, faktualne povedi o trenutnem stanju sobe

**Shranjeno:** `aiObservation: string`

---

## Korak 4: Izbira Stila

**Komponenta:** `Step4StyleSelection.tsx`

**Proces:**
1. AI sporočilo: "What style would you like this room to have?"
2. Uporabnik izbere enega ali več stilov (npr. Modern, Scandinavian, Industrial, itd.)
3. Izbrani slogi se shranijo v `data.selectedStyles`
4. Ko uporabnik klikne "Continue":
   - Uporabniško sporočilo: "Selected styles: Modern, Scandinavian"
   - Flow se premakne na korak 5

**Shranjeno:** `selectedStyles: string[]`

---

## Korak 5: Signal Budgeta

**Komponenta:** `Step5BudgetSignal.tsx`

**Proces:**
1. AI sporočilo: "To guide the design choices, what budget level should I aim for?"
2. Uporabnik izbere budget level:
   - Budget-friendly
   - Balanced
   - Premium
   - Not sure yet
3. Izbira se shrani v `data.budgetLevel`
4. Uporabniško sporočilo se doda v konverzacijo
5. Flow se premakne na korak 6

**Shranjeno:** `budgetLevel: "budget-friendly" | "balanced" | "premium" | "not-sure"`

---

## Korak 6: Design Preferences

**Komponenta:** `Step6DesignPreferences.tsx`

**Proces:**
1. AI sporočilo: "Great. Tell me your preferences (colors, floor, heating, key furniture) so I don't guess."
2. Uporabnik nastavi preference:
   - **Wall Main Color:** (npr. "warm greige")
   - **Wall Accent Color:** (npr. "olive green")
   - **Flooring:** "keep" | "replace" | "refinish"
   - **Underfloor Heating:** true/false
   - **Bed Type:** (samo za bedroom) "none" | "single" | "double" | "king"
   - **Notes:** dodatne opombe
3. Preference se shranijo v `data.preferences`
4. Ko uporabnik klikne "Continue":
   - Uporabniško sporočilo z vsemi preferencemi
   - Flow se premakne na korak 7

**Shranjeno:** `preferences: RoomDesignPreferences`

---

## Korak 7: Generiranje Dizajnov

**Komponenta:** `Step6DesignGeneration.tsx`

**Proces:**
1. Komponenta se avtomatsko zažene
2. Prikaže se loading stanje
3. **Faza 1: Resize slike**
   - Prva fotografija se resize-a na max 1920x1920px, quality 9.5
4. **Faza 2: Generiranje Prompt-a**
   - API klic: `POST /api/prompt-room-render`
   - **API Endpoint:** `/app/api/prompt-room-render/route.ts`
   - **Model:** GPT-4o-mini (Vision)
   - **Input:**
     - `image`: base64 data URL
     - `roomType`: tip sobe
     - `styles`: izbrani slogi
     - `budget`: budget level
     - `preferences`: design preferences
     - `observation`: AI opazovanje
   - **Output:**
     - `prompt`: optimiziran prompt za image editing
     - `negativePrompt`: negativen prompt
     - `decisions`: AI odločitve o barvah, tleh, itd.
   - **Ključna funkcionalnost:**
     - Preservira geometrijo sobe (okna, vrata, polica, itd.)
     - Lock-anje vseh anchored elementov
     - Safety suffix za dodatno zaščito
5. **Faza 3: Generiranje Slik**
   - API klic: `POST /api/render`
   - **API Endpoint:** `/app/api/render/route.ts`
   - **Model:** OpenAI Images API (`gpt-image-1`)
   - **Input:**
     - `image`: base64 data URL (resized)
     - `prompt`: generiran prompt
     - `negativePrompt`: generiran negative prompt
     - `n`: 3 (število variacij)
     - `size`: "auto"
   - **Proces:**
     - Uporablja `openai.images.edit()` za image editing
     - Generira 3 različne variacije dizajna
     - Retry logika za 429 rate limits
   - **Output:**
     - `images`: array of image URLs (data URLs ali URL-ji)
6. Generirane slike se shranijo v `data.generatedDesigns`
7. AI sporočilo: "Here are your redesigned room concepts.\n\nChoose the one you like most to continue."
8. Flow se premakne na korak 8

**API Endpoints:**
- `POST /api/prompt-room-render` - generira optimiziran prompt
- `POST /api/render` - generira 3 variacije dizajna

**Shranjeno:** `generatedDesigns: string[]` (3 image URLs)

---

## Korak 8: Izbira Finalnega Dizajna

**Komponenta:** `Step7FinalDesignSelection.tsx`

**Proces:**
1. Prikaže se grid z 3 generiranimi dizajni
2. Uporabnik izbere najljubši dizajn (z zoom funkcionalnostjo)
3. Izbira se shrani v `data.selectedDesign`
4. Uporabniško sporočilo: "Selected design concept"
5. AI sporočilo z izbranim dizajnom (slika)
6. Flow se premakne na korak 9

**Shranjeno:** `selectedDesign: string` (image URL)

---

## Korak 9: Ocena Stroškov

**Komponenta:** `Step8CostEstimate.tsx`

**Proces:**
1. Komponenta se avtomatsko zažene
2. Izračuna se cost estimate na podlagi:
   - `roomType`: base cost za tip sobe
     - Kitchen: €15,000
     - Bathroom: €8,000
     - Bedroom: €5,000
     - Living room: €7,000
     - Other: €6,000
   - `budgetLevel`: multiplier
     - Budget-friendly: 0.7x
     - Balanced: 1.0x
     - Premium: 1.5x
     - Not sure: 1.0x
3. Razčlenitev stroškov:
   - **Materials:** 40-50% base cost
   - **Furniture:** 30-40% base cost
   - **Labor:** 20-30% base cost
   - **Total:** vsota vseh
4. Cost breakdown se prikaže v konverzaciji z:
   - Izbranim dizajnom
   - Razčlenitvijo po kategorijah
   - Total range (min-max)
   - Opomba: "Estimated values ±10–15%"
5. Flow se premakne na korak 10

**Shranjeno:** `costEstimate: { materials, furniture, labor, total }` (vsi z min/max)

---

## Korak 10: Predlogi Materialov

**Komponenta:** `Step9MaterialSuggestions.tsx`

**Proces:**
1. Komponenta se avtomatsko zažene
2. **Trenutno:** Uporablja placeholder podatke
   - TODO: Implementirati API klic za realne predloge
3. Generira predloge materialov na podlagi:
   - `roomType`: tip sobe
   - `style`: prvi izbrani slog
4. Predlogi se prikažejo v konverzaciji:
   - Kategorija: Product Type (Brand/Store)
   - Primer: "Flooring: Vinyl plank (Merkur)"
5. Flow se premakne na korak 11

**Shranjeno:** `materialSuggestions: Array<{ category, productType, brandOrStore }>`

**Opomba:** Ta korak trenutno uporablja hardcoded podatke. V prihodnosti bi moral klicati API za realne predloge na podlagi dizajna in preference.

---

## Korak 11: Finalni Poročilo

**Komponenta:** `Step10FinalReport.tsx`

**Proces:**
1. AI sporočilo: "Your renovation project is ready."
2. Prikaže se finalni poročilo z:
   - Povzetkom celotnega projekta
   - Izbranim dizajnom
   - Cost estimate
   - Material suggestions
   - Možnost za shranjevanje projekta
3. Uporabnik lahko:
   - Shrani projekt
   - Začne nov projekt
   - Pregleda rezultate

**Shranjeno:** Vsi podatki so že shranjeni v `data` objektu

---

## Konverzacijski UI

**Komponenta:** `ConversationMessage.tsx`

**Funkcionalnosti:**
- **AI Sporočila:**
  - Typewriter efekt (22ms na znak)
  - Auto-scroll med tipkanjem
  - Podpora za string in ReactNode vsebino
  - Loading stanja

- **Uporabniška Sporočila:**
  - Enostavna prikaz vsebine
  - Timestamp

- **Layout:**
  - AI sporočila: levo
  - Uporabniška sporočila: desno
  - Max width: 85%
  - Rounded corners, transparent background

---

## API Endpoints Povzetek

### 1. `/api/generate-greeting`
- **Metoda:** POST
- **Model:** GPT-4o-mini
- **Namen:** Generira personaliziran pozdrav

### 2. `/api/analyze-room`
- **Metoda:** POST
- **Model:** GPT-4o (Vision)
- **Input:** `{ images: string[] }` (base64 data URLs)
- **Output:** `{ observation: string }`
- **Namen:** Analizira fotografije sobe in generira objektivno opazovanje

### 3. `/api/prompt-room-render`
- **Metoda:** POST
- **Model:** GPT-4o-mini (Vision)
- **Input:**
  ```json
  {
    "image": "data:image/...",
    "roomType": "kitchen",
    "styles": ["modern", "scandinavian"],
    "budget": "balanced",
    "preferences": { ... },
    "observation": "..."
  }
  ```
- **Output:**
  ```json
  {
    "prompt": "...",
    "negativePrompt": "...",
    "decisions": { ... }
  }
  ```
- **Namen:** Generira optimiziran prompt za image editing z preservacijo geometrije

### 4. `/api/render`
- **Metoda:** POST
- **Model:** OpenAI Images API (`gpt-image-1`)
- **Input:**
  ```json
  {
    "image": "data:image/...",
    "prompt": "...",
    "negativePrompt": "...",
    "n": 3,
    "size": "auto"
  }
  ```
- **Output:**
  ```json
  {
    "imageUrl": "...",
    "images": ["...", "...", "..."],
    "metadata": { ... }
  }
  ```
- **Namen:** Generira 3 variacije dizajna z image editing

---

## Data Flow

```
User Input → Component State → API Call → Response → State Update → Next Step
```

**State Management:**
- Vsi podatki se shranjujejo v `RoomRenovationData` objekt
- Komponente prejemajo podatke preko props
- Posodobitve preko `updateData()` funkcije
- Konverzacija se shranjuje v `conversation` array

---

## Ključne Značilnosti

1. **Typewriter Efekt:** AI sporočila se prikazujejo z animacijo tipkanja
2. **Auto-scroll:** Konverzacija se avtomatsko scroll-a med tipkanjem
3. **Auto-advance:** Nekateri koraki se avtomatsko premaknejo naprej (Step 3, 7, 9)
4. **Image Resizing:** Fotografije se avtomatsko resize-ajo pred API klici
5. **Geometry Preservation:** Prompt engineering za ohranitev geometrije sobe
6. **Error Handling:** Fallback vrednosti in error sporočila
7. **Retry Logic:** 429 rate limit handling v `/api/render`

---

## Prihodnje Izboljšave

1. **Step 10 (Material Suggestions):** Implementirati real API za predloge materialov
2. **Caching:** Cache-ati generirane dizajne za hitrejše ponovne zahteve
3. **Progress Tracking:** Shranjevanje napredka v bazo podatkov
4. **Undo/Redo:** Možnost vračanja korakov
5. **Export:** PDF export finalnega poročila

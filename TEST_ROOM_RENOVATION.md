# Test Skripta za Prenovo Sobe z Replicate AI

## Opis

Ta test skripta testira Replicate AI za prenovo sobe. Vzame sliko sobe kot input in vrne prenovljeno sobo, pri čemer:

✅ **SMEMO spremeniti:**
- Pohištvo (postelja, stol, miza)
- Barvo sten
- Dekoracije
- Svetlobo
- Materiale

❌ **NE SMEMO spremeniti:**
- Vrata (pozicija, velikost)
- Okna (pozicija, velikost)
- Stene (pozicija, širina)
- Struktura sobe
- Proporcije sobe
- Kamera kot

## Zahteve

1. Node.js (v18 ali novejši)
2. Replicate API token v `.env.local`
3. Test slika (opcijsko)

## Namestitev

```bash
# Namesti odvisnosti (če še niso)
npm install

# Preveri, da je replicate nameščen
npm list replicate
```

## Uporaba

### Osnovna uporaba (z default sliko)

```bash
node test-room-renovation-replicate.js
```

To bo uporabilo sliko iz `public/test-assets/floorplan-test.png`.

### Z lastno sliko

```bash
node test-room-renovation-replicate.js path/to/your/image.png
```

### Podprti formati slik

- PNG
- JPEG/JPG
- WebP

## Konfiguracija

Skripta prebere `REPLICATE_API_TOKEN` iz `.env.local`:

```env
REPLICATE_API_TOKEN=r8_xxxxxxxxxxxxx
```

## Rezultati

Generirane slike se shranijo v mapo `test-results/` z imenom:
```
renovated-room-YYYY-MM-DDTHH-MM-SS-sssZ.png
```

## Primer izhoda

```
🔑 Replicate API Token:
   r8_xxxxxxxxxxxxx...

📸 Using image: public/test-assets/floorplan-test.png

🚀 Starting room renovation test...

📖 Reading input image...
✅ Image loaded (245 KB)

📝 Render prompt prepared
   Prompt length: 1234 characters
   Negative prompt length: 456 characters

🎨 Calling Replicate API...
   Model: stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b
   Prompt strength: 0.55
   Guidance scale: 8.5
   Inference steps: 40

✅ Replicate API call completed
   Time taken: 12.34 seconds

📸 Generated image URL:
   https://replicate.delivery/...

💾 Downloading and saving result...
💾 Saved result to: test-results/renovated-room-2025-12-29T...

============================================================
✅ TEST COMPLETED SUCCESSFULLY
============================================================

📊 Results:
   Input image: public/test-assets/floorplan-test.png
   Output image: test-results/renovated-room-2025-12-29T...
   Generation time: 12.34s

🔍 Verification:
   ✓ Layout preserved (doors, windows, walls, structure)
   ✓ Furniture and colors changed
   ✓ Full color RGB output
   ✓ Photorealistic quality
```

## Troubleshooting

### Napaka: "REPLICATE_API_TOKEN is required"

Preveri, da imaš v `.env.local` nastavljen token:
```env
REPLICATE_API_TOKEN=r8_xxxxxxxxxxxxx
```

### Napaka: "Rate limit exceeded" (429)

Replicate ima omejitev 6 zahtev na minuto. Počakaj nekaj minut in poskusi znova.

### Napaka: "Image not found"

Preveri, da je pot do slike pravilna:
```bash
ls -la path/to/your/image.png
```

### Slika ni barvna / je črno-bela

Preveri, da uporabljaš pravilen model in da je `prompt_strength` nastavljen na 0.55 (ne previsoko).

## Napredne možnosti

### Spremeni parametre generiranja

Uredi `test-room-renovation-replicate.js` in spremeni:

```javascript
const replicateInput = {
  prompt_strength: 0.55,  // Nizka = ohrani layout, Visoka = več sprememb
  guidance_scale: 8.5,    // Visoka = močnejši prompt
  num_inference_steps: 40, // Več = boljša kakovost, počasneje
};
```

### Spremeni stil prenove

Uredi `renderPrompt` v skripti, da spremeni stil:
- Modern
- Scandinavian
- Luxury
- Minimal
- itd.

## Podpora

Če imaš težave, preveri:
1. Da je Replicate API token veljaven
2. Da imaš dovolj kredita na Replicate računu
3. Da je slika v podprtem formatu
4. Da je Node.js pravilno nameščen

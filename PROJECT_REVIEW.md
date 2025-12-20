# Pregled Projekta - Najdeni Problemi in Manjkajoče Funkcionalnosti

## ✅ KAJ DELUJE

### API Struktura
- ✅ `/app/api/generate/route.ts` - glavni orchestrator
- ✅ `/app/api/generate/intent.ts` - ChatGPT #1 (prompt je OK)
- ✅ `/app/api/generate/search.ts` - SerpAPI integracija
- ✅ `/app/api/generate/curate.ts` - ChatGPT #2 (prompt je OK)
- ✅ `/app/api/generate/render.ts` - Replicate integracija
- ✅ `/app/api/generate/map.ts` - Store locations
- ✅ `/app/api/generate/types.ts` - TypeScript tipi

### Frontend
- ✅ Questionnaire UI - vse koraki implementirani
- ✅ StepGenerate komponenta - kliče `/api/generate`
- ✅ Test komponenta - `/test-replicate` za testiranje Replicate

## ❌ NAJDENI PROBLEMI

### 1. Replicate Image Upload Problem
**Lokacija:** `app/api/generate/render.ts`

**Problem:**
- Replicate SDK poskuša uporabiti lokalno datoteko `/tmp/tmpXXXfile.png`, ki ne obstaja
- Upload preko Replicate Files API morda ne deluje pravilno
- Fallback na data URI morda ne deluje za ControlNet modele

**Možne rešitve:**
- Preveriti, ali Replicate SDK podpira direktno base64
- Uporabiti Buffer objekt namesto data URI
- Preveriti Replicate API dokumentacijo za pravilen format

### 2. Barvne Slike Problem
**Lokacija:** `app/api/generate/render.ts`, `app/api/generate/curate.ts`

**Problem:**
- Slike so še vedno črno-bele, čeprav so promti posodobljeni
- Negative prompt morda ni dovolj močan
- ControlNet model morda ignorira color zahteve

**Možne rešitve:**
- Dodati še več color zahtev v prompt
- Preveriti, ali ControlNet model podpira color output
- Morda uporabiti drugačen model

### 3. Manjkajoče Validacije
**Lokacija:** `app/api/generate/route.ts`

**Možni problemi:**
- Ni validacije, da so vsi required fields prisotni
- Ni validacije formata uploads (floorPlan)
- Ni error handling za delne napake

### 4. Store Locations
**Lokacija:** `app/api/generate/map.ts`

**Problem:**
- Vse lokacije so hardcoded na Ljubljano
- Ni realnega geocodinga
- Ni upoštevanja uporabnikove lokacije

## ⚠️ POTENCIALNI PROBLEMI

### 1. Rate Limiting
- Ni rate limitinga v `/api/generate/route.ts`
- SerpAPI ima rate limits
- Replicate ima rate limits
- OpenAI ima rate limits

### 2. Error Handling
- Render napake se ignorirajo (continue without render)
- Ni retry logike
- Ni timeout handlinga

### 3. Performance
- SerpAPI iskanja so zaporedna (lahko traja dolgo)
- Ni cachinga
- Ni optimizacije za večje datoteke

## 📋 PRIPOROČILA

### Takojšnji popravki:
1. **Replicate Image Upload** - preveriti pravilen način uploada
2. **Color Output** - preveriti, ali model res podpira color
3. **Error Messages** - boljši error handling

### Dolgoročni izboljšanja:
1. Rate limiting
2. Caching
3. Real geocoding za store locations
4. Retry logika
5. Timeout handling

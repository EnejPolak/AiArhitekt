# AI Architect

## Render API (OpenAI-only)

This project uses **OpenAI Images API** (`gpt-image-1`) via the server route `POST /api/render`.

**Note:** `gpt-image-1` may require **Organization Verification** in your OpenAI account. If you see a `403` error about verification, verify your org in the OpenAI dashboard and wait up to ~15 minutes for access to propagate.

### Setup

1) Copy `env.example` → `.env.local` (or set the variable in your environment)
2) Set:

`OPENAI_API_KEY=...`

### API (backwards compatible)

**Request** (same as current UI; extra fields optional):

```json
{
  "image": "data:image/jpeg;base64,...", 
  "prompt": "string (required)",
  "negativePrompt": "string (optional)",
  "mask": "data:image/png;base64,... (optional)",
  "size": "1024x1536 (optional)",
  "n": 1
}
```

**Response**

```json
{
  "imageUrl": "data:image/png;base64,...",
  "metadata": { "provider": "openai", "size": "1024x1536", "n": 1, "mode": "edits" }
}
```

---

## Places API (store discovery)

Store discovery uses **Google Places API** (Nearby Search + optional Details) via `POST /api/places/search`.

### Cost control

- **Request cap:** Max 6 requests per search (3 category keywords + up to 2 fallback, or up to 5 brand keywords).
- **Radius:** `radiusKm` is clamped to 1–50 km; results are post-filtered by Haversine distance so only places within the radius are returned.
- **Caching:** Search results cached 14 days, place details 30 days (by rounded lat/lng + keyword + language).
- **Validation:** Invalid or out-of-range `lat`/`lng` return 400.

### Request

```json
{
  "lat": 46.36,
  "lng": 15.11,
  "radiusKm": 50,
  "mode": "category",
  "dryRun": false
}
```

`mode`: `"category"` (pohištvo / keramika / železnina) or `"brand"` (requires `brandKeywords`). Response includes `meta` (e.g. `requestsMade`, `filteredOutCount`, `usedLocation`) and `places` with `distanceMeters` / `distanceKm`.


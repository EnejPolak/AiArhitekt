# Google Places Search Module

Cost-controlled Google Places search for Slovenian stores with caching, throttling, and smart query planning.

## API Endpoints

### POST `/api/places/search`

Search for nearby stores around a location.

**Request Body:**
```json
{
  "lat": 46.0569,
  "lng": 14.5058,
  "radiusKm": 10,
  "mode": "category",  // "category" | "brand" (optional, default: "category")
  "brandKeywords": ["Merkur", "Lesnina"],  // Required if mode="brand"
  "dryRun": false  // Optional, default: false
}
```

**Response:**
```json
{
  "meta": {
    "radiusMeters": 10000,
    "requestsMade": 3,
    "cacheHits": 0,
    "fallbacksUsed": 0,
    "plannedQueries": [
      "pohištvo (sl)",
      "keramika (sl)",
      "železnina (sl)"
    ],
    "executionNotes": []
  },
  "places": [
    {
      "place_id": "ChIJ...",
      "name": "Merkur",
      "types": ["store", "furniture_store"],
      "vicinity": "Ljubljana",
      "formatted_address": "Trubarjeva cesta 50, 1000 Ljubljana",
      "location": {
        "lat": 46.0569,
        "lng": 14.5058
      },
      "rating": 4.5,
      "user_ratings_total": 123,
      "opening_hours": {
        "open_now": true
      },
      "googleMapsUrl": "https://www.google.com/maps/place/?q=place_id:ChIJ...",
      "sourceKeywords": ["pohištvo"],
      "categoriesMatched": ["furniture"]
    }
  ]
}
```

### GET `/api/places/details?placeId=ChIJ...`

Fetch detailed information for a specific place (lazy loading).

**Query Parameters:**
- `placeId` (required): Google Place ID

**Response:**
```json
{
  "place_id": "ChIJ...",
  "name": "Merkur",
  "formatted_address": "Trubarjeva cesta 50, 1000 Ljubljana",
  "formatted_phone_number": "+386 1 234 5678",
  "website": "https://www.merkur.si",
  "opening_hours": {
    "open_now": true,
    "weekday_text": ["Monday: 8:00 AM – 8:00 PM", ...]
  },
  "url": "https://maps.google.com/...",
  ...
}
```

## Cost Control Features

### 1. **Request Limits**
- **Max 6 requests per search** (absolute cap)
- **Concurrency: 2** (max 2 requests in flight)
- **Throttling: 3 requests/second**

### 2. **Query Strategy**

**Category Mode (default):**
- Phase 1: 3 Slovenian queries
  - `pohištvo` (furniture)
  - `keramika` (tiles/bathroom)
  - `železnina` (hardware)
- Phase 2: English fallback (max 2 queries total)
  - Only if category returned 0 results or < 3 results
  - Prioritizes categories with 0 results first

**Brand Mode:**
- Up to 5 brand queries (from `brandKeywords`)
- Still respects max 6 requests total

### 3. **Caching**
- **Search results**: 14 days TTL
- **Place details**: 30 days TTL
- Cache key includes: `(roundedLat, roundedLng, radiusKm, keyword, language, region)`
- Coordinates rounded to 3 decimals to reduce cache fragmentation
- In-memory cache (Map-based), optional Redis support

### 4. **Lazy Details Loading**
- Search endpoint returns basic fields only
- Details endpoint called only when user explicitly requests it
- Saves API costs by not fetching details for all places upfront

### 5. **Error Handling**
- **429 / OVER_QUERY_LIMIT**: Exponential backoff, max 2 retries
- **ZERO_RESULTS**: Not treated as error, returns empty array
- **Partial results**: Always returns what was found, even if some queries fail
- **Timeout**: 6 seconds per request

## Usage Examples

### Basic Category Search
```typescript
const response = await fetch('/api/places/search', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    lat: 46.0569,
    lng: 14.5058,
    radiusKm: 10
  })
});

const { places, meta } = await response.json();
console.log(`Found ${places.length} places using ${meta.requestsMade} API calls`);
```

### Brand Search
```typescript
const response = await fetch('/api/places/search', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    lat: 46.0569,
    lng: 14.5058,
    radiusKm: 20,
    mode: 'brand',
    brandKeywords: ['Merkur', 'Lesnina', 'JYSK']
  })
});
```

### Dry Run (Planning)
```typescript
const response = await fetch('/api/places/search', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    lat: 46.0569,
    lng: 14.5058,
    radiusKm: 10,
    dryRun: true
  })
});

const { meta } = await response.json();
console.log('Planned queries:', meta.plannedQueries);
// requestsMade: 0, no API calls made
```

### Fetch Place Details
```typescript
const response = await fetch(`/api/places/details?placeId=${placeId}`);
const details = await response.json();
console.log('Phone:', details.formatted_phone_number);
console.log('Website:', details.website);
```

## Environment Variables

```env
GOOGLE_MAPS_API_KEY=your_api_key_here
```

## Response Fields

### Place (from search)
- `place_id`: Unique Google Place ID
- `name`: Place name
- `types`: Array of place types
- `vicinity` / `formatted_address`: Address
- `location`: `{ lat, lng }`
- `rating`: Average rating (0-5)
- `user_ratings_total`: Number of ratings
- `opening_hours.open_now`: Boolean (if available)
- `googleMapsUrl`: Direct link to Google Maps
- `sourceKeywords`: Array of keywords that matched this place
- `categoriesMatched`: Array of categories (furniture, tiles_bathroom, hardware)

### PlaceDetails (from details endpoint)
- All fields from Place, plus:
- `formatted_phone_number`: Phone number
- `website`: Website URL
- `opening_hours.weekday_text`: Array of opening hours per day
- `url`: Google Maps URL

## Performance

- **Cache hit**: ~1ms (no API call)
- **Cache miss**: ~200-500ms per request (with throttling)
- **Typical search**: 3-5 requests = ~1-2 seconds
- **Details fetch**: ~200-500ms (cached after first call)

## Best Practices

1. **Use caching**: Same location + radius + keyword = instant results
2. **Lazy details**: Only fetch details when user clicks on a place
3. **Dry run first**: Use `dryRun: true` to see planned queries
4. **Monitor meta**: Check `requestsMade` and `cacheHits` to optimize
5. **Handle partial results**: Always check `places.length` even if some queries failed

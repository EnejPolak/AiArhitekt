import { NextResponse } from "next/server";
import { TTLCache } from "@/lib/cache";
import { RateLimiter, getClientIP } from "@/lib/rateLimit";

export const runtime = "nodejs";

interface PlaceStore {
  placeId: string;
  name: string;
  vicinity: string;
  rating: number | null;
  userRatingsTotal: number | null;
  lat: number;
  lng: number;
  googleMapsUrl: string;
}

interface PlacesCacheEntry {
  stores: PlaceStore[];
}

// Cache with 10 minutes TTL
const placesCache = new TTLCache<PlacesCacheEntry>(10 * 60 * 1000);

// Rate limiter: 30 requests per minute per IP
const rateLimiter = new RateLimiter(30, 60000);

export async function GET(req: Request) {
  try {
    // Rate limiting
    const clientIP = getClientIP(req);
    const rateLimitCheck = rateLimiter.check(clientIP);
    if (!rateLimitCheck.allowed) {
      return NextResponse.json(
        {
          error: "rate_limited",
          details: "Too many requests. Please try again later.",
          resetAt: rateLimitCheck.resetAt,
          status: 429,
        },
        { status: 429 }
      );
    }

    const { searchParams } = new URL(req.url);
    const latParam = searchParams.get("lat");
    const lngParam = searchParams.get("lng");
    const radiusKmParam = searchParams.get("radiusKm");
    const keyword = searchParams.get("keyword") || "";

    // Validation
    if (!latParam || !lngParam) {
      return NextResponse.json(
        { error: "lat and lng parameters are required", status: 400 },
        { status: 400 }
      );
    }

    const lat = parseFloat(latParam);
    const lng = parseFloat(lngParam);

    if (isNaN(lat) || isNaN(lng)) {
      return NextResponse.json(
        { error: "lat and lng must be valid numbers", status: 400 },
        { status: 400 }
      );
    }

    // Validate lat/lng range
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return NextResponse.json(
        { error: "Invalid lat/lng range", status: 400 },
        { status: 400 }
      );
    }

    // Clamp radiusKm to [1..50]
    let radiusKm = 10; // default
    if (radiusKmParam) {
      radiusKm = Math.max(1, Math.min(50, parseFloat(radiusKmParam) || 10));
    }

    const radiusMeters = Math.round(radiusKm * 1000);

    // Check cache
    const cacheKey = `${lat.toFixed(4)},${lng.toFixed(4)},${radiusKm},${keyword}`;
    const cached = placesCache.get(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    // Check API key
    if (!process.env.GOOGLE_MAPS_API_KEY) {
      return NextResponse.json(
        { error: "GOOGLE_MAPS_API_KEY not configured", status: 500 },
        { status: 500 }
      );
    }

    // Build URL for Places Nearby Search
    const location = `${lat},${lng}`;
    const keywordParam = keyword ? `&keyword=${encodeURIComponent(keyword)}` : "";
    const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${location}&radius=${radiusMeters}${keywordParam}&key=${process.env.GOOGLE_MAPS_API_KEY}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

    try {
      const response = await fetch(url, {
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`Google Places API error: ${response.status}`);
      }

      const data = await response.json();

      if (data.status === "ZERO_RESULTS") {
        const emptyResult: PlacesCacheEntry = { stores: [] };
        placesCache.set(cacheKey, emptyResult);
        return NextResponse.json(emptyResult);
      }

      if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
        return NextResponse.json(
          {
            error: "Places API error",
            details: data.status,
            status: 400,
          },
          { status: 400 }
        );
      }

      // Parse results (up to 20)
      const stores: PlaceStore[] = (data.results || [])
        .slice(0, 20)
        .map((place: any) => ({
          placeId: place.place_id,
          name: place.name,
          vicinity: place.vicinity || place.formatted_address || "",
          rating: place.rating || null,
          userRatingsTotal: place.user_ratings_total || null,
          lat: place.geometry.location.lat,
          lng: place.geometry.location.lng,
          googleMapsUrl: `https://www.google.com/maps/place/?q=place_id:${place.place_id}`,
        }));

      const result: PlacesCacheEntry = { stores };

      // Cache result
      placesCache.set(cacheKey, result);

      return NextResponse.json(result);
    } catch (error: any) {
      clearTimeout(timeout);
      if (error.name === "AbortError") {
        return NextResponse.json(
          {
            error: "Request timeout",
            details: "Places request took longer than 10 seconds",
            status: 504,
          },
          { status: 504 }
        );
      }
      throw error;
    }
  } catch (error: any) {
    console.error("Places stores error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error.message,
        status: 500,
      },
      { status: 500 }
    );
  }
}

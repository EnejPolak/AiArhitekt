import { NextResponse } from "next/server";
import { TTLCache } from "@/lib/cache";

export const runtime = "nodejs";

interface GeocodeCacheEntry {
  formattedAddress: string;
  lat: number;
  lng: number;
}

// Cache with 24h TTL
const geocodeCache = new TTLCache<GeocodeCacheEntry>(24 * 60 * 60 * 1000);

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const address = searchParams.get("address");

    // Validation
    if (!address || typeof address !== "string") {
      return NextResponse.json(
        { error: "address parameter is required", status: 400 },
        { status: 400 }
      );
    }

    const trimmedAddress = address.trim();
    if (trimmedAddress.length < 3) {
      return NextResponse.json(
        { error: "address must be at least 3 characters", status: 400 },
        { status: 400 }
      );
    }

    // Check cache
    const cacheKey = trimmedAddress.toLowerCase();
    const cached = geocodeCache.get(cacheKey);
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

    // Make request with timeout
    const encodedAddress = encodeURIComponent(trimmedAddress);
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodedAddress}&key=${process.env.GOOGLE_MAPS_API_KEY}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

    try {
      const response = await fetch(url, {
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`Google Geocoding API error: ${response.status}`);
      }

      const data = await response.json();

      if (data.status !== "OK" || !data.results?.[0]) {
        return NextResponse.json(
          {
            error: "Address not found",
            details: data.status,
            status: 404,
          },
          { status: 404 }
        );
      }

      const result = data.results[0];
      const location = result.geometry.location;

      const geocodeResult: GeocodeCacheEntry = {
        formattedAddress: result.formatted_address,
        lat: location.lat,
        lng: location.lng,
      };

      // Cache result
      geocodeCache.set(cacheKey, geocodeResult);

      return NextResponse.json(geocodeResult);
    } catch (error: any) {
      clearTimeout(timeout);
      if (error.name === "AbortError") {
        return NextResponse.json(
          {
            error: "Request timeout",
            details: "Geocoding request took longer than 10 seconds",
            status: 504,
          },
          { status: 504 }
        );
      }
      throw error;
    }
  } catch (error: any) {
    console.error("Geocode error:", error);
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

import { NextResponse } from "next/server";
import { searchPlaces, type SearchParams } from "@/lib/places/placesService";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body: SearchParams = await req.json().catch(() => ({}));

    // Strict validation - fail if lat/lng missing or invalid
    if (typeof body.lat !== "number" || typeof body.lng !== "number") {
      return NextResponse.json(
        { error: "lat and lng must be valid numbers", status: 400 },
        { status: 400 }
      );
    }

    // Validate coordinate ranges
    if (body.lat < -90 || body.lat > 90 || body.lng < -180 || body.lng > 180) {
      return NextResponse.json(
        { error: "Invalid coordinate range: lat must be -90 to 90, lng must be -180 to 180", status: 400 },
        { status: 400 }
      );
    }

    // Validate that coordinates are not NaN or Infinity
    if (!Number.isFinite(body.lat) || !Number.isFinite(body.lng)) {
      return NextResponse.json(
        { error: "lat and lng must be finite numbers", status: 400 },
        { status: 400 }
      );
    }

    if (typeof body.radiusKm !== "number" || body.radiusKm < 1 || body.radiusKm > 50) {
      return NextResponse.json(
        { error: "radiusKm must be a number between 1 and 50", status: 400 },
        { status: 400 }
      );
    }

    // Validate mode
    if (body.mode && body.mode !== "category" && body.mode !== "brand") {
      return NextResponse.json(
        { error: "mode must be 'category' or 'brand'", status: 400 },
        { status: 400 }
      );
    }

    // Validate brandKeywords if mode is brand
    if (body.mode === "brand") {
      if (!Array.isArray(body.brandKeywords) || body.brandKeywords.length === 0) {
        return NextResponse.json(
          { error: "brandKeywords array is required when mode is 'brand'", status: 400 },
          { status: 400 }
        );
      }
    }

    // Execute search (onlyWithWebsite: default true; debug: include candidates + discarded)
    const result = await searchPlaces({
      lat: body.lat,
      lng: body.lng,
      radiusKm: body.radiusKm,
      mode: body.mode || "category",
      brandKeywords: body.brandKeywords,
      dryRun: body.dryRun || false,
      onlyWithWebsite: body.onlyWithWebsite !== false,
      debug: body.debug === true,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Places search error:", error);
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

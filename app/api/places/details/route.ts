import { NextResponse } from "next/server";
import { getPlaceDetails } from "@/lib/places/placesService";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const placeId = searchParams.get("placeId");

    if (!placeId || typeof placeId !== "string") {
      return NextResponse.json(
        { error: "placeId parameter is required", status: 400 },
        { status: 400 }
      );
    }

    // Fetch details
    const details = await getPlaceDetails(placeId);

    if (!details) {
      return NextResponse.json(
        { error: "Place not found", status: 404 },
        { status: 404 }
      );
    }

    return NextResponse.json(details);
  } catch (error: any) {
    console.error("Places details error:", error);
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

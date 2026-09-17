import { NextResponse } from "next/server";
import { getPlaceDetails } from "@/lib/places/placesService";
import { requireSpendRouteAuth } from "@/lib/api/spendAuth";
import { sanitizedInternalErrorResponse } from "@/lib/api/publicError";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await requireSpendRouteAuth();
  if (!auth.ok) return auth.response;
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
  } catch (error: unknown) {
    return sanitizedInternalErrorResponse("Places details error:", error);
  }
}

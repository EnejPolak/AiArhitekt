import { NextResponse } from "next/server";
import { geocodeAddress, reverseGeocode } from "@/lib/geocode/service";
import type { GeocodeResult } from "@/lib/geocode/types";

export const runtime = "nodejs";

function jsonResult(result: GeocodeResult): NextResponse {
  if (result.ok) {
    return NextResponse.json({
      ok: true,
      formattedAddress: result.formattedAddress,
      lat: result.lat,
      lng: result.lng,
    });
  }
  return NextResponse.json(
    {
      ok: false,
      code: result.code,
      message: result.message,
      error: result.message,
      status: result.httpStatus,
    },
    { status: result.httpStatus }
  );
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const address = searchParams.get("address");
    if (!address || typeof address !== "string") {
      return jsonResult({
        ok: false,
        code: "GEOCODING_INVALID_REQUEST",
        message: "address parameter is required",
        httpStatus: 400,
      });
    }
    return jsonResult(await geocodeAddress(address));
  } catch {
    return jsonResult({
      ok: false,
      code: "GEOCODING_ERROR",
      message: "Geocoding failed.",
      httpStatus: 500,
    });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as
      | { address?: unknown; lat?: unknown; lng?: unknown }
      | null;
    if (!body || typeof body !== "object") {
      return jsonResult({
        ok: false,
        code: "GEOCODING_INVALID_REQUEST",
        message: "Invalid JSON",
        httpStatus: 400,
      });
    }
    if (typeof body.address === "string") {
      return jsonResult(await geocodeAddress(body.address));
    }
    if (typeof body.lat === "number" && typeof body.lng === "number") {
      return jsonResult(await reverseGeocode(body.lat, body.lng));
    }
    return jsonResult({
      ok: false,
      code: "GEOCODING_INVALID_REQUEST",
      message: "address or lat/lng is required",
      httpStatus: 400,
    });
  } catch {
    return jsonResult({
      ok: false,
      code: "GEOCODING_ERROR",
      message: "Geocoding failed.",
      httpStatus: 500,
    });
  }
}

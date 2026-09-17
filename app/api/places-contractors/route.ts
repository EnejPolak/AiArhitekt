import { NextResponse } from "next/server";
import { requireSpendRouteAuth } from "@/lib/api/spendAuth";
import { sanitizedInternalErrorResponse } from "@/lib/api/publicError";
import { clampSearchRadiusKm, isValidSearchCoordinate } from "@/lib/project-location/parse";
import {
  filterContractorsByRequestedRadius,
  readPlaceCoordinates,
} from "@/lib/places/contractorDistance";

export const runtime = "nodejs";

// Trade to search query mapping
const TRADE_QUERIES: Record<string, string> = {
  painter: "painter interior painting",
  flooring: "flooring installer",
  plumber: "plumber",
  electrician: "electrician",
};

export async function POST(req: Request) {
  const auth = await requireSpendRouteAuth();
  if (!auth.ok) return auth.response;
  try {
    if (!process.env.GOOGLE_MAPS_API_KEY) {
      return NextResponse.json({ error: "GOOGLE_MAPS_API_KEY not configured" }, { status: 500 });
    }

    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

    const { location, radiusKm, neededTrades } = body;

    if (!location || !isValidSearchCoordinate(location.lat, location.lng)) {
      return NextResponse.json({ error: "location with lat/lng is required" }, { status: 400 });
    }

    if (!neededTrades || !Array.isArray(neededTrades)) {
      return NextResponse.json({ error: "neededTrades array is required" }, { status: 400 });
    }

    const radiusMeters = clampSearchRadiusKm(radiusKm) * 1000;
    const contractorsByTrade: Record<string, Array<{
      name: string;
      address: string;
      phone: string | null;
      website: string | null;
      rating: number | null;
      reviewsCount: number | null;
      placeId: string;
    }>> = {};

    for (const trade of neededTrades) {
      const query = TRADE_QUERIES[trade] || trade;
      
      const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&location=${location.lat},${location.lng}&radius=${radiusMeters}&key=${process.env.GOOGLE_MAPS_API_KEY}`;
      
      try {
        const response = await fetch(url);
        const data = await response.json();

        if (data.status === "OK" && data.results) {
          const contractors: Array<{
            name: string;
            address: string;
            phone: string | null;
            website: string | null;
            rating: number | null;
            reviewsCount: number | null;
            placeId: string;
          }> = [];

          const rawResults: Array<{
            place_id?: string;
            name?: string;
            formatted_address?: string;
            vicinity?: string;
            rating?: number;
            user_ratings_total?: number;
          }> = Array.isArray(data.results) ? data.results : [];
          const inRadius = filterContractorsByRequestedRadius(
            rawResults,
            { lat: location.lat, lng: location.lng },
            radiusKm,
            readPlaceCoordinates
          );
          const topResults = inRadius.slice(0, 5);
          
          for (const place of topResults) {
            const placeId = place.place_id;
            if (!placeId) continue;
            try {
              // Get place details
              const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,formatted_address,formatted_phone_number,website,rating,user_ratings_total&key=${process.env.GOOGLE_MAPS_API_KEY}`;
              const detailsResponse = await fetch(detailsUrl);
              const detailsData = await detailsResponse.json();

              if (detailsData.result) {
                const result = detailsData.result;
                contractors.push({
                  name: result.name || place.name || "Unknown",
                  address: result.formatted_address || place.formatted_address || place.vicinity || "",
                  phone: result.formatted_phone_number || null,
                  website: result.website || null,
                  rating: result.rating || null,
                  reviewsCount: result.user_ratings_total || null,
                  placeId,
                });
              } else {
                // Fallback to basic info
                contractors.push({
                  name: place.name || "Unknown",
                  address: place.formatted_address || place.vicinity || "",
                  phone: null,
                  website: null,
                  rating: place.rating || null,
                  reviewsCount: place.user_ratings_total || null,
                  placeId,
                });
              }
            } catch (err) {
              console.warn(`Failed to get details for ${place.place_id}:`, err);
            }
          }

          contractorsByTrade[trade] = contractors;
        }
      } catch (err) {
        console.warn(`Failed to search for ${trade}:`, err);
        contractorsByTrade[trade] = [];
      }
    }

    return NextResponse.json({ contractorsByTrade });
  } catch (error: unknown) {
    return sanitizedInternalErrorResponse("Places contractors error:", error);
  }
}

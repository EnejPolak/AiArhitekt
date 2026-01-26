import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Trade to search query mapping
const TRADE_QUERIES: Record<string, string> = {
  painter: "painter interior painting",
  flooring: "flooring installer",
  plumber: "plumber",
  electrician: "electrician",
};

export async function POST(req: Request) {
  try {
    if (!process.env.GOOGLE_MAPS_API_KEY) {
      return NextResponse.json({ error: "GOOGLE_MAPS_API_KEY not configured" }, { status: 500 });
    }

    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

    const { location, radiusKm, neededTrades } = body;

    if (!location || typeof location.lat !== "number" || typeof location.lng !== "number") {
      return NextResponse.json({ error: "location with lat/lng is required" }, { status: 400 });
    }

    if (!neededTrades || !Array.isArray(neededTrades)) {
      return NextResponse.json({ error: "neededTrades array is required" }, { status: 400 });
    }

    const radiusMeters = (radiusKm || 50) * 1000;
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

          // Get details for top 3-5 results
          const topResults = data.results.slice(0, 5);
          
          for (const place of topResults) {
            try {
              // Get place details
              const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=name,formatted_address,formatted_phone_number,website,rating,user_ratings_total&key=${process.env.GOOGLE_MAPS_API_KEY}`;
              const detailsResponse = await fetch(detailsUrl);
              const detailsData = await detailsResponse.json();

              if (detailsData.result) {
                const result = detailsData.result;
                contractors.push({
                  name: result.name || place.name,
                  address: result.formatted_address || place.formatted_address || place.vicinity || "",
                  phone: result.formatted_phone_number || null,
                  website: result.website || null,
                  rating: result.rating || null,
                  reviewsCount: result.user_ratings_total || null,
                  placeId: place.place_id,
                });
              } else {
                // Fallback to basic info
                contractors.push({
                  name: place.name,
                  address: place.formatted_address || place.vicinity || "",
                  phone: null,
                  website: null,
                  rating: place.rating || null,
                  reviewsCount: place.user_ratings_total || null,
                  placeId: place.place_id,
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
  } catch (error: any) {
    console.error("Places contractors error:", error);
    return NextResponse.json({ error: error.message || "Contractor search failed" }, { status: 500 });
  }
}

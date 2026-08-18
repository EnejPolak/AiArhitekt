import { z } from "zod";

/** Raw Google Geocoding JSON — extra keys allowed, never forwarded to clients. */
export const googleGeocodeResponseSchema = z
  .object({
    status: z.string(),
    error_message: z.string().optional(),
    results: z
      .array(
        z
          .object({
            formatted_address: z.string().optional(),
            geometry: z
              .object({
                location: z
                  .object({
                    lat: z.number(),
                    lng: z.number(),
                  })
                  .passthrough(),
              })
              .passthrough()
              .optional(),
          })
          .passthrough()
      )
      .optional(),
  })
  .passthrough();

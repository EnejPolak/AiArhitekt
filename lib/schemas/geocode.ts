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
            address_components: z
              .array(
                z
                  .object({
                    long_name: z.string().optional(),
                    short_name: z.string().optional(),
                    types: z.array(z.string()).optional(),
                  })
                  .passthrough()
              )
              .optional(),
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

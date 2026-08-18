/**
 * Geocoding safety configuration.
 * Daily/monthly numbers are documented targets for Google Cloud quota.
 * They are NOT an in-app persistent counter (no database).
 */

function parseBool(value: string | undefined, defaultValue: boolean): boolean {
  if (value == null || value.trim() === "") return defaultValue;
  const v = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(v)) return true;
  if (["0", "false", "no", "off"].includes(v)) return false;
  return defaultValue;
}

function parsePositiveInt(value: string | undefined, defaultValue: number): number {
  const n = parseInt(value ?? "", 10);
  if (!Number.isFinite(n) || n < 1) return defaultValue;
  return n;
}

export const GEOCODING_DEFAULT_DAILY_LIMIT = 200;
export const GEOCODING_DEFAULT_MONTHLY_SOFT_LIMIT = 8000;

export type GeocodingConfig = {
  enabled: boolean;
  dailyLimit: number;
  monthlySoftLimit: number;
  apiKey: string;
};

export function getGeocodingConfig(): GeocodingConfig {
  return {
    enabled: parseBool(process.env.GOOGLE_GEOCODING_ENABLED, true),
    dailyLimit: parsePositiveInt(
      process.env.GOOGLE_GEOCODING_DAILY_LIMIT,
      GEOCODING_DEFAULT_DAILY_LIMIT
    ),
    monthlySoftLimit: parsePositiveInt(
      process.env.GOOGLE_GEOCODING_MONTHLY_SOFT_LIMIT,
      GEOCODING_DEFAULT_MONTHLY_SOFT_LIMIT
    ),
    apiKey: (process.env.GOOGLE_MAPS_API_KEY ?? "").trim(),
  };
}

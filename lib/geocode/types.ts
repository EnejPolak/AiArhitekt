export const GEOCODING_ERROR_CODES = {
  DISABLED: "GEOCODING_DISABLED",
  QUOTA_REACHED: "GEOCODING_QUOTA_REACHED",
  REQUEST_DENIED: "GEOCODING_REQUEST_DENIED",
  INVALID_REQUEST: "GEOCODING_INVALID_REQUEST",
  NOT_FOUND: "GEOCODING_NOT_FOUND",
  MALFORMED: "GEOCODING_MALFORMED",
  NOT_CONFIGURED: "GEOCODING_NOT_CONFIGURED",
  TIMEOUT: "GEOCODING_TIMEOUT",
  ERROR: "GEOCODING_ERROR",
} as const;

export type GeocodingErrorCode =
  (typeof GEOCODING_ERROR_CODES)[keyof typeof GEOCODING_ERROR_CODES];

export type GeocodeSuccess = {
  ok: true;
  formattedAddress: string;
  lat: number;
  lng: number;
};

export type GeocodeFailure = {
  ok: false;
  code: GeocodingErrorCode;
  message: string;
  httpStatus: number;
};

export type GeocodeResult = GeocodeSuccess | GeocodeFailure;

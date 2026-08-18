/**
 * Deterministic cache keys so equivalent user input shares one Google request.
 */

export function normalizeGeocodeAddress(address: string): string {
  return address
    .normalize("NFC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** Round coordinates so tiny GPS jitter does not multiply reverse-geocode calls. */
export function normalizeLatLng(lat: number, lng: number): { lat: number; lng: number; key: string } {
  const rLat = Math.round(lat * 1e5) / 1e5;
  const rLng = Math.round(lng * 1e5) / 1e5;
  return { lat: rLat, lng: rLng, key: `latlng:${rLat},${rLng}` };
}

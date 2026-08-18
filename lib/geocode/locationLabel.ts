export function locationLabelFromGeocode(
  data: { ok?: unknown; formattedAddress?: unknown },
  coords?: { latitude: number; longitude: number }
): string | null {
  const formatted =
    typeof data.formattedAddress === "string" ? data.formattedAddress.trim() : "";
  if (formatted) return formatted;
  if (coords && Number.isFinite(coords.latitude) && Number.isFinite(coords.longitude)) {
    return `${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}`;
  }
  return null;
}

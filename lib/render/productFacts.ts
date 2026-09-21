export function snapshotString(snapshot: unknown, keys: string[]): string | null {
  if (!snapshot || typeof snapshot !== "object") return null;
  const record = snapshot as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export function verifiedProductAppearance(snapshot: unknown): {
  material: string | null;
  color: string | null;
  dimensions: string | null;
} {
  return {
    material: snapshotString(snapshot, ["material"]),
    color: snapshotString(snapshot, ["color"]),
    dimensions: snapshotString(snapshot, ["dimensions", "size"]),
  };
}

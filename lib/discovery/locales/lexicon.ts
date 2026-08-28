import { normalizeMatchText } from "@/lib/text/diacritics";

const COLOR_SL: Array<[string, string]> = [
  ["olive-green", "olivno zelena"],
  ["olive green", "olivno zelena"],
  ["metallic black", "črna"],
  ["matte black", "črna"],
  ["dark green", "temno zelena"],
  ["light grey", "svetlo siva"],
  ["light gray", "svetlo siva"],
  ["black", "črna"],
  ["white", "bela"],
  ["green", "zelena"],
  ["blue", "modra"],
  ["red", "rdeča"],
  ["yellow", "rumena"],
  ["beige", "bež"],
  ["brown", "rjava"],
  ["grey", "siva"],
  ["gray", "siva"],
  ["oak", "hrast"],
];

export function localizeSlColor(raw: string): string {
  const folded = normalizeMatchText(raw);
  if (!folded) return raw.trim();
  for (const [english, sl] of COLOR_SL) {
    if (folded === english || folded.includes(english)) return sl;
  }
  return raw.trim();
}

export function hasMonitorConstraintText(blob: string): boolean {
  const folded = normalizeMatchText(blob);
  return /\bmonitor/.test(folded) || /vec monitor/.test(folded);
}

export function hasErgonomicConstraintText(blob: string): boolean {
  const folded = normalizeMatchText(blob);
  return /ergonom/.test(folded);
}

export function hasLargeConstraintText(blob: string): boolean {
  const folded = normalizeMatchText(blob);
  return /\blarge\b|\bvelik/.test(folded);
}

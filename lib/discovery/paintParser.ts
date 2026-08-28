import { normalizeMatchText } from "@/lib/text/diacritics";

export type ParsedPaintPreference = {
  raw: string;
  hue: string;
  finish: "matte" | "metallic" | "gloss" | null;
  displaySpec: string;
};

const FINISH_PATTERNS: Array<{ finish: ParsedPaintPreference["finish"]; patterns: RegExp[] }> = [
  {
    finish: "matte",
    patterns: [/\bmatte\b/, /\bmatt\b/, /\bmat\b/, /\bmatna\b/, /\bmatni\b/],
  },
  {
    finish: "metallic",
    patterns: [/\bmetallic\b/, /\bmetalik\b/, /\bmetalic\b/],
  },
  {
    finish: "gloss",
    patterns: [/\bgloss\b/, /\bglossy\b/, /\bsijaj\b/, /\bsijajna\b/, /\bsijajni\b/],
  },
];

const HUE_ALIASES: Array<[RegExp, string]> = [
  [/\bolive\s+green\b|\bolivno\s+zelena\b/, "olive-green"],
  [/\bdark\s+green\b|\btemno\s+zelena\b/, "dark-green"],
  [/\blight\s+gr[ae]y\b|\bsvetlo\s+siva\b/, "light-gray"],
  [/\bmetallic\s+black\b|\bmetalik\s+crn\b/, "black"],
  [/\bmatte\s+black\b|\bmat\s+crn\b|\bmatna\s+crna\b/, "black"],
  [/\bblack\b|\bcrn\b|\bcrna\b/, "black"],
  [/\bwhite\b|\bbel\b|\bbela\b/, "white"],
  [/\bolive\b|\bolivn/, "olive-green"],
  [/\bgreen\b|\bzelen/, "green"],
  [/\bblue\b|\bmodr/, "blue"],
  [/\bred\b|\brdec/, "red"],
  [/\bbeige\b|\bbez\b/, "beige"],
  [/\bbrown\b|\brjav/, "brown"],
  [/\bgray\b|\bgrey\b|\bsiv/, "gray"],
];

function detectFinish(folded: string): ParsedPaintPreference["finish"] {
  for (const { finish, patterns } of FINISH_PATTERNS) {
    if (patterns.some((pattern) => pattern.test(folded))) return finish;
  }
  return null;
}

function detectHue(folded: string): string {
  for (const [pattern, hue] of HUE_ALIASES) {
    if (pattern.test(folded)) return hue;
  }
  const stripped = folded
    .replace(/\b(interior|wall|paint|barva|stenska|notranja|finish|colour|color)\b/g, " ")
    .replace(/\b(matte|matt|mat|matna|matni|metallic|metalik|gloss|sijaj)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return stripped || folded;
}

export function parsePaintPreference(rawInput: string): ParsedPaintPreference | null {
  const raw = rawInput.normalize("NFC").replace(/\s+/g, " ").trim();
  if (!raw) return null;
  const folded = normalizeMatchText(raw);
  const finish = detectFinish(folded);
  const hue = detectHue(folded);
  const finishLabel =
    finish === "matte" ? "matte" : finish === "metallic" ? "metallic" : finish === "gloss" ? "gloss" : "";
  const displaySpec = [finishLabel, hue.replace(/-/g, " "), "interior wall paint"]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return { raw, hue, finish, displaySpec };
}

export function paintHueLabel(hue: string): string {
  return hue.replace(/-/g, " ");
}

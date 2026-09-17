/** Materials that commonly appear as color/finish words and need careful evidence checks. */
export const APPEARANCE_SENSITIVE_MATERIALS = new Set([
  "gold",
  "oak",
  "marble",
  "brass",
  "leather",
  "stone",
  "wood",
  "silver",
]);

const GENUINE_MATERIAL_CUE =
  /\b(solid|made\s+of|real|genuine|pure|24k|18k|14k|material(?:na)?\s+sestava|iz\s+masiv|masiven)\b/i;

function normalizeHaystack(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function appearanceOnlyPattern(material: string): RegExp {
  const m = material.toLowerCase();
  const base: Record<string, string> = {
    gold: "gold|golden|zlat",
    oak: "oak|hrast",
    marble: "marble|marmor",
    brass: "brass|medenin",
    leather: "leather|usnj",
    stone: "stone|kamen",
    wood: "wood|les",
    silver: "silver|srebrn",
  };
  const term = base[m] ?? m;
  return new RegExp(
    `\\b(?:(?:${term})[-\\s]?(?:look|effect|finish|colour|color|tone|videz|efekt|dekor|barva)|faux\\s+(?:${term})|imitacija\\s+(?:${term}))\\b`,
    "i"
  );
}

export function contradictoryMaterialEvidence(material: string, haystackRaw: string): boolean {
  const haystack = normalizeHaystack(haystackRaw);
  const m = material.toLowerCase();
  if (m === "gold") {
    return /\b(ceramic|porcelain|granitogres|gres|laminat|laminate|plastic|pvc|metal\s*look|kerami[kc])\b/i.test(
      haystack
    );
  }
  if (m === "oak" || m === "wood") {
    return /\b(laminat|laminate|oak[- ]?look|hrastov?\s*izgled|dekor\s*hrast|mdf|particle\s*board)\b/i.test(
      haystack
    );
  }
  if (m === "marble") {
    return /\b(marble[- ]?(?:look|effect)|marmor[- ]?(?:videz|efekt|dekor)|ceramic|porcelain|gres)\b/i.test(
      haystack
    );
  }
  if (m === "leather") {
    return /\b(faux\s+leather|leather[- ]?look|eko\s*usnje|umetno\s*usnje|pu\s*leather)\b/i.test(haystack);
  }
  if (m === "brass") {
    return (
      /\b(brass[- ]?(?:look|finish|effect)|medeninast\s*videz)\b/i.test(haystack) &&
      !/\bsolid\s+brass|made\s+of\s+brass|iz\s+medenine\b/i.test(haystack)
    );
  }
  if (m === "stone") {
    return /\b(stone[- ]?(?:look|effect)|kamen[- ]?(?:videz|efekt)|ceramic|porcelain)\b/i.test(haystack);
  }
  return false;
}

/**
 * True when evidence only supports appearance/finish of a material, not the material itself.
 */
export function isAppearanceOnlyMaterialEvidence(material: string, evidenceHaystack: string): boolean {
  const haystack = normalizeHaystack(evidenceHaystack);
  const m = material.toLowerCase().replace(/^solid\s+/, "");
  if (!APPEARANCE_SENSITIVE_MATERIALS.has(m)) return false;

  const appearanceHit = appearanceOnlyPattern(m).test(haystack);
  const colorWordOnly =
    m === "gold"
      ? /\b(gold|golden|zlata?|zlati)\b/i.test(haystack) && !GENUINE_MATERIAL_CUE.test(haystack)
      : false;

  if (contradictoryMaterialEvidence(m, haystack)) return true;
  if (appearanceHit && !GENUINE_MATERIAL_CUE.test(haystack)) return true;
  if (colorWordOnly && !/\b(solid\s+gold|made\s+of\s+gold|24k|18k|14k|pure\s+gold)\b/i.test(haystack)) {
    return true;
  }
  return false;
}

export function hasGenuineMaterialEvidence(material: string, evidenceHaystack: string): boolean {
  const haystack = normalizeHaystack(evidenceHaystack);
  const m = material.toLowerCase().replace(/^solid\s+/, "");
  if (isAppearanceOnlyMaterialEvidence(m, haystack)) return false;
  if (contradictoryMaterialEvidence(m, haystack)) return false;

  const colorLikeMaterials = new Set(["gold", "silver"]);
  if (colorLikeMaterials.has(m)) {
    return (
      /\b(solid\s+|made\s+of\s+|real\s+|genuine\s+|pure\s+|24k|18k|14k)/i.test(haystack) &&
      haystack.includes(normalizeHaystack(m))
    );
  }

  const aliases: Record<string, string[]> = {
    marble: ["marble", "marmor"],
    oak: ["oak", "hrast"],
    leather: ["leather", "usnje"],
    brass: ["brass", "medenin"],
    stone: ["stone", "kamen"],
    wood: ["wood", "les", "masiv"],
    titanium: ["titanium", "titan"],
  };
  const needles = aliases[m] ?? [m];
  return needles.some((token) => haystack.includes(normalizeHaystack(token)));
}

import type { StyleProfile, CanonicalStyleId } from "./types";

export const STYLE_PROFILES: Record<StyleProfile["id"], StyleProfile> = {
  modern: {
    id: "modern",
    positive: {
      terms: {
        sl: ["moderna", "moderen", "sodobna", "sodoben", "elegantna", "eleganten", "čiste linije", "preproste linije"],
        en: ["modern", "contemporary", "clean lines", "sleek", "current design"],
      },
    },
    negative: {
      terms: {
        sl: ["starinska", "klasična", "klasičen", "rustikalna", "ornament"],
        en: ["antique", "classic", "traditional", "ornate"],
      },
    },
    materials: {
      terms: {
        sl: ["kovinsko podnožje", "steklo", "kovina", "antracit"],
        en: ["metal base", "glass", "metal", "steel"],
      },
    },
    colors: {
      terms: {
        sl: ["mat", "črna", "antracit", "siva"],
        en: ["matte", "black", "anthracite", "gray", "grey"],
      },
    },
    forms: {
      terms: {
        sl: ["čiste linije", "preproste linije", "ravne linije"],
        en: ["clean lines", "straight lines", "simple geometry"],
      },
    },
  },
  scandinavian: {
    id: "scandinavian",
    positive: {
      terms: {
        sl: ["skandinavska", "skandinavski", "preprosta", "preprost", "minimalistična", "naravni materiali"],
        en: ["scandinavian", "nordic", "simple", "airy", "warm minimalism"],
      },
    },
    negative: {
      terms: {
        sl: ["visoki sijaj", "lesk", "ornamentirana", "težka"],
        en: ["high gloss", "glossy", "ornate", "heavy"],
      },
    },
    materials: {
      terms: {
        sl: ["svetel les", "naraven les", "naravni les", "hrast", "svetli hrast"],
        en: ["light wood", "natural wood", "oak", "light oak", "birch"],
      },
    },
    colors: {
      terms: {
        sl: ["bela", "bež", "svetlo siva", "svetla"],
        en: ["white", "beige", "light gray", "light grey", "cream"],
      },
    },
    forms: {
      terms: {
        sl: ["preprosta", "mehke linije", "naravna"],
        en: ["simple", "soft forms", "natural"],
      },
    },
  },
  luxury: {
    id: "luxury",
    positive: {
      terms: {
        sl: ["elegantna", "eleganten", "premium", "prestižna", "prestižen", "prefinjena", "prefinjen", "visokokakovostna"],
        en: ["luxury", "premium", "elegant", "refined", "high-end", "prestige"],
      },
    },
    negative: {
      terms: {
        sl: ["poceni", "osnovna", "otroška", "plastična"],
        en: ["cheap", "basic", "children", "plastic", "budget"],
      },
    },
    materials: {
      terms: {
        sl: ["steklo", "kovina", "marmor", "oreh", "temen les", "medenina", "kovinsko podnožje"],
        en: ["glass", "metal", "marble", "walnut", "dark wood", "brass", "metal base"],
      },
    },
    colors: {
      terms: {
        sl: ["črna", "temen", "oreh", "zlata", "medenina"],
        en: ["black", "dark", "walnut", "gold", "brass"],
      },
    },
    forms: {
      terms: {
        sl: ["prefinjena", "elegantna", "kvalitetna obdelava"],
        en: ["refined", "elegant", "quality finish"],
      },
      concepts: ["desk", "coffee_table", "sofa", "chair", "office_chair", "gaming_chair", "lighting", "bed", "wardrobe"],
    },
  },
  minimal: {
    id: "minimal",
    positive: {
      terms: {
        sl: [
          "minimalistična",
          "minimalističen",
          "minimalistični",
          "preprosta",
          "preprost",
          "čiste linije",
          "enostavna",
          "enostaven",
          "brez odvečnih elementov",
          "ravne linije",
          "tanka konstrukcija",
          "čist dizajn",
        ],
        en: ["minimal", "minimalist", "simple", "clean lines", "sleek", "uncluttered", "essential"],
      },
      concepts: ["desk", "coffee_table", "wardrobe", "bed", "sofa", "gaming_chair", "office_chair", "chair", "lighting"],
    },
    negative: {
      terms: {
        sl: [
          "veliko polic",
          "z veliko policami",
          "nadgradnjo",
          "nadgradnja",
          "ornamentirana",
          "ornament",
          "dekorativna",
          "klasična",
          "otroška",
          "masivna omara",
          "rgb",
          "racing",
        ],
        en: [
          "many shelves",
          "shelves",
          "hutch",
          "ornate",
          "decorative",
          "classic",
          "children",
          "bulky compartments",
          "rgb",
          "racing",
        ],
      },
      concepts: ["desk", "coffee_table", "wardrobe", "bed", "sofa", "gaming_chair", "office_chair", "chair"],
    },
    materials: {
      terms: {
        sl: ["kovina", "steklo", "mat"],
        en: ["metal", "glass", "matte"],
      },
    },
    colors: {
      terms: {
        sl: ["bela", "črna", "siva", "mat"],
        en: ["white", "black", "gray", "grey", "matte"],
      },
    },
    forms: {
      terms: {
        sl: ["tanke noge", "preprosta miza", "brez polic", "enostavna konstrukcija"],
        en: ["slim legs", "simple desk", "no shelves", "simple frame"],
      },
      concepts: ["desk", "coffee_table", "chair", "office_chair", "gaming_chair", "lighting"],
    },
  },
  rustic: {
    id: "rustic",
    positive: {
      terms: {
        sl: ["rustikalna", "rustikalen", "masiven les", "masivni les", "naraven les", "naravni les", "staran les", "topel les", "industrijsko rustikalna"],
        en: ["rustic", "solid wood", "reclaimed wood", "natural wood", "farmhouse", "industrial rustic"],
      },
    },
    negative: {
      terms: {
        sl: ["visoki sijaj", "steklena", "visoki sijaj", "moderna visok sijaj"],
        en: ["high gloss", "glass top", "glossy modern"],
      },
    },
    materials: {
      terms: {
        sl: ["masivni les", "masiven les", "kovina in les", "hrast", "bor"],
        en: ["solid wood", "reclaimed wood", "metal and wood", "oak", "pine"],
      },
    },
    colors: {
      terms: {
        sl: ["topel", "rjava", "naravna", "temna"],
        en: ["warm", "brown", "natural", "earthy"],
      },
    },
    forms: {
      terms: {
        sl: ["masivna", "rustikalna", "teksturirana"],
        en: ["solid", "rustic", "textured"],
      },
    },
  },
};

/** Combined multi-style query modifiers keyed by sorted style pair. */
export const COMBINED_STYLE_QUERY_MODIFIERS: Partial<
  Record<string, { sl: [string, string]; en: [string, string] }>
> = {
  "luxury+minimal": {
    sl: ["elegantna minimalistična", "moderna minimalistična"],
    en: ["elegant minimalist", "modern minimalist"],
  },
  "minimal+luxury": {
    sl: ["elegantna minimalistična", "moderna minimalistična"],
    en: ["elegant minimalist", "modern minimalist"],
  },
  "modern+minimal": {
    sl: ["moderna minimalistična", "sodobna minimalistična"],
    en: ["modern minimalist", "contemporary minimalist"],
  },
  "minimal+modern": {
    sl: ["moderna minimalistična", "sodobna minimalistična"],
    en: ["modern minimalist", "contemporary minimalist"],
  },
  "scandinavian+minimal": {
    sl: ["skandinavska minimalistična", "preprosta svetla"],
    en: ["scandinavian minimalist", "simple light"],
  },
  "minimal+scandinavian": {
    sl: ["skandinavska minimalistična", "preprosta svetla"],
    en: ["scandinavian minimalist", "simple light"],
  },
};

export function combinedStyleQueryKey(styles: CanonicalStyleId[]): string | null {
  if (styles.length < 2) return null;
  return [...styles].sort((a, b) => a.localeCompare(b)).join("+");
}

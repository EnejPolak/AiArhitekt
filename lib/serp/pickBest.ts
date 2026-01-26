/**
 * Ranking/picking module for SERP results
 * Picks the best product page from organic results, rejecting category/list pages
 */

export type SerpOrganicResult = {
  title: string;
  link: string;
  snippet?: string;
};

export type PickedResult = {
  title: string;
  link: string;
  snippet?: string;
  score: number;
  reasons: string[];
};

const STOPWORDS = new Set([
  "in",
  "ali",
  "za",
  "na",
  "v",
  "z",
  "pri",
  "od",
  "do",
  "the",
  "and",
  "or",
]);

const LISTING_WORDS = [
  "kategorija",
  "kolekcija",
  "izdelki (",
  "prikazi vse",
  "page",
  "stran",
  "jedilni stoli za vsak dom",
];

const COLOR_TOKENS = [
  "bez",
  "bež",
  "bela",
  "crna",
  "črna",
  "siva",
  "rjava",
  "roza",
  "zelena",
  "modra",
];

/**
 * Normalize text: lowercase, remove diacritics, split into tokens
 */
function normalizeText(text: string): string {
  // Remove diacritics
  const diacriticsMap: Record<string, string> = {
    č: "c",
    ć: "c",
    đ: "d",
    š: "s",
    ž: "z",
    Č: "c",
    Ć: "c",
    Đ: "d",
    Š: "s",
    Ž: "z",
  };

  let normalized = text.toLowerCase();
  for (const [diacritic, replacement] of Object.entries(diacriticsMap)) {
    normalized = normalized.replace(new RegExp(diacritic, "g"), replacement);
  }

  return normalized;
}

/**
 * Tokenize query: split, remove stopwords, keep meaningful tokens
 */
function tokenizeQuery(query: string): string[] {
  const normalized = normalizeText(query);
  const tokens = normalized
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  return tokens.filter((token) => {
    // Keep numeric tokens
    if (/^\d+$/.test(token)) {
      return true;
    }
    // Remove stopwords
    if (STOPWORDS.has(token)) {
      return false;
    }
    // Keep tokens length >= 2
    return token.length >= 2;
  });
}

/**
 * Check if link/title indicates a category/listing page (HARD REJECT)
 */
function isCategoryPage(result: SerpOrganicResult): boolean {
  const link = result.link.toLowerCase();
  const title = (result.title || "").toLowerCase();
  const snippet = (result.snippet || "").toLowerCase();
  const combined = `${title} ${snippet}`;

  // Category code pattern: -C followed by digits/letters (e.g., /jedilni-stoli-C102C3C1)
  // Match both -C and /-C patterns
  if (/-C\d+[A-Za-z0-9]*/i.test(link) || /\/-C\d+[A-Za-z0-9]*/i.test(link)) {
    return true;
  }
  
  // Also check for category codes in path segments (xxxlesnina pattern)
  // Pattern: word-C followed by alphanumeric (e.g., jedilni-stoli-C102C3C1)
  if (/[a-z0-9-]+-C\d+[A-Za-z0-9]+/i.test(link)) {
    return true;
  }

  // Category path patterns
  if (/\/c\//.test(link) || /\/category/.test(link) || /\/kategorija/.test(link)) {
    return true;
  }

  // Page number patterns
  if (/stran \d+/i.test(title) || /\?p=\d+/.test(link) || /&p=\d+/.test(link)) {
    return true;
  }

  // Listing words in title/snippet
  for (const word of LISTING_WORDS) {
    if (combined.includes(word.toLowerCase())) {
      return true;
    }
  }

  // Harvey Norman: reject listing URLs
  if (link.includes("harveynorman") || link.includes("harvey-norman")) {
    // Hard reject: listing paths like "/pohistvo/jedilnice/jedilni-stoli" without "/jedilni-stol-"
    if (/\/pohistvo\/jedilnice\/jedilni-stoli/i.test(link) && !/\/jedilni-stol-/i.test(link)) {
      return true;
    }
    
    // Hard reject: pagination query params
    if (/\?p=/i.test(link)) {
      return true;
    }
    
    // Reject general listing paths without product slug
    const pathMatch = link.match(/harveynorman[^/]*\/([^?#]+)/);
    if (pathMatch) {
      const path = pathMatch[1];
      // If path is short and doesn't contain product-like identifiers, likely a category
      if (path.length < 30 && !/\d{6,}/.test(path) && !/p\//.test(link)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Calculate product page preference bonuses
 */
function getProductPageBonuses(link: string): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  // +12 if link contains "/p/" (xxxlesnina product pages)
  if (/\/p\//.test(link)) {
    score += 12;
    reasons.push("+12: Contains /p/ (product page marker)");
  }

  // +10 if link ends with long numeric product id
  if (/(\d{9,})$/i.test(link) || /-(\d{9,})$/i.test(link) || /\/\d{9,}$/i.test(link)) {
    score += 10;
    reasons.push("+10: Contains long numeric product ID");
  }

  // +6 if link contains "/p/" OR looks like product detail page
  if (/\/p\//.test(link) || (!isCategoryPage({ link, title: "", snippet: "" }) && /[a-z0-9-]{20,}/i.test(link))) {
    score += 6;
    reasons.push("+6: Product detail page pattern");
  }

  return { score, reasons };
}

/**
 * Calculate token match score
 */
function getTokenMatchScore(
  queryTokens: string[],
  result: SerpOrganicResult
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  const haystack = normalizeText(`${result.title} ${result.snippet || ""}`);
  let matchedTokens = 0;

  for (const token of queryTokens) {
    if (haystack.includes(token)) {
      matchedTokens++;
      if (/^\d+$/.test(token)) {
        // Numeric token
        score += 3;
      } else if (token.length >= 3) {
        // Non-numeric token len >= 3
        score += 2;
      } else if (token.length === 2) {
        // Token len == 2
        score += 1;
      }
    }
  }

  // +6 bonus if >=70% of tokens match
  const matchRatio = queryTokens.length > 0 ? matchedTokens / queryTokens.length : 0;
  if (matchRatio >= 0.7) {
    score += 6;
    reasons.push(`+6: ${Math.round(matchRatio * 100)}% token match (${matchedTokens}/${queryTokens.length})`);
  } else {
    reasons.push(`Token match: ${matchedTokens}/${queryTokens.length} tokens`);
  }

  return { score, reasons };
}

/**
 * Check if title contains only generic terms
 */
function isGenericTitle(queryTokens: string[], title: string): boolean {
  const normalizedTitle = normalizeText(title);
  const titleTokens = normalizedTitle.split(/\s+/).filter((t) => t.length >= 2);

  // Count how many query tokens appear in title
  let matches = 0;
  for (const token of queryTokens) {
    if (titleTokens.some((tt) => tt.includes(token) || token.includes(tt))) {
      matches++;
    }
  }

  const matchRatio = queryTokens.length > 0 ? matches / queryTokens.length : 0;
  return matchRatio < 0.4;
}

/**
 * Extract color tokens from query (returns normalized tokens)
 */
function extractColorTokens(query: string): string[] {
  const normalized = normalizeText(query);
  const found: string[] = [];
  
  for (const color of COLOR_TOKENS) {
    const normalizedColor = normalizeText(color);
    if (normalized.includes(normalizedColor)) {
      found.push(normalizedColor); // Store normalized version
    }
  }
  
  return found;
}

/**
 * Check color token constraints and apply penalties
 */
function checkColorConstraints(
  query: string,
  result: SerpOrganicResult,
  queryTokens: string[]
): { penalty: number; reasons: string[] } {
  let penalty = 0;
  const reasons: string[] = [];
  
  const colorTokens = extractColorTokens(query);
  if (colorTokens.length === 0) {
    return { penalty: 0, reasons: [] };
  }
  
  const haystack = normalizeText(`${result.title} ${result.snippet || ""}`);
  
  // Check each required color token (already normalized)
  for (const colorToken of colorTokens) {
    if (!haystack.includes(colorToken)) {
      penalty -= 15;
      // Show original color name for clarity
      const originalColor = COLOR_TOKENS.find(c => normalizeText(c) === colorToken) || colorToken;
      reasons.push(`-15: Missing required color token "${originalColor}"`);
    }
  }
  
  // Special case: if query contains "bez/bež" (normalized to "bez") and result contains "roza", extra penalty
  const hasBez = colorTokens.includes("bez"); // Both "bez" and "bež" normalize to "bez"
  if (hasBez && haystack.includes("roza")) {
    penalty -= 10;
    reasons.push("-10: Query requires bez/bež but result contains roza");
  }
  
  return { penalty, reasons };
}

/**
 * Pick the best result from SERP organic results
 * Returns result with debug info about filtering
 */
export function pickBestResult(
  query: string,
  results: SerpOrganicResult[]
): { picked: PickedResult | null; rawOrganicCount: number; filteredCount: number } {
  const rawOrganicCount = results?.length || 0;
  
  if (!results || results.length === 0) {
    return { picked: null, rawOrganicCount, filteredCount: 0 };
  }

  const queryTokens = tokenizeQuery(query);

  // Score each result
  const scoredResults: Array<{ result: SerpOrganicResult; score: number; reasons: string[] }> = [];
  let filteredCount = 0;

  for (const result of results) {
    // HARD REJECT: category pages
    if (isCategoryPage(result)) {
      continue; // Skip this result (counted as filtered)
    }
    
    filteredCount++; // Count non-rejected results

    let totalScore = 0;
    const allReasons: string[] = [];

    // Product page bonuses
    const productBonuses = getProductPageBonuses(result.link);
    totalScore += productBonuses.score;
    allReasons.push(...productBonuses.reasons);

    // Token match score
    const tokenScore = getTokenMatchScore(queryTokens, result);
    totalScore += tokenScore.score;
    allReasons.push(...tokenScore.reasons);

    // Color token constraints
    const colorCheck = checkColorConstraints(query, result, queryTokens);
    totalScore += colorCheck.penalty;
    allReasons.push(...colorCheck.reasons);

    // Penalize generic results
    if (isGenericTitle(queryTokens, result.title)) {
      totalScore -= 8;
      allReasons.push("-8: Generic title with low token match");
    }

    scoredResults.push({
      result,
      score: totalScore,
      reasons: allReasons,
    });
  }

  if (scoredResults.length === 0) {
    return { picked: null, rawOrganicCount, filteredCount };
  }

  // Sort by score (descending) and pick the best
  scoredResults.sort((a, b) => b.score - a.score);
  const best = scoredResults[0];

  return {
    picked: {
      title: best.result.title,
      link: best.result.link,
      snippet: best.result.snippet,
      score: best.score,
      reasons: best.reasons,
    },
    rawOrganicCount,
    filteredCount,
  };
}

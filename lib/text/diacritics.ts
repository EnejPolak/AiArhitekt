/**
 * Comparison-only folding. Search queries keep original č/š/ž.
 */

export function foldDiacritics(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/gi, "d")
    .replace(/Đ/g, "d");
}

/** Lowercased, diacritic-folded, punctuation collapsed. For matching only. */
export function normalizeMatchText(value: string): string {
  return foldDiacritics(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Match a style/paint token using word boundaries — never as substring inside another token. */
export function containsToken(haystack: string, token: string): boolean {
  const foldedToken = normalizeMatchText(token);
  if (!foldedToken) return false;
  if (foldedToken.includes(" ")) {
    return haystack.includes(foldedToken);
  }
  const tokens = haystack.split(" ").filter(Boolean);
  return tokens.includes(foldedToken);
}

/** Longer roots may match inflected tokens (marmor → marmorne), short roots stay exact (mat ≠ material). */
export function containsRootToken(haystack: string, root: string): boolean {
  const foldedRoot = normalizeMatchText(root);
  if (!foldedRoot) return false;
  if (foldedRoot.includes(" ")) {
    return haystack.includes(foldedRoot);
  }
  if (foldedRoot.length <= 3) {
    return containsToken(haystack, foldedRoot);
  }
  const tokens = haystack.split(" ").filter(Boolean);
  return tokens.some((token) => token === foldedRoot || token.startsWith(foldedRoot));
}

/** Match if any token/phrase appears with boundary-safe rules. */
export function containsAnyToken(haystack: string, terms: string[]): boolean {
  return terms.some((term) => containsToken(haystack, term));
}

/** Match if any root/token appears with boundary-safe or inflection-safe rules. */
export function containsAnyRootToken(haystack: string, roots: string[]): boolean {
  return roots.some((root) => containsRootToken(haystack, root));
}

/** NFC lowercase with letters (including čšž) preserved. For SERP query tokens. */
export function preserveSearchLetters(value: string): string {
  return value
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s.x€]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

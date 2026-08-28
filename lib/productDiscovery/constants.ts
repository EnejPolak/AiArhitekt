/** Configurable model for OpenAI web-search product discovery (Step C / api-debug). */
export const OPENAI_PRODUCT_SEARCH_MODEL =
  process.env.OPENAI_PRODUCT_SEARCH_MODEL?.trim() || "gpt-5.6-terra";

/** Per-item OpenAI Responses API timeout. */
export const OPENAI_PRODUCT_SEARCH_TIMEOUT_MS = 90_000;

/** Max concurrent OpenAI product searches per request. */
export const OPENAI_PRODUCT_SEARCH_CONCURRENCY = 3;

/** OpenAI web_search allowed_domains cap (Places may return more; trim only). */
export const OPENAI_WEB_SEARCH_MAX_ALLOWED_DOMAINS = 20;

/** Max verified source URLs passed to rescue ranker. */
export const RESCUE_MAX_CANDIDATES = 10;

/** Max rescue candidates to enrich via merchant page fetch. */
export const RESCUE_ENRICH_MAX_CANDIDATES = 5;

/** When pre-rank leader is strong, enrich fewer candidates. */
export const RESCUE_ENRICH_MIN_CANDIDATES = 3;

/** Concurrent merchant page enrichment fetches. */
export const RESCUE_ENRICH_CONCURRENCY = 2;

/** Minimum match score for accepted primary results. */
export const ACCEPTANCE_PRIMARY_MIN_SCORE = 0.7;

/** Minimum match score for accepted rescue results. */
export const ACCEPTANCE_RESCUE_MIN_SCORE = 0.75;

/** Minimum requirement coverage for accepted primary results. */
export const ACCEPTANCE_PRIMARY_MIN_COVERAGE = 0.6;

/** Minimum requirement coverage for accepted rescue results. */
export const ACCEPTANCE_RESCUE_MIN_COVERAGE = 0.7;

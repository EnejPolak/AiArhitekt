export const MAX_PRODUCT_DISCOVERY_ITEMS = 10;
export const MAX_ITEM_SPEC_LENGTH = 120;
export const PRODUCT_DISCOVERY_COOLDOWN_SECONDS = 60;
export const PRODUCT_DISCOVERY_GUARD_OPERATION = "product_discovery";
export const MAX_LOCATION_INPUT_LENGTH = 500;
export const MIN_LOCATION_INPUT_LENGTH = 3;
export const MIN_DISCOVERY_RADIUS_KM = 1;
export const DEFAULT_DISCOVERY_RADIUS_KM = 50;
export const MAX_DISCOVERY_RADIUS_KM = 50;

/**
 * Total live SerpAPI provider requests allowed for one discovery refresh,
 * shared across ALL query-level passes. Cached hits do not consume this budget.
 *
 * Derived: 5 requirements × fastMode (2 domains × 2 variants) ≈ 20 logical/pass;
 * one partial fallback pass ≈ +8 → cap at 28.
 */
export const PER_DISCOVERY_SERP_BUDGET = 28;

/** Wall-clock deadline for the interactive discovery action (geocode + Places + product search).
 * Per-item OpenAI work is derived from remaining time and cannot exceed this bound.
 */
export const DISCOVERY_DEADLINE_MS = 75_000;

/** Do not start a new provider request when less than this remains before deadline. */
export const DISCOVERY_SERP_MIN_REMAINING_MS = 8_000;

/** Per-provider-request timeout during discovery (no automatic retry). */
export const DISCOVERY_SERP_TIMEOUT_MS = 12_000;

/** Do not start a new OpenAI Step C item when less than this remains before deadline. */
export const DISCOVERY_OPENAI_MIN_REMAINING_MS = 8_000;

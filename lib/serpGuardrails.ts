/**
 * SERP API cost guardrails: daily cap, rate limiting, caching
 */

import { promises as fs } from "fs";
import path from "path";
import { TTLCache } from "./cache";

const DAILY_CAP = 50;
const RATE_LIMIT_MS = 1000; // 1 request per second
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

interface DailyUsage {
  date: string; // YYYY-MM-DD
  used: number;
}

interface SerpResult {
  organic: Array<{
    title: string;
    link: string;
    snippet: string;
  }>;
}

const serpCache = new TTLCache<SerpResult>(CACHE_TTL);
let lastRequestTime = 0;
let dailyUsage: DailyUsage | null = null;
const USAGE_FILE = path.join(process.cwd(), "tmp", "serp-usage.json");

/**
 * Load daily usage from file or memory
 */
async function loadDailyUsage(): Promise<DailyUsage> {
  const today = new Date().toISOString().split("T")[0];

  // Check if we have cached usage for today
  if (dailyUsage && dailyUsage.date === today) {
    return dailyUsage;
  }

  // Try to load from file
  try {
    await fs.mkdir(path.dirname(USAGE_FILE), { recursive: true });
    try {
      const content = await fs.readFile(USAGE_FILE, "utf-8");
      const data: DailyUsage = JSON.parse(content);

      if (data.date === today) {
        dailyUsage = data;
        return data;
      }
    } catch (readError: any) {
      // File doesn't exist or invalid, start fresh
      if (readError.code !== "ENOENT") {
        console.warn("Failed to read SERP usage file:", readError);
      }
    }
  } catch (error) {
    // Directory creation failed, use memory only
    console.warn("Failed to create tmp directory:", error);
  }

  // Start new day
  dailyUsage = { date: today, used: 0 };
  return dailyUsage;
}

/**
 * Save daily usage to file
 */
async function saveDailyUsage(usage: DailyUsage): Promise<void> {
  dailyUsage = usage;
  try {
    await fs.mkdir(path.dirname(USAGE_FILE), { recursive: true });
    await fs.writeFile(USAGE_FILE, JSON.stringify(usage, null, 2), "utf-8");
  } catch (error) {
    // If file write fails, keep in memory only
    console.warn("Failed to save SERP usage to file:", error);
  }
}

/**
 * Check if we can make a SERP request (daily cap)
 */
export async function checkDailyCap(): Promise<{
  allowed: boolean;
  used: number;
  remaining: number;
}> {
  const usage = await loadDailyUsage();
  const remaining = DAILY_CAP - usage.used;

  return {
    allowed: remaining > 0,
    used: usage.used,
    remaining: Math.max(0, remaining),
  };
}

/**
 * Increment daily usage counter
 */
export async function incrementDailyUsage(): Promise<void> {
  const usage = await loadDailyUsage();
  usage.used += 1;
  await saveDailyUsage(usage);
}

/**
 * Rate limit: ensure at least 1 second between requests
 */
export async function waitForRateLimit(): Promise<void> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;

  if (timeSinceLastRequest < RATE_LIMIT_MS) {
    const waitTime = RATE_LIMIT_MS - timeSinceLastRequest;
    await new Promise((resolve) => setTimeout(resolve, waitTime));
  }

  lastRequestTime = Date.now();
}

/**
 * Get cached SERP result
 */
export function getCachedResult(query: string): SerpResult | null {
  return serpCache.get(query) || null;
}

/**
 * Cache SERP result
 */
export function cacheResult(query: string, result: SerpResult): void {
  serpCache.set(query, result, CACHE_TTL);
}

/**
 * Make SERP API request with guardrails
 */
export async function makeSerpRequest(
  query: string,
  apiKey: string,
  dryRun: boolean = false
): Promise<SerpResult> {
  // Check cache first
  const cached = getCachedResult(query);
  if (cached) {
    return cached;
  }

  // Check daily cap
  const capCheck = await checkDailyCap();
  if (!capCheck.allowed) {
    throw new Error(
      `Daily SERP cap reached (${capCheck.used}/${DAILY_CAP}). Try again tomorrow.`
    );
  }

  if (dryRun) {
    // Return empty result for dry run
    return { organic: [] };
  }

  // Wait for rate limit
  await waitForRateLimit();

  // Make request
  const encodedQuery = encodeURIComponent(query);
  const url = `https://serpapi.com/search.json?engine=google&q=${encodedQuery}&location=Slovenia&hl=sl&gl=si&num=10&api_key=${apiKey}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

  try {
    const response = await fetch(url, {
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`SERP API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // Parse organic results (top 5)
    const organic = (data.organic_results || [])
      .slice(0, 5)
      .map((item: any) => ({
        title: item.title || "",
        link: item.link || "",
        snippet: item.snippet || "",
      }));

    const result: SerpResult = { organic };

    // Cache result
    cacheResult(query, result);

    // Increment usage
    await incrementDailyUsage();

    return result;
  } catch (error: any) {
    clearTimeout(timeout);
    if (error.name === "AbortError") {
      throw new Error("SERP API request timeout");
    }
    throw error;
  }
}

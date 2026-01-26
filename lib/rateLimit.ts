/**
 * Simple per-IP rate limiting using sliding window
 */

interface RateLimitEntry {
  requests: number[];
  windowStart: number;
}

export class RateLimiter {
  private requests: Map<string, RateLimitEntry>;
  private windowMs: number;
  private maxRequests: number;

  constructor(maxRequests: number, windowMs: number = 60000) {
    // Default: 60 seconds window
    this.requests = new Map();
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;

    // Cleanup old entries every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  check(ip: string): { allowed: boolean; remaining: number; resetAt: number } {
    const now = Date.now();
    let entry = this.requests.get(ip);

    if (!entry) {
      entry = { requests: [], windowStart: now };
      this.requests.set(ip, entry);
    }

    // Remove requests outside the window
    entry.requests = entry.requests.filter(
      (timestamp) => now - timestamp < this.windowMs
    );

    // Check if limit exceeded
    if (entry.requests.length >= this.maxRequests) {
      const oldestRequest = entry.requests[0];
      const resetAt = oldestRequest + this.windowMs;
      return {
        allowed: false,
        remaining: 0,
        resetAt,
      };
    }

    // Add current request
    entry.requests.push(now);

    return {
      allowed: true,
      remaining: this.maxRequests - entry.requests.length,
      resetAt: now + this.windowMs,
    };
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [ip, entry] of this.requests.entries()) {
      // Remove old requests
      entry.requests = entry.requests.filter(
        (timestamp) => now - timestamp < this.windowMs
      );

      // Remove entry if no requests
      if (entry.requests.length === 0) {
        this.requests.delete(ip);
      }
    }
  }
}

/**
 * Get client IP from Next.js request
 */
export function getClientIP(req: Request): string {
  // Try various headers
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }

  const realIP = req.headers.get("x-real-ip");
  if (realIP) {
    return realIP;
  }

  // Fallback
  return "unknown";
}

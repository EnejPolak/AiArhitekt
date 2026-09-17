import { describe, expect, it } from "vitest";
import { safeCaptureTags, sentryBrowserOptions } from "./report";

describe("safe observability capture", () => {
  it("keeps correlation identifiers and drops secret-like keys", () => {
    const tags = safeCaptureTags({
      projectId: "11111111-1111-4111-8111-111111111111",
      attemptId: "22222222-2222-4222-8222-222222222222",
      stage: "resolve_products",
      errorCode: "places_failed",
      level: "error",
    });
    expect(tags.projectId).toBeTruthy();
    expect(tags.attemptId).toBeTruthy();
    expect(tags.stage).toBe("resolve_products");
    expect(tags.errorCode).toBe("places_failed");
    expect(tags).not.toHaveProperty("level");
  });

  it("disables Sentry when no DSN is configured", () => {
    const previous = process.env.SENTRY_DSN;
    const previousPublic = process.env.NEXT_PUBLIC_SENTRY_DSN;
    delete process.env.SENTRY_DSN;
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    expect(sentryBrowserOptions().enabled).toBe(false);
    expect(sentryBrowserOptions().dsn).toBeUndefined();
    if (previous === undefined) delete process.env.SENTRY_DSN;
    else process.env.SENTRY_DSN = previous;
    if (previousPublic === undefined) delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    else process.env.NEXT_PUBLIC_SENTRY_DSN = previousPublic;
  });
});

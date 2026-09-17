import { assertRuntimeConfig } from "@/lib/env/productionConfig";

export async function register(): Promise<void> {
  assertRuntimeConfig();
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initServerSentry } = await import("@/lib/observability/sentry.server");
    initServerSentry();
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    const { initEdgeSentry } = await import("@/lib/observability/sentry.edge");
    initEdgeSentry();
  }
}

export async function onRequestError(...args: unknown[]): Promise<void> {
  if (!(process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN ?? "").trim()) return;
  const { captureRequestError } = await import("@/lib/observability/sentry.server");
  (captureRequestError as (...params: unknown[]) => void)(...args);
}

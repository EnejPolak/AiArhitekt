import * as Sentry from "@sentry/nextjs";
import { sentryBrowserOptions, sentryDsn } from "@/lib/observability/report";

export function initEdgeSentry(): void {
  if (!sentryDsn()) return;
  Sentry.init({
    ...sentryBrowserOptions(),
    tracesSampleRate: 0,
  });
}

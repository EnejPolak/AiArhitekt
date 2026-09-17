import * as Sentry from "@sentry/nextjs";
import { sentryBrowserOptions, sentryDsn } from "@/lib/observability/report";

export function initServerSentry(): void {
  if (!sentryDsn()) return;
  Sentry.init({
    ...sentryBrowserOptions(),
    tracesSampleRate: 0,
  });
}

export const captureRequestError = Sentry.captureRequestError;

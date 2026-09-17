import * as Sentry from "@sentry/nextjs";
import { sentryBrowserOptions, sentryDsn } from "@/lib/observability/report";

if (sentryDsn()) {
  Sentry.init({
    ...sentryBrowserOptions(),
    tracesSampleRate: 0,
  });
}

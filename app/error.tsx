"use client";

import { AppErrorFallback } from "@/components/app/AppErrorFallback";
import { captureSafeException } from "@/lib/observability/report";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  void captureSafeException(error, { stage: "react.render", errorCode: error.digest ?? error.name });
  return <AppErrorFallback reset={reset} homeHref="/" homeLabel="Go home" />;
}

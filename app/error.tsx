"use client";

import { AppErrorFallback } from "@/components/app/AppErrorFallback";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  console.error("[app-error]", { digest: error.digest, name: error.name });
  return <AppErrorFallback reset={reset} homeHref="/" homeLabel="Go home" />;
}

"use client";

import { AppErrorFallback } from "@/components/app/AppErrorFallback";

export default function AppSegmentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  console.error("[app-workspace-error]", { digest: error.digest, name: error.name });
  return (
    <div className="flex min-h-0 min-w-0 flex-1 overflow-y-auto bg-background">
      <AppErrorFallback reset={reset} homeHref="/app" homeLabel="Back to workspace" />
    </div>
  );
}

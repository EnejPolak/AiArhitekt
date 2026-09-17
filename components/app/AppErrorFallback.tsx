"use client";

import * as React from "react";
import Link from "next/link";
import { APP_ERROR_BODY, APP_ERROR_TITLE } from "@/lib/ui/customerCopy";

export function AppErrorFallback({
  reset,
  homeHref = "/app",
  homeLabel = "Back to workspace",
}: {
  reset?: () => void;
  homeHref?: string;
  homeLabel?: string;
}) {
  return (
    <div className="flex min-h-full flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-[16px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-5 py-6">
        <h1 className="text-[20px] font-semibold text-white">{APP_ERROR_TITLE}</h1>
        <p className="mt-3 text-[14px] leading-relaxed text-[rgba(255,255,255,0.70)]">
          {APP_ERROR_BODY}
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          {reset ? (
            <button
              type="button"
              onClick={() => reset()}
              className="rounded-lg bg-[#3B82F6] px-4 py-3 text-center text-[14px] font-medium text-white hover:bg-[#2563EB]"
            >
              Try again
            </button>
          ) : null}
          <Link
            href={homeHref}
            className="rounded-lg border border-[rgba(255,255,255,0.15)] px-4 py-3 text-center text-[14px] font-medium text-white hover:bg-[rgba(255,255,255,0.05)]"
          >
            {homeLabel}
          </Link>
        </div>
      </div>
    </div>
  );
}

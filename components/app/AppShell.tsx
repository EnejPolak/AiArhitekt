"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function AppShell({
  sidebar,
  children,
}: {
  sidebar: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <div className="flex h-screen overflow-x-hidden overflow-hidden bg-background">
      <div className="hidden h-full shrink-0 md:flex">{sidebar}</div>

      {open ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Close projects menu"
            className="absolute inset-0 bg-black/60"
            onClick={() => setOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Projects menu"
            className="relative flex h-full w-[min(20rem,88vw)] max-w-full flex-col overflow-hidden bg-background shadow-2xl"
          >
            <div className="flex h-12 shrink-0 items-center justify-between border-b border-[rgba(255,255,255,0.08)] px-3">
              <span className="text-[14px] font-medium text-white">Projects</span>
              <button
                type="button"
                aria-label="Close projects menu"
                className="rounded-md p-2 text-white hover:bg-[rgba(255,255,255,0.08)]"
                onClick={() => setOpen(false)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 min-w-0 flex-1 overflow-hidden">{sidebar}</div>
          </div>
        </div>
      ) : null}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-[rgba(255,255,255,0.08)] px-3 md:hidden">
          <button
            type="button"
            aria-label="Open projects menu"
            aria-expanded={open}
            className="rounded-md p-2 text-white hover:bg-[rgba(255,255,255,0.08)]"
            onClick={() => setOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="truncate text-[14px] font-medium text-white">Arhitekt AI</span>
        </div>
        <div className={cn("flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden")}>{children}</div>
      </div>
    </div>
  );
}

import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { isDebugApiAllowed } from "@/lib/env/deployment";

export const dynamic = "force-dynamic";

export default function ApiDebugLayout({ children }: { children: ReactNode }) {
  if (!isDebugApiAllowed()) {
    notFound();
  }

  return children;
}

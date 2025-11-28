"use client";

import * as React from "react";
import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { cn } from "@/lib/utils";
import { useCookieOptional } from "@/lib/contexts/CookieContext";

export interface FooterProps {
  className?: string;
}

export const Footer: React.FC<FooterProps> = ({ className }) => {
  const cookieContext = useCookieOptional();

  return (
    <footer
      className={cn(
        "border-t border-white/10 pt-12 pb-10 md:pt-14 md:pb-10",
        className
      )}
    >
      <Container>
        <div className="flex flex-col items-center gap-8 md:gap-10">
          <p className="text-sm text-[rgba(255,255,255,0.70)]">
            © 2024 Arhitekt AI. All rights reserved.
          </p>
          <nav className="flex flex-wrap items-center justify-center gap-4 md:gap-6 max-w-4xl">
            <Link
              href="/privacy"
              className="text-[14px] md:text-[15px] text-[rgba(255,255,255,0.70)] hover:text-[rgba(255,255,255,0.80)] hover:underline transition-all duration-200 ease-in-out"
            >
              Privacy Policy
            </Link>
            <Link
              href="/terms"
              className="text-[14px] md:text-[15px] text-[rgba(255,255,255,0.70)] hover:text-[rgba(255,255,255,0.80)] hover:underline transition-all duration-200 ease-in-out"
            >
              Terms of Service
            </Link>
            <Link
              href="/cookie-policy"
              className="text-[14px] md:text-[15px] text-[rgba(255,255,255,0.70)] hover:text-[rgba(255,255,255,0.80)] hover:underline transition-all duration-200 ease-in-out"
            >
              Cookie Policy
            </Link>
            {cookieContext && (
              <button
                onClick={cookieContext.openModal}
                className="text-[14px] md:text-[15px] text-[rgba(255,255,255,0.70)] hover:text-[rgba(255,255,255,0.80)] hover:underline transition-all duration-200 ease-in-out"
              >
                Cookie Settings
              </button>
            )}
            <Link
              href="/refund-policy"
              className="text-[14px] md:text-[15px] text-[rgba(255,255,255,0.70)] hover:text-[rgba(255,255,255,0.80)] hover:underline transition-all duration-200 ease-in-out"
            >
              Refund Policy
            </Link>
            <Link
              href="/disclaimer"
              className="text-[14px] md:text-[15px] text-[rgba(255,255,255,0.70)] hover:text-[rgba(255,255,255,0.80)] hover:underline transition-all duration-200 ease-in-out"
            >
              Disclaimer
            </Link>
            <Link
              href="/construction-safety-warning"
              className="text-[14px] md:text-[15px] text-[rgba(255,255,255,0.70)] hover:text-[rgba(255,255,255,0.80)] hover:underline transition-all duration-200 ease-in-out"
            >
              Construction Safety Warning
            </Link>
          </nav>
        </div>
      </Container>
    </footer>
  );
};


"use client";

import { CookiePolicyHero } from "@/components/pages/cookie-policy/CookiePolicyHero";
import { CookiePolicyContent } from "@/components/pages/cookie-policy/CookiePolicyContent";
import { Footer } from "@/components/layout/Footer";

export default function CookiePolicyPage() {
  return (
    <main className="min-h-screen">
      <CookiePolicyHero />
      <CookiePolicyContent />
      <Footer />
    </main>
  );
}


"use client";

import { PrivacyHero } from "@/components/pages/privacy/PrivacyHero";
import { PrivacyContent } from "@/components/pages/privacy/PrivacyContent";
import { Footer } from "@/components/layout/Footer";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen">
      <PrivacyHero />
      <PrivacyContent />
      <Footer />
    </main>
  );
}


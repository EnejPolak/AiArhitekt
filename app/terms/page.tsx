"use client";

import { TermsHero } from "@/components/pages/terms/TermsHero";
import { TermsContent } from "@/components/pages/terms/TermsContent";
import { Footer } from "@/components/layout/Footer";

export default function TermsPage() {
  return (
    <main className="min-h-screen">
      <TermsHero />
      <TermsContent />
      <Footer />
    </main>
  );
}


"use client";

import { DisclaimerHero } from "@/components/pages/disclaimer/DisclaimerHero";
import { DisclaimerContent } from "@/components/pages/disclaimer/DisclaimerContent";
import { Footer } from "@/components/layout/Footer";

export default function DisclaimerPage() {
  return (
    <main className="min-h-screen">
      <DisclaimerHero />
      <DisclaimerContent />
      <Footer />
    </main>
  );
}


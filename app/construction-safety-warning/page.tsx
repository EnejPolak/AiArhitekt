"use client";

import { ConstructionSafetyWarningHero } from "@/components/pages/construction-safety-warning/ConstructionSafetyWarningHero";
import { ConstructionSafetyWarningContent } from "@/components/pages/construction-safety-warning/ConstructionSafetyWarningContent";
import { Footer } from "@/components/layout/Footer";

export default function ConstructionSafetyWarningPage() {
  return (
    <main className="min-h-screen">
      <ConstructionSafetyWarningHero />
      <ConstructionSafetyWarningContent />
      <Footer />
    </main>
  );
}


"use client";

import { PricingHero } from "@/components/pages/pricing/PricingHero";
import { PricingCards } from "@/components/pages/pricing/PricingCards";
import { WhatIncluded } from "@/components/pages/pricing/WhatIncluded";
import { PricingFAQ } from "@/components/pages/pricing/PricingFAQ";
import { PricingCTA } from "@/components/pages/pricing/PricingCTA";
import { Footer } from "@/components/layout/Footer";

export default function PricingPage() {
  return (
    <main className="min-h-screen">
      <PricingHero />
      <PricingCards />
      <WhatIncluded />
      <PricingFAQ />
      <PricingCTA />
      <Footer />
    </main>
  );
}


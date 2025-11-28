"use client";

import { AboutHero } from "@/components/pages/about/AboutHero";
import { OurMission } from "@/components/pages/about/OurMission";
import { WhatWeSolve } from "@/components/pages/about/WhatWeSolve";
import { HowWeBuiltIt } from "@/components/pages/about/HowWeBuiltIt";
import { WhoWeAre } from "@/components/pages/about/WhoWeAre";
import { OurValues } from "@/components/pages/about/OurValues";
import { OurJourney } from "@/components/pages/about/OurJourney";
import { AboutCTA } from "@/components/pages/about/AboutCTA";
import { Footer } from "@/components/layout/Footer";

export default function AboutPage() {
  return (
    <main className="min-h-screen">
      <AboutHero />
      <OurMission />
      <WhatWeSolve />
      <HowWeBuiltIt />
      <WhoWeAre />
      <OurValues />
      <OurJourney />
      <AboutCTA />
      <Footer />
    </main>
  );
}


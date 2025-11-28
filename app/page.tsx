"use client";

import { Hero } from "@/components/sections/Hero";
import { Timeline } from "@/components/sections/Timeline";
import { Features } from "@/components/sections/Features";
import { Pricing } from "@/components/sections/Pricing";
import { CTA } from "@/components/sections/CTA";
import { Footer } from "@/components/layout/Footer";
import { useRef } from "react";

export default function Home() {
  const heroRef = useRef<{ handleTimelineComplete: () => void }>(null);

  const handleTimelineComplete = () => {
    heroRef.current?.handleTimelineComplete();
  };

  return (
    <main>
      <Hero ref={heroRef} />
      <Timeline onComplete={handleTimelineComplete} />
      <Features />
      <Pricing />
      <CTA />
      <Footer />
    </main>
  );
}


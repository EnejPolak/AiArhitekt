"use client";

import { Hero } from "@/components/sections/Hero";
import { Timeline } from "@/components/sections/Timeline";
import { HowItWorks } from "@/components/sections/HowItWorks";
import { WhatYouGet } from "@/components/sections/WhatYouGet";
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
      <HowItWorks />
      <WhatYouGet />
      <CTA />
      <Footer />
    </main>
  );
}


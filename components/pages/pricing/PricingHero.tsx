"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Container } from "@/components/ui/Container";
import { cn } from "@/lib/utils";

export interface PricingHeroProps {
  className?: string;
}

export const PricingHero: React.FC<PricingHeroProps> = ({ className }) => {
  return (
    <section
      className={cn(
        "w-full pt-30 pb-20 relative",
        className
      )}
    >
      <Container className="px-6 md:px-10 lg:px-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="text-center max-w-4xl mx-auto"
        >
          <h1 className="text-[48px] md:text-[56px] font-semibold leading-[1.1] text-white mb-6">
            Simple Pricing for Every Project
          </h1>
          <p className="text-lg md:text-xl font-normal leading-relaxed text-[rgba(255,255,255,0.70)] max-w-3xl mx-auto">
            No subscriptions. No hidden fees. Generate your 3D concept, cost estimate & permit guidance instantly.
          </p>
        </motion.div>
      </Container>
    </section>
  );
};


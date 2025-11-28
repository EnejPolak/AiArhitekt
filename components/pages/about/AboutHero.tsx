"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Container } from "@/components/ui/Container";
import { cn } from "@/lib/utils";

export interface AboutHeroProps {
  className?: string;
}

export const AboutHero: React.FC<AboutHeroProps> = ({ className }) => {
  return (
    <section
      className={cn(
        "w-full min-h-[85vh] flex flex-col items-center justify-center pt-20 pb-20 relative",
        className
      )}
    >
      <Container className="px-6 md:px-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="text-center w-full"
        >
          <h1 className="text-[48px] md:text-[56px] font-semibold md:font-bold leading-[1.1] text-white mb-6 max-w-[900px] mx-auto">
            Designed for Homeowners. Built by Architects. Powered by AI.
          </h1>
          <p className="text-lg md:text-xl font-normal leading-[1.55] text-[rgba(255,255,255,0.75)] max-w-[800px] mx-auto mb-0">
            Arhitekt AI helps you see, plan, and understand your home before you build it.
            We combine architectural expertise with intelligent simulations to make renovation and construction simple, visual, and predictable.
          </p>
        </motion.div>
      </Container>
    </section>
  );
};


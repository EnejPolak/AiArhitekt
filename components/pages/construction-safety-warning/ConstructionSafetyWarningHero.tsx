"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Container } from "@/components/ui/Container";
import { cn } from "@/lib/utils";

export interface ConstructionSafetyWarningHeroProps {
  className?: string;
}

export const ConstructionSafetyWarningHero: React.FC<
  ConstructionSafetyWarningHeroProps
> = ({ className }) => {
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
          <h1 className="text-[32px] md:text-[40px] font-semibold md:font-bold leading-[1.1] text-white mb-3 max-w-[900px] mx-auto">
            Construction Safety Warning
          </h1>
          <p className="text-[14px] md:text-[15px] font-normal leading-[1.55] text-[rgba(255,255,255,0.65)] max-w-[800px] mx-auto mb-6 md:mb-8">
            Last updated: {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
          </p>
        </motion.div>
      </Container>
    </section>
  );
};


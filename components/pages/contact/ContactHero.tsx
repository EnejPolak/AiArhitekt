"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Container } from "@/components/ui/Container";
import { cn } from "@/lib/utils";

export interface ContactHeroProps {
  className?: string;
}

export const ContactHero: React.FC<ContactHeroProps> = ({ className }) => {
  return (
    <section
      className={cn(
        "w-full min-h-[65vh] flex flex-col items-center justify-center pt-20 pb-20 relative",
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
          <h1 className="text-[42px] md:text-[48px] font-semibold md:font-bold leading-[1.2] tracking-[-0.02em] text-white mb-5 max-w-[800px] mx-auto">
            Tell Us About Your Project.
          </h1>
          <p className="text-lg font-normal leading-[1.55] text-[rgba(255,255,255,0.72)] max-w-[720px] mx-auto mb-16">
            Share your plans, ideas or questions and we'll help you understand what your home could look like – before you build it.
          </p>
        </motion.div>
      </Container>
    </section>
  );
};


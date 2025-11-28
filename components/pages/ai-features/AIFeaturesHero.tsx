"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

export interface AIFeaturesHeroProps {
  className?: string;
}

export const AIFeaturesHero: React.FC<AIFeaturesHeroProps> = ({ className }) => {
  return (
    <section
      className={cn(
        "w-full pt-30 pb-35 relative overflow-hidden",
        className
      )}
    >
      <Container className="px-6 md:px-10 lg:px-20">
        <div className="flex flex-col lg:flex-row items-start lg:items-center gap-12 lg:gap-16">
          {/* Left: Text Content */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="flex-1 max-w-2xl"
          >
            <h1 className="text-[56px] font-bold leading-[1.1] tracking-[-0.01em] text-[rgba(255,255,255,0.92)] mb-5">
              AI Tools That Help You Design, Plan & Build Smarter
            </h1>
            <p className="text-xl font-normal leading-relaxed text-[rgba(255,255,255,0.80)] mb-8 max-w-[55ch]">
              Transform your architectural vision into reality with AI-powered tools that understand design, calculate costs, and guide you through every step of your project.
            </p>
            <motion.div
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Button
                variant="default"
                className="px-[26px] py-[14px] text-base font-medium rounded-xl"
              >
                Start My Project
              </Button>
            </motion.div>
          </motion.div>

          {/* Right: Floating Preview Cards / Gradient Blob */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2, ease: "easeOut" }}
            className="flex-1 relative h-[400px] lg:h-[500px]"
          >
            {/* Gradient Blob Background */}
            <div className="absolute inset-0 bg-gradient-radial from-[rgba(0,255,210,0.08)] via-[rgba(0,255,210,0.03)] to-transparent rounded-full blur-3xl" />
            
            {/* Floating Cards Preview */}
            <div className="relative h-full flex items-center justify-center">
              <motion.div
                animate={{
                  y: [0, -10, 0],
                }}
                transition={{
                  duration: 4,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
                className="w-48 h-32 rounded-2xl bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.10)] backdrop-blur-sm shadow-[0_4px_60px_rgba(0,255,215,0.08)]"
              />
            </div>
          </motion.div>
        </div>
      </Container>
    </section>
  );
};


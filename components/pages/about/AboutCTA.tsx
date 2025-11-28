"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

export interface AboutCTAProps {
  className?: string;
}

export const AboutCTA: React.FC<AboutCTAProps> = ({ className }) => {
  return (
    <section
      className={cn(
        "w-full py-35 md:py-40 relative overflow-hidden",
        className
      )}
    >
      {/* Subtle Teal Spotlight */}
      <div className="absolute inset-0 bg-gradient-radial from-[rgba(0,255,210,0.08)] via-[rgba(0,255,210,0.03)] to-transparent pointer-events-none" />

      <Container className="px-6 md:px-10 lg:px-20 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="text-center max-w-3xl mx-auto"
        >
          <h2 className="text-[40px] md:text-[48px] font-semibold leading-[1.2] text-white mb-5">
            Ready to See Your Home Before You Build It?
          </h2>
          <p className="text-lg font-normal leading-relaxed text-[rgba(255,255,255,0.75)] mb-9 max-w-2xl mx-auto">
            Create your AI preview in under 30 seconds.
          </p>
          <motion.div
            whileHover={{ scale: 1.02, filter: "brightness(1.07)" }}
            whileTap={{ scale: 0.98 }}
          >
            <Button
              variant="default"
              className="px-[42px] py-[18px] text-base font-semibold rounded-[14px] shadow-[0_4px_20px_rgba(0,255,210,0.15)]"
            >
              Start Your Project
            </Button>
          </motion.div>
        </motion.div>
      </Container>
    </section>
  );
};


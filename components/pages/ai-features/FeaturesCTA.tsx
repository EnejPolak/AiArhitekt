"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

export interface FeaturesCTAProps {
  className?: string;
}

export const FeaturesCTA: React.FC<FeaturesCTAProps> = ({ className }) => {
  return (
    <section
      className={cn(
        "w-full py-35 relative overflow-hidden",
        className
      )}
    >
      {/* Subtle Background Gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[rgba(0,255,210,0.02)] to-transparent" />

      <Container className="px-6 md:px-10 lg:px-20 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="text-center max-w-3xl mx-auto"
        >
          <h2 className="text-[44px] font-semibold leading-[1.2] text-[rgba(255,255,255,0.92)] mb-5">
            Ready to Transform Your Home?
          </h2>
          <p className="text-lg font-normal leading-relaxed text-[rgba(255,255,255,0.75)] mb-9 max-w-2xl mx-auto">
            Start your project today and experience how AI can simplify your architectural journey from concept to completion.
          </p>
          <motion.div
            whileHover={{ scale: 1.02, filter: "brightness(1.07)" }}
            whileTap={{ scale: 0.98 }}
          >
            <Button
              variant="default"
              className="px-[30px] py-4 text-base font-semibold rounded-xl shadow-[0_4px_20px_rgba(0,255,210,0.15)]"
            >
              Start My Project
            </Button>
          </motion.div>
        </motion.div>
      </Container>
    </section>
  );
};


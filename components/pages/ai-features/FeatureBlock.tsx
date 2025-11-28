"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Container } from "@/components/ui/Container";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

export interface FeatureBlockProps {
  title: string;
  description: string;
  bullets: string[];
  imagePosition: "left" | "right";
  isFirst?: boolean;
  className?: string;
}

export const FeatureBlock: React.FC<FeatureBlockProps> = ({
  title,
  description,
  bullets,
  imagePosition,
  isFirst = false,
  className,
}) => {
  const isRight = imagePosition === "right";

  return (
    <section
      className={cn(
        "w-full py-35 relative",
        isFirst && "pt-35",
        className
      )}
    >
      <Container className="px-6 md:px-10 lg:px-20">
        <div
          className={cn(
            "flex flex-col gap-10 lg:gap-16",
            isRight ? "lg:flex-row" : "lg:flex-row-reverse"
          )}
        >
          {/* Text Content */}
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.45, ease: "easeOut" }}
            className="flex-1 flex flex-col justify-center"
          >
            <h2 className="text-[40px] font-semibold leading-[1.2] text-[rgba(255,255,255,0.92)] mb-4">
              {title}
            </h2>
            <p className="text-[17px] font-normal leading-[1.55] text-[rgba(255,255,255,0.65)] mb-6 max-w-[65ch]">
              {description}
            </p>

            {/* Bullet Points */}
            <div className="space-y-3.5">
              {bullets.map((bullet, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -10 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{
                    duration: 0.4,
                    delay: index * 0.08,
                    ease: "easeOut",
                  }}
                  className="flex items-start gap-3"
                >
                  <Check className="w-5 h-5 text-[rgba(0,255,210,0.7)] flex-shrink-0 mt-0.5 stroke-[1.5]" />
                  <span className="text-base text-[rgba(255,255,255,0.75)] leading-relaxed">
                    {bullet}
                  </span>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Visual Card */}
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.45, delay: 0.1, ease: "easeOut" }}
            className="flex-1 flex items-center justify-center"
          >
            <div className="relative w-full max-w-[620px] aspect-[4/3] rounded-[28px] p-8 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.10)] shadow-[0_4px_60px_rgba(0,255,215,0.08)] backdrop-blur-sm">
              {/* Placeholder for feature image */}
              <div className="w-full h-full rounded-2xl bg-gradient-to-br from-[rgba(15,23,42,0.4)] to-[rgba(0,0,0,0.2)] flex items-center justify-center">
                <div className="text-center">
                  <div className="w-24 h-24 mx-auto mb-4 rounded-full bg-[rgba(0,255,210,0.1)] border border-[rgba(0,255,210,0.2)] flex items-center justify-center">
                    <div className="w-12 h-12 rounded-lg bg-[rgba(0,255,210,0.2)]" />
                  </div>
                  <p className="text-sm text-[rgba(255,255,255,0.5)]">
                    Feature Preview
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </Container>
    </section>
  );
};


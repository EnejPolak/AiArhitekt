"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Container } from "@/components/ui/Container";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

export interface HowWeBuiltItProps {
  className?: string;
}

const FEATURES = [
  "Floor plan geometry understanding",
  "3D spatial reconstruction",
  "Material, cost & permit intelligence",
];

export const HowWeBuiltIt: React.FC<HowWeBuiltItProps> = ({ className }) => {
  return (
    <section
      className={cn(
        "w-full py-35 md:py-40 relative",
        className
      )}
    >
      <Container className="px-6 md:px-10 lg:px-20">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center max-w-6xl mx-auto">
          {/* Text Content */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-[40px] md:text-[48px] font-semibold leading-[1.2] text-white mb-6">
              Built With Advanced Spatial AI
            </h2>
            <p className="text-[17px] font-normal leading-[1.6] text-[rgba(255,255,255,0.75)] mb-8">
              We trained models specifically for floor plans, architectural layouts, materials, and domestic building rules.
              While generic AI tools can create images, Arhitekt AI understands rooms, dimensions, flow, and real construction constraints.
            </p>

            {/* Sub-features */}
            <ul className="space-y-4">
              {FEATURES.map((feature, index) => (
                <motion.li
                  key={index}
                  initial={{ opacity: 0, x: -10 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: index * 0.1 }}
                  className="flex items-start gap-3"
                >
                  <Check className="w-5 h-5 text-[rgba(0,230,204,0.7)] flex-shrink-0 mt-0.5 stroke-[1.5]" />
                  <span className="text-base text-[rgba(255,255,255,0.75)] leading-relaxed">
                    {feature}
                  </span>
                </motion.li>
              ))}
            </ul>
          </motion.div>

          {/* Visual - 3D Wireframe */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="relative h-[400px] rounded-2xl bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.08)] flex items-center justify-center"
          >
            {/* 3D Wireframe Visualization */}
            <svg className="w-full h-full" viewBox="0 0 300 300">
              {/* Back face */}
              <polygon
                points="50,50 250,50 250,250 50,250"
                fill="none"
                stroke="rgba(0,230,204,0.3)"
                strokeWidth="2"
              />
              {/* Front face */}
              <polygon
                points="80,80 280,80 280,280 80,280"
                fill="rgba(0,230,204,0.05)"
                stroke="rgba(0,230,204,0.6)"
                strokeWidth="2"
              />
              {/* Connecting lines */}
              <line x1="50" y1="50" x2="80" y2="80" stroke="rgba(0,230,204,0.4)" strokeWidth="1.5" />
              <line x1="250" y1="50" x2="280" y2="80" stroke="rgba(0,230,204,0.4)" strokeWidth="1.5" />
              <line x1="250" y1="250" x2="280" y2="280" stroke="rgba(0,230,204,0.4)" strokeWidth="1.5" />
              <line x1="50" y1="250" x2="80" y2="280" stroke="rgba(0,230,204,0.4)" strokeWidth="1.5" />
            </svg>
          </motion.div>
        </div>
      </Container>
    </section>
  );
};


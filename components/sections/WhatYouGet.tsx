"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Container } from "@/components/ui/Container";
import { cn } from "@/lib/utils";
import { Boxes, Calculator, FileCheck } from "lucide-react";

export interface WhatYouGetProps {
  className?: string;
}

const ITEMS = [
  {
    id: 1,
    title: "3D AI Concept",
    description:
      "Realistic 3D visualization of your space before you start building or renovating.",
    icon: Boxes,
  },
  {
    id: 2,
    title: "Project Cost Overview",
    description:
      "A clear cost estimate, material breakdown, and budget recommendation.",
    icon: Calculator,
  },
  {
    id: 3,
    title: "Permit & Next Steps",
    description:
      "Guidance on required permits and the steps needed to start the project.",
    icon: FileCheck,
  },
];

export const WhatYouGet: React.FC<WhatYouGetProps> = ({ className }) => {
  return (
    <section
      className={cn(
        "w-full py-0 mt-20 md:mt-24 mb-28 md:mb-36 relative",
        className
      )}
    >
      <Container>
        {/* Section Title */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-10 md:mb-12"
        >
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-white">
            What You Get
          </h2>
        </motion.div>

        {/* Items Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 md:gap-16 lg:gap-20">
          {ITEMS.map((item, index) => {
            const Icon = item.icon;
            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{
                  duration: 0.5,
                  delay: index * 0.1,
                  ease: "easeOut",
                }}
                className="flex flex-col items-center text-center"
              >
                {/* Icon */}
                <div className="mb-6">
                  <Icon className="w-8 h-8 text-[rgba(255,255,255,0.6)] stroke-[1.5]" />
                </div>

                {/* Title */}
                <h3 className="text-xl md:text-2xl font-bold text-white mb-3 md:mb-4">
                  {item.title}
                </h3>

                {/* Description */}
                <p className="text-sm md:text-base leading-relaxed text-[rgba(255,255,255,0.58)] max-w-[280px]">
                  {item.description}
                </p>
              </motion.div>
            );
          })}
        </div>
      </Container>
    </section>
  );
};


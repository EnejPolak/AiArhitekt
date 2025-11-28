"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Container } from "@/components/ui/Container";
import { cn } from "@/lib/utils";
import { Eye, DollarSign, FileText } from "lucide-react";

export interface WhatWeSolveProps {
  className?: string;
}

const PROBLEMS = [
  {
    id: 1,
    title: "Uncertainty",
    description:
      "Most homeowners can't visualize the final result. AI creates a clear 3D concept so you understand space, light, scale, and layout.",
    icon: Eye,
  },
  {
    id: 2,
    title: "Unexpected Costs",
    description:
      "Renovations often cost more than planned. AI gives a budget estimate before work begins so you make informed decisions.",
    icon: DollarSign,
  },
  {
    id: 3,
    title: "Legal Confusion",
    description:
      "Permits are confusing. AI explains what you need, why, and what steps come next.",
    icon: FileText,
  },
];

export const WhatWeSolve: React.FC<WhatWeSolveProps> = ({ className }) => {
  return (
    <section
      className={cn(
        "w-full py-35 md:py-40 relative",
        className
      )}
    >
      <Container className="px-6 md:px-10 lg:px-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-[40px] md:text-[48px] font-semibold leading-[1.2] text-white">
            Why We Built Arhitekt AI
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 md:gap-15 max-w-6xl mx-auto">
          {PROBLEMS.map((problem, index) => {
            const Icon = problem.icon;
            return (
              <motion.div
                key={problem.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="text-center"
              >
                <Icon className="w-8 h-8 text-[rgba(0,230,204,0.7)] mx-auto mb-6 stroke-[1.5]" />
                <h3 className="text-xl md:text-[22px] font-semibold text-white mb-4">
                  {problem.title}
                </h3>
                <p className="text-base md:text-[17px] font-normal leading-relaxed text-[rgba(255,255,255,0.65)]">
                  {problem.description}
                </p>
              </motion.div>
            );
          })}
        </div>
      </Container>
    </section>
  );
};


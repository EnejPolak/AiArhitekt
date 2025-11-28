"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Container } from "@/components/ui/Container";
import { cn } from "@/lib/utils";

export interface OurValuesProps {
  className?: string;
}

const VALUES = [
  {
    id: 1,
    title: "Clarity",
    description: "no guesswork, no hidden details",
  },
  {
    id: 2,
    title: "Accuracy",
    description: "realistic AI simulations",
  },
  {
    id: 3,
    title: "Transparency",
    description: "clear costs and next steps",
  },
  {
    id: 4,
    title: "Empowerment",
    description: "homeowners should understand their homes before building",
  },
];

export const OurValues: React.FC<OurValuesProps> = ({ className }) => {
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
            Our Principles
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-6xl mx-auto">
          {VALUES.map((value, index) => (
            <motion.div
              key={value.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: index * 0.1 }}
              className="text-center"
            >
              <h3 className="text-xl font-semibold text-white mb-3">
                {value.title}
              </h3>
              <p className="text-sm text-[rgba(255,255,255,0.65)] leading-relaxed">
                {value.description}
              </p>
            </motion.div>
          ))}
        </div>
      </Container>
    </section>
  );
};


"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Container } from "@/components/ui/Container";
import { cn } from "@/lib/utils";

export interface OurJourneyProps {
  className?: string;
}

const TIMELINE = [
  {
    id: 1,
    year: "2024",
    event: "Initial AI model trained",
  },
  {
    id: 2,
    year: "2025",
    event: "Spatial engine v1 launched",
  },
  {
    id: 3,
    year: "2025",
    event: "Permit intelligence added",
  },
  {
    id: 4,
    year: "2026",
    event: "Full home 3D engine",
  },
];

export const OurJourney: React.FC<OurJourneyProps> = ({ className }) => {
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
            Our Journey
          </h2>
        </motion.div>

        <div className="max-w-2xl mx-auto">
          <div className="relative pl-8">
            {/* Vertical Line */}
            <div className="absolute left-0 top-0 bottom-0 w-[1px] bg-[rgba(0,230,204,0.3)]" />

            {/* Timeline Items */}
            <div className="space-y-12">
              {TIMELINE.map((item, index) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: index * 0.1 }}
                  className="relative flex items-start gap-6"
                >
                  {/* Dot */}
                  <div className="absolute -left-[33px] top-1 w-3 h-3 rounded-full bg-[rgba(0,230,204,0.6)] border-2 border-[rgba(0,230,204,0.3)]" />

                  {/* Content */}
                  <div>
                    <div className="text-lg font-semibold text-[rgba(0,230,204,0.9)] mb-2">
                      {item.year}
                    </div>
                    <p className="text-base text-[rgba(255,255,255,0.75)]">
                      {item.event}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
};


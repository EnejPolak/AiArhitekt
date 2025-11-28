"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Container } from "@/components/ui/Container";
import { cn } from "@/lib/utils";

export interface WhoWeAreProps {
  className?: string;
}

const TEAMS = [
  {
    id: 1,
    title: "Architecture",
    description: "research & space modeling",
  },
  {
    id: 2,
    title: "AI Engineering",
    description: "simulation tools & intelligence engine",
  },
  {
    id: 3,
    title: "UX Design",
    description: "clarity, accuracy, simplicity",
  },
  {
    id: 4,
    title: "Visualization",
    description: "blueprint & 3D concept rendering",
  },
];

export const WhoWeAre: React.FC<WhoWeAreProps> = ({ className }) => {
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
          <h2 className="text-[40px] md:text-[48px] font-semibold leading-[1.2] text-white mb-4">
            Who We Are
          </h2>
          <p className="text-[17px] font-normal leading-relaxed text-[rgba(255,255,255,0.75)] max-w-2xl mx-auto">
            A small team of architects, engineers, and AI specialists building the future of home planning.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {TEAMS.map((team, index) => (
            <motion.div
              key={team.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: index * 0.1 }}
              className="rounded-[22px] p-8 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.10)] backdrop-blur-sm"
            >
              <h3 className="text-xl font-semibold text-white mb-2">
                {team.title}
              </h3>
              <p className="text-sm text-[rgba(255,255,255,0.65)]">
                {team.description}
              </p>
            </motion.div>
          ))}
        </div>
      </Container>
    </section>
  );
};


"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Container } from "@/components/ui/Container";
import { cn } from "@/lib/utils";

export interface OurMissionProps {
  className?: string;
}

export const OurMission: React.FC<OurMissionProps> = ({ className }) => {
  return (
    <section
      className={cn(
        "w-full pt-32 md:pt-40 pb-35 md:pb-40 relative",
        className
      )}
    >
      <Container className="px-6 md:px-10 lg:px-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="max-w-[850px]"
        >
          <h2 className="text-[40px] md:text-[48px] font-semibold leading-[1.2] text-white mb-6 pb-6 border-b border-[rgba(0,230,204,0.2)]">
            Our Mission
          </h2>
          <div className="space-y-10">
            <p className="text-[17px] font-normal leading-[1.6] text-[rgba(255,255,255,0.75)]">
              Arhitekt AI exists to remove uncertainty from home projects.
            </p>
            <p className="text-[17px] font-normal leading-[1.6] text-[rgba(255,255,255,0.75)]">
              Most people renovate or build only once or twice in their lifetime.
              We believe you should be able to see the result before spending thousands on materials, architects, consultants, and permits.
            </p>
            <p className="text-[17px] font-normal leading-[1.6] text-[rgba(255,255,255,0.75)]">
              Arhitekt AI brings clarity, transparency, and confidence through intelligent simulations and easy-to-understand project insights.
            </p>
          </div>
        </motion.div>
      </Container>
    </section>
  );
};


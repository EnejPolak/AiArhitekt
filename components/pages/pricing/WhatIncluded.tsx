"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Container } from "@/components/ui/Container";
import { cn } from "@/lib/utils";
import { FileText, Boxes, Package, Calculator, FileCheck, Download } from "lucide-react";

export interface WhatIncludedProps {
  className?: string;
}

const ITEMS = [
  {
    id: 1,
    title: "AI Floor Plan Analysis",
    icon: FileText,
  },
  {
    id: 2,
    title: "3D Space Builder",
    icon: Boxes,
  },
  {
    id: 3,
    title: "Material Engine",
    icon: Package,
  },
  {
    id: 4,
    title: "Smart Cost Estimate",
    icon: Calculator,
  },
  {
    id: 5,
    title: "Permit Checklist",
    icon: FileCheck,
  },
  {
    id: 6,
    title: "PDF Export",
    icon: Download,
  },
];

export const WhatIncluded: React.FC<WhatIncludedProps> = ({ className }) => {
  return (
    <section
      className={cn(
        "w-full py-28 md:py-36 relative",
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
            Everything in Every Plan
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {ITEMS.map((item, index) => {
            const Icon = item.icon;
            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: index * 0.08 }}
                className="flex flex-col items-center text-center p-6 rounded-2xl bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] hover:border-[rgba(0,230,204,0.2)] transition-all duration-300"
              >
                <Icon className="w-8 h-8 text-[rgba(0,230,204,0.7)] mb-4 stroke-[1.5]" />
                <h3 className="text-base font-medium text-[rgba(255,255,255,0.85)]">
                  {item.title}
                </h3>
              </motion.div>
            );
          })}
        </div>
      </Container>
    </section>
  );
};


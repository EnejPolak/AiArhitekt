"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Container } from "@/components/ui/Container";
import { cn } from "@/lib/utils";

export interface ContactFAQProps {
  className?: string;
}

const FAQ_ITEMS = [
  {
    id: 1,
    question: "Can you replace a full architect?",
    answer:
      "No. Arhitekt AI is designed to help you visualize and plan your project before engaging professionals. We provide 3D concepts, cost estimates, and permit guidance, but for final construction documents and legal approvals, you'll need a licensed architect.",
  },
  {
    id: 2,
    question: "Do you work with professionals?",
    answer:
      "Yes. Many architects, contractors, and designers use Arhitekt AI to quickly generate initial concepts and cost estimates for their clients. It helps speed up the early planning phase and gives clients a clear visual understanding of the project.",
  },
  {
    id: 3,
    question: "Is this only for EU?",
    answer:
      "While our permit intelligence is currently optimized for EU regulations, our AI tools work globally. You can upload any floor plan and get 3D visualizations and cost estimates regardless of location. Permit guidance may be limited to EU countries for now.",
  },
];

export const ContactFAQ: React.FC<ContactFAQProps> = ({ className }) => {
  return (
    <section
      className={cn(
        "w-full pt-24 md:pt-30 pb-30 relative",
        className
      )}
    >
      <Container className="px-6 md:px-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="max-w-[900px] mx-auto"
        >
          <h2 className="text-[32px] md:text-[40px] font-semibold text-white mb-8 text-center">
            Before you message us, you might be wondering…
          </h2>
          <div className="space-y-8">
            {FAQ_ITEMS.map((item, index) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: index * 0.1 }}
              >
                <h3 className="text-lg md:text-xl font-semibold text-white mb-3">
                  {item.question}
                </h3>
                <p className="text-[15px] md:text-base text-[rgba(255,255,255,0.70)] leading-relaxed">
                  {item.answer}
                </p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </Container>
    </section>
  );
};


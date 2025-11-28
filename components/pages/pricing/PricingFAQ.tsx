"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Container } from "@/components/ui/Container";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";

export interface PricingFAQProps {
  className?: string;
}

const FAQ_ITEMS = [
  {
    id: 1,
    question: "How accurate is the estimate?",
    answer:
      "Our AI cost estimates are based on regional pricing data, material costs, and labor rates. Accuracy typically ranges from 85-95% depending on project complexity and local market conditions. We recommend consulting with contractors for final quotes.",
  },
  {
    id: 2,
    question: "Can I use it for permits?",
    answer:
      "Yes! Our permit guidance identifies required permits based on your location and project type. We provide documentation checklists and application timelines. However, always verify with your local building department as regulations vary by jurisdiction.",
  },
  {
    id: 3,
    question: "What file types can I upload?",
    answer:
      "We accept PDFs, JPG/PNG images, and hand-drawn sketches. Our AI can process scanned floor plans, digital blueprints, and even photos of sketches. For best results, use clear, well-lit images with visible measurements.",
  },
  {
    id: 4,
    question: "Do I keep the exports forever?",
    answer:
      "Yes, all exports are yours to keep permanently. Once generated, you can download your 3D models, cost estimates, and reports as many times as you need. Files are stored in your account for easy access.",
  },
  {
    id: 5,
    question: "What if my plan is low quality?",
    answer:
      "Our AI is designed to work with various quality levels, including low-resolution scans and rough sketches. If the system detects issues, it will flag them for your review. For best results, we recommend clear, legible plans with visible dimensions.",
  },
];

export const PricingFAQ: React.FC<PricingFAQProps> = ({ className }) => {
  const [openId, setOpenId] = React.useState<number | null>(null);

  const toggleItem = (id: number) => {
    setOpenId(openId === id ? null : id);
  };

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
            Frequently Asked Questions
          </h2>
        </motion.div>

        <div className="max-w-3xl mx-auto space-y-4">
          {FAQ_ITEMS.map((item, index) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: index * 0.1 }}
              className="rounded-2xl bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.10)] backdrop-blur-sm overflow-hidden"
            >
              <button
                onClick={() => toggleItem(item.id)}
                className="w-full px-6 py-5 flex items-center justify-between text-left hover:bg-[rgba(255,255,255,0.02)] transition-colors"
              >
                <span className="text-base font-medium text-white pr-4">
                  {item.question}
                </span>
                <motion.div
                  animate={{ rotate: openId === item.id ? 180 : 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <ChevronDown className="w-5 h-5 text-[rgba(255,255,255,0.60)] flex-shrink-0" />
                </motion.div>
              </button>
              <AnimatePresence>
                {openId === item.id && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="overflow-hidden"
                  >
                    <div className="px-6 pb-5 pt-0">
                      <p className="text-sm leading-relaxed text-[rgba(255,255,255,0.65)]">
                        {item.answer}
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>
      </Container>
    </section>
  );
};


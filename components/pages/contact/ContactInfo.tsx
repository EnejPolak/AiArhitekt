"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Mail, MapPin, Clock, Check } from "lucide-react";

export interface ContactInfoProps {
  className?: string;
}

export const ContactInfo: React.FC<ContactInfoProps> = ({ className }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay: 0.1 }}
      className={cn("space-y-8", className)}
    >
      {/* Contact Details */}
      <div className="rounded-[28px] p-6 md:p-8 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.10)]">
        <h3 className="text-lg md:text-xl font-semibold text-white mb-4">
          Contact details
        </h3>
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <Mail className="w-[18px] h-[18px] text-[rgba(0,230,204,0.7)] flex-shrink-0 mt-0.5 stroke-[1.5]" />
            <a
              href="mailto:hello@arhitekt.ai"
              className="text-[15px] md:text-base text-[rgba(255,255,255,0.70)] hover:text-[rgba(255,255,255,0.90)] transition-colors"
            >
              hello@arhitekt.ai
            </a>
          </div>
          <div className="flex items-start gap-3">
            <MapPin className="w-[18px] h-[18px] text-[rgba(0,230,204,0.7)] flex-shrink-0 mt-0.5 stroke-[1.5]" />
            <p className="text-[15px] md:text-base text-[rgba(255,255,255,0.70)]">
              Based in Slovenia. Working with projects across EU.
            </p>
          </div>
          <div className="flex items-start gap-3">
            <Clock className="w-[18px] h-[18px] text-[rgba(0,230,204,0.7)] flex-shrink-0 mt-0.5 stroke-[1.5]" />
            <p className="text-[15px] md:text-base text-[rgba(255,255,255,0.70)]">
              We respond Mon–Fri, 9:00–17:00 CET.
            </p>
          </div>
        </div>
      </div>

      {/* Best For */}
      <div className="rounded-[28px] p-6 md:p-8 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.10)]">
        <h3 className="text-lg md:text-xl font-semibold text-white mb-4">
          Best for…
        </h3>
        <ul className="space-y-2.5">
          {[
            "Questions about what Arhitekt AI can do for your home.",
            "Help understanding your floor plan or renovation idea.",
            "Small advisory before you start spending money on contractors.",
          ].map((item, index) => (
            <li key={index} className="flex items-start gap-3">
              <Check className="w-4 h-4 text-[rgba(0,230,204,0.7)] flex-shrink-0 mt-1 stroke-[1.5]" />
              <span className="text-sm md:text-[15px] text-[rgba(255,255,255,0.70)] leading-relaxed">
                {item}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </motion.div>
  );
};


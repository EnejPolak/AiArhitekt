"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import {
  FileText,
  Building2,
  Ruler,
  DraftingCompass,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface PricingProps {
  className?: string;
}

interface Plan {
  name: string;
  price: string;
  description: string;
  features: string[];
  icon: React.ComponentType<{ className?: string }>;
  popular?: boolean;
}

const PLANS: Plan[] = [
  {
    name: "Starter",
    price: "€19",
    description: "Ideal for homeowners exploring their first renovation.",
    icon: FileText,
    features: [
      "AI floorplan analysis",
      "3D model previews",
      "Basic cost estimates",
      "Permit guidance",
    ],
  },
  {
    name: "Pro",
    price: "€39",
    description: "For architects and designers running multiple projects.",
    icon: Building2,
    popular: true,
    features: [
      "AI floorplan analysis",
      "Unlimited 3D model previews",
      "Advanced cost estimates",
      "Permit guidance & compliance",
      "Priority support",
    ],
  },
  {
    name: "Studio",
    price: "€79",
    description: "For studios needing high-volume 3D and permit-ready plans.",
    icon: DraftingCompass,
    features: [
      "AI floorplan analysis",
      "Unlimited 3D model previews",
      "Advanced cost estimates",
      "Permit guidance & compliance",
      "Priority support",
      "API access",
      "Custom integrations",
    ],
  },
];

export const Pricing: React.FC<PricingProps> = ({ className }) => {
  return (
    <section
      id="pricing"
      className={cn("py-16 md:py-24 px-4", className)}
    >
      <Container>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="text-center mb-12 md:mb-16"
        >
          <h2 className="mb-4 text-4xl md:text-5xl lg:text-6xl font-extrabold leading-[1.1] text-white">
            Pricing
          </h2>
          <p className="mx-auto max-w-[640px] text-base md:text-xl font-medium text-[#A0A0A0]">
            Choose the plan that works for your next home project.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8 max-w-7xl mx-auto">
          {PLANS.map((plan, index) => {
            const Icon = plan.icon;
            return (
              <motion.div
                key={plan.name}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{
                  duration: 0.6,
                  ease: "easeOut",
                  delay: index * 0.1,
                }}
                className={cn(
                  "relative flex flex-col p-8 rounded-2xl border bg-gradient-to-b from-[#151515] to-[#0E0E0E] shadow-[0_20px_60px_rgba(0,0,0,0.6)] transition-all duration-200 ease-out",
                  plan.popular
                    ? "lg:scale-[1.03] border-blue-500/60 shadow-[0_20px_60px_rgba(0,0,0,0.6),0_0_40px_rgba(59,130,246,0.3)]"
                    : "border-white/5 hover:scale-[1.01] hover:border-white/10"
                )}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-blue-500/20 border border-blue-500/40 rounded-full text-xs font-semibold text-blue-300">
                    Most Popular
                  </div>
                )}

                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-blue-500/10 rounded-lg border border-blue-500/20">
                    <Icon className="w-5 h-5 text-blue-400" />
                  </div>
                  <h3 className="text-2xl font-bold text-white">{plan.name}</h3>
                </div>

                <div className="mb-4">
                  <span className="text-4xl font-extrabold text-white">
                    {plan.price}
                  </span>
                  <span className="text-lg text-[#A0A0A0]">/mo</span>
                </div>

                <p className="text-sm text-[#A0A0A0] mb-6 min-h-[40px]">
                  {plan.description}
                </p>

                <ul className="flex-1 space-y-3 mb-6">
                  {plan.features.map((feature, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <CheckCircle2 className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                      <span className="text-sm text-[#C9C9C9]">{feature}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  variant="default"
                  className={cn(
                    "w-full md:w-auto px-5 py-3 rounded-full font-semibold transition-all duration-200 ease-out",
                    plan.popular
                      ? "hover:scale-[1.02] hover:shadow-[0_0_30px_rgba(59,130,246,0.7)]"
                      : "hover:scale-[1.02] hover:shadow-[0_0_30px_rgba(59,130,246,0.5)]"
                  )}
                >
                  Get started
                </Button>
              </motion.div>
            );
          })}
        </div>
      </Container>
    </section>
  );
};

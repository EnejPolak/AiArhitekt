"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

export interface PricingCardsProps {
  className?: string;
}

const PLANS = [
  {
    id: 1,
    name: "Basic",
    price: "€19",
    period: "/ project",
    description: "For simple rooms and small layouts.",
    features: [
      "AI Floor Plan Reader",
      "Basic 3D Concept",
      "Cost Estimate",
      "1 PDF Export",
    ],
    buttonText: "Start Basic",
    buttonVariant: "outline" as const,
    popular: false,
  },
  {
    id: 2,
    name: "Pro",
    price: "€39",
    period: "/ project",
    description: "For full apartments and renovations.",
    features: [
      "Everything in Basic",
      "Full 3D Layout",
      "Material Suggestions",
      "Permit Guidance",
      "Unlimited Exports",
      "Priority Rendering",
    ],
    buttonText: "Start Pro",
    buttonVariant: "default" as const,
    popular: true,
  },
  {
    id: 3,
    name: "Complete",
    price: "€99",
    period: "/ project",
    description: "For houses & complex projects.",
    features: [
      "Everything in Pro",
      "Exterior 3D",
      "Full Cost Breakdown",
      "Structural Notes",
      "Contractor-Ready PDF",
    ],
    buttonText: "Start Complete",
    buttonVariant: "outline" as const,
    popular: false,
  },
];

export const PricingCards: React.FC<PricingCardsProps> = ({ className }) => {
  return (
    <section
      className={cn(
        "w-full py-20 md:py-28 relative",
        className
      )}
    >
      <Container className="px-6 md:px-10 lg:px-20">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 md:gap-14 lg:gap-16 max-w-7xl mx-auto">
          {PLANS.map((plan, index) => (
            <motion.div
              key={plan.id}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className={cn(
                "relative rounded-[28px] p-10 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.10)] backdrop-blur-sm transition-all duration-300",
                "hover:border-[rgba(0,230,204,0.3)] hover:shadow-[0_8px_40px_rgba(0,255,210,0.12)]",
                plan.popular && "lg:scale-[1.02]"
              )}
            >
              {/* Popular Badge */}
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full bg-[rgba(0,230,204,0.15)] border border-[rgba(0,230,204,0.3)] backdrop-blur-sm">
                  <span className="text-xs font-semibold text-[rgba(0,230,204,0.9)]">
                    Most Popular
                  </span>
                </div>
              )}

              {/* Content */}
              <div className="flex flex-col h-full">
                <div className="mb-6">
                  <h3 className="text-2xl font-semibold text-white mb-2">
                    {plan.name}
                  </h3>
                  <div className="flex items-baseline gap-2 mb-3">
                    <span className="text-4xl font-bold text-white">
                      {plan.price}
                    </span>
                    <span className="text-base text-[rgba(255,255,255,0.60)]">
                      {plan.period}
                    </span>
                  </div>
                  <p className="text-sm text-[rgba(255,255,255,0.65)]">
                    {plan.description}
                  </p>
                </div>

                {/* Features List */}
                <ul className="flex-1 space-y-3 mb-8">
                  {plan.features.map((feature, idx) => (
                    <li key={idx} className="flex items-start gap-3">
                      <Check className="w-5 h-5 text-[rgba(0,230,204,0.7)] flex-shrink-0 mt-0.5 stroke-[1.5]" />
                      <span className="text-sm text-[rgba(255,255,255,0.75)] leading-relaxed">
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>

                {/* Button */}
                <Button
                  variant={plan.buttonVariant === "default" ? "default" : "outline"}
                  className={cn(
                    "w-full py-3.5 rounded-xl font-semibold transition-all",
                    plan.popular && "shadow-[0_4px_20px_rgba(0,255,210,0.15)]"
                  )}
                >
                  {plan.buttonText}
                </Button>
              </div>
            </motion.div>
          ))}
        </div>
      </Container>
    </section>
  );
};


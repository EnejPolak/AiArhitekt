"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Container } from "@/components/ui/Container";
import { cn } from "@/lib/utils";
import { FileText, Box, Building2, Ruler, DoorOpen, Layers, Square, CheckCircle2 } from "lucide-react";

export interface HowItWorksProps {
  className?: string;
}

const STEPS = [
  {
    id: 1,
    title: "AI Reads Your Plan",
    description:
      "AI analizira dimenzije, stene, okna, vrata in razporeditev prostorov. Pretvori tvoj PDF/jpg v digitalni arhitekturni model.",
    shortDescription:
      "Upload Your Floor Plan. AI analizira dimenzije, stene, okna, vrata in razporeditev prostorov.",
    label: "Analyzing layout…",
    color: "teal",
  },
  {
    id: 2,
    title: "AI Builds Your 3D Space",
    description:
      "Od 2D načrta ustvari realističen 3D model tvojega prostora: svetloba, materiali, postavitev pohištva, razmerja in arhitekturne podrobnosti.",
    shortDescription:
      "AI Generates Your 3D Home. Od 2D načrta ustvari realističen 3D model tvojega prostora.",
    label: "Generating 3D model…",
    color: "cyan",
  },
  {
    id: 3,
    title: "AI Creates Your Project Report",
    description:
      "Pripraviš personaliziran načrt: stroškovnik, materiali, priporočila, dovoljenja, next-steps za gradnjo ali prenovo.",
    shortDescription:
      "Get Your Cost & Permit Guide. Pripraviš personaliziran načrt za gradnjo ali prenovo.",
    label: "Ready to download",
    color: "blue",
  },
];

export const HowItWorks: React.FC<HowItWorksProps> = ({ className }) => {
  const [hoveredStep, setHoveredStep] = React.useState<number | null>(null);

  return (
    <section
      id="how-it-works"
      className={cn(
        "w-full py-24 md:py-32 relative",
        className
      )}
    >
      <Container>
        {/* Section Title */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16 md:mb-20"
        >
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-white mb-4">
            How It Works
          </h2>
          <p className="text-lg md:text-xl text-[#A0A0A0] max-w-2xl mx-auto">
            AI builds your home from scratch – from plan to final project
          </p>
        </motion.div>

        {/* Steps Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 md:gap-12">
          {STEPS.map((step, index) => (
            <motion.div
              key={step.id}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.15 }}
              onMouseEnter={() => setHoveredStep(step.id)}
              onMouseLeave={() => setHoveredStep(null)}
              className="relative group"
            >
              {/* Card */}
              <div className="relative h-full rounded-3xl p-8 bg-[rgba(15,23,42,0.4)] backdrop-blur-sm border border-[rgba(255,255,255,0.1)] shadow-[0_4px_60px_-20px_rgba(0,255,200,0.10)] transition-all duration-300 hover:border-[rgba(0,230,204,0.3)] hover:shadow-[0_8px_80px_-20px_rgba(0,255,200,0.15)]">
                {/* Step Number Badge */}
                <div className="absolute -top-4 left-8 w-10 h-10 rounded-full bg-gradient-to-br from-[rgba(0,230,204,0.2)] to-[rgba(0,180,216,0.2)] border border-[rgba(0,230,204,0.3)] flex items-center justify-center backdrop-blur-sm">
                  <span className="text-sm font-bold text-white">{step.id}</span>
                </div>

                {/* Visual Scene */}
                <div className="relative h-48 mb-6 rounded-2xl overflow-hidden bg-gradient-to-br from-[rgba(0,0,0,0.3)] to-[rgba(15,23,42,0.5)] flex items-center justify-center">
                  {step.id === 1 && (
                    <BlueprintScene isHovered={hoveredStep === step.id} />
                  )}
                  {step.id === 2 && (
                    <Model3DScene isHovered={hoveredStep === step.id} />
                  )}
                  {step.id === 3 && (
                    <ReportScene isHovered={hoveredStep === step.id} />
                  )}
                </div>

                {/* Content */}
                <div className="space-y-4">
                  <h3 className="text-2xl font-bold text-white">{step.title}</h3>
                  <p className="text-base leading-relaxed text-[#BFBFBF]">
                    {step.shortDescription}
                  </p>

                  {/* Processing Label */}
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: hoveredStep === step.id ? 1 : 0.6 }}
                    className="flex items-center gap-2 mt-4"
                  >
                    <div className="w-1.5 h-1.5 rounded-full bg-[rgba(0,230,204,0.6)] animate-pulse" />
                    <span className="text-sm font-medium text-[rgba(255,255,255,0.7)]">
                      {step.label}
                    </span>
                  </motion.div>
                </div>

                {/* Glow Effect on Hover */}
                {hoveredStep === step.id && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="absolute inset-0 rounded-3xl bg-gradient-to-br from-[rgba(0,230,204,0.05)] to-transparent pointer-events-none"
                  />
                )}
              </div>
            </motion.div>
          ))}
        </div>
      </Container>
    </section>
  );
};

// Step 1: Blueprint Scene
const BlueprintScene: React.FC<{ isHovered: boolean }> = ({ isHovered }) => {
  return (
    <div className="relative w-full h-full flex items-center justify-center">
      {/* Blueprint Grid Background */}
      <div className="absolute inset-0 opacity-20">
        <svg className="w-full h-full" viewBox="0 0 200 200">
          <defs>
            <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>

      {/* Drawing Walls */}
      <motion.svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 200 150"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
      >
        {/* Room outline */}
        <motion.rect
          x="30"
          y="30"
          width="140"
          height="90"
          fill="none"
          stroke="rgba(0,230,204,0.6)"
          strokeWidth="2"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: isHovered ? 1 : 0.8 }}
          transition={{ duration: 1.5, ease: "easeInOut" }}
        />
        {/* Inner wall */}
        <motion.line
          x1="100"
          y1="30"
          x2="100"
          y2="120"
          stroke="rgba(0,230,204,0.6)"
          strokeWidth="2"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: isHovered ? 1 : 0.6 }}
          transition={{ duration: 1, delay: 0.3, ease: "easeInOut" }}
        />
      </motion.svg>

      {/* Icons */}
      <div className="absolute inset-0 flex items-center justify-center gap-8">
        <motion.div
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: isHovered ? 1 : 0.7, scale: isHovered ? 1 : 0.8 }}
          transition={{ delay: 0.5, duration: 0.4 }}
          className="relative"
        >
          <DoorOpen className="w-8 h-8 text-[rgba(0,230,204,0.8)]" />
          <motion.div
            className="absolute inset-0 rounded-full bg-[rgba(0,230,204,0.2)] blur-md"
            animate={{ scale: isHovered ? [1, 1.2, 1] : 1 }}
            transition={{ duration: 2, repeat: Infinity }}
          />
        </motion.div>
        <motion.div
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: isHovered ? 1 : 0.7, scale: isHovered ? 1 : 0.8 }}
          transition={{ delay: 0.7, duration: 0.4 }}
          className="relative"
        >
          <Square className="w-8 h-8 text-[rgba(0,230,204,0.8)]" />
          <motion.div
            className="absolute inset-0 rounded-full bg-[rgba(0,230,204,0.2)] blur-md"
            animate={{ scale: isHovered ? [1, 1.2, 1] : 1 }}
            transition={{ duration: 2, repeat: Infinity, delay: 0.3 }}
          />
        </motion.div>
        <motion.div
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: isHovered ? 1 : 0.7, scale: isHovered ? 1 : 0.8 }}
          transition={{ delay: 0.9, duration: 0.4 }}
          className="relative"
        >
          <Layers className="w-8 h-8 text-[rgba(0,230,204,0.8)]" />
          <motion.div
            className="absolute inset-0 rounded-full bg-[rgba(0,230,204,0.2)] blur-md"
            animate={{ scale: isHovered ? [1, 1.2, 1] : 1 }}
            transition={{ duration: 2, repeat: Infinity, delay: 0.6 }}
          />
        </motion.div>
      </div>
    </div>
  );
};

// Step 2: 3D Model Scene
const Model3DScene: React.FC<{ isHovered: boolean }> = ({ isHovered }) => {
  return (
    <div className="relative w-full h-full flex items-center justify-center">
      {/* 3D Wireframe */}
      <motion.div
        className="relative"
        animate={{
          rotateY: isHovered ? [0, 5, -5, 0] : 0,
          scale: isHovered ? [1, 1.05, 1] : 1,
        }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      >
        {/* Wireframe Box */}
        <svg className="w-32 h-32" viewBox="0 0 120 120">
          {/* Back face */}
          <motion.polygon
            points="20,20 100,20 100,100 20,100"
            fill="none"
            stroke="rgba(0,230,204,0.4)"
            strokeWidth="1.5"
            initial={{ opacity: 0 }}
            animate={{ opacity: isHovered ? 1 : 0.6 }}
            transition={{ delay: 0.2 }}
          />
          {/* Front face */}
          <motion.polygon
            points="40,40 120,40 120,120 40,120"
            fill="rgba(0,230,204,0.1)"
            stroke="rgba(0,230,204,0.8)"
            strokeWidth="2"
            initial={{ opacity: 0 }}
            animate={{ opacity: isHovered ? 1 : 0.7 }}
            transition={{ delay: 0.4 }}
          />
          {/* Connecting lines */}
          <motion.line
            x1="20"
            y1="20"
            x2="40"
            y2="40"
            stroke="rgba(0,230,204,0.6)"
            strokeWidth="1.5"
            initial={{ opacity: 0 }}
            animate={{ opacity: isHovered ? 1 : 0.5 }}
            transition={{ delay: 0.3 }}
          />
          <motion.line
            x1="100"
            y1="20"
            x2="120"
            y2="40"
            stroke="rgba(0,230,204,0.6)"
            strokeWidth="1.5"
            initial={{ opacity: 0 }}
            animate={{ opacity: isHovered ? 1 : 0.5 }}
            transition={{ delay: 0.35 }}
          />
          <motion.line
            x1="100"
            y1="100"
            x2="120"
            y2="120"
            stroke="rgba(0,230,204,0.6)"
            strokeWidth="1.5"
            initial={{ opacity: 0 }}
            animate={{ opacity: isHovered ? 1 : 0.5 }}
            transition={{ delay: 0.4 }}
          />
          <motion.line
            x1="20"
            y1="100"
            x2="40"
            y2="120"
            stroke="rgba(0,230,204,0.6)"
            strokeWidth="1.5"
            initial={{ opacity: 0 }}
            animate={{ opacity: isHovered ? 1 : 0.5 }}
            transition={{ delay: 0.45 }}
          />
        </svg>

        {/* Furniture Icons */}
        <div className="absolute inset-0 flex items-center justify-center">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: isHovered ? 1 : 0.6, y: isHovered ? 0 : 5 }}
            transition={{ delay: 0.8 }}
            className="absolute -bottom-4 -left-4"
          >
            <Box className="w-6 h-6 text-[rgba(0,230,204,0.7)]" />
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: isHovered ? 1 : 0.6, y: isHovered ? 0 : 5 }}
            transition={{ delay: 1 }}
            className="absolute -bottom-4 -right-4"
          >
            <Building2 className="w-6 h-6 text-[rgba(0,230,204,0.7)]" />
          </motion.div>
        </div>
      </motion.div>

      {/* Lighting Effect */}
      {isHovered && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.3, 0.2] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="absolute inset-0 bg-gradient-radial from-[rgba(0,230,204,0.1)] to-transparent"
        />
      )}
    </div>
  );
};

// Step 3: Report Scene
const ReportScene: React.FC<{ isHovered: boolean }> = ({ isHovered }) => {
  return (
    <div className="relative w-full h-full flex items-center justify-center">
      {/* Document Stack */}
      <div className="relative">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20, rotate: -5 + i * 2 }}
            animate={{
              opacity: isHovered ? 0.8 - i * 0.2 : 0.5 - i * 0.15,
              y: isHovered ? -i * 4 : -i * 2,
              rotate: isHovered ? -5 + i * 2 : -3 + i * 1.5,
            }}
            transition={{ delay: i * 0.1, duration: 0.4 }}
            className="absolute w-20 h-24 bg-gradient-to-br from-[rgba(255,255,255,0.1)] to-[rgba(200,200,200,0.05)] border border-[rgba(255,255,255,0.15)] rounded-lg backdrop-blur-sm"
            style={{ left: `${i * 8}px`, top: `${i * 6}px` }}
          >
            <div className="p-2 space-y-1">
              <div className="h-1 bg-[rgba(255,255,255,0.3)] rounded w-3/4" />
              <div className="h-1 bg-[rgba(255,255,255,0.2)] rounded w-full" />
              <div className="h-1 bg-[rgba(255,255,255,0.2)] rounded w-5/6" />
            </div>
          </motion.div>
        ))}
      </div>

      {/* Material Samples */}
      <div className="absolute inset-0 flex items-center justify-center gap-3">
        <motion.div
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: isHovered ? 1 : 0.6, scale: isHovered ? 1 : 0.8 }}
          transition={{ delay: 0.5, type: "spring", stiffness: 200 }}
          className="w-8 h-8 rounded bg-gradient-to-br from-amber-700 to-amber-900 border border-amber-600/30 shadow-lg"
        />
        <motion.div
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: isHovered ? 1 : 0.6, scale: isHovered ? 1 : 0.8 }}
          transition={{ delay: 0.6, type: "spring", stiffness: 200 }}
          className="w-8 h-8 rounded bg-gradient-to-br from-gray-600 to-gray-800 border border-gray-500/30 shadow-lg"
        />
        <motion.div
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: isHovered ? 1 : 0.6, scale: isHovered ? 1 : 0.8 }}
          transition={{ delay: 0.7, type: "spring", stiffness: 200 }}
          className="w-8 h-8 rounded bg-gradient-to-br from-blue-600 to-blue-800 border border-blue-500/30 shadow-lg"
        />
      </div>

      {/* Checkmark Badge */}
      <motion.div
        initial={{ opacity: 0, scale: 0 }}
        animate={{ opacity: isHovered ? 1 : 0.7, scale: isHovered ? 1 : 0.9 }}
        transition={{ delay: 0.8, type: "spring", stiffness: 200 }}
        className="absolute -top-2 -right-2"
      >
        <CheckCircle2 className="w-6 h-6 text-[rgba(0,230,204,0.9)]" />
      </motion.div>
    </div>
  );
};


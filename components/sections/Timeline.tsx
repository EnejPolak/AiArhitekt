"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Container } from "@/components/ui/Container";
import { cn } from "@/lib/utils";

export interface TimelineProps {
  className?: string;
  onComplete?: () => void;
}

const STEPS = [
  { id: 1, label: "Upload", segmentLabel: "Analyzing your plan…" },
  { id: 2, label: "AI Process", segmentLabel: "Generating AI model…" },
  { id: 3, label: "Result", segmentLabel: "" },
];

export const Timeline: React.FC<TimelineProps> = ({ className, onComplete }) => {
  const [currentSegment, setCurrentSegment] = React.useState(0);
  const [showLabel, setShowLabel] = React.useState(true);

  React.useEffect(() => {
    const timer1 = setTimeout(() => {
      setCurrentSegment(1);
    }, 2500);
    const timer2 = setTimeout(() => {
      setCurrentSegment(2);
    }, 5000);
    const timer3 = setTimeout(() => {
      setShowLabel(false);
      if (onComplete) {
        onComplete();
      }
    }, 5000);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
    };
  }, [onComplete]);

  const getLabelPosition = () => {
    if (currentSegment === 0) return "25%";
    if (currentSegment === 1) return "75%";
    return "100%";
  };

  const getSegmentLabel = () => {
    if (currentSegment === 0) return STEPS[0].segmentLabel;
    if (currentSegment === 1) return STEPS[1].segmentLabel;
    return "";
  };

  return (
    <section
      className={cn(
        "w-full -mt-[70px] mb-20 flex items-center justify-center",
        className
      )}
    >
      <Container className="px-0">
        <div className="flex flex-col items-center justify-center w-full">
          {/* Timeline Bar - Full width from hero text to image */}
          <div className="relative w-full max-w-[1200px] h-[2px] bg-[rgba(255,255,255,0.14)] rounded-[2px] mb-2">
            {/* Progress Beam Animation */}
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: "100%" }}
              transition={{ duration: 5, ease: "easeOut" }}
              className="absolute left-0 top-0 h-[3px] bg-gradient-to-r from-[rgba(0,245,212,0.15)] via-[rgba(0,224,255,0.18)] to-[rgba(0,245,212,0.15)] rounded-[2px]"
            />

            {/* Floating Processing Label */}
            {showLabel && (
              <motion.div
                initial={{ opacity: 0, x: 0 }}
                animate={{
                  opacity: 1,
                  x: currentSegment === 0 ? "25%" : currentSegment === 1 ? "75%" : "100%",
                }}
                exit={{ opacity: 0 }}
                transition={{
                  duration: 2.5,
                  ease: "easeInOut",
                }}
                className="absolute -top-8 left-0 transform -translate-x-1/2"
                style={{ left: getLabelPosition() }}
              >
                <div className="px-2.5 py-1 rounded-xl bg-[rgba(0,0,0,0.6)] backdrop-blur-md border border-[rgba(255,255,255,0.08)]">
                  <span className="text-[11px] font-medium text-[rgba(255,255,255,0.6)]">
                    {getSegmentLabel()}
                  </span>
                </div>
              </motion.div>
            )}

            {/* Checkpoints */}
            <div className="absolute inset-0 flex items-center justify-between">
              {STEPS.map((step, index) => (
                <div
                  key={step.id}
                  className="flex flex-col items-center"
                  style={{
                    position: "absolute",
                    left: `${(index / (STEPS.length - 1)) * 100}%`,
                    transform: "translateX(-50%)",
                  }}
                >
                  {/* Outer Circle */}
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{
                      duration: 0.3,
                      delay: index * 0.2,
                    }}
                    className="relative w-5 h-5 rounded-full border-2 border-[rgba(0,230,204,0.2)] bg-transparent shadow-[0_0_10px_rgba(0,230,204,0.18)] flex items-center justify-center mb-2.5"
                  >
                    {/* Pulse animation when beam reaches */}
                    <motion.div
                      animate={{
                        scale:
                          currentSegment >= index
                            ? [1, 1.05, 1]
                            : 1,
                      }}
                      transition={{
                        duration: 0.4,
                        delay: index * 2.5,
                        times: [0, 0.5, 1],
                      }}
                      className="absolute inset-0 rounded-full border-2 border-[rgba(0,230,204,0.22)]"
                    />
                    {/* Inner Circle */}
                    <motion.div
                      initial={{ scale: 0.4, opacity: 0 }}
                      animate={{ scale: 1, opacity: 0.7 }}
                      transition={{
                        duration: 0.2,
                        delay: index * 0.2 + 0.1,
                      }}
                      className="w-2.5 h-2.5 rounded-full bg-white opacity-55 z-10"
                    />
                  </motion.div>

                  {/* Label */}
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 0.55 }}
                    transition={{
                      duration: 0.25,
                      delay: index * 0.2 + 0.15,
                    }}
                    className="text-[13px] font-normal text-[rgba(255,255,255,0.55)] tracking-[0.01em]"
                  >
                    {step.label}
                  </motion.span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
};

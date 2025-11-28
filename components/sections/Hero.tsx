"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { BrickLoader } from "@/components/ui/BrickLoader";

export interface HeroProps {
  className?: string;
}

export const Hero = React.forwardRef<
  { handleTimelineComplete: () => void },
  HeroProps
>(({ className }, ref) => {
  const [imageReady, setImageReady] = React.useState(false);

  const handleTimelineComplete = React.useCallback(() => {
    setImageReady(true);
  }, []);

  React.useImperativeHandle(ref, () => ({
    handleTimelineComplete,
  }));

  return (
    <section
      className={cn(
        "relative min-h-[80vh] flex flex-col justify-center pt-[200px] pb-10",
        className
      )}
    >
      <Container className="pl-0">
        <div className="flex items-center gap-[86px] relative">
          {/* Left: Text Content */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="max-w-[600px] flex-1 -ml-12"
          >
            <h1 className="mb-6 text-[32px] font-extrabold leading-[1.1] text-white md:text-[44px] lg:text-[64px]">
              See Your Home
              <br />
              Before It Exists.
            </h1>
            <p className="mb-8 max-w-[420px] text-base font-medium leading-[1.6] text-[#CFCFCF] md:text-lg">
              Upload your plan to get a 3D model, cost estimate & permit
              guidance.
            </p>
            <motion.div
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Button variant="default" size="default">
                Start Your Project
              </Button>
            </motion.div>
          </motion.div>

          {/* Right: 3D Image or Loading Spinner */}
          <div className="hidden lg:flex flex-1 items-center justify-end relative -translate-y-2">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="relative w-full max-w-[540px] aspect-[4/3] rounded-2xl overflow-hidden mr-[35px] bg-[rgba(15,23,42,0.25)] border border-[rgba(255,255,255,0.1)] flex items-center justify-center"
            >
              {!imageReady && (
                <div className="absolute inset-0 bg-[rgba(0,0,0,0.05)] z-10" />
              )}
              {!imageReady ? (
                <BrickLoader />
              ) : (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                  className="relative w-full h-full"
                >
                  <Image
                    src="/3d-image-of-interior-design.png"
                    alt="3D Interior Design Visualization"
                    fill
                    className="object-cover"
                    priority
                  />
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.3, delay: 0.2 }}
                    className="absolute top-3 right-3 px-2.5 py-1 rounded-lg bg-[rgba(0,230,204,0.08)] backdrop-blur-md border border-[rgba(0,230,204,0.16)]"
                  >
                    <span className="text-[11px] font-medium text-[rgba(255,255,255,0.75)]">
                      Preview ready
                    </span>
                  </motion.div>
                </motion.div>
              )}
            </motion.div>
          </div>
        </div>
      </Container>
    </section>
  );
});

Hero.displayName = "Hero";

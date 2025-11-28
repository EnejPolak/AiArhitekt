"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export interface BrickLoaderProps {
  className?: string;
}

const BRICK_ROWS = 4;
const BRICKS_PER_ROW = 5;

export const BrickLoader: React.FC<BrickLoaderProps> = ({ className }) => {
  const bricks = React.useMemo(() => {
    const brickArray: Array<{ row: number; col: number; id: string }> = [];
    for (let row = 0; row < BRICK_ROWS; row++) {
      for (let col = 0; col < BRICKS_PER_ROW; col++) {
        brickArray.push({
          row,
          col,
          id: `${row}-${col}`,
        });
      }
    }
    return brickArray;
  }, []);

  const getBuildDelay = (row: number, col: number) => {
    // Build from bottom-left to top-right
    const totalBricks = row * BRICKS_PER_ROW + col;
    return totalBricks * 0.04; // 40ms per brick
  };

  const getTotalBuildTime = () => {
    return (BRICK_ROWS * BRICKS_PER_ROW - 1) * 0.04 + 0.2;
  };

  const totalBuildTime = getTotalBuildTime();
  const crashStartTime = totalBuildTime + 0.2; // Hold for 200ms
  const crashDuration = 0.4; // Crash takes 400ms
  const cycleDuration = crashStartTime + crashDuration + 0.4; // Pause before restart

  return (
    <div className={cn("flex flex-col items-center gap-4", className)}>
      <div className="relative w-32 h-24 flex flex-col-reverse items-center justify-center">
        {bricks.map((brick) => {
          const buildDelay = getBuildDelay(brick.row, brick.col);
          const crashDelay = (BRICK_ROWS - 1 - brick.row) * 0.03 + brick.col * 0.01;

          return (
            <motion.div
              key={brick.id}
              className="absolute w-5 h-3 bg-gradient-to-br from-[rgba(220,220,220,0.35)] to-[rgba(180,180,180,0.25)] border border-[rgba(255,255,255,0.15)] rounded-sm shadow-sm"
              style={{
                left: `${brick.col * 26 + 3}px`,
                bottom: `${brick.row * 16 + 8}px`,
              }}
              initial={{ opacity: 0, y: 30, scale: 0.6, rotate: 0 }}
              animate={{
                opacity: [
                  0, // Start hidden
                  1, // Appear during build
                  1, // Stay visible
                  0, // Disappear during crash
                  0, // Stay hidden
                ],
                y: [
                  30, // Start below
                  0, // Move to position
                  0, // Stay in position
                  -15 + Math.random() * 10, // Crash down with variation
                  30, // Reset below
                ],
                scale: [
                  0.6, // Start small
                  1, // Scale to full
                  1, // Stay full
                  0.7, // Shrink during crash
                  0.6, // Reset
                ],
                rotate: [
                  0, // Start straight
                  0, // Stay straight during build
                  0, // Stay straight while built
                  (Math.random() - 0.5) * 30, // Random rotation during crash
                  0, // Reset
                ],
              }}
              transition={{
                duration: cycleDuration,
                times: [
                  0,
                  buildDelay / cycleDuration,
                  crashStartTime / cycleDuration,
                  (crashStartTime + crashDelay) / cycleDuration,
                  1,
                ],
                ease: [
                  "easeOut", // Build in
                  "easeOut", // Build in
                  "linear", // Hold
                  "easeIn", // Crash
                  "easeOut", // Reset
                ],
                repeat: Infinity,
              }}
            />
          );
        })}
      </div>
      <span className="text-sm font-medium text-[rgba(255,255,255,0.6)]">
        Processing…
      </span>
    </div>
  );
};

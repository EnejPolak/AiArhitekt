"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useCookieOptional } from "@/lib/contexts/CookieContext";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

export const CookieBanner: React.FC = () => {
  const cookieContext = useCookieOptional();

  if (!cookieContext) {
    return null;
  }

  const { showBanner, acceptAll, rejectAll, openModal } = cookieContext;

  return (
    <AnimatePresence>
      {showBanner && (
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 50 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="fixed bottom-6 left-6 right-6 z-[100] md:left-auto md:right-6 md:w-[360px]"
        >
          <div
            className={cn(
              "rounded-2xl p-6 md:p-7",
              "bg-[rgba(255,255,255,0.04)]",
              "border border-[rgba(255,255,255,0.12)]",
              "backdrop-blur-[12px]",
              "shadow-[0_8px_32px_rgba(0,0,0,0.3)]"
            )}
          >
            <h3 className="text-lg font-semibold text-white mb-2">
              Cookie Preferences
            </h3>
            <p className="text-[14px] md:text-[15px] text-[rgba(255,255,255,0.75)] mb-5 leading-relaxed">
              We use cookies to improve your experience, analyze usage, and
              ensure the platform runs securely. You can accept all, reject all,
              or customize your preferences.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
              <Button
                onClick={acceptAll}
                variant="default"
                size="default"
                className="flex-1 sm:flex-none bg-gradient-to-r from-[#00E6CC] to-[#00D4B8] hover:from-[#00F5D4] hover:to-[#00E6CC] text-white border-0 shadow-[0_4px_16px_rgba(0,230,204,0.3)]"
              >
                Accept All
              </Button>
              <Button
                onClick={rejectAll}
                variant="outline"
                size="default"
                className="flex-1 sm:flex-none"
              >
                Reject All
              </Button>
              <button
                onClick={openModal}
                className="w-full sm:w-auto px-4 py-2.5 text-[14px] font-medium text-[rgba(255,255,255,0.80)] hover:text-white transition-colors duration-200 ease-in-out underline text-center"
              >
                Customize preferences
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};


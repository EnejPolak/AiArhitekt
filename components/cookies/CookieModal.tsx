"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useCookieOptional } from "@/lib/contexts/CookieContext";
import { CookieToggle } from "./CookieToggle";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

export const CookieModal: React.FC = () => {
  const cookieContext = useCookieOptional();

  if (!cookieContext) {
    return null;
  }

  const {
    showModal,
    preferences,
    setPreferences,
    closeModal,
    acceptAll,
  } = cookieContext;

  const [localPrefs, setLocalPrefs] = React.useState({
    essential: true,
    functional: preferences?.functional ?? false,
    analytics: preferences?.analytics ?? false,
  });

  React.useEffect(() => {
    if (preferences) {
      setLocalPrefs({
        essential: true,
        functional: preferences.functional,
        analytics: preferences.analytics,
      });
    }
  }, [preferences, showModal]);

  const handleSave = () => {
    setPreferences(localPrefs);
  };

  const handleAcceptAll = () => {
    acceptAll();
  };

  return (
    <AnimatePresence>
      {showModal && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[200] bg-[rgba(0,0,0,0.7)] backdrop-blur-sm"
            onClick={closeModal}
          />
          {/* Modal */}
          <div className="fixed inset-0 z-[201] flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className={cn(
                "w-full max-w-[520px] rounded-2xl p-8 md:p-10",
                "bg-[rgba(255,255,255,0.04)]",
                "border border-[rgba(255,255,255,0.12)]",
                "backdrop-blur-[12px]",
                "shadow-[0_8px_32px_rgba(0,0,0,0.4)]",
                "pointer-events-auto"
              )}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-white mb-2">
                    Customize Cookies
                  </h2>
                  <p className="text-sm text-[rgba(255,255,255,0.65)]">
                    Choose which cookies you want to allow. Essential cookies
                    cannot be disabled.
                  </p>
                </div>
                <button
                  onClick={closeModal}
                  className="p-1.5 rounded-lg hover:bg-[rgba(255,255,255,0.08)] transition-colors duration-200 ease-in-out"
                  aria-label="Close"
                >
                  <X className="w-5 h-5 text-[rgba(255,255,255,0.80)]" />
                </button>
              </div>

              <div className="space-y-6 mb-8">
                <CookieToggle
                  label="Essential Cookies"
                  description="Required for login, security, and site functionality."
                  checked={localPrefs.essential}
                  onChange={() => {}}
                  disabled={true}
                />
                <CookieToggle
                  label="Functional Cookies"
                  description="Remember preferences and enhance features."
                  checked={localPrefs.functional}
                  onChange={(checked) =>
                    setLocalPrefs((prev) => ({ ...prev, functional: checked }))
                  }
                />
                <CookieToggle
                  label="Analytics Cookies"
                  description="Help us understand site usage to improve the platform."
                  checked={localPrefs.analytics}
                  onChange={(checked) =>
                    setLocalPrefs((prev) => ({ ...prev, analytics: checked }))
                  }
                />
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  onClick={handleSave}
                  variant="default"
                  size="default"
                  className="flex-1 bg-gradient-to-r from-[#00E6CC] to-[#00D4B8] hover:from-[#00F5D4] hover:to-[#00E6CC] text-white border-0 shadow-[0_4px_16px_rgba(0,230,204,0.3)]"
                >
                  Save Preferences
                </Button>
                <Button
                  onClick={handleAcceptAll}
                  variant="outline"
                  size="default"
                  className="flex-1 sm:flex-none"
                >
                  Accept All
                </Button>
                <Button
                  onClick={closeModal}
                  variant="outline"
                  size="default"
                  className="flex-1 sm:flex-none"
                >
                  Cancel
                </Button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
};


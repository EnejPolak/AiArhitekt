"use client";

import * as React from "react";

export interface CookiePreferences {
  essential: boolean;
  functional: boolean;
  analytics: boolean;
}

interface CookieContextType {
  preferences: CookiePreferences | null;
  showBanner: boolean;
  showModal: boolean;
  setPreferences: (prefs: CookiePreferences) => void;
  openModal: () => void;
  closeModal: () => void;
  acceptAll: () => void;
  rejectAll: () => void;
}

const CookieContext = React.createContext<CookieContextType | undefined>(
  undefined
);

const STORAGE_KEY = "arhitekt-ai-cookie-preferences";

export function CookieProvider({ children }: { children: React.ReactNode }) {
  const [preferences, setPreferencesState] =
    React.useState<CookiePreferences | null>(null);
  const [showBanner, setShowBanner] = React.useState(false);
  const [showModal, setShowModal] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);

  // Load preferences from localStorage on mount
  React.useEffect(() => {
    setMounted(true);
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        try {
          const prefs = JSON.parse(stored) as CookiePreferences;
          setPreferencesState(prefs);
          setShowBanner(false);
        } catch (e) {
          // Invalid stored data, show banner
          setShowBanner(true);
        }
      } else {
        setShowBanner(true);
      }
    }
  }, []);

  const setPreferences = React.useCallback((prefs: CookiePreferences) => {
    setPreferencesState(prefs);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    }
    setShowBanner(false);
    setShowModal(false);
  }, []);

  const acceptAll = React.useCallback(() => {
    const prefs: CookiePreferences = {
      essential: true,
      functional: true,
      analytics: true,
    };
    setPreferences(prefs);
  }, [setPreferences]);

  const rejectAll = React.useCallback(() => {
    const prefs: CookiePreferences = {
      essential: true,
      functional: false,
      analytics: false,
    };
    setPreferences(prefs);
  }, [setPreferences]);

  const openModal = React.useCallback(() => {
    setShowModal(true);
  }, []);

  const closeModal = React.useCallback(() => {
    setShowModal(false);
  }, []);

  // Don't render until mounted to avoid hydration mismatch
  if (!mounted) {
    return <>{children}</>;
  }

  return (
    <CookieContext.Provider
      value={{
        preferences,
        showBanner,
        showModal,
        setPreferences,
        openModal,
        closeModal,
        acceptAll,
        rejectAll,
      }}
    >
      {children}
    </CookieContext.Provider>
  );
}

export function useCookie() {
  const context = React.useContext(CookieContext);
  if (context === undefined) {
    throw new Error("useCookie must be used within a CookieProvider");
  }
  return context;
}

export function useCookieOptional() {
  const context = React.useContext(CookieContext);
  return context;
}


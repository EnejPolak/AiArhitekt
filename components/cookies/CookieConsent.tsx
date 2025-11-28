"use client";

import { CookieBanner } from "./CookieBanner";
import { CookieModal } from "./CookieModal";

export const CookieConsent: React.FC = () => {
  return (
    <>
      <CookieBanner />
      <CookieModal />
    </>
  );
};


"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Navbar } from "./Navbar";

export const ConditionalNavbar: React.FC = () => {
  const pathname = usePathname();
  const isAppRoute = pathname?.startsWith("/app");

  if (isAppRoute) {
    return null;
  }

  return <Navbar />;
};


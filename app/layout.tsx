import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
import { ConditionalNavbar } from "@/components/layout/ConditionalNavbar";
import { CookieProvider } from "@/lib/contexts/CookieContext";
import { CookieConsent } from "@/components/cookies/CookieConsent";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
});

export const metadata: Metadata = {
  title: "AiArhitekt",
  description: "AI Architecture Platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={manrope.variable}>
      <body className="font-sans antialiased">
        <CookieProvider>
          <ConditionalNavbar />
          {children}
          <CookieConsent />
        </CookieProvider>
      </body>
    </html>
  );
}


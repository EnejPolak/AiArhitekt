import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/layout/Navbar";
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
          <Navbar />
          {children}
          <CookieConsent />
        </CookieProvider>
      </body>
    </html>
  );
}


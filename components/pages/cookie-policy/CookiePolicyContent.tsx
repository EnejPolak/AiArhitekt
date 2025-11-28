"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Container } from "@/components/ui/Container";
import { cn } from "@/lib/utils";

export interface CookiePolicyContentProps {
  className?: string;
}

export const CookiePolicyContent: React.FC<CookiePolicyContentProps> = ({ className }) => {
  return (
    <section
      className={cn(
        "w-full py-20 md:py-32 relative",
        className
      )}
    >
      <Container className="px-6 md:px-12 max-w-4xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }}
          className="prose prose-invert max-w-none"
        >
          <div className="mb-12">
            <p className="text-base md:text-lg leading-[1.6] text-[#CFCFCF] mb-6">
              This Cookie Policy explains how Arhitekt AI ("we", "us", or "our") uses cookies and similar technologies on our website and platform.
            </p>
            <p className="text-base md:text-lg leading-[1.6] text-[#CFCFCF]">
              By using Arhitekt AI, you agree that we can store and access cookies on your device as described in this policy.
            </p>
          </div>

          <div className="mb-12">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-6 mt-12">
              1. What Are Cookies?
            </h2>
            <p className="text-base md:text-lg leading-[1.6] text-[#CFCFCF] mb-4">
              Cookies are small text files that are stored on your device (computer, tablet, phone) when you visit a website.
            </p>
            <p className="text-base md:text-lg leading-[1.6] text-[#CFCFCF] mb-4">
              They help the website recognize your device and remember certain information about your visit, such as your preferences or login status.
            </p>
            <p className="text-base md:text-lg leading-[1.6] text-[#CFCFCF] mb-4">
              Cookies can be:
            </p>
            <ul className="list-disc list-inside space-y-2 mb-6 text-base md:text-lg leading-[1.6] text-[#CFCFCF] ml-4">
              <li><strong>Session cookies</strong> – deleted when you close your browser</li>
              <li><strong>Persistent cookies</strong> – remain on your device for a set period or until you delete them</li>
            </ul>
          </div>

          <div className="mb-12">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-6 mt-12">
              2. How We Use Cookies
            </h2>
            <p className="text-base md:text-lg leading-[1.6] text-[#CFCFCF] mb-4">
              We use cookies and similar technologies to:
            </p>
            <ul className="list-disc list-inside space-y-2 mb-6 text-base md:text-lg leading-[1.6] text-[#CFCFCF] ml-4">
              <li>Keep you logged in and manage your session</li>
              <li>Remember your preferences (e.g., language, UI settings)</li>
              <li>Analyze how the website and platform are used</li>
              <li>Improve performance, stability, and security</li>
              <li>Support features such as forms, dashboards, and project views</li>
            </ul>
            <p className="text-base md:text-lg leading-[1.6] text-[#CFCFCF]">
              We do not use cookies to collect sensitive personal information such as passwords in plain text.
            </p>
          </div>

          <div className="mb-12">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-6 mt-12">
              3. Types of Cookies We Use
            </h2>

            <h3 className="text-xl md:text-2xl font-semibold text-white mb-4 mt-8">
              3.1 Essential Cookies
            </h3>
            <p className="text-base md:text-lg leading-[1.6] text-[#CFCFCF] mb-4">
              These cookies are necessary for the website and platform to function properly.
            </p>
            <p className="text-base md:text-lg leading-[1.6] text-[#CFCFCF] mb-4">
              Without them, core features such as login, account access, and secure navigation would not work.
            </p>
            <p className="text-base md:text-lg leading-[1.6] text-[#CFCFCF] mb-4">
              Examples:
            </p>
            <ul className="list-disc list-inside space-y-2 mb-6 text-base md:text-lg leading-[1.6] text-[#CFCFCF] ml-4">
              <li>Keeping you authenticated while you navigate</li>
              <li>Remembering form inputs during a session</li>
              <li>Protecting against fraudulent or malicious activity</li>
            </ul>
            <p className="text-base md:text-lg leading-[1.6] text-[#CFCFCF]">
              You cannot opt out of essential cookies, because they are required for the service to operate.
            </p>

            <h3 className="text-xl md:text-2xl font-semibold text-white mb-4 mt-8">
              3.2 Functional Cookies
            </h3>
            <p className="text-base md:text-lg leading-[1.6] text-[#CFCFCF] mb-4">
              These cookies allow us to remember your preferences and provide enhanced functionality.
            </p>
            <p className="text-base md:text-lg leading-[1.6] text-[#CFCFCF] mb-4">
              Examples:
            </p>
            <ul className="list-disc list-inside space-y-2 mb-6 text-base md:text-lg leading-[1.6] text-[#CFCFCF] ml-4">
              <li>Remembering UI settings or layout options</li>
              <li>Saving language preferences</li>
              <li>Helping us provide a smoother user experience</li>
            </ul>
            <p className="text-base md:text-lg leading-[1.6] text-[#CFCFCF]">
              If you disable these cookies, some preferences may not be saved and certain features may behave in a more basic way.
            </p>

            <h3 className="text-xl md:text-2xl font-semibold text-white mb-4 mt-8">
              3.3 Analytics & Performance Cookies
            </h3>
            <p className="text-base md:text-lg leading-[1.6] text-[#CFCFCF] mb-4">
              These cookies help us understand how users interact with Arhitekt AI so we can improve the product.
            </p>
            <p className="text-base md:text-lg leading-[1.6] text-[#CFCFCF] mb-4">
              We may use analytics tools (such as privacy-respecting analytics services) to collect:
            </p>
            <ul className="list-disc list-inside space-y-2 mb-6 text-base md:text-lg leading-[1.6] text-[#CFCFCF] ml-4">
              <li>pages viewed</li>
              <li>time spent on each section</li>
              <li>clicks and navigation paths</li>
              <li>technical information about your browser and device</li>
            </ul>
            <p className="text-base md:text-lg leading-[1.6] text-[#CFCFCF] mb-4">
              This data is used in aggregated form and is not used to identify you personally.
            </p>
            <p className="text-base md:text-lg leading-[1.6] text-[#CFCFCF]">
              Depending on your region, analytics cookies may only be used with your consent.
            </p>

            <h3 className="text-xl md:text-2xl font-semibold text-white mb-4 mt-8">
              3.4 Third-Party Cookies
            </h3>
            <p className="text-base md:text-lg leading-[1.6] text-[#CFCFCF] mb-4">
              Some cookies may be set by third-party services that we use, such as:
            </p>
            <ul className="list-disc list-inside space-y-2 mb-6 text-base md:text-lg leading-[1.6] text-[#CFCFCF] ml-4">
              <li>Analytics providers</li>
              <li>Payment processors</li>
              <li>Embedded content or integrations (if applicable in the future)</li>
            </ul>
            <p className="text-base md:text-lg leading-[1.6] text-[#CFCFCF] mb-4">
              These third parties may collect information about your use of our website, in line with their own privacy and cookie policies.
            </p>
            <p className="text-base md:text-lg leading-[1.6] text-[#CFCFCF]">
              We recommend reviewing their policies if you want to understand how they handle your data.
            </p>
          </div>

          <div className="mb-12">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-6 mt-12">
              4. How You Can Control Cookies
            </h2>
            <p className="text-base md:text-lg leading-[1.6] text-[#CFCFCF] mb-4">
              You have several options to manage or control cookies:
            </p>

            <h3 className="text-xl md:text-2xl font-semibold text-white mb-4 mt-8">
              4.1 Browser Settings
            </h3>
            <p className="text-base md:text-lg leading-[1.6] text-[#CFCFCF] mb-4">
              Most browsers allow you to:
            </p>
            <ul className="list-disc list-inside space-y-2 mb-6 text-base md:text-lg leading-[1.6] text-[#CFCFCF] ml-4">
              <li>block cookies altogether</li>
              <li>delete existing cookies</li>
              <li>receive a warning before a cookie is stored</li>
            </ul>
            <p className="text-base md:text-lg leading-[1.6] text-[#CFCFCF] mb-4">
              Check your browser's help section for instructions (e.g. Chrome, Firefox, Safari, Edge).
            </p>
            <p className="text-base md:text-lg leading-[1.6] text-[#CFCFCF] mb-4">
              Be aware that blocking or deleting cookies may impact how Arhitekt AI functions.
            </p>
            <p className="text-base md:text-lg leading-[1.6] text-[#CFCFCF]">
              Essential features such as login may stop working correctly.
            </p>

            <h3 className="text-xl md:text-2xl font-semibold text-white mb-4 mt-8">
              4.2 Cookie Banners / Consent Tools (If Implemented)
            </h3>
            <p className="text-base md:text-lg leading-[1.6] text-[#CFCFCF] mb-4">
              If we use a cookie banner or consent manager, you may be able to:
            </p>
            <ul className="list-disc list-inside space-y-2 mb-6 text-base md:text-lg leading-[1.6] text-[#CFCFCF] ml-4">
              <li>accept or reject non-essential cookies</li>
              <li>change your cookie preferences at any time</li>
            </ul>
            <p className="text-base md:text-lg leading-[1.6] text-[#CFCFCF]">
              Your choices will be stored in a cookie on your device.
            </p>
          </div>

          <div className="mb-12">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-6 mt-12">
              5. Do Not Track
            </h2>
            <p className="text-base md:text-lg leading-[1.6] text-[#CFCFCF] mb-4">
              Some browsers offer a "Do Not Track" (DNT) signal.
            </p>
            <p className="text-base md:text-lg leading-[1.6] text-[#CFCFCF]">
              At this time, our service does not respond to DNT signals in a standardized way, but we may revisit this as standards evolve.
            </p>
          </div>

          <div className="mb-12">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-6 mt-12">
              6. Changes to This Cookie Policy
            </h2>
            <p className="text-base md:text-lg leading-[1.6] text-[#CFCFCF] mb-4">
              We may update this Cookie Policy from time to time (for example, if we add new features or use new analytics tools).
            </p>
            <p className="text-base md:text-lg leading-[1.6] text-[#CFCFCF] mb-4">
              When we make changes, we will:
            </p>
            <ul className="list-disc list-inside space-y-2 mb-6 text-base md:text-lg leading-[1.6] text-[#CFCFCF] ml-4">
              <li>update the "Last updated" date at the top of this page</li>
              <li>optionally notify you through the website or by email if changes are significant</li>
            </ul>
            <p className="text-base md:text-lg leading-[1.6] text-[#CFCFCF]">
              We encourage you to review this page periodically.
            </p>
          </div>

          <div className="mb-12">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-6 mt-12">
              7. Contact Us
            </h2>
            <p className="text-base md:text-lg leading-[1.6] text-[#CFCFCF] mb-4">
              If you have questions about this Cookie Policy or how cookies are used on Arhitekt AI, you can contact us at:
            </p>
            <ul className="list-none space-y-2 mb-6">
              <li className="text-base md:text-lg leading-[1.6] text-[#CFCFCF]">
                Email:{" "}
                <a
                  href="mailto:privacy@arhitekt.ai"
                  className="text-[#00E6CC] hover:text-[#00F5D4] underline transition-colors"
                >
                  privacy@arhitekt.ai
                </a>
              </li>
              <li className="text-base md:text-lg leading-[1.6] text-[#CFCFCF]">
                Website:{" "}
                <a
                  href="https://www.arhitekt.ai"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#00E6CC] hover:text-[#00F5D4] underline transition-colors"
                >
                  www.arhitekt.ai
                </a>
              </li>
            </ul>
          </div>
        </motion.div>
      </Container>
    </section>
  );
};


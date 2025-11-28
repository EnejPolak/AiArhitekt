"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Container } from "@/components/ui/Container";
import { cn } from "@/lib/utils";

export interface PrivacyContentProps {
  className?: string;
}

export const PrivacyContent: React.FC<PrivacyContentProps> = ({ className }) => {
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
              Welcome to Arhitekt AI.
            </p>
            <p className="text-base md:text-lg leading-[1.6] text-[#CFCFCF] mb-6">
              We respect your privacy and are committed to protecting your personal data. This Privacy Policy explains what information we collect, how we use it, how we protect it, and what rights you have regarding your data.
            </p>
            <p className="text-base md:text-lg leading-[1.6] text-[#CFCFCF]">
              Please read this policy carefully to understand how your information is handled when using Arhitekt AI.
            </p>
          </div>

          <div className="mb-12">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-6 mt-12">
              1. Who We Are
            </h2>
            <p className="text-base md:text-lg leading-[1.6] text-[#CFCFCF] mb-4">
              Arhitekt AI is a digital platform that helps users generate 3D home previews, cost estimates, material suggestions, and renovation guidance using AI.
            </p>
            <p className="text-base md:text-lg leading-[1.6] text-[#CFCFCF] mb-4">
              We act as the Data Controller for the personal data you provide.
            </p>
            <p className="text-base md:text-lg leading-[1.6] text-[#CFCFCF]">
              This policy applies to all users of our website and platform, including homeowners, designers, and anyone exploring our tools.
            </p>
          </div>

          <div className="mb-12">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-6 mt-12">
              2. What Data We Collect
            </h2>
            <p className="text-base md:text-lg leading-[1.6] text-[#CFCFCF] mb-6">
              We collect three types of data:
            </p>

            <h3 className="text-xl md:text-2xl font-semibold text-white mb-4 mt-8">
              2.1 Data You Provide Directly
            </h3>
            <p className="text-base md:text-lg leading-[1.6] text-[#CFCFCF] mb-4">
              This includes:
            </p>
            <ul className="list-disc list-inside space-y-2 mb-6 text-base md:text-lg leading-[1.6] text-[#CFCFCF] ml-4">
              <li>Full name</li>
              <li>Email address</li>
              <li>Password (encrypted)</li>
              <li>Messages or inquiries sent through our contact form</li>
              <li>Project details you submit (e.g., room dimensions, renovation goals)</li>
              <li>Uploaded files (floor plans, PDFs, sketches, images)</li>
              <li>Billing details if applicable (only when purchasing a paid plan)</li>
            </ul>

            <h3 className="text-xl md:text-2xl font-semibold text-white mb-4 mt-8">
              2.2 Data Collected Automatically
            </h3>
            <p className="text-base md:text-lg leading-[1.6] text-[#CFCFCF] mb-4">
              When you use our website, we may automatically collect:
            </p>
            <ul className="list-disc list-inside space-y-2 mb-6 text-base md:text-lg leading-[1.6] text-[#CFCFCF] ml-4">
              <li>IP address</li>
              <li>Browser type and version</li>
              <li>Device type and operating system</li>
              <li>Approximate location (city-level, non-precise)</li>
              <li>Pages viewed and time spent on them</li>
              <li>Application usage logs (errors, performance data)</li>
            </ul>
            <p className="text-base md:text-lg leading-[1.6] text-[#CFCFCF]">
              This data helps us improve the platform and ensure security.
            </p>

            <h3 className="text-xl md:text-2xl font-semibold text-white mb-4 mt-8">
              2.3 Cookies and Similar Technologies
            </h3>
            <p className="text-base md:text-lg leading-[1.6] text-[#CFCFCF] mb-4">
              We use cookies to:
            </p>
            <ul className="list-disc list-inside space-y-2 mb-6 text-base md:text-lg leading-[1.6] text-[#CFCFCF] ml-4">
              <li>Keep your session active</li>
              <li>Remember preferences</li>
              <li>Provide analytics to improve features</li>
              <li>Ensure secure login and access controls</li>
            </ul>
            <p className="text-base md:text-lg leading-[1.6] text-[#CFCFCF]">
              You can disable cookies in your browser settings, but some features may not function correctly without them.
            </p>
          </div>

          <div className="mb-12">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-6 mt-12">
              3. How We Use Your Data
            </h2>
            <p className="text-base md:text-lg leading-[1.6] text-[#CFCFCF] mb-4">
              We use your personal data for the following purposes:
            </p>
            <ul className="list-disc list-inside space-y-2 mb-6 text-base md:text-lg leading-[1.6] text-[#CFCFCF] ml-4">
              <li>Creating and managing your account</li>
              <li>Processing your floor plans and generating 3D previews</li>
              <li>Providing cost estimates, material suggestions, and permit guidance</li>
              <li>Responding to your messages or support requests</li>
              <li>Improving and optimizing the platform</li>
              <li>Preventing fraud or misuse</li>
              <li>Complying with legal obligations</li>
            </ul>
            <p className="text-base md:text-lg leading-[1.6] text-[#CFCFCF] font-medium">
              We do not sell your personal data.
            </p>
          </div>

          <div className="mb-12">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-6 mt-12">
              4. Legal Bases for Processing (GDPR)
            </h2>
            <p className="text-base md:text-lg leading-[1.6] text-[#CFCFCF] mb-4">
              We process your data under the following legal grounds:
            </p>
            <ul className="list-disc list-inside space-y-2 mb-6 text-base md:text-lg leading-[1.6] text-[#CFCFCF] ml-4">
              <li><strong className="text-white">Contract performance</strong> – when creating an account or generating AI results</li>
              <li><strong className="text-white">Legitimate interest</strong> – analytics, service improvement, and security</li>
              <li><strong className="text-white">Consent</strong> – optional marketing emails or cookie preferences</li>
              <li><strong className="text-white">Legal obligation</strong> – when required by law</li>
            </ul>
          </div>

          <div className="mb-12">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-6 mt-12">
              5. How We Store and Protect Your Data
            </h2>
            <p className="text-base md:text-lg leading-[1.6] text-[#CFCFCF] mb-4">
              We implement industry-standard measures to secure your data:
            </p>
            <ul className="list-disc list-inside space-y-2 mb-6 text-base md:text-lg leading-[1.6] text-[#CFCFCF] ml-4">
              <li>Encrypted communication (HTTPS)</li>
              <li>Password hashing</li>
              <li>Secure cloud hosting with reputable providers</li>
              <li>Access controls to limit who can view your information</li>
            </ul>
            <p className="text-base md:text-lg leading-[1.6] text-[#CFCFCF]">
              We store data only as long as necessary for the purposes described.
            </p>
          </div>

          <div className="mb-12">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-6 mt-12">
              6. Sharing Your Data
            </h2>
            <p className="text-base md:text-lg leading-[1.6] text-[#CFCFCF] mb-4">
              We may share your data only with trusted third parties:
            </p>
            <ul className="list-disc list-inside space-y-2 mb-6 text-base md:text-lg leading-[1.6] text-[#CFCFCF] ml-4">
              <li>Hosting providers (servers, storage)</li>
              <li>Analytics tools</li>
              <li>Email service providers</li>
              <li>Payment processors (if paid plans are used)</li>
            </ul>
            <p className="text-base md:text-lg leading-[1.6] text-[#CFCFCF] font-medium mb-4">
              We never sell personal information to third parties for advertising or marketing.
            </p>
            <p className="text-base md:text-lg leading-[1.6] text-[#CFCFCF]">
              These providers are required to protect your data and use it only as instructed.
            </p>
          </div>

          <div className="mb-12">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-6 mt-12">
              7. International Transfers
            </h2>
            <p className="text-base md:text-lg leading-[1.6] text-[#CFCFCF] mb-4">
              Some service providers we use may operate outside the European Economic Area (EEA).
            </p>
            <p className="text-base md:text-lg leading-[1.6] text-[#CFCFCF]">
              When transferring data internationally, we ensure appropriate safeguards (Standard Contractual Clauses or equivalent protections).
            </p>
          </div>

          <div className="mb-12">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-6 mt-12">
              8. Your Rights (GDPR)
            </h2>
            <p className="text-base md:text-lg leading-[1.6] text-[#CFCFCF] mb-4">
              As a user, you have the right to:
            </p>
            <ul className="list-disc list-inside space-y-2 mb-6 text-base md:text-lg leading-[1.6] text-[#CFCFCF] ml-4">
              <li>Access your personal data</li>
              <li>Correct inaccurate information</li>
              <li>Request deletion ("Right to be forgotten")</li>
              <li>Restrict processing</li>
              <li>Object to processing</li>
              <li>Request data portability</li>
              <li>Withdraw consent (where applicable)</li>
              <li>File a complaint with a supervisory authority</li>
            </ul>
            <p className="text-base md:text-lg leading-[1.6] text-[#CFCFCF]">
              To exercise any of these rights, contact us at{" "}
              <a
                href="mailto:privacy@arhitekt.ai"
                className="text-[#00E6CC] hover:text-[#00F5E6] underline transition-colors"
              >
                privacy@arhitekt.ai
              </a>
              .
            </p>
          </div>

          <div className="mb-12">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-6 mt-12">
              9. Cookies
            </h2>
            <p className="text-base md:text-lg leading-[1.6] text-[#CFCFCF] mb-4">
              We use:
            </p>
            <ul className="list-disc list-inside space-y-2 mb-6 text-base md:text-lg leading-[1.6] text-[#CFCFCF] ml-4">
              <li>Essential cookies (required for login and platform operation)</li>
              <li>Analytics cookies (with user consent depending on region)</li>
            </ul>
            <p className="text-base md:text-lg leading-[1.6] text-[#CFCFCF]">
              You may adjust or disable cookies through your browser, but essential features may stop working.
            </p>
          </div>

          <div className="mb-12">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-6 mt-12">
              10. Data Retention
            </h2>
            <p className="text-base md:text-lg leading-[1.6] text-[#CFCFCF] mb-4">
              We retain personal data only as long as necessary:
            </p>
            <ul className="list-disc list-inside space-y-2 mb-6 text-base md:text-lg leading-[1.6] text-[#CFCFCF] ml-4">
              <li><strong className="text-white">Account information</strong> → kept until you delete your account</li>
              <li><strong className="text-white">Support inquiries</strong> → kept until resolved + short archival period</li>
              <li><strong className="text-white">Uploaded files</strong> → kept for project usage or until removed by you</li>
              <li><strong className="text-white">Analytics data</strong> → kept for a limited period (e.g., 12–24 months)</li>
            </ul>
          </div>

          <div className="mb-12">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-6 mt-12">
              11. Changes to This Policy
            </h2>
            <p className="text-base md:text-lg leading-[1.6] text-[#CFCFCF] mb-4">
              We may update this Privacy Policy when necessary.
            </p>
            <p className="text-base md:text-lg leading-[1.6] text-[#CFCFCF] mb-4">
              If significant changes occur, we will notify you through the website or email.
            </p>
            <p className="text-base md:text-lg leading-[1.6] text-[#CFCFCF]">
              The "Last updated" date will always reflect the most recent version.
            </p>
          </div>

          <div className="mb-12">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-6 mt-12">
              12. Contact Us
            </h2>
            <p className="text-base md:text-lg leading-[1.6] text-[#CFCFCF] mb-6">
              If you have questions about this policy or want to exercise your data rights, contact us:
            </p>
            <ul className="space-y-3 text-base md:text-lg leading-[1.6] text-[#CFCFCF]">
              <li>
                Email:{" "}
                <a
                  href="mailto:privacy@arhitekt.ai"
                  className="text-[#00E6CC] hover:text-[#00F5E6] underline transition-colors"
                >
                  privacy@arhitekt.ai
                </a>
              </li>
              <li>
                Website:{" "}
                <a
                  href="https://www.arhitekt.ai"
                  className="text-[#00E6CC] hover:text-[#00F5E6] underline transition-colors"
                  target="_blank"
                  rel="noopener noreferrer"
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


"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Container } from "@/components/ui/Container";
import { cn } from "@/lib/utils";

export interface TermsContentProps {
  className?: string;
}

export const TermsContent: React.FC<TermsContentProps> = ({ className }) => {
  return (
    <section
      className={cn(
        "w-full py-20 md:py-32 relative",
        className
      )}
    >
      <Container className="px-6 md:px-12 max-w-[960px]">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }}
          className="max-w-none"
        >
          <div className="mb-10" style={{ paddingTop: "120px", paddingBottom: "120px" }}>
            <p className="text-base md:text-lg leading-[1.65] text-[rgba(255,255,255,0.80)] mb-4" style={{ marginBottom: "12px" }}>
              Welcome to Arhitekt AI.
            </p>
            <p className="text-base md:text-lg leading-[1.65] text-[rgba(255,255,255,0.80)] mb-4" style={{ marginBottom: "12px" }}>
              These Terms of Service explain the rules and conditions for using our website and platform.
            </p>
            <p className="text-base md:text-lg leading-[1.65] text-[rgba(255,255,255,0.80)] mb-4" style={{ marginBottom: "12px" }}>
              By accessing or using Arhitekt AI, you agree to these Terms.
            </p>
            <p className="text-base md:text-lg leading-[1.65] text-[rgba(255,255,255,0.80)]" style={{ marginBottom: "12px" }}>
              If you do not agree, you must stop using the platform.
            </p>
          </div>

          <div className="mb-10" style={{ marginBottom: "36px" }}>
            <h2 className="text-[20px] md:text-[22px] font-semibold text-white mb-4" style={{ marginBottom: "16px", marginTop: "32px" }}>
              1. Overview
            </h2>
            <p className="text-base md:text-lg leading-[1.65] text-[rgba(255,255,255,0.80)] mb-4" style={{ marginBottom: "12px" }}>
              Arhitekt AI provides tools that generate 3D home previews, floor plan interpretations, cost estimates, and renovation guidance using AI technologies.
            </p>
            <p className="text-base md:text-lg leading-[1.65] text-[rgba(255,255,255,0.80)]" style={{ marginBottom: "12px" }}>
              These Terms apply to visitors, registered users, and anyone accessing the service.
            </p>
          </div>

          <div className="mb-10" style={{ marginBottom: "36px" }}>
            <h2 className="text-[20px] md:text-[22px] font-semibold text-white mb-4" style={{ marginBottom: "16px", marginTop: "32px" }}>
              2. Eligibility
            </h2>
            <p className="text-base md:text-lg leading-[1.65] text-[rgba(255,255,255,0.80)] mb-4" style={{ marginBottom: "12px" }}>
              To use Arhitekt AI, you must:
            </p>
            <ul className="list-disc list-inside mb-4 space-y-2" style={{ marginLeft: "20px", marginBottom: "12px" }}>
              <li className="text-base md:text-lg leading-[1.65] text-[rgba(255,255,255,0.80)]">
                be at least 16 years old
              </li>
              <li className="text-base md:text-lg leading-[1.65] text-[rgba(255,255,255,0.80)]">
                have the authority to enter legal agreements
              </li>
              <li className="text-base md:text-lg leading-[1.65] text-[rgba(255,255,255,0.80)]">
                use the platform for lawful purposes only
              </li>
            </ul>
            <p className="text-base md:text-lg leading-[1.65] text-[rgba(255,255,255,0.80)]" style={{ marginBottom: "12px" }}>
              If you create an account on behalf of a company, you confirm that you have the authority to represent it.
            </p>
          </div>

          <div className="mb-10" style={{ marginBottom: "36px" }}>
            <h2 className="text-[20px] md:text-[22px] font-semibold text-white mb-4" style={{ marginBottom: "16px", marginTop: "32px" }}>
              3. Account Registration
            </h2>
            <p className="text-base md:text-lg leading-[1.65] text-[rgba(255,255,255,0.80)] mb-4" style={{ marginBottom: "12px" }}>
              To access advanced features, you must create an account.
            </p>
            <p className="text-base md:text-lg leading-[1.65] text-[rgba(255,255,255,0.80)] mb-4" style={{ marginBottom: "12px" }}>
              You agree to:
            </p>
            <ul className="list-disc list-inside mb-4 space-y-2" style={{ marginLeft: "20px", marginBottom: "12px" }}>
              <li className="text-base md:text-lg leading-[1.65] text-[rgba(255,255,255,0.80)]">
                provide accurate information
              </li>
              <li className="text-base md:text-lg leading-[1.65] text-[rgba(255,255,255,0.80)]">
                keep your login details secure
              </li>
              <li className="text-base md:text-lg leading-[1.65] text-[rgba(255,255,255,0.80)]">
                notify us immediately if you suspect account misuse
              </li>
            </ul>
            <p className="text-base md:text-lg leading-[1.65] text-[rgba(255,255,255,0.80)]" style={{ marginBottom: "12px" }}>
              You are responsible for all activity under your account.
            </p>
          </div>

          <div className="mb-10" style={{ marginBottom: "36px" }}>
            <h2 className="text-[20px] md:text-[22px] font-semibold text-white mb-4" style={{ marginBottom: "16px", marginTop: "32px" }}>
              4. Acceptable Use
            </h2>
            <p className="text-base md:text-lg leading-[1.65] text-[rgba(255,255,255,0.80)] mb-4" style={{ marginBottom: "12px" }}>
              You may NOT:
            </p>
            <ul className="list-disc list-inside mb-4 space-y-2" style={{ marginLeft: "20px", marginBottom: "12px" }}>
              <li className="text-base md:text-lg leading-[1.65] text-[rgba(255,255,255,0.80)]">
                misuse or attempt to break the platform
              </li>
              <li className="text-base md:text-lg leading-[1.65] text-[rgba(255,255,255,0.80)]">
                upload harmful files, malware, or corrupted PDFs
              </li>
              <li className="text-base md:text-lg leading-[1.65] text-[rgba(255,255,255,0.80)]">
                use AI outputs for illegal construction or fraudulent purposes
              </li>
              <li className="text-base md:text-lg leading-[1.65] text-[rgba(255,255,255,0.80)]">
                copy, resell, or reverse-engineer the service
              </li>
              <li className="text-base md:text-lg leading-[1.65] text-[rgba(255,255,255,0.80)]">
                scrape data or automate usage without permission
              </li>
            </ul>
            <p className="text-base md:text-lg leading-[1.65] text-[rgba(255,255,255,0.80)]" style={{ marginBottom: "12px" }}>
              We reserve the right to suspend or terminate accounts that violate these rules.
            </p>
          </div>

          <div className="mb-10" style={{ marginBottom: "36px" }}>
            <h2 className="text-[20px] md:text-[22px] font-semibold text-white mb-4" style={{ marginBottom: "16px", marginTop: "32px" }}>
              5. AI-Generated Output
            </h2>
            <p className="text-base md:text-lg leading-[1.65] text-[rgba(255,255,255,0.80)] mb-4" style={{ marginBottom: "12px" }}>
              Arhitekt AI provides AI-generated estimates, previews, and guidance, which:
            </p>
            <ul className="list-disc list-inside mb-4 space-y-2" style={{ marginLeft: "20px", marginBottom: "12px" }}>
              <li className="text-base md:text-lg leading-[1.65] text-[rgba(255,255,255,0.80)]">
                may contain inaccuracies or incomplete interpretations
              </li>
              <li className="text-base md:text-lg leading-[1.65] text-[rgba(255,255,255,0.80)]">
                are not a substitute for professional architectural or engineering advice
              </li>
              <li className="text-base md:text-lg leading-[1.65] text-[rgba(255,255,255,0.80)]">
                must be validated by qualified professionals for real-world use
              </li>
              <li className="text-base md:text-lg leading-[1.65] text-[rgba(255,255,255,0.80)]">
                are provided "as is"
              </li>
            </ul>
            <p className="text-base md:text-lg leading-[1.65] text-[rgba(255,255,255,0.80)]" style={{ marginBottom: "12px" }}>
              Arhitekt AI is not liable for decisions made based on AI output.
            </p>
          </div>

          <div className="mb-10" style={{ marginBottom: "36px" }}>
            <h2 className="text-[20px] md:text-[22px] font-semibold text-white mb-4" style={{ marginBottom: "16px", marginTop: "32px" }}>
              6. Paid Plans & Billing
            </h2>
            <p className="text-base md:text-lg leading-[1.65] text-[rgba(255,255,255,0.80)] mb-4" style={{ marginBottom: "12px" }}>
              If you choose a paid plan:
            </p>
            <ul className="list-disc list-inside mb-4 space-y-2" style={{ marginLeft: "20px", marginBottom: "12px" }}>
              <li className="text-base md:text-lg leading-[1.65] text-[rgba(255,255,255,0.80)]">
                pricing is shown clearly before purchase
              </li>
              <li className="text-base md:text-lg leading-[1.65] text-[rgba(255,255,255,0.80)]">
                payments are processed through trusted third-party providers
              </li>
              <li className="text-base md:text-lg leading-[1.65] text-[rgba(255,255,255,0.80)]">
                subscriptions may renew automatically (if applicable)
              </li>
              <li className="text-base md:text-lg leading-[1.65] text-[rgba(255,255,255,0.80)]">
                refunds follow our Refund Policy (if available)
              </li>
            </ul>
            <p className="text-base md:text-lg leading-[1.65] text-[rgba(255,255,255,0.80)]" style={{ marginBottom: "12px" }}>
              Failure to pay may result in suspension of access.
            </p>
          </div>

          <div className="mb-10" style={{ marginBottom: "36px" }}>
            <h2 className="text-[20px] md:text-[22px] font-semibold text-white mb-4" style={{ marginBottom: "16px", marginTop: "32px" }}>
              7. Intellectual Property
            </h2>
            <p className="text-base md:text-lg leading-[1.65] text-[rgba(255,255,255,0.80)] mb-4" style={{ marginBottom: "12px" }}>
              All content, branding, software, and materials on Arhitekt AI are the property of Arhitekt AI or its licensors.
            </p>
            <p className="text-base md:text-lg leading-[1.65] text-[rgba(255,255,255,0.80)] mb-4" style={{ marginBottom: "12px" }}>
              You may not:
            </p>
            <ul className="list-disc list-inside mb-4 space-y-2" style={{ marginLeft: "20px", marginBottom: "12px" }}>
              <li className="text-base md:text-lg leading-[1.65] text-[rgba(255,255,255,0.80)]">
                reproduce
              </li>
              <li className="text-base md:text-lg leading-[1.65] text-[rgba(255,255,255,0.80)]">
                modify
              </li>
              <li className="text-base md:text-lg leading-[1.65] text-[rgba(255,255,255,0.80)]">
                distribute
              </li>
              <li className="text-base md:text-lg leading-[1.65] text-[rgba(255,255,255,0.80)]">
                or use our assets without permission
              </li>
            </ul>
            <p className="text-base md:text-lg leading-[1.65] text-[rgba(255,255,255,0.80)] mb-4" style={{ marginBottom: "12px" }}>
              However, you own the floor plans and files you upload, and you retain rights to your content.
            </p>
            <p className="text-base md:text-lg leading-[1.65] text-[rgba(255,255,255,0.80)]" style={{ marginBottom: "12px" }}>
              You grant Arhitekt AI permission to process your files solely to provide the service.
            </p>
          </div>

          <div className="mb-10" style={{ marginBottom: "36px" }}>
            <h2 className="text-[20px] md:text-[22px] font-semibold text-white mb-4" style={{ marginBottom: "16px", marginTop: "32px" }}>
              8. Termination
            </h2>
            <p className="text-base md:text-lg leading-[1.65] text-[rgba(255,255,255,0.80)] mb-4" style={{ marginBottom: "12px" }}>
              We may suspend or terminate your account if you:
            </p>
            <ul className="list-disc list-inside mb-4 space-y-2" style={{ marginLeft: "20px", marginBottom: "12px" }}>
              <li className="text-base md:text-lg leading-[1.65] text-[rgba(255,255,255,0.80)]">
                violate these Terms
              </li>
              <li className="text-base md:text-lg leading-[1.65] text-[rgba(255,255,255,0.80)]">
                misuse the platform
              </li>
              <li className="text-base md:text-lg leading-[1.65] text-[rgba(255,255,255,0.80)]">
                engage in fraud or harmful behavior
              </li>
            </ul>
            <p className="text-base md:text-lg leading-[1.65] text-[rgba(255,255,255,0.80)]" style={{ marginBottom: "12px" }}>
              You may delete your account at any time through settings or by contacting support.
            </p>
          </div>

          <div className="mb-10" style={{ marginBottom: "36px" }}>
            <h2 className="text-[20px] md:text-[22px] font-semibold text-white mb-4" style={{ marginBottom: "16px", marginTop: "32px" }}>
              9. Limitation of Liability
            </h2>
            <p className="text-base md:text-lg leading-[1.65] text-[rgba(255,255,255,0.80)] mb-4" style={{ marginBottom: "12px" }}>
              To the maximum extent permitted by law:
            </p>
            <ul className="list-disc list-inside mb-4 space-y-2" style={{ marginLeft: "20px", marginBottom: "12px" }}>
              <li className="text-base md:text-lg leading-[1.65] text-[rgba(255,255,255,0.80)]">
                we are not liable for indirect or incidental damages
              </li>
              <li className="text-base md:text-lg leading-[1.65] text-[rgba(255,255,255,0.80)]">
                we are not liable for construction mistakes, financial losses, or incorrect interpretations
              </li>
              <li className="text-base md:text-lg leading-[1.65] text-[rgba(255,255,255,0.80)]">
                the service is provided as is, without guarantees
              </li>
            </ul>
            <p className="text-base md:text-lg leading-[1.65] text-[rgba(255,255,255,0.80)]" style={{ marginBottom: "12px" }}>
              Use of AI-generated content is at your own risk.
            </p>
          </div>

          <div className="mb-10" style={{ marginBottom: "36px" }}>
            <h2 className="text-[20px] md:text-[22px] font-semibold text-white mb-4" style={{ marginBottom: "16px", marginTop: "32px" }}>
              10. Third-Party Services
            </h2>
            <p className="text-base md:text-lg leading-[1.65] text-[rgba(255,255,255,0.80)] mb-4" style={{ marginBottom: "12px" }}>
              Our platform may use third-party tools (hosting, analytics, payments).
            </p>
            <p className="text-base md:text-lg leading-[1.65] text-[rgba(255,255,255,0.80)] mb-4" style={{ marginBottom: "12px" }}>
              These providers have their own terms. You agree to comply with them when using related features.
            </p>
          </div>

          <div className="mb-10" style={{ marginBottom: "36px" }}>
            <h2 className="text-[20px] md:text-[22px] font-semibold text-white mb-4" style={{ marginBottom: "16px", marginTop: "32px" }}>
              11. Changes to These Terms
            </h2>
            <p className="text-base md:text-lg leading-[1.65] text-[rgba(255,255,255,0.80)] mb-4" style={{ marginBottom: "12px" }}>
              We may update these Terms occasionally.
            </p>
            <p className="text-base md:text-lg leading-[1.65] text-[rgba(255,255,255,0.80)] mb-4" style={{ marginBottom: "12px" }}>
              If changes are significant, we will notify you by email or through the platform.
            </p>
            <p className="text-base md:text-lg leading-[1.65] text-[rgba(255,255,255,0.80)]" style={{ marginBottom: "12px" }}>
              Continued use after changes means you accept the updated Terms.
            </p>
          </div>

          <div className="mb-10" style={{ marginBottom: "36px" }}>
            <h2 className="text-[20px] md:text-[22px] font-semibold text-white mb-4" style={{ marginBottom: "16px", marginTop: "32px" }}>
              12. Governing Law
            </h2>
            <p className="text-base md:text-lg leading-[1.65] text-[rgba(255,255,255,0.80)] mb-4" style={{ marginBottom: "12px" }}>
              These Terms are governed by the laws of [Your Country or Region].
            </p>
            <p className="text-base md:text-lg leading-[1.65] text-[rgba(255,255,255,0.80)]" style={{ marginBottom: "12px" }}>
              Any disputes will be handled in the courts of [Your Jurisdiction].
            </p>
          </div>

          <div className="mb-10" style={{ marginBottom: "36px" }}>
            <h2 className="text-[20px] md:text-[22px] font-semibold text-white mb-4" style={{ marginBottom: "16px", marginTop: "32px" }}>
              13. Contact Us
            </h2>
            <p className="text-base md:text-lg leading-[1.65] text-[rgba(255,255,255,0.80)] mb-4" style={{ marginBottom: "12px" }}>
              If you have questions about these Terms, contact us:
            </p>
            <ul className="list-none space-y-2 mb-4" style={{ marginLeft: "0", marginBottom: "12px" }}>
              <li className="text-base md:text-lg leading-[1.65] text-[rgba(255,255,255,0.80)]">
                Email:{" "}
                <a
                  href="mailto:legal@arhitekt.ai"
                  className="text-[#00E6CC] hover:text-[#00F5D4] underline transition-colors"
                >
                  legal@arhitekt.ai
                </a>
              </li>
              <li className="text-base md:text-lg leading-[1.65] text-[rgba(255,255,255,0.80)]">
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


"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Container } from "@/components/ui/Container";
import { cn } from "@/lib/utils";

export interface RefundPolicyContentProps {
  className?: string;
}

export const RefundPolicyContent: React.FC<RefundPolicyContentProps> = ({
  className,
}) => {
  return (
    <section className={cn("w-full py-20 md:py-32 relative", className)}>
      <Container className="px-6 md:px-8 max-w-[960px]">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }}
          className="max-w-none text-left"
        >
          <div className="pt-[120px] md:pt-[140px] pb-[120px]">
            <p className="text-[15px] md:text-[16px] leading-[1.65] text-[rgba(255,255,255,0.80)] mb-3">
              This Refund Policy explains the conditions for refunds of digital
              purchases made through Arhitekt AI. Please read this policy
              carefully to understand when refunds are available and how to request
              them.
            </p>
            <p className="text-[15px] md:text-[16px] leading-[1.65] text-[rgba(255,255,255,0.80)] mb-3">
              By making a purchase through Arhitekt AI, you agree to this Refund
              Policy. If you do not agree with these terms, please do not proceed
              with your purchase.
            </p>
          </div>

          <div className="mb-9 md:mb-10">
            <h2 className="text-[20px] md:text-[22px] font-semibold text-white mb-3 mt-8">
              1. Overview
            </h2>
            <p className="text-[15px] md:text-[16px] leading-[1.65] text-[rgba(255,255,255,0.80)] mb-3">
              Arhitekt AI provides digital services, including AI processing, 3D
              previews, generation credits, and other digital content. These
              services are delivered immediately upon purchase and processing.
            </p>
            <p className="text-[15px] md:text-[16px] leading-[1.65] text-[rgba(255,255,255,0.80)] mb-3">
              Once AI generation or digital content is delivered, the product is
              considered "used" and consumed. Digital products and services cannot
              be returned in the same way as physical goods.
            </p>
            <p className="text-[15px] md:text-[16px] leading-[1.65] text-[rgba(255,255,255,0.80)]">
              This policy outlines the specific circumstances under which refunds
              may be available and the process for requesting a refund.
            </p>
          </div>

          <div className="mb-9 md:mb-10">
            <h2 className="text-[20px] md:text-[22px] font-semibold text-white mb-3 mt-8">
              2. Non-Refundable Items
            </h2>
            <p className="text-[15px] md:text-[16px] leading-[1.65] text-[rgba(255,255,255,0.80)] mb-3">
              The following items and services are non-refundable once delivered:
            </p>
            <ul className="list-disc list-inside mb-3 space-y-2 ml-5">
              <li className="text-[15px] md:text-[16px] leading-[1.65] text-[rgba(255,255,255,0.80)]">
                AI-generated previews
              </li>
              <li className="text-[15px] md:text-[16px] leading-[1.65] text-[rgba(255,255,255,0.80)]">
                AI-based calculations
              </li>
              <li className="text-[15px] md:text-[16px] leading-[1.65] text-[rgba(255,255,255,0.80)]">
                Rendered 3D images
              </li>
              <li className="text-[15px] md:text-[16px] leading-[1.65] text-[rgba(255,255,255,0.80)]">
                Credits or tokens already consumed
              </li>
              <li className="text-[15px] md:text-[16px] leading-[1.65] text-[rgba(255,255,255,0.80)]">
                Any digital service already delivered
              </li>
              <li className="text-[15px] md:text-[16px] leading-[1.65] text-[rgba(255,255,255,0.80)]">
                Subscriptions already used
              </li>
            </ul>
            <p className="text-[15px] md:text-[16px] leading-[1.65] text-[rgba(255,255,255,0.80)] mb-3">
              <strong>
                Once AI generation or digital output has been produced, the service
                is considered consumed and cannot be refunded.
              </strong>
            </p>
            <p className="text-[15px] md:text-[16px] leading-[1.65] text-[rgba(255,255,255,0.80)]">
              This policy applies regardless of whether you are satisfied with the
              quality, accuracy, or outcome of the AI-generated content. We
              recommend reviewing our service descriptions and examples before
              making a purchase.
            </p>
          </div>

          <div className="mb-9 md:mb-10">
            <h2 className="text-[20px] md:text-[22px] font-semibold text-white mb-3 mt-8">
              3. Eligible Refund Situations
            </h2>
            <p className="text-[15px] md:text-[16px] leading-[1.65] text-[rgba(255,255,255,0.80)] mb-3">
              Refunds may be considered in the following specific circumstances:
            </p>
            <ul className="list-disc list-inside mb-3 space-y-2 ml-5">
              <li className="text-[15px] md:text-[16px] leading-[1.65] text-[rgba(255,255,255,0.80)]">
                Accidental double charges for the same purchase
              </li>
              <li className="text-[15px] md:text-[16px] leading-[1.65] text-[rgba(255,255,255,0.80)]">
                Technical payment errors on our payment processing system
              </li>
              <li className="text-[15px] md:text-[16px] leading-[1.65] text-[rgba(255,255,255,0.80)]">
                Being charged after canceling a subscription (if applicable)
              </li>
              <li className="text-[15px] md:text-[16px] leading-[1.65] text-[rgba(255,255,255,0.80)]">
                Duplicate subscriptions purchased in error
              </li>
              <li className="text-[15px] md:text-[16px] leading-[1.65] text-[rgba(255,255,255,0.80)]">
                Billing mistakes on our side (e.g., incorrect pricing, wrong
                product charged)
              </li>
              <li className="text-[15px] md:text-[16px] leading-[1.65] text-[rgba(255,255,255,0.80)]">
                Inability to access the product due to verified technical issues
                on our platform that prevent delivery
              </li>
            </ul>
            <p className="text-[15px] md:text-[16px] leading-[1.65] text-[rgba(255,255,255,0.80)] mb-3">
              Each refund request must be reviewed manually. We will investigate
              each case individually and determine eligibility based on the
              specific circumstances, technical logs, and our records.
            </p>
            <p className="text-[15px] md:text-[16px] leading-[1.65] text-[rgba(255,255,255,0.80)]">
              Refunds are not available simply because you changed your mind,
              found a better alternative, or are dissatisfied with the AI-generated
              output quality, unless there is a verified technical issue preventing
              delivery.
            </p>
          </div>

          <div className="mb-9 md:mb-10">
            <h2 className="text-[20px] md:text-[22px] font-semibold text-white mb-3 mt-8">
              4. Subscription Renewals
            </h2>
            <p className="text-[15px] md:text-[16px] leading-[1.65] text-[rgba(255,255,255,0.80)] mb-3">
              If the service uses a subscription model, renewals are typically
              non-refundable after the renewal date. Once a subscription has been
              renewed and the billing period has begun, the service is considered
              active and consumed.
            </p>
            <p className="text-[15px] md:text-[16px] leading-[1.65] text-[rgba(255,255,255,0.80)] mb-3">
              However, if you contact support immediately after renewal (within 24
              hours) and have not used any features or consumed any credits during
              the new billing period, we may, at our discretion, provide a refund
              or credit for the renewal amount.
            </p>
            <p className="text-[15px] md:text-[16px] leading-[1.65] text-[rgba(255,255,255,0.80)]">
              To avoid unwanted renewals, please cancel your subscription before the
              renewal date. You can manage your subscription settings in your
              account dashboard or by contacting support.
            </p>
          </div>

          <div className="mb-9 md:mb-10">
            <h2 className="text-[20px] md:text-[22px] font-semibold text-white mb-3 mt-8">
              5. Refund Process
            </h2>
            <p className="text-[15px] md:text-[16px] leading-[1.65] text-[rgba(255,255,255,0.80)] mb-3">
              To request a refund, you must:
            </p>
            <ol className="list-decimal list-inside mb-3 space-y-2 ml-5">
              <li className="text-[15px] md:text-[16px] leading-[1.65] text-[rgba(255,255,255,0.80)]">
                Contact us at{" "}
                <a
                  href="mailto:billing@arhitekt.ai"
                  className="text-[#00E6CC] hover:text-[#00F5D4] underline transition-colors"
                >
                  billing@arhitekt.ai
                </a>
              </li>
              <li className="text-[15px] md:text-[16px] leading-[1.65] text-[rgba(255,255,255,0.80)]">
                Provide your order ID, email address used for purchase, and a
                clear reason for the refund request
              </li>
              <li className="text-[15px] md:text-[16px] leading-[1.65] text-[rgba(255,255,255,0.80)]">
                Wait for our review (usually 3–7 working days)
              </li>
            </ol>
            <p className="text-[15px] md:text-[16px] leading-[1.65] text-[rgba(255,255,255,0.80)] mb-3">
              If your refund request is approved, the refund will be issued to the
              original payment method used for the purchase. Processing times may
              vary depending on your payment provider, but typically take 5–10
              business days to appear in your account.
            </p>
            <p className="text-[15px] md:text-[16px] leading-[1.65] text-[rgba(255,255,255,0.80)]">
              We cannot issue refunds to a different payment method or account
              than the one used for the original purchase.
            </p>
          </div>

          <div className="mb-9 md:mb-10">
            <h2 className="text-[20px] md:text-[22px] font-semibold text-white mb-3 mt-8">
              6. Chargebacks
            </h2>
            <p className="text-[15px] md:text-[16px] leading-[1.65] text-[rgba(255,255,255,0.80)] mb-3">
              Filing a payment dispute or chargeback with your bank or credit card
              company without first contacting our support team may delay or
              prevent resolution of your issue.
            </p>
            <p className="text-[15px] md:text-[16px] leading-[1.65] text-[rgba(255,255,255,0.80)] mb-3">
              We encourage you to contact us directly at{" "}
              <a
                href="mailto:billing@arhitekt.ai"
                className="text-[#00E6CC] hover:text-[#00F5D4] underline transition-colors"
              >
                billing@arhitekt.ai
              </a>{" "}
              to resolve any billing issues before initiating a chargeback. We are
              committed to working with you to resolve legitimate concerns.
            </p>
            <p className="text-[15px] md:text-[16px] leading-[1.65] text-[rgba(255,255,255,0.80)]">
              Accounts linked to fraudulent chargebacks or repeated chargeback
              attempts may be suspended or terminated. We reserve the right to
              dispute chargebacks that are not legitimate or that violate this
              Refund Policy.
            </p>
          </div>

          <div className="mb-9 md:mb-10">
            <h2 className="text-[20px] md:text-[22px] font-semibold text-white mb-3 mt-8">
              7. No Guarantee of Refund Approval
            </h2>
            <p className="text-[15px] md:text-[16px] leading-[1.65] text-[rgba(255,255,255,0.80)] mb-3">
              Refund approval is not guaranteed. Each request is evaluated on a
              case-by-case basis, and our determination depends on several factors,
              including:
            </p>
            <ul className="list-disc list-inside mb-3 space-y-2 ml-5">
              <li className="text-[15px] md:text-[16px] leading-[1.65] text-[rgba(255,255,255,0.80)]">
                Usage status of the purchased service or credits
              </li>
              <li className="text-[15px] md:text-[16px] leading-[1.65] text-[rgba(255,255,255,0.80)]">
                Technical logs and records of service delivery
              </li>
              <li className="text-[15px] md:text-[16px] leading-[1.65] text-[rgba(255,255,255,0.80)]">
                Fairness and reasonableness of the request
              </li>
              <li className="text-[15px] md:text-[16px] leading-[1.65] text-[rgba(255,255,255,0.80)]">
                Compliance with this Refund Policy
              </li>
            </ul>
            <p className="text-[15px] md:text-[16px] leading-[1.65] text-[rgba(255,255,255,0.80)]">
              We reserve the right to deny refund requests that do not meet the
              criteria outlined in this policy or that we determine to be
              unreasonable or fraudulent.
            </p>
          </div>

          <div className="mb-9 md:mb-10">
            <h2 className="text-[20px] md:text-[22px] font-semibold text-white mb-3 mt-8">
              8. Contact Us
            </h2>
            <p className="text-[15px] md:text-[16px] leading-[1.65] text-[rgba(255,255,255,0.80)] mb-3">
              If you have questions about this Refund Policy or need to request a
              refund, contact us at:
            </p>
            <ul className="list-none space-y-2 mb-3">
              <li className="text-[15px] md:text-[16px] leading-[1.65] text-[rgba(255,255,255,0.80)]">
                Email:{" "}
                <a
                  href="mailto:billing@arhitekt.ai"
                  className="text-[#00E6CC] hover:text-[#00F5D4] underline transition-colors"
                >
                  billing@arhitekt.ai
                </a>
              </li>
              <li className="text-[15px] md:text-[16px] leading-[1.65] text-[rgba(255,255,255,0.80)]">
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


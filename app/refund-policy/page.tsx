"use client";

import { RefundPolicyHero } from "@/components/pages/refund-policy/RefundPolicyHero";
import { RefundPolicyContent } from "@/components/pages/refund-policy/RefundPolicyContent";
import { Footer } from "@/components/layout/Footer";

export default function RefundPolicyPage() {
  return (
    <main className="min-h-screen">
      <RefundPolicyHero />
      <RefundPolicyContent />
      <Footer />
    </main>
  );
}


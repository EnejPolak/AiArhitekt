"use client";

import { ContactHero } from "@/components/pages/contact/ContactHero";
import { ContactForm } from "@/components/pages/contact/ContactForm";
import { ContactInfo } from "@/components/pages/contact/ContactInfo";
import { ContactFAQ } from "@/components/pages/contact/ContactFAQ";
import { Footer } from "@/components/layout/Footer";

export default function ContactPage() {
  return (
    <main className="min-h-screen">
      <ContactHero />
      <div className="w-full py-10">
        <div className="mx-auto w-full max-w-[1200px] px-6 md:px-12">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-16">
            <div className="lg:col-span-2">
              <ContactForm />
            </div>
            <div className="lg:col-span-1">
              <ContactInfo />
            </div>
          </div>
        </div>
      </div>
      <ContactFAQ />
      <Footer />
    </main>
  );
}


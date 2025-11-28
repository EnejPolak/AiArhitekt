"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

export interface ContactFormProps {
  className?: string;
}

export const ContactForm: React.FC<ContactFormProps> = ({ className }) => {
  const [formData, setFormData] = React.useState({
    fullName: "",
    email: "",
    projectType: "",
    budget: "",
    location: "",
    message: "",
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Handle form submission
    console.log("Form submitted:", formData);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
      className={cn(
        "w-full rounded-[28px] p-8 md:p-10 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.10)] shadow-[0_24px_80px_rgba(0,255,210,0.10)]",
        className
      )}
    >
      <h2 className="text-[22px] md:text-[24px] font-semibold text-white mb-4">
        Send us a message
      </h2>
      <p className="text-[15px] md:text-base text-[rgba(255,255,255,0.70)] mb-6">
        Tell us briefly about your home, your plans and what you'd like help with.
      </p>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Full Name */}
        <div>
          <label
            htmlFor="fullName"
            className="block text-[13px] md:text-sm font-medium tracking-[0.03em] text-[rgba(255,255,255,0.75)] mb-2"
          >
            Full Name
          </label>
          <input
            type="text"
            id="fullName"
            name="fullName"
            value={formData.fullName}
            onChange={handleChange}
            required
            className="w-full h-[48px] px-4 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.18)] rounded-xl text-[15px] md:text-base text-white placeholder-[rgba(255,255,255,0.50)] focus:outline-none focus:border-[rgba(0,230,204,0.6)] transition-colors"
            placeholder="John Doe"
          />
        </div>

        {/* Email */}
        <div>
          <label
            htmlFor="email"
            className="block text-[13px] md:text-sm font-medium tracking-[0.03em] text-[rgba(255,255,255,0.75)] mb-2"
          >
            Email
          </label>
          <input
            type="email"
            id="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            required
            className="w-full h-[48px] px-4 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.18)] rounded-xl text-[15px] md:text-base text-white placeholder-[rgba(255,255,255,0.50)] focus:outline-none focus:border-[rgba(0,230,204,0.6)] transition-colors"
            placeholder="john@example.com"
          />
        </div>

        {/* Project Type */}
        <div>
          <label
            htmlFor="projectType"
            className="block text-[13px] md:text-sm font-medium tracking-[0.03em] text-[rgba(255,255,255,0.75)] mb-2"
          >
            Project Type
          </label>
          <select
            id="projectType"
            name="projectType"
            value={formData.projectType}
            onChange={handleChange}
            required
            className="w-full h-[48px] px-4 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.18)] rounded-xl text-[15px] md:text-base text-white focus:outline-none focus:border-[rgba(0,230,204,0.6)] transition-colors"
          >
            <option value="" disabled>
              Select project type
            </option>
            <option value="new-build">New build</option>
            <option value="renovation">Renovation</option>
            <option value="interior-only">Interior only</option>
            <option value="exploring">Just exploring</option>
          </select>
        </div>

        {/* Estimated Budget */}
        <div>
          <label
            htmlFor="budget"
            className="block text-[13px] md:text-sm font-medium tracking-[0.03em] text-[rgba(255,255,255,0.75)] mb-2"
          >
            Estimated Budget
          </label>
          <select
            id="budget"
            name="budget"
            value={formData.budget}
            onChange={handleChange}
            required
            className="w-full h-[48px] px-4 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.18)] rounded-xl text-[15px] md:text-base text-white focus:outline-none focus:border-[rgba(0,230,204,0.6)] transition-colors"
          >
            <option value="" disabled>
              Select budget range
            </option>
            <option value="<10k">&lt; €10k</option>
            <option value="10-30k">€10–30k</option>
            <option value="30-100k">€30–100k</option>
            <option value=">100k">&gt; €100k</option>
          </select>
        </div>

        {/* Project Location */}
        <div>
          <label
            htmlFor="location"
            className="block text-[13px] md:text-sm font-medium tracking-[0.03em] text-[rgba(255,255,255,0.75)] mb-2"
          >
            Project Location (City / Country)
          </label>
          <input
            type="text"
            id="location"
            name="location"
            value={formData.location}
            onChange={handleChange}
            required
            className="w-full h-[48px] px-4 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.18)] rounded-xl text-[15px] md:text-base text-white placeholder-[rgba(255,255,255,0.50)] focus:outline-none focus:border-[rgba(0,230,204,0.6)] transition-colors"
            placeholder="Ljubljana, Slovenia"
          />
        </div>

        {/* Message */}
        <div>
          <label
            htmlFor="message"
            className="block text-[13px] md:text-sm font-medium tracking-[0.03em] text-[rgba(255,255,255,0.75)] mb-2"
          >
            Message / Project Details
          </label>
          <textarea
            id="message"
            name="message"
            value={formData.message}
            onChange={handleChange}
            required
            rows={6}
            className="w-full min-h-[140px] px-4 py-3 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.18)] rounded-xl text-[15px] md:text-base text-white placeholder-[rgba(255,255,255,0.50)] focus:outline-none focus:border-[rgba(0,230,204,0.6)] transition-colors resize-none"
            placeholder="Tell us about your project..."
          />
        </div>

        {/* Submit Button */}
        <div className="pt-2">
          <Button
            type="submit"
            variant="default"
            className="w-full md:w-[240px] py-4 px-8 rounded-[14px] text-[15px] md:text-base font-semibold"
          >
            Send Message
          </Button>
          <p className="mt-3 text-xs md:text-[13px] text-[rgba(255,255,255,0.60)]">
            We usually reply within 24–48 hours.
          </p>
        </div>
      </form>
    </motion.div>
  );
};


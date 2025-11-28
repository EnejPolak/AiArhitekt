"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { Eye, EyeOff } from "lucide-react";
import Link from "next/link";

export interface SignUpFormProps {
  className?: string;
}

export const SignUpForm: React.FC<SignUpFormProps> = ({ className }) => {
  const [showPassword, setShowPassword] = React.useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false);
  const [agreeToTerms, setAgreeToTerms] = React.useState(false);
  const [formData, setFormData] = React.useState({
    fullName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Handle form submission
    console.log("Sign up:", formData);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className={cn(
        "w-full max-w-[420px] rounded-[28px] p-10 md:p-11 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.10)] shadow-[0_24px_80px_rgba(0,255,210,0.10)] backdrop-blur-sm",
        className
      )}
    >
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-[28px] md:text-[32px] font-semibold leading-[1.2] tracking-[-0.01em] text-white mb-4">
          Create Your Account
        </h1>
        <p className="text-[15px] md:text-base text-[rgba(255,255,255,0.70)]">
          Start generating your 3D home previews in minutes.
        </p>
      </div>

      {/* Form */}
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
            className="w-full h-[48px] px-4 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.14)] rounded-xl text-[15px] md:text-base text-white placeholder-[rgba(255,255,255,0.50)] focus:outline-none focus:border-[rgba(0,230,204,0.6)] transition-colors"
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
            className="w-full h-[48px] px-4 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.14)] rounded-xl text-[15px] md:text-base text-white placeholder-[rgba(255,255,255,0.50)] focus:outline-none focus:border-[rgba(0,230,204,0.6)] transition-colors"
            placeholder="you@example.com"
          />
        </div>

        {/* Password */}
        <div>
          <label
            htmlFor="password"
            className="block text-[13px] md:text-sm font-medium tracking-[0.03em] text-[rgba(255,255,255,0.75)] mb-2"
          >
            Password
          </label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              id="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              required
              className="w-full h-[48px] px-4 pr-12 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.14)] rounded-xl text-[15px] md:text-base text-white placeholder-[rgba(255,255,255,0.50)] focus:outline-none focus:border-[rgba(0,230,204,0.6)] transition-colors"
              placeholder="Create a password"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-[rgba(0,230,204,0.7)] hover:text-[rgba(0,230,204,0.9)] transition-colors"
            >
              {showPassword ? (
                <EyeOff className="w-5 h-5 stroke-[1.5]" />
              ) : (
                <Eye className="w-5 h-5 stroke-[1.5]" />
              )}
            </button>
          </div>
        </div>

        {/* Confirm Password */}
        <div>
          <label
            htmlFor="confirmPassword"
            className="block text-[13px] md:text-sm font-medium tracking-[0.03em] text-[rgba(255,255,255,0.75)] mb-2"
          >
            Confirm Password
          </label>
          <div className="relative">
            <input
              type={showConfirmPassword ? "text" : "password"}
              id="confirmPassword"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
              required
              className="w-full h-[48px] px-4 pr-12 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.14)] rounded-xl text-[15px] md:text-base text-white placeholder-[rgba(255,255,255,0.50)] focus:outline-none focus:border-[rgba(0,230,204,0.6)] transition-colors"
              placeholder="Confirm your password"
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-[rgba(0,230,204,0.7)] hover:text-[rgba(0,230,204,0.9)] transition-colors"
            >
              {showConfirmPassword ? (
                <EyeOff className="w-5 h-5 stroke-[1.5]" />
              ) : (
                <Eye className="w-5 h-5 stroke-[1.5]" />
              )}
            </button>
          </div>
        </div>

        {/* Terms Checkbox */}
        <div className="pt-2">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={agreeToTerms}
              onChange={(e) => setAgreeToTerms(e.target.checked)}
              required
              className="w-4 h-4 mt-0.5 rounded border-[rgba(255,255,255,0.18)] bg-[rgba(255,255,255,0.04)] text-[rgba(0,230,204,0.7)] focus:ring-[rgba(0,230,204,0.3)] focus:ring-offset-0"
            />
            <span className="text-sm md:text-[15px] text-[rgba(255,255,255,0.70)] leading-relaxed">
              I agree to the{" "}
              <Link
                href="/terms"
                className="text-[rgba(0,230,204,0.8)] hover:text-[rgba(0,230,204,1)] hover:underline transition-colors"
              >
                Terms
              </Link>{" "}
              and{" "}
              <Link
                href="/privacy"
                className="text-[rgba(0,230,204,0.8)] hover:text-[rgba(0,230,204,1)] hover:underline transition-colors"
              >
                Privacy Policy
              </Link>
            </span>
          </label>
        </div>

        {/* Sign Up Button */}
        <div className="pt-6">
          <Button
            type="submit"
            variant="default"
            className="w-full h-[50px] rounded-[14px] text-base font-semibold"
          >
            Create Account
          </Button>
        </div>

        {/* Helper Text */}
        <div className="text-center pt-4">
          <p className="text-[13px] text-[rgba(255,255,255,0.65)]">
            Already have an account?{" "}
            <Link
              href="/sign-in"
              className="text-[rgba(0,230,204,0.8)] hover:text-[rgba(0,230,204,1)] hover:underline transition-colors"
            >
              Sign in
            </Link>
          </p>
        </div>

        {/* OR Divider */}
        <div className="relative py-7">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-[rgba(255,255,255,0.10)]" />
          </div>
          <div className="relative flex justify-center">
            <span className="text-xs text-[rgba(255,255,255,0.45)] bg-[rgba(255,255,255,0.04)] px-3">
              OR
            </span>
          </div>
        </div>

        {/* Social Sign Up Buttons */}
        <div className="space-y-4">
          <button
            type="button"
            className="w-full h-[48px] flex items-center justify-center gap-3 bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.12)] rounded-[14px] text-[15px] text-[rgba(255,255,255,0.85)] hover:bg-[rgba(255,255,255,0.04)] hover:border-[rgba(255,255,255,0.18)] transition-all"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Continue with Google
          </button>
          <button
            type="button"
            className="w-full h-[48px] flex items-center justify-center gap-3 bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.12)] rounded-[14px] text-[15px] text-[rgba(255,255,255,0.85)] hover:bg-[rgba(255,255,255,0.04)] hover:border-[rgba(255,255,255,0.18)] transition-all"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.96-3.24-1.5-1.56-.71-2.94-1.16-4.23-2.24C4.79 15.25 3 12.45 2.74 9.14c-.03-.5-.05-1-.05-1.49 0-1.89.45-3.7 1.32-5.37C5.07 1.5 7.24.94 9.6 1.1c1.75.14 3.48.93 4.82 2.02 1.19.96 2.11 2.18 3.24 3.24 1.5 1.4 2.95 2.78 4.16 4.36.95 1.25 1.73 2.55 2.21 4.05.48 1.5.56 3.05.24 4.59-.32 1.54-1.01 2.98-2.01 4.19-.5.6-1.08 1.15-1.69 1.66-.61.51-1.26.97-1.95 1.37-.69.4-1.42.73-2.18.99-.76.26-1.55.45-2.36.57-.81.12-1.64.17-2.48.15-.84-.02-1.68-.11-2.5-.28-.82-.17-1.62-.42-2.39-.75-.77-.33-1.51-.74-2.21-1.22-.7-.48-1.35-1.03-1.95-1.64-.6-.61-1.14-1.28-1.61-2-.47-.72-.87-1.48-1.19-2.28-.32-.8-.56-1.63-.72-2.48-.16-.85-.24-1.72-.24-2.6 0-.88.08-1.75.24-2.6.16-.85.4-1.68.72-2.48.32-.8.72-1.56 1.19-2.28.47-.72 1.01-1.39 1.61-2 .6-.61 1.25-1.16 1.95-1.64.7-.48 1.44-.89 2.21-1.22.77-.33 1.57-.58 2.39-.75.82-.17 1.66-.26 2.5-.28.84-.02 1.67.03 2.48.15.81.12 1.6.31 2.36.57.76.26 1.49.59 2.18.99.69.4 1.34.86 1.95 1.37.61.51 1.19 1.06 1.69 1.66z" fill="#000" />
            </svg>
            Continue with Apple
          </button>
        </div>
      </form>
    </motion.div>
  );
};


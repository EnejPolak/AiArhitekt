"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { signUp } from "@/lib/auth/actions";
import { authErrorMessage } from "@/lib/auth/errors";
import { DEFAULT_POST_AUTH_PATH } from "@/lib/auth/redirect";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

export interface SignUpFormProps {
  className?: string;
}

type FormStatus = "idle" | "submitting" | "success" | "error";

const inputClass =
  "h-[48px] w-full rounded-xl border border-[rgba(255,255,255,0.14)] bg-[rgba(255,255,255,0.04)] px-4 text-[15px] text-white placeholder-[rgba(255,255,255,0.50)] transition-colors focus:border-[rgba(0,230,204,0.6)] focus:outline-none md:text-base";

export const SignUpForm: React.FC<SignUpFormProps> = ({ className }) => {
  const router = useRouter();
  const [showPassword, setShowPassword] = React.useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false);
  const [agreeToTerms, setAgreeToTerms] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [status, setStatus] = React.useState<FormStatus>("idle");
  const [errorMessage, setErrorMessage] = React.useState("");
  const [successMessage, setSuccessMessage] = React.useState("");
  const errorId = React.useId();
  const submitting = status === "submitting";

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;

    setStatus("submitting");
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const result = await signUp({
        email,
        password,
        confirmPassword,
        agreeToTerms,
      });
      if (!result.ok) {
        setStatus("error");
        setErrorMessage(result.message);
        return;
      }

      setStatus("success");
      if (result.needsEmailConfirmation) {
        setSuccessMessage(
          "Check your email to confirm your account."
        );
        return;
      }

      setSuccessMessage("Account created. Opening your workspace…");
      router.push(DEFAULT_POST_AUTH_PATH);
      router.refresh();
    } catch {
      setStatus("error");
      setErrorMessage(authErrorMessage("network"));
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className={cn(
        "w-full max-w-[420px] rounded-[28px] border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.04)] p-10 shadow-[0_24px_80px_rgba(0,255,210,0.10)] backdrop-blur-sm md:p-11",
        className
      )}
    >
      <div className="mb-8 text-center">
        <h1 className="mb-4 text-[28px] font-semibold leading-[1.2] tracking-[-0.01em] text-white md:text-[32px]">
          Create Your Account
        </h1>
        <p className="text-[15px] text-[rgba(255,255,255,0.70)] md:text-base">
          Start generating your 3D home previews in minutes.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {status === "error" && errorMessage ? (
          <p
            id={errorId}
            role="alert"
            className="border-destructive/40 bg-destructive/10 rounded-xl border px-4 py-3 text-sm text-[#E5484D]"
          >
            {errorMessage}
          </p>
        ) : null}
        {status === "success" && successMessage ? (
          <p
            role="status"
            className="rounded-xl border border-[rgba(61,154,106,0.4)] bg-[rgba(61,154,106,0.12)] px-4 py-3 text-sm text-[#8FCBAA]"
          >
            {successMessage}
          </p>
        ) : null}

        <div>
          <label
            htmlFor="email"
            className="mb-2 block text-[13px] font-medium tracking-[0.03em] text-[rgba(255,255,255,0.75)] md:text-sm"
          >
            Email
          </label>
          <input
            type="email"
            id="email"
            name="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            disabled={submitting || status === "success"}
            aria-invalid={status === "error"}
            aria-describedby={status === "error" ? errorId : undefined}
            className={inputClass}
            placeholder="you@example.com"
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="mb-2 block text-[13px] font-medium tracking-[0.03em] text-[rgba(255,255,255,0.75)] md:text-sm"
          >
            Password
          </label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              id="password"
              name="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={8}
              disabled={submitting || status === "success"}
              aria-invalid={status === "error"}
              aria-describedby={status === "error" ? errorId : undefined}
              className={cn(inputClass, "pr-12")}
              placeholder="Create a password"
            />
            <button
              type="button"
              onClick={() => setShowPassword((open) => !open)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-[rgba(0,230,204,0.7)] transition-colors hover:text-[rgba(0,230,204,0.9)]"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <EyeOff className="h-5 w-5 stroke-[1.5]" />
              ) : (
                <Eye className="h-5 w-5 stroke-[1.5]" />
              )}
            </button>
          </div>
        </div>

        <div>
          <label
            htmlFor="confirmPassword"
            className="mb-2 block text-[13px] font-medium tracking-[0.03em] text-[rgba(255,255,255,0.75)] md:text-sm"
          >
            Confirm Password
          </label>
          <div className="relative">
            <input
              type={showConfirmPassword ? "text" : "password"}
              id="confirmPassword"
              name="confirmPassword"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
              disabled={submitting || status === "success"}
              aria-invalid={status === "error"}
              aria-describedby={status === "error" ? errorId : undefined}
              className={cn(inputClass, "pr-12")}
              placeholder="Confirm your password"
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword((open) => !open)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-[rgba(0,230,204,0.7)] transition-colors hover:text-[rgba(0,230,204,0.9)]"
              aria-label={
                showConfirmPassword
                  ? "Hide confirm password"
                  : "Show confirm password"
              }
            >
              {showConfirmPassword ? (
                <EyeOff className="h-5 w-5 stroke-[1.5]" />
              ) : (
                <Eye className="h-5 w-5 stroke-[1.5]" />
              )}
            </button>
          </div>
        </div>

        <div className="pt-2">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={agreeToTerms}
              onChange={(event) => setAgreeToTerms(event.target.checked)}
              required
              disabled={submitting || status === "success"}
              className="mt-0.5 h-4 w-4 rounded border-[rgba(255,255,255,0.18)] bg-[rgba(255,255,255,0.04)] text-[rgba(0,230,204,0.7)] focus:ring-[rgba(0,230,204,0.3)] focus:ring-offset-0"
            />
            <span className="text-sm leading-relaxed text-[rgba(255,255,255,0.70)] md:text-[15px]">
              I agree to the{" "}
              <Link
                href="/terms"
                className="text-[rgba(0,230,204,0.8)] transition-colors hover:text-[rgba(0,230,204,1)] hover:underline"
              >
                Terms
              </Link>{" "}
              and{" "}
              <Link
                href="/privacy"
                className="text-[rgba(0,230,204,0.8)] transition-colors hover:text-[rgba(0,230,204,1)] hover:underline"
              >
                Privacy Policy
              </Link>
            </span>
          </label>
        </div>

        <div className="pt-6">
          <Button
            type="submit"
            variant="default"
            disabled={submitting || status === "success"}
            className="h-[50px] w-full rounded-[14px] text-base font-semibold"
          >
            {submitting ? "Creating account…" : "Create Account"}
          </Button>
        </div>

        <div className="pt-4 text-center">
          <p className="text-[13px] text-[rgba(255,255,255,0.65)]">
            Already have an account?{" "}
            <Link
              href="/sign-in"
              className="text-[rgba(0,230,204,0.8)] transition-colors hover:text-[rgba(0,230,204,1)] hover:underline"
            >
              Sign in
            </Link>
          </p>
        </div>
      </form>
    </motion.div>
  );
};

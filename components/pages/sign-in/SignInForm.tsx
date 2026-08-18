"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { signIn } from "@/lib/auth/actions";
import { authErrorMessage } from "@/lib/auth/errors";
import { DEFAULT_POST_AUTH_PATH, safeInternalPath } from "@/lib/auth/redirect";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

export interface SignInFormProps {
  className?: string;
  callbackError?: boolean;
  nextPath?: string;
}

type FormStatus = "idle" | "submitting" | "success" | "error";

const inputClass =
  "h-[48px] w-full rounded-xl border border-[rgba(255,255,255,0.14)] bg-[rgba(255,255,255,0.04)] px-4 text-[15px] text-white placeholder-[rgba(255,255,255,0.50)] transition-colors focus:border-[rgba(0,230,204,0.6)] focus:outline-none md:text-base";

export const SignInForm: React.FC<SignInFormProps> = ({
  className,
  callbackError = false,
  nextPath,
}) => {
  const router = useRouter();
  const [showPassword, setShowPassword] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [status, setStatus] = React.useState<FormStatus>(
    callbackError ? "error" : "idle"
  );
  const [errorMessage, setErrorMessage] = React.useState(
    callbackError ? authErrorMessage("callback_invalid") : ""
  );
  const errorId = React.useId();
  const submitting = status === "submitting";

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;

    setStatus("submitting");
    setErrorMessage("");

    try {
      const result = await signIn({ email, password });
      if (!result.ok) {
        setStatus("error");
        setErrorMessage(result.message);
        return;
      }

      setStatus("success");
      router.push(safeInternalPath(nextPath, DEFAULT_POST_AUTH_PATH));
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
      <div className="mb-8">
        <h1 className="mb-4 text-[28px] font-semibold leading-[1.2] tracking-[-0.01em] text-white md:text-[30px] md:font-bold">
          Sign in to Arhitekt AI
        </h1>
        <p className="text-sm text-[rgba(255,255,255,0.70)] md:text-base">
          Access your projects, 3D previews and reports.
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
        {status === "success" ? (
          <p
            role="status"
            className="rounded-xl border border-[rgba(61,154,106,0.4)] bg-[rgba(61,154,106,0.12)] px-4 py-3 text-sm text-[#8FCBAA]"
          >
            Signed in. Opening your workspace…
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
            disabled={submitting}
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
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              disabled={submitting}
              aria-invalid={status === "error"}
              aria-describedby={status === "error" ? errorId : undefined}
              className={cn(inputClass, "pr-12")}
              placeholder="Enter your password"
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

        <div className="pt-6">
          <Button
            type="submit"
            variant="default"
            disabled={submitting || status === "success"}
            className="h-[50px] w-full rounded-[14px] text-base font-semibold"
          >
            {submitting ? "Signing in…" : "Sign In"}
          </Button>
        </div>

        <div className="pt-4 text-center">
          <p className="text-[13px] text-[rgba(255,255,255,0.65)]">
            New here?{" "}
            <Link
              href="/sign-up"
              className="text-[rgba(0,230,204,0.8)] transition-colors hover:text-[rgba(0,230,204,1)] hover:underline"
            >
              Create an account
            </Link>
          </p>
        </div>
      </form>
    </motion.div>
  );
};

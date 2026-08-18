import { z } from "zod";

export const emailSchema = z
  .string()
  .trim()
  .min(1, "Enter your email.")
  .email("Enter a valid email address.");

export const signInPasswordSchema = z.string().min(1, "Enter your password.");

export const signUpPasswordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.");

export const signInSchema = z.object({
  email: emailSchema,
  password: signInPasswordSchema,
});

export const signUpSchema = z
  .object({
    email: emailSchema,
    password: signUpPasswordSchema,
    confirmPassword: z.string().min(1, "Confirm your password."),
    agreeToTerms: z.boolean().refine((value) => value === true, {
      message: "Accept the Terms and Privacy Policy to continue.",
    }),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;

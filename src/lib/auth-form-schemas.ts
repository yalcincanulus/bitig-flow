import { z } from "zod";

export const signInSchema = z.object({
  email: z.email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
});

export const signUpSchema = z.object({
  name: z.string().trim().min(1, "Enter your name"),
  email: z.email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const forgotPasswordSchema = z.object({
  email: z.email("Enter a valid email"),
});

export const resetPasswordSchema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmation: z.string(),
  })
  .refine(({ password, confirmation }) => password === confirmation, {
    message: "Passwords must match",
    path: ["confirmation"],
  });

export const otpSchema = z.object({
  otp: z.string().regex(/^\d{6}$/, "Enter the 6-digit code"),
});

export const verifyEmailSchema = z.object({
  email: z.email("Enter a valid email"),
  otp: z.string().regex(/^\d{6}$/, "Enter the 6-digit code"),
});

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(1, "Name your organization"),
});

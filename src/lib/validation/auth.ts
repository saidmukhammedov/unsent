import { z } from "zod";
import { normalizePhoneNumber } from "./phone";

export const recoveryKeySchema = z.object({
  recoveryKey: z
    .string()
    .trim()
    .min(16, "Recovery key must be at least 16 characters")
    .max(64, "Recovery key format is invalid"),
});

export type RecoveryKeyInput = z.infer<typeof recoveryKeySchema>;

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters long")
  .max(128, "Password must not exceed 128 characters")
  .refine((val) => /[a-zA-Z]/.test(val), {
    message: "Password must contain at least one letter",
  })
  .refine((val) => /[0-9]/.test(val), {
    message: "Password must contain at least one number",
  });

export const registerSchema = z
  .object({
    phone: z
      .string()
      .trim()
      .min(1, "Phone number is required")
      .refine((val) => normalizePhoneNumber(val) !== null, {
        message: "Please enter a valid phone number with country code (e.g. +998 90 123 45 67 or +1 555-234-5678)",
      }),
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Password confirmation is required"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  phone: z
    .string()
    .trim()
    .min(1, "Phone number is required")
    .refine((val) => normalizePhoneNumber(val) !== null, {
      message: "Please enter a valid phone number with country code (e.g. +998 90 123 45 67 or +1 555-234-5678)",
    }),
  password: z.string().min(1, "Password is required"),
});

export type LoginInput = z.infer<typeof loginSchema>;

// Deprecated early schemas kept for compatibility if needed
export const phoneRegistrationSchema = z.object({
  phone: z
    .string()
    .trim()
    .regex(/^\+[1-9]\d{7,14}$/, "Phone number must follow international E.164 format (+...)"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters long")
    .max(128, "Password must not exceed 128 characters"),
});

export type PhoneRegistrationInput = z.infer<typeof phoneRegistrationSchema>;

export const otpVerifySchema = z.object({
  phone: z
    .string()
    .trim()
    .regex(/^\+[1-9]\d{7,14}$/, "Phone number must follow international E.164 format (+...)"),
  code: z
    .string()
    .trim()
    .length(6, "Verification code must be 6 digits")
    .regex(/^\d{6}$/, "Verification code must consist of digits only"),
});

export type OtpVerifyInput = z.infer<typeof otpVerifySchema>;

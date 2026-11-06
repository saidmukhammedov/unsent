import { z } from "zod";

export const recoveryKeySchema = z.object({
  recoveryKey: z
    .string()
    .trim()
    .min(16, "Recovery key must be at least 16 characters")
    .max(64, "Recovery key format is invalid"),
});

export type RecoveryKeyInput = z.infer<typeof recoveryKeySchema>;

export const phoneRegistrationSchema = z.object({
  phone: z
    .string()
    .trim()
    .regex(/^\+[1-9]\d{7,14}$/, "Phone number must follow international E.164 format (+...)"),
  password: z
    .string()
    .min(10, "Password must be at least 10 characters long")
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

import { z } from "zod";

export const reportCreateSchema = z.object({
  reason: z.enum([
    "PERSONAL_INFO",
    "HARASSMENT",
    "THREATS",
    "SPAM",
    "OTHER",
  ]),
  details: z
    .string()
    .trim()
    .max(500, "Details cannot exceed 500 characters")
    .optional()
    .nullable(),
});

export const moderationActionSchema = z.object({
  action: z.enum(["APPROVE", "REJECT", "REMOVE", "DISMISS_REPORTS"]),
  reason: z
    .string()
    .trim()
    .min(2, "Reason must be at least 2 characters")
    .max(255, "Reason cannot exceed 255 characters"),
  notes: z
    .string()
    .trim()
    .max(1000, "Notes cannot exceed 1000 characters")
    .optional()
    .nullable(),
});

export type ReportCreateInput = z.infer<typeof reportCreateSchema>;
export type ModerationActionInput = z.infer<typeof moderationActionSchema>;

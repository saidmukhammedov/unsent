import { z } from "zod";
import { isValidTheme, normalizeTheme } from "@/lib/constants/themes";

export const letterCreateSchema = z.object({
  title: z
    .string()
    .trim()
    .max(200, "Title must not exceed 200 characters")
    .optional(),
  recipientName: z
    .string()
    .trim()
    .max(100, "Recipient designation must not exceed 100 characters")
    .optional(),
  content: z
    .string()
    .trim()
    .min(10, "Letter must contain at least 10 characters")
    .max(10000, "Letter cannot exceed 10,000 characters"),
  visibility: z.enum(["PRIVATE", "PUBLIC"]).default("PRIVATE"),
  entryType: z.enum(["LETTER", "NOTE"]).default("LETTER"),
  theme: z
    .string()
    .trim()
    .refine((val) => !val || isValidTheme(val), {
      message: "Theme must match one of the approved editorial themes",
    })
    .transform((val) => (val ? normalizeTheme(val) || undefined : undefined))
    .optional(),
  tags: z
    .array(
      z
        .string()
        .trim()
        .toLowerCase()
        .max(30, "Tag must not exceed 30 characters")
    )
    .max(5, "Maximum 5 tags allowed")
    .default([]),
  parentLetterId: z.string().uuid("Invalid parent letter identifier").optional(),
});

export type LetterCreateInput = z.infer<typeof letterCreateSchema>;

export const personalNoteSchema = z.object({
  title: z
    .string()
    .trim()
    .max(200, "Title must not exceed 200 characters")
    .optional(),
  content: z
    .string()
    .trim()
    .min(1, "Note cannot be empty")
    .max(5000, "Note cannot exceed 5,000 characters"),
  tags: z
    .array(z.string().trim().toLowerCase().max(30))
    .max(5)
    .default([]),
});

export type PersonalNoteInput = z.infer<typeof personalNoteSchema>;

export const letterUpdateSchema = z.object({
  title: z.string().trim().max(200).optional(),
  content: z.string().trim().min(1).max(10000),
  theme: z
    .string()
    .trim()
    .refine((val) => !val || isValidTheme(val))
    .transform((val) => (val ? normalizeTheme(val) || undefined : undefined))
    .optional(),
  tags: z.array(z.string().trim().toLowerCase().max(30)).max(5).default([]),
});

export type LetterUpdateInput = z.infer<typeof letterUpdateSchema>;

export const orbitQuerySchema = z.object({
  mode: z.enum(["latest", "discover"]).default("latest"),
  theme: z
    .string()
    .trim()
    .refine((val) => !val || isValidTheme(val), {
      message: "Invalid editorial theme parameter",
    })
    .transform((val) => (val ? normalizeTheme(val) || undefined : undefined))
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export type OrbitQueryInput = z.infer<typeof orbitQuerySchema>;

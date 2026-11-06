import { z } from "zod";

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
  tags: z.array(z.string().trim().toLowerCase().max(30)).max(5).default([]),
});

export type LetterUpdateInput = z.infer<typeof letterUpdateSchema>;

import { z } from "zod";

export const savedLetterNoteSchema = z.object({
  privateNote: z
    .string()
    .trim()
    .max(3000, "Private reflection note cannot exceed 3,000 characters")
    .nullable()
    .optional()
    .transform((val) => (val === "" ? null : val ?? null)),
});

export type SavedLetterNoteInput = z.infer<typeof savedLetterNoteSchema>;

export const archiveExportQuerySchema = z.object({
  format: z.enum(["markdown", "json"]).default("markdown"),
});

export type ArchiveExportQueryInput = z.infer<typeof archiveExportQuerySchema>;

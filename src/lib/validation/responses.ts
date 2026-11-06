import { z } from "zod";

export const responseCreateSchema = z.object({
  content: z
    .string()
    .trim()
    .min(3, "Response must contain at least 3 characters")
    .max(1000, "Response cannot exceed 1,000 characters"),
});

export type ResponseCreateInput = z.infer<typeof responseCreateSchema>;

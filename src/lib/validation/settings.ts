import { z } from "zod";

export const deleteAccountSchema = z.object({
  confirmPhrase: z
    .string()
    .trim()
    .refine((val) => val === "ERASE MY SANCTUARY", {
      message: 'You must type "ERASE MY SANCTUARY" to confirm deletion.',
    }),
});

export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;

export const appearancePreferencesSchema = z.object({
  atmosphere: z.enum(["ivory", "dusk", "sepia"]).default("ivory"),
  fontSize: z.enum(["compact", "normal", "large"]).default("normal"),
});

export type AppearancePreferencesInput = z.infer<typeof appearancePreferencesSchema>;

export const notificationPreferencesSchema = z.object({
  notifyOnResponses: z.boolean().default(true),
});

export type NotificationPreferencesInput = z.infer<typeof notificationPreferencesSchema>;

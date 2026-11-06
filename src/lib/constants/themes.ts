export const APPROVED_THEMES = [
  "Love",
  "Longing",
  "Grief",
  "Regret",
  "Forgiveness",
  "Goodbyes",
  "Gratitude",
  "Hope",
  "Unspoken",
] as const;

export type Theme = (typeof APPROVED_THEMES)[number];

/**
 * Validates if a string matches one of the approved editorial themes (case-insensitive).
 */
export function isValidTheme(theme: string): boolean {
  if (!theme || typeof theme !== "string") return false;
  return APPROVED_THEMES.some((t) => t.toLowerCase() === theme.trim().toLowerCase());
}

/**
 * Normalizes a theme string to its canonical casing (e.g. "grief" -> "Grief").
 */
export function normalizeTheme(theme: string): Theme | null {
  if (!theme || typeof theme !== "string") return null;
  const match = APPROVED_THEMES.find((t) => t.toLowerCase() === theme.trim().toLowerCase());
  return match ?? null;
}

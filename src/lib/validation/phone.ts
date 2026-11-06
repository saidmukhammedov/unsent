/**
 * Normalizes phone numbers to standard E.164 format.
 * Examples:
 *  - "+1 (555) 234-5678" -> "+15552345678"
 *  - "555-234-5678" -> "+15552345678" (assumes +1 if 10 digits)
 *  - "+44 7911 123456" -> "+447911123456"
 *  - "15552345678" -> "+15552345678"
 */
export function normalizePhoneNumber(raw: string): string | null {
  if (!raw || typeof raw !== "string") return null;

  const trimmed = raw.trim();
  // Strip formatting: spaces, hyphens, parentheses, dots
  const stripped = trimmed.replace(/[\s\-\(\)\.]/g, "");

  if (stripped.startsWith("+")) {
    const digitsOnly = stripped.slice(1);
    if (!/^\d{7,15}$/.test(digitsOnly)) return null;
    return `+${digitsOnly}`;
  }

  // If starts with digits only
  if (!/^\d+$/.test(stripped)) return null;

  // 10 digits (Standard North America without country code) -> prepend +1
  if (stripped.length === 10) {
    return `+1${stripped}`;
  }

  // 11 digits starting with 1 -> prepend +
  if (stripped.length === 11 && stripped.startsWith("1")) {
    return `+${stripped}`;
  }

  // International 8 to 15 digits without leading + -> prepend +
  if (stripped.length >= 8 && stripped.length <= 15) {
    return `+${stripped}`;
  }

  return null;
}

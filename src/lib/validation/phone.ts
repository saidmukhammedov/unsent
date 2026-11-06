/**
 * Normalizes international phone numbers to standard E.164 format (+<country_code><digits>).
 *
 * Supported formats:
 *  - Uzbekistan (+998):
 *      "+998 90 123 45 67" -> "+998901234567"
 *      "+998 (91) 987-65-43" -> "+998919876543"
 *      "998901234567" -> "+998901234567"
 *      "00998901234567" -> "+998901234567"
 *  - International numbers with leading '+':
 *      "+1 (555) 234-5678" -> "+15552345678"
 *      "+44 7911 123456" -> "+447911123456"
 *      "+49 170 1234567" -> "+491701234567"
 *      "+81 90 1234 5678" -> "+819012345678"
 *  - International numbers with leading '00' (ITU international call prefix):
 *      "0015552345678" -> "+15552345678"
 *      "00447911123456" -> "+447911123456"
 *  - North America with country code '1':
 *      "15552345678" -> "+15552345678"
 *
 * Rejection rules:
 *  - Ambiguous 10-digit numbers without country code (e.g. "555-234-5678") are rejected.
 *    We never silently assume an unadorned number belongs to the United States.
 *  - Ambiguous 9-digit numbers without country code (e.g. "901234567") are rejected.
 *  - Numbers starting with '0' as country code (e.g. "+0123456789") are rejected.
 *  - Strings with alphabetic or non-formatting characters are rejected.
 *  - Numbers outside E.164 length constraints (7 to 15 digits) are rejected.
 */
export function normalizePhoneNumber(raw: string): string | null {
  if (!raw || typeof raw !== "string") return null;

  const trimmed = raw.trim();
  // Strip formatting characters: spaces, hyphens, parentheses, dots
  const stripped = trimmed.replace(/[\s\-\(\)\.]/g, "");

  // 1. Explicit '+' international format
  if (stripped.startsWith("+")) {
    const digitsOnly = stripped.slice(1);
    // E.164: country code starts with 1-9, total digits 7 to 15
    if (!/^[1-9]\d{6,14}$/.test(digitsOnly)) return null;
    return `+${digitsOnly}`;
  }

  // 2. '00' international prefix (ITU standard)
  if (stripped.startsWith("00")) {
    const digitsOnly = stripped.slice(2);
    if (!/^[1-9]\d{6,14}$/.test(digitsOnly)) return null;
    return `+${digitsOnly}`;
  }

  // Digits-only checks from here
  if (!/^\d+$/.test(stripped)) return null;

  // 3. Uzbekistan: 12 digits starting with country code 998 (e.g. 998901234567)
  if (stripped.length === 12 && stripped.startsWith("998")) {
    return `+${stripped}`;
  }

  // 4. North American Numbering Plan: 11 digits starting with country code 1 (e.g. 15552345678)
  if (stripped.length === 11 && stripped.startsWith("1")) {
    return `+${stripped}`;
  }

  // 5. Ambiguous numbers without explicit country codes are rejected
  return null;
}

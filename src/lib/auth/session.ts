import crypto from "crypto";

export const SESSION_COOKIE_NAME = "unsent_session";
export const RECOVERY_COOKIE_NAME = "unsent_rk_hint";

/**
 * Derives a secure SHA-256 hash of a session token for storage.
 * Ensures the plaintext token stored in cookies cannot be retrieved
 * directly from database read compromises.
 */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Generates a high-entropy random token for sessions and recovery keys.
 */
export function generateSecureToken(byteLength = 32): string {
  return crypto.randomBytes(byteLength).toString("base64url");
}

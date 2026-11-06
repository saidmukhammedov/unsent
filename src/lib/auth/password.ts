import argon2 from "argon2";

/**
 * Validates password strength according to UNSENT security policies:
 * - Minimum 8 characters
 * - Maximum 128 characters
 * - At least one letter
 * - At least one number
 */
export function validatePasswordStrength(password: string): { isValid: boolean; error?: string } {
  if (!password || typeof password !== "string") {
    return { isValid: false, error: "Password is required." };
  }
  if (password.length < 8) {
    return { isValid: false, error: "Password must be at least 8 characters long." };
  }
  if (password.length > 128) {
    return { isValid: false, error: "Password must be at most 128 characters long." };
  }
  if (!/[a-zA-Z]/.test(password)) {
    return { isValid: false, error: "Password must contain at least one letter." };
  }
  if (!/[0-9]/.test(password)) {
    return { isValid: false, error: "Password must contain at least one number." };
  }
  return { isValid: true };
}

/**
 * Hashes a plaintext password using Argon2id with memory-hard parameters.
 */
export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536, // 64 MB
    timeCost: 3,
    parallelism: 4,
  });
}

/**
 * Verifies a plaintext password against an Argon2id hash.
 * Returns false on malformed hashes or verification errors safely.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (!password || !hash) return false;
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

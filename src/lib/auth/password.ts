import argon2 from "argon2";

/**
 * Concurrency Limiter for Argon2id Operations
 * Each Argon2id operation allocates 64 MB of RAM and utilizes 4 CPU threads.
 * To prevent Out-Of-Memory (OOM) crashes and thread starvation during burst traffic on Cloud Run,
 * we strictly throttle concurrent Argon2 computations per container instance to a maximum of 4.
 * Excess requests wait in a FIFO queue.
 */
const MAX_CONCURRENT_ARGON2_OPERATIONS = 4;
let activeArgon2Operations = 0;
const argon2Queue: Array<() => void> = [];

async function acquireArgon2Slot(): Promise<() => void> {
  if (activeArgon2Operations < MAX_CONCURRENT_ARGON2_OPERATIONS) {
    activeArgon2Operations++;
    let released = false;
    return () => {
      if (!released) {
        released = true;
        activeArgon2Operations--;
        const next = argon2Queue.shift();
        if (next) next();
      }
    };
  }

  return new Promise((resolve) => {
    argon2Queue.push(() => {
      activeArgon2Operations++;
      let released = false;
      resolve(() => {
        if (!released) {
          released = true;
          activeArgon2Operations--;
          const next = argon2Queue.shift();
          if (next) next();
        }
      });
    });
  });
}

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
 * Throttled through the concurrency limiter to preserve Cloud Run container stability.
 */
export async function hashPassword(password: string): Promise<string> {
  const release = await acquireArgon2Slot();
  try {
    return await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536, // 64 MB
      timeCost: 3,
      parallelism: 4,
    });
  } finally {
    release();
  }
}

/**
 * Verifies a plaintext password against an Argon2id hash.
 * Throttled through the concurrency limiter to preserve Cloud Run container stability.
 * Returns false on malformed hashes or verification errors safely.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (!password || !hash) return false;
  const release = await acquireArgon2Slot();
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  } finally {
    release();
  }
}

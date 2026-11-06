import argon2 from "argon2";

export class Argon2OverloadError extends Error {
  constructor(message = "Authentication service is experiencing heavy load. Please retry shortly.") {
    super(message);
    this.name = "Argon2OverloadError";
  }
}

export class Argon2TimeoutError extends Error {
  constructor(message = "Authentication request timed out waiting for compute capacity.") {
    super(message);
    this.name = "Argon2TimeoutError";
  }
}

/**
 * Concurrency Limiter & Bounded Queue for Argon2id Operations
 *
 * Sizing Justification for 2-vCPU Cloud Run Instance:
 * - Each Argon2id operation uses parallelism=4 (4 CPU threads) and 64 MB RAM.
 * - Running 4 concurrent operations spawns 16 threads competing for 2 vCPUs, causing excessive
 *   context switching, CPU thrashing, and degraded request latencies.
 * - Limiting to MAX_CONCURRENT_ARGON2_OPERATIONS = 2 yields 8 threads (4 per vCPU core),
 *   optimally saturating compute without thrashing.
 * - Peak RAM consumption is bounded at 2 * 64 MB = 128 MB (out of 2048 MB allocated).
 * - The waiting queue is strictly bounded to MAX_ARGON2_QUEUE_SIZE = 10 with a 5000ms timeout
 *   to prevent unbounded memory accumulation or indefinite connection stalls under burst traffic.
 */
export const MAX_CONCURRENT_ARGON2_OPERATIONS = 2;
export const MAX_ARGON2_QUEUE_SIZE = 10;
export const ARGON2_QUEUE_TIMEOUT_MS = 5_000;

let activeArgon2Operations = 0;

interface QueuedItem {
  resolve: (release: () => void) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

const argon2Queue: QueuedItem[] = [];

export function getArgon2QueueMetrics(): {
  active: number;
  queued: number;
  maxConcurrent: number;
  maxQueue: number;
} {
  return {
    active: activeArgon2Operations,
    queued: argon2Queue.length,
    maxConcurrent: MAX_CONCURRENT_ARGON2_OPERATIONS,
    maxQueue: MAX_ARGON2_QUEUE_SIZE,
  };
}

/**
 * Creates a slot-release callback that safely decrements the active count
 * and pumps the next waiting request from the queue.
 */
function createReleaseFunction(): () => void {
  let released = false;
  return () => {
    if (!released) {
      released = true;
      activeArgon2Operations--;
      pumpQueue();
    }
  };
}

/**
 * Processes the next waiting item in the FIFO queue if capacity is available.
 */
function pumpQueue(): void {
  while (activeArgon2Operations < MAX_CONCURRENT_ARGON2_OPERATIONS && argon2Queue.length > 0) {
    const nextItem = argon2Queue.shift();
    if (!nextItem) break;

    clearTimeout(nextItem.timer);
    activeArgon2Operations++;
    const release = createReleaseFunction();
    nextItem.resolve(release);
  }
}

async function acquireArgon2Slot(): Promise<() => void> {
  // If capacity is available immediately, acquire slot
  if (activeArgon2Operations < MAX_CONCURRENT_ARGON2_OPERATIONS) {
    activeArgon2Operations++;
    return createReleaseFunction();
  }

  // If queue is full, immediately reject with overload error
  if (argon2Queue.length >= MAX_ARGON2_QUEUE_SIZE) {
    throw new Argon2OverloadError(
      `Argon2 compute queue is at maximum capacity (${MAX_ARGON2_QUEUE_SIZE} waiting). Rejecting excess load.`
    );
  }

  // Queue the request with a timeout
  return new Promise<() => void>((resolve, reject) => {
    const queuedItem: QueuedItem = {
      resolve,
      reject,
      timer: setTimeout(() => {
        // Remove item from queue if still waiting
        const index = argon2Queue.indexOf(queuedItem);
        if (index !== -1) {
          argon2Queue.splice(index, 1);
        }
        reject(new Argon2TimeoutError(`Timed out waiting for Argon2 compute slot after ${ARGON2_QUEUE_TIMEOUT_MS}ms.`));
      }, ARGON2_QUEUE_TIMEOUT_MS),
    };

    argon2Queue.push(queuedItem);
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
 * Throttled through the concurrency limiter and bounded queue.
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
 * Throttled through the concurrency limiter and bounded queue.
 * Returns false on malformed hashes, rethrows overload/timeout errors.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (!password || !hash) return false;
  const release = await acquireArgon2Slot();
  try {
    return await argon2.verify(hash, password);
  } catch (err) {
    // If it's an overload or timeout error, rethrow so callers can respond with 503
    if (err instanceof Argon2OverloadError || err instanceof Argon2TimeoutError) {
      throw err;
    }
    return false;
  } finally {
    release();
  }
}

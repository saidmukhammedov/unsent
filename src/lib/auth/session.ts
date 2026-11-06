import crypto from "crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { generateUnsentId } from "./identity";
import { generateRecoveryKey, hashSecret, verifySecret, parseRecoveryKey } from "./crypto";
import type { AuthenticatedUser } from "@/types/domain";

export const SESSION_COOKIE_NAME = "unsent_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

/**
 * Derives a SHA-256 hash of a session token for secure database storage.
 */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Generates high-entropy random bytes formatted as base64url.
 */
export function generateSecureToken(byteLength = 32): string {
  return crypto.randomBytes(byteLength).toString("base64url");
}

/**
 * Reads the current session from incoming HTTP-only cookies and verifies it in the database.
 */
export async function getCurrentSession(): Promise<{
  user: AuthenticatedUser;
  tokenHash: string;
} | null> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionToken || sessionToken.length < 16) {
    return null;
  }

  const tokenHash = hashToken(sessionToken);

  const session = await db.session.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!session || session.expiresAt <= new Date()) {
    return null;
  }

  return {
    user: {
      id: session.user.id,
      unsentId: session.user.unsentId,
      accountType: session.user.accountType,
      phone: session.user.phone,
      phoneVerifiedAt: session.user.phoneVerifiedAt,
      createdAt: session.user.createdAt,
    },
    tokenHash: session.tokenHash,
  };
}

/**
 * Creates a brand new anonymous identity and sets the persistent HTTP-only session cookie.
 * Returns the created user and the plain Recovery Key (shown to the user ONCE).
 */
export async function createAnonymousSession(): Promise<{
  user: AuthenticatedUser;
  newRecoveryKey: string;
}> {
  const unsentId = generateUnsentId();
  const { recoveryKey, recoveryTokenId } = generateRecoveryKey();
  const recoveryKeyHash = await hashSecret(recoveryKey);

  const user = await db.user.create({
    data: {
      unsentId,
      accountType: "ANONYMOUS",
      recoveryTokenId,
      recoveryKeyHash,
    },
  });

  const sessionToken = generateSecureToken(32);
  const tokenHash = hashToken(sessionToken);
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE * 1000);

  await db.session.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt,
    },
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });

  return {
    user: {
      id: user.id,
      unsentId: user.unsentId,
      accountType: user.accountType,
      phone: user.phone,
      phoneVerifiedAt: user.phoneVerifiedAt,
      createdAt: user.createdAt,
    },
    newRecoveryKey: recoveryKey,
  };
}

/**
 * Ensures an active identity exists. If an existing valid session is found, it is returned.
 * If not, a new anonymous identity is bootstrapped.
 */
export async function ensureSession(): Promise<{
  user: AuthenticatedUser;
  newRecoveryKey?: string;
}> {
  const current = await getCurrentSession();
  if (current) {
    return { user: current.user };
  }

  return await createAnonymousSession();
}

/**
 * Restores an existing identity using an entered recovery credential.
 */
export async function restoreSessionWithRecoveryKey(rawKey: string): Promise<{
  success: boolean;
  user?: AuthenticatedUser;
  error?: string;
}> {
  const parsed = parseRecoveryKey(rawKey);
  if (!parsed) {
    return { success: false, error: "The format of this recovery key is invalid. Expected format: REC-XXXXXXXX-..." };
  }

  const user = await db.user.findUnique({
    where: { recoveryTokenId: parsed.recoveryTokenId },
  });

  if (!user) {
    return { success: false, error: "No identity matches this recovery credential." };
  }

  const isValid = await verifySecret(parsed.secret, user.recoveryKeyHash);
  if (!isValid) {
    return { success: false, error: "Invalid recovery credential." };
  }

  // Invalidate any existing sessions for this user to ensure single-device / fresh session security
  await db.session.deleteMany({
    where: { userId: user.id },
  });

  // Issue new session
  const sessionToken = generateSecureToken(32);
  const tokenHash = hashToken(sessionToken);
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE * 1000);

  await db.session.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt,
    },
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });

  return {
    success: true,
    user: {
      id: user.id,
      unsentId: user.unsentId,
      accountType: user.accountType,
      phone: user.phone,
      phoneVerifiedAt: user.phoneVerifiedAt,
      createdAt: user.createdAt,
    },
  };
}

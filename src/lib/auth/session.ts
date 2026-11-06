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
      role: session.user.role,
      phone: session.user.phone,
      phoneVerifiedAt: session.user.phoneVerifiedAt,
      createdAt: session.user.createdAt,
    },
    tokenHash: session.tokenHash,
  };
}

/**
 * Issues a new active session for a specific user ID and writes the persistent HTTP-only cookie.
 */
export async function createSessionForUser(userId: string): Promise<string> {
  const sessionToken = generateSecureToken(32);
  const tokenHash = hashToken(sessionToken);
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE * 1000);

  await db.session.create({
    data: {
      userId,
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

  return sessionToken;
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

  await createSessionForUser(user.id);

  return {
    user: {
      id: user.id,
      unsentId: user.unsentId,
      accountType: user.accountType,
      role: user.role,
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
  await createSessionForUser(user.id);

  return {
    success: true,
    user: {
      id: user.id,
      unsentId: user.unsentId,
      accountType: user.accountType,
      role: user.role,
      phone: user.phone,
      phoneVerifiedAt: user.phoneVerifiedAt,
      createdAt: user.createdAt,
    },
  };
}

/**
 * Terminates the current active session and clears the session cookie.
 */
export async function terminateCurrentSession(): Promise<boolean> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (sessionToken) {
    const tokenHash = hashToken(sessionToken);
    await db.session.deleteMany({
      where: { tokenHash },
    });
  }

  cookieStore.delete(SESSION_COOKIE_NAME);
  return true;
}

/**
 * Invalidates all other active sessions for the current identity while preserving the current one.
 */
export async function invalidateOtherSessions(): Promise<{ count: number }> {
  const current = await getCurrentSession();
  if (!current) {
    throw new Error("Unauthorized");
  }

  const result = await db.session.deleteMany({
    where: {
      userId: current.user.id,
      NOT: { tokenHash: current.tokenHash },
    },
  });

  return { count: result.count };
}

/**
 * Retrieves session stats for the authenticated identity.
 */
export async function getActiveSessions(): Promise<{
  totalCount: number;
  currentSessionCreatedAt: Date;
  otherSessionsCount: number;
}> {
  const current = await getCurrentSession();
  if (!current) {
    throw new Error("Unauthorized");
  }

  const sessions = await db.session.findMany({
    where: { userId: current.user.id },
    orderBy: { createdAt: "desc" },
  });

  const currentSession = sessions.find((s) => s.tokenHash === current.tokenHash);

  return {
    totalCount: sessions.length,
    currentSessionCreatedAt: currentSession?.createdAt || current.user.createdAt,
    otherSessionsCount: Math.max(0, sessions.length - 1),
  };
}

/**
 * Deliberately erases an identity and its private data.
 * - Permanently erases private letters, personal notes, saved letters, reflection notes, and notifications.
 * - Permanently severs ownership of published Orbit letters and responses (sets authorId = null).
 * - Erases sessions, credentials, and user record.
 * - Clears session cookie.
 */
export async function deleteAccountAndData(userId: string): Promise<void> {
  // 1. Permanently delete private letters
  await db.letter.deleteMany({
    where: {
      authorId: userId,
      visibility: "PRIVATE",
    },
  });

  // 2. Permanently delete personal notes
  await db.letter.deleteMany({
    where: {
      authorId: userId,
      entryType: "NOTE",
    },
  });

  // 3. Permanently delete saved letters and reflections
  await db.savedLetter.deleteMany({
    where: { userId },
  });

  // 4. Permanently delete notifications
  await db.notification.deleteMany({
    where: { userId },
  });

  // 5. Permanently delete reports filed by user
  await db.report.deleteMany({
    where: { reporterId: userId },
  });

  // 6. For published Orbit letters and responses: orphan them cleanly
  await db.letter.updateMany({
    where: {
      authorId: userId,
      visibility: "PUBLIC",
    },
    data: {
      authorId: null,
    },
  });

  // 7. Delete all sessions
  await db.session.deleteMany({
    where: { userId },
  });

  // 8. Delete user record
  await db.user.delete({
    where: { id: userId },
  });

  // 9. Clear session cookie
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

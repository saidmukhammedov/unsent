import { headers } from "next/headers";
import { getCurrentSession } from "./session";
import type { AuthenticatedUser } from "@/types/domain";

export interface ModeratorAuthResult {
  authorized: boolean;
  user?: AuthenticatedUser;
  error?: string;
  statusCode?: number;
}

/**
 * Verifies that the current request is performed by an authorized moderator.
 *
 * Supported authorization methods:
 * 1. Active session where User.role is "MODERATOR" or "ADMIN".
 * 2. Active session whose unsentId is listed in MODERATOR_UNSENT_IDS env var.
 * 3. Server-side API token passed via `x-moderator-token` or `Authorization: Bearer <token>`
 *    matching the configured MODERATOR_TOKEN env var.
 */
export async function verifyModerator(): Promise<ModeratorAuthResult> {
  const reqHeaders = await headers();
  const authHeader = reqHeaders.get("authorization");
  const modTokenHeader = reqHeaders.get("x-moderator-token");

  // 1. Programmatic token authentication (for automated testing or admin scripts)
  const configuredToken = process.env.MODERATOR_TOKEN;
  if (configuredToken && configuredToken.trim().length > 0) {
    if (modTokenHeader === configuredToken.trim()) {
      return {
        authorized: true,
        user: {
          id: "00000000-0000-0000-0000-000000000000",
          unsentId: "@moderator_system",
          accountType: "REGISTERED",
          role: "ADMIN",
          createdAt: new Date(),
        },
      };
    }

    if (authHeader && authHeader.startsWith("Bearer ")) {
      const bearer = authHeader.slice(7).trim();
      if (bearer === configuredToken.trim()) {
        return {
          authorized: true,
          user: {
            id: "00000000-0000-0000-0000-000000000000",
            unsentId: "@moderator_system",
            accountType: "REGISTERED",
            role: "ADMIN",
            createdAt: new Date(),
          },
        };
      }
    }
  }

  // 2. Session-based authentication
  const session = await getCurrentSession();
  if (!session) {
    return {
      authorized: false,
      statusCode: 401,
      error: "Authentication required to access moderation tools.",
    };
  }

  // Check role in database
  if (session.user.role === "MODERATOR" || session.user.role === "ADMIN") {
    return {
      authorized: true,
      user: session.user,
    };
  }

  // Check MODERATOR_UNSENT_IDS environment variable
  const allowedIds = process.env.MODERATOR_UNSENT_IDS;
  if (allowedIds) {
    const list = allowedIds.split(",").map((s) => s.trim().toLowerCase());
    if (list.includes(session.user.unsentId.toLowerCase())) {
      return {
        authorized: true,
        user: session.user,
      };
    }
  }

  return {
    authorized: false,
    statusCode: 403,
    error: "Access denied. You do not have moderator privileges.",
  };
}

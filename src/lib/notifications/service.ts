import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export interface ResponseNotificationPayload {
  responseId: string;
  preview: string;
  recipientName?: string | null;
  letterTitle?: string | null;
  createdAt: string;
}

/**
 * Creates a notification for the original letter's author when an approved response is published.
 * Ensures:
 * 1. The original author exists.
 * 2. The responder is not notifying themselves.
 * 3. Duplicate notifications for the same response are prevented.
 */
export async function notifyAuthorOfResponse(params: {
  originalLetterId: string;
  responseId: string;
  responseContent: string;
  responderId: string;
}): Promise<boolean> {
  const { originalLetterId, responseId, responseContent, responderId } = params;

  // Retrieve original letter and its author
  const letter = await db.letter.findUnique({
    where: { id: originalLetterId },
    select: {
      id: true,
      authorId: true,
      title: true,
      recipientName: true,
      visibility: true,
      isModerated: true,
    },
  });

  if (!letter || !letter.authorId) {
    return false;
  }

  // Do not self-notify if author responded to their own letter
  if (letter.authorId === responderId) {
    return false;
  }

  // Database-enforced idempotency key prevents duplicate notifications even under concurrent execution
  const idempotencyKey = `resp_notif:${originalLetterId}:${responseId}`;

  // 1. Fast preliminary check via unique idempotency key
  const existing = await db.notification.findUnique({
    where: { idempotencyKey },
    select: { id: true },
  });

  if (existing) {
    return false; // Already notified for this exact response
  }

  const payload: ResponseNotificationPayload = {
    responseId,
    preview: responseContent.length > 120 ? `${responseContent.slice(0, 117)}...` : responseContent,
    recipientName: letter.recipientName,
    letterTitle: letter.title,
    createdAt: new Date().toISOString(),
  };

  // 2. Database-enforced atomic creation with unique constraint idempotency (P2002 guard)
  try {
    await db.notification.create({
      data: {
        userId: letter.authorId,
        letterId: originalLetterId,
        type: "RESPONSE_RECEIVED",
        idempotencyKey,
        payload: payload as unknown as Prisma.InputJsonValue,
        isRead: false,
      },
    });
    return true;
  } catch (err: unknown) {
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: string }).code === "P2002"
    ) {
      // Race condition safely mitigated: parallel request already created this notification!
      return false;
    }
    throw err;
  }
}

/**
 * Retrieves unread notification count for a user.
 */
export async function getUnreadNotificationCount(userId: string): Promise<number> {
  return await db.notification.count({
    where: {
      userId,
      isRead: false,
    },
  });
}

/**
 * Retrieves paginated notifications for a user.
 */
export async function getUserNotifications(userId: string, limit = 20) {
  return await db.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      type: true,
      letterId: true,
      payload: true,
      isRead: true,
      createdAt: true,
    },
  });
}

/**
 * Marks a single notification as read if owned by the user.
 */
export async function markNotificationAsRead(userId: string, notificationId: string): Promise<boolean> {
  const result = await db.notification.updateMany({
    where: {
      id: notificationId,
      userId,
    },
    data: {
      isRead: true,
    },
  });

  return result.count > 0;
}

/**
 * Marks all notifications as read for a user.
 */
export async function markAllNotificationsAsRead(userId: string): Promise<number> {
  const result = await db.notification.updateMany({
    where: {
      userId,
      isRead: false,
    },
    data: {
      isRead: true,
    },
  });

  return result.count;
}

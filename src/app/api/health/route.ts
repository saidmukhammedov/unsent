import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getRateLimiterStatus } from "@/lib/rate-limit";

export async function GET() {
  const startTime = Date.now();
  let dbStatus = "unknown";
  let isHealthy = true;

  try {
    // 1. Validate database connection pool connectivity
    await db.$queryRaw`SELECT 1`;
    dbStatus = "connected";
  } catch (err) {
    dbStatus = "disconnected";
    isHealthy = false;
    console.error("[HEALTHCHECK_DB_FAILURE] Database connection probe failed:", err);
  }

  // 2. Report rate limiter status
  const rateLimiter = getRateLimiterStatus();

  const responsePayload = {
    status: isHealthy ? "healthy" : "unhealthy",
    timestamp: new Date().toISOString(),
    region: process.env.CLOUD_RUN_REGION || "europe-west3",
    uptimeSeconds: Math.floor(process.uptime()),
    database: dbStatus,
    rateLimiter: rateLimiter.backend,
    latencyMs: Date.now() - startTime,
  };

  return NextResponse.json(responsePayload, {
    status: isHealthy ? 200 : 503,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}

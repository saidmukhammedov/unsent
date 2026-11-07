import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { probeRedisConnectivity } from "@/lib/rate-limit";

export async function GET() {
  const startTime = Date.now();
  let dbStatus: "connected" | "disconnected" = "disconnected";
  let isHealthy = true;

  // 1. Validate database connection pool connectivity with bounded timeout
  try {
    const dbProbe = db.$queryRaw`SELECT 1`;
    let dbTimer: NodeJS.Timeout;
    const dbTimeout = new Promise<never>((_, reject) => {
      dbTimer = setTimeout(() => reject(new Error("DB_TIMEOUT")), 2000);
    });

    await Promise.race([dbProbe, dbTimeout]);
    clearTimeout(dbTimer!);
    dbStatus = "connected";
  } catch (err) {
    dbStatus = "disconnected";
    isHealthy = false;
    console.error("[HEALTHCHECK_DB_FAILURE] Database connection probe failed:", err instanceof Error ? err.message : "Error");
  }

  // 2. Perform bounded-time Redis connectivity probe
  const redisProbe = await probeRedisConnectivity(2000);
  const isProd = process.env.NODE_ENV === "production";

  // In production, rate limiting is a strict dependency; if Redis is unreachable or unconfigured,
  // protected routes return 503, so the instance is not ready to serve live traffic.
  if (isProd) {
    if (!redisProbe.configured || !redisProbe.reachable) {
      isHealthy = false;
    }
  } else {
    // In development/test, in-memory rate limiting is an accepted operational mode
    if (!redisProbe.configured && redisProbe.backend === "memory") {
      // Healthy via local memory fallback
    } else if (redisProbe.configured && !redisProbe.reachable) {
      isHealthy = false;
    }
  }

  // 3. Construct sanitized public response payload (no connection strings, keys, or internal diagnostics)
  const responsePayload = {
    status: isHealthy ? "healthy" : "unhealthy",
    timestamp: new Date().toISOString(),
    region: process.env.VERCEL_REGION || process.env.CLOUD_RUN_REGION || "fra1",
    uptimeSeconds: Math.floor(process.uptime()),
    checks: {
      database: dbStatus,
      rateLimiter: {
        backend: redisProbe.backend,
        configured: redisProbe.configured,
        reachable: redisProbe.reachable,
      },
    },
    latencyMs: Date.now() - startTime,
  };

  return NextResponse.json(responsePayload, {
    status: isHealthy ? 200 : 503,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}

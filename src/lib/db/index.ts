import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

// Graceful shutdown handling for Cloud Run SIGTERM / SIGINT signals
if (typeof process !== "undefined") {
  const handleGracefulShutdown = async (signal: string) => {
    try {
      console.log(`[SHUTDOWN] Received ${signal}. Disconnecting Prisma database connections...`);
      await db.$disconnect();
    } catch (err) {
      console.error("[SHUTDOWN_ERROR] Error disconnecting Prisma during shutdown:", err);
    }
  };

  process.once("SIGTERM", () => handleGracefulShutdown("SIGTERM"));
  process.once("SIGINT", () => handleGracefulShutdown("SIGINT"));
}

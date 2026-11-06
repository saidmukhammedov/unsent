/**
 * Next.js Instrumentation Hook
 * Executes at server startup before handling incoming HTTP requests.
 * Ensures the production environment configuration is strictly validated.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateEnvironment } = await import("@/lib/env");
    console.log("[STARTUP] Running startup environment validation...");
    validateEnvironment();
    console.log("[STARTUP] Environment validation succeeded.");
  }
}

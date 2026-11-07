import { z } from "zod";

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DIRECT_URL: z.string().optional(),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  MODERATOR_TOKEN: z.string().min(16, "MODERATOR_TOKEN must be at least 16 characters"),
  UPSTASH_REDIS_REST_URL: z.string().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  RATE_LIMIT_LOG_SECRET: z.string().optional(),
  PORT: z.string().optional().default("8080"),
  CLOUD_RUN_REGION: z.string().optional().default("europe-west3"),
  VERCEL_REGION: z.string().optional(),
});

export type ValidatedEnv = z.infer<typeof envSchema>;

let cachedEnv: ValidatedEnv | null = null;

export function resetCachedEnv(): void {
  cachedEnv = null;
}

/**
 * Validates critical environment variables at startup.
 * In production mode, enforces that all required secrets (including Upstash Redis and Direct database URL)
 * are populated and meet security criteria.
 *
 * @param envSource Optional environment source (defaults to process.env)
 * @param isRuntimeValidation If true, enforces production secrets even during builds
 */
export function validateEnvironment(
  envSource: Record<string, string | undefined> = process.env,
  isRuntimeValidation: boolean = true
): ValidatedEnv {
  if (cachedEnv && envSource === process.env) return cachedEnv;

  const parsed = envSchema.safeParse(envSource);

  if (!parsed.success) {
    const errorDetails = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    const msg = `[CRITICAL_ENV_VALIDATION_ERROR] Environment configuration is invalid:\n${errorDetails}`;
    console.error(msg);
    throw new Error(msg);
  }

  const env = parsed.data;

  // Strict production assertions
  const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
  if (env.NODE_ENV === "production" && (isRuntimeValidation || !isBuildPhase)) {
    const missingProductionVars: string[] = [];
    if (!env.DIRECT_URL || env.DIRECT_URL.trim() === "") missingProductionVars.push("DIRECT_URL");
    if (!env.UPSTASH_REDIS_REST_URL || env.UPSTASH_REDIS_REST_URL.trim() === "") missingProductionVars.push("UPSTASH_REDIS_REST_URL");
    if (!env.UPSTASH_REDIS_REST_TOKEN || env.UPSTASH_REDIS_REST_TOKEN.trim() === "") missingProductionVars.push("UPSTASH_REDIS_REST_TOKEN");
    if (!env.RATE_LIMIT_LOG_SECRET || env.RATE_LIMIT_LOG_SECRET.trim().length < 32) missingProductionVars.push("RATE_LIMIT_LOG_SECRET (min 32 characters / 32 bytes entropy)");

    if (missingProductionVars.length > 0) {
      const msg = `[CRITICAL_ENV_VALIDATION_ERROR] The following required production environment variables are missing: ${missingProductionVars.join(", ")}`;
      console.error(msg);
      throw new Error(msg);
    }
  }

  if (envSource === process.env) {
    cachedEnv = env;
  }
  return env;
}

import { z } from "zod";

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DIRECT_URL: z.string().optional(),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  MODERATOR_TOKEN: z.string().min(16, "MODERATOR_TOKEN must be at least 16 characters"),
  UPSTASH_REDIS_REST_URL: z.string().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  PORT: z.string().optional().default("8080"),
  CLOUD_RUN_REGION: z.string().optional().default("europe-west3"),
});

export type ValidatedEnv = z.infer<typeof envSchema>;

let cachedEnv: ValidatedEnv | null = null;

/**
 * Validates critical environment variables at startup.
 * In production mode, enforces that all required secrets (including Upstash Redis and Direct database URL)
 * are populated and meet security criteria.
 */
export function validateEnvironment(): ValidatedEnv {
  if (cachedEnv) return cachedEnv;

  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const errorDetails = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    console.error(`[CRITICAL_ENV_VALIDATION_ERROR] Environment configuration is invalid:\n${errorDetails}`);
    throw new Error(`Invalid environment configuration:\n${errorDetails}`);
  }

  const env = parsed.data;

  // Strict production assertions
  if (env.NODE_ENV === "production") {
    const missingProductionVars: string[] = [];
    if (!env.DIRECT_URL) missingProductionVars.push("DIRECT_URL");
    if (!env.UPSTASH_REDIS_REST_URL) missingProductionVars.push("UPSTASH_REDIS_REST_URL");
    if (!env.UPSTASH_REDIS_REST_TOKEN) missingProductionVars.push("UPSTASH_REDIS_REST_TOKEN");

    if (missingProductionVars.length > 0) {
      const msg = `[CRITICAL_ENV_VALIDATION_ERROR] The following required production environment variables are missing: ${missingProductionVars.join(", ")}`;
      console.error(msg);
      throw new Error(msg);
    }
  }

  cachedEnv = env;
  return env;
}

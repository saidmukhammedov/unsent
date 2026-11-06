# ==============================================================================
# UNSENT — Production Multi-Stage Dockerfile for Google Cloud Run
# Architecture: Node.js 22 LTS / Debian Slim / Standalone Next.js
# Region: europe-west3 (Frankfurt)
# ==============================================================================

# ------------------------------------------------------------------------------
# Stage 1: Dependency Installation & Native Binary Compilation
# ------------------------------------------------------------------------------
FROM node:22-slim AS deps
WORKDIR /app

# Install native compilation dependencies for Argon2 (C++ / node-gyp) & OpenSSL for Prisma
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    gcc \
    openssl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Enable and pin pnpm version matching repository packageManager
RUN corepack enable && corepack prepare pnpm@12.15.0 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ------------------------------------------------------------------------------
# Stage 2: Application Build
# ------------------------------------------------------------------------------
FROM node:22-slim AS builder
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@12.15.0 --activate

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma Client code
ENV PRISMA_CLI_QUERY_ENGINE_TYPE="binary"
ENV PRISMA_CLIENT_ENGINE_TYPE="binary"
RUN pnpm prisma generate

# Build Next.js application in standalone mode
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
RUN pnpm build

# ------------------------------------------------------------------------------
# Stage 3: Production Minimal Runner
# ------------------------------------------------------------------------------
FROM node:22-slim AS runner
WORKDIR /app

# Production environment defaults
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=8080
ENV HOSTNAME="0.0.0.0"

# Install OpenSSL runtime required by Prisma Client engine
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create dedicated non-root system group and user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy static assets and public directory
COPY --from=builder /app/public ./public

# Copy standalone output from Next.js build
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy Prisma schema and migrations (for runtime schema reflection & migration tasks)
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json

USER nextjs

EXPOSE 8080

# Health check probe for local container testing
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:8080/api/health || exit 1

CMD ["node", "server.js"]

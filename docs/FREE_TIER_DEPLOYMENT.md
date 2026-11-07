# UNSENT — Strict $0 Free-Tier Production Deployment Guide

**Approved Production Architecture:** Vercel Hobby + Neon Serverless PostgreSQL Free + Upstash Redis Free  
**Deployment Cost:** Exactly **$0.00** — No credit cards, no paid upgrades, no usage-based billing, no surprise fees.  
**Target Region:** Frankfurt (`fra1` / `eu-central-1`)  
**Runtime:** Native Next.js 16 Serverless on Vercel Node.js 22 LTS  
**Security Standard:** Zero-Trust, Encrypted Identifiers, Native Argon2id, Ephemeral Anonymous Sessions, Fail-Closed Distributed Rate Limiting.

---

> [!IMPORTANT]
> **Strict Non-Commercial License Requirement (Vercel Hobby):**  
> Vercel's Hobby plan is legally restricted to **personal, educational, and non-commercial projects**. UNSENT is designed and deployed under this tier strictly as a free, public literary sanctuary. Commercial monetization, paid subscriptions, commercial sponsorships, or business use are strictly prohibited under the Vercel Hobby Terms of Service unless formally migrated to a paid plan.

---

## 1. Architectural Overview & Free-Tier Limits

To guarantee that UNSENT operates permanently without incurring any financial charges, all infrastructure is strictly mapped to genuinely free tiers that do not require credit card entry or permit automatic paid overages.

```mermaid
flowchart TD
    Client["Visitor / Reader Browser"] -->|"HTTPS / Secure Cookies"| VercelEdge["Vercel Edge Network (fra1)"]
    VercelEdge --> VercelFunc["Vercel Serverless Functions (Next.js 16 / Node 22)"]
    
    subgraph Frankfurt [Europe - Frankfurt Region]
        VercelFunc -->|"HTTPS REST (Rate Limiting)"| Upstash["Upstash Redis Free (eu-central-1)<br>500k commands/mo | 256 MB RAM | 10 GB Bandwidth"]
        VercelFunc -->|"Pooled TLS :6543 (PgBouncer)"| NeonPool["Neon PostgreSQL Free (aws-eu-central-1)<br>1 GB Storage | 100 CU-hrs/mo | 5 GB Egress"]
        NeonPool --> NeonStorage[("PostgreSQL Storage Engine")]
    end
    
    DevMachine["Developer Workstation"] -.->|"Direct TLS :5432 (prisma migrate deploy)"| NeonStorage
```

### Free-Tier Capacity Matrix

| Component | Provider & Plan | Cost | Hard Quota & Service Limits | Over-Quota Behavior |
| :--- | :--- | :--- | :--- | :--- |
| **Web & API Hosting** | **Vercel Hobby** | $0 / mo | • **1,000,000 (1M)** Serverless Function Invocations / mo<br>• **100 GB** Fast Data Transfer / mo<br>• **1024 MB** RAM per function<br>• **10s** default timeout (max 60s)<br>• **Strictly personal / non-commercial use only** | Requests throttled or HTTP 402/503 returned. Invocations pause until monthly cycle reset. Usage limits cannot be bypassed by charging; never automatically upgrades or charges overages. Traffic availability is not guaranteed once limits are exhausted. |
| **Database** | **Neon Free Tier** | $0 / mo | • **1.0 GB** PostgreSQL data storage per project<br>• **100 Compute Unit (CU) hours** / mo per project<br>• **5 GB** monthly public network transfer (egress)<br>• **1 project**, up to 10 branches<br>• **6-hour** instant restore history (PITR)<br>• **Scale-to-zero** after 5 min idle | • **Storage (1 GB exceeded):** Neon rejects writes (`INSERT`, `UPDATE`, `CREATE TABLE`) with a storage limit/disk full error; existing data remains readable.<br>• **Compute (100 CU-hrs exhausted):** Compute endpoint is suspended until next monthly billing cycle; connections fail (HTTP 500/503).<br>• **Bandwidth (5 GB exceeded):** Network egress is throttled or suspended. |
| **Rate Limiter** | **Upstash Redis Free** | $0 / mo | • **500,000** commands / month (no daily cap)<br>• **256 MB** maximum database size<br>• **10 GB** monthly bandwidth<br>• **1 free database**<br>• Max 1000 concurrent connections | Commands rejected with `ERR max monthly request limit exceeded...`. UNSENT catches the error and **fails closed** (returns HTTP 503 `SERVICE_UNAVAILABLE`). Protected operations (submit, login, register, report) are refused to prevent abuse. No overage charges. Quota resets on the 1st of the next calendar month. |
| **Domain** | **Vercel Subdomain** | $0 / mo | • Included `*.vercel.app` domain with automated SSL / TLS termination | N/A — Free and permanent. |

---

## 2. Compatibility Audit & Architectural Verification

The codebase has been verified for compatibility with Vercel serverless execution:

1. **Next.js & Standalone Output:**
   - On Vercel, Next.js natively builds and packages serverless function lambdas and edge assets.
   - [`next.config.ts`](file:///C:/Users/hp/.gemini/antigravity/scratch/unsent/next.config.ts) was updated so that `output: "standalone"` is only activated if `BUILD_STANDALONE="true"` is set for custom Docker builds, allowing native Vercel serverless packaging without conflict.
2. **Prisma Client Generation:**
   - [`package.json`](file:///C:/Users/hp/.gemini/antigravity/scratch/unsent/package.json) contains `"postinstall": "prisma generate"`. During Vercel's automated build phase, `@prisma/client` is automatically compiled and pinned to the serverless function layer.
3. **Native Argon2id Password Hashing:**
   - Argon2 v0.45.2 compiles via `node-gyp` during Vercel build or uses Linux glibc prebuilts matching AWS Lambda / Amazon Linux 2023.
   - Argon2id parameters (`m=65536` [64 MB], `t=3`, `p=4`) consume only ~6% of Vercel's 1024 MB serverless function RAM.
   - The semaphore in [`src/lib/auth/password.ts`](file:///C:/Users/hp/.gemini/antigravity/scratch/unsent/src/lib/auth/password.ts) bounds concurrency to 2 simultaneous operations with a queue of 10, preventing CPU context thrashing and timeout stalls.
4. **Session Cookies Behind Vercel Edge Proxy:**
   - Vercel automatically terminates TLS at the edge. The application uses `cookies()` with `httpOnly: true, secure: true, sameSite: "lax", path: "/"`. Sessions remain persistent and secure over `https://*.vercel.app`.
5. **Stateless Operation (Zero Local Filesystem Dependency):**
   - No user content, letters, notes, or sessions are written to the local disk. Everything is persisted in PostgreSQL or Upstash Redis. Archive JSON export is generated in-memory and streamed directly over HTTP.
6. **Neon Scale-to-Zero & Cold Starts:**
   - In Neon Free, compute instances pause after 5 minutes of inactivity. When a new visitor accesses the app, Neon wakes up with a cold-start delay of 500ms to 2000ms. Prisma Client automatically waits for the TCP socket and resumes operations.
7. **Rate Limiter Failure Mode & Fail-Closed Behavior:**
   - [`src/lib/rate-limit.ts`](file:///C:/Users/hp/.gemini/antigravity/scratch/unsent/src/lib/rate-limit.ts) enforces a strict fail-closed policy in production. If Upstash Redis credentials are missing, network connectivity is lost, or the Upstash monthly quota (500k commands) is exhausted, the rate limiter refuses the operation with `status: "service_unavailable", error: "SERVICE_UNAVAILABLE"`, translating to an HTTP 503 response. It never fails open or silently falls back to unshared in-memory state in production.

---

## 3. Step-by-Step Setup Instructions ($0 Cost)

### Step 1: Provision Neon PostgreSQL Free
1. Sign up at [neon.tech](https://neon.tech/) using GitHub or Google (no credit card required).
2. Create a new project:
   - **Name:** `unsent-prod`
   - **Region:** `Europe (Frankfurt) / aws-eu-central-1`
   - **Postgres Version:** 16
3. Navigate to **Dashboard > Connection Details**:
   - Check **Connection Pooling**.
   - Copy the connection string as `DATABASE_URL` (uses port `6543` and `-pooler` host with `?sslmode=require&pgbouncer=true`).
   - Uncheck **Connection Pooling** (or switch to Direct connection).
   - Copy the direct connection string as `DIRECT_URL` (uses port `5432` with `?sslmode=require`).

### Step 2: Provision Upstash Redis Free
1. Sign up at [upstash.com](https://upstash.com/) using GitHub or Google (no credit card required).
2. Click **Create Database**:
   - **Name:** `unsent-ratelimit`
   - **Type:** Regional
   - **Region:** `eu-central-1 (Frankfurt)`
   - **Primary Plan:** Free ($0 — 500,000 commands/month, 256 MB storage)
3. Under the **Details** page, locate **REST API**:
   - Copy `UPSTASH_REDIS_REST_URL`.
   - Copy `UPSTASH_REDIS_REST_TOKEN`.

### Step 3: Configure Vercel Project
1. Sign up or log in at [vercel.com](https://vercel.com/) with GitHub.
2. Click **Add New... > Project** and import repository `saidmukhammedov/unsent`.
3. In **Project Settings**:
   - **Framework Preset:** Next.js
   - **Root Directory:** `./`
   - **Build Command:** `pnpm build` (default)
   - **Install Command:** `pnpm install` (default)
4. Set **Serverless Function Region**:
   - In **Settings > Functions**, set Function Region to **Frankfurt, Germany (`fra1`)** to co-locate compute with Neon and Upstash.

---

## 4. Production Environment Variables Configuration

In **Vercel Project Settings > Environment Variables**, configure the following variables for **Production** and **Preview**:

| Variable Name | Environment | Value / Generation Instructions |
| :--- | :--- | :--- |
| `NODE_ENV` | Production, Preview | `production` |
| `NEXT_PUBLIC_APP_URL` | Production | `https://<your-project-subdomain>.vercel.app` |
| `VERCEL_REGION` | Production, Preview | `fra1` |
| `DATABASE_URL` | Production, Preview | Pooled Neon connection string (`...-pooler...:6543/...`) |
| `DIRECT_URL` | Production, Preview | Direct unpooled Neon connection string (`...:5432/...`) |
| `SESSION_SECRET` | Production, Preview | 64-char random hex string (`openssl rand -hex 32`) |
| `MODERATOR_TOKEN` | Production, Preview | 32+ char secret for programmatic administrative CLI scripts/testing (`openssl rand -hex 24`). Never expose to frontend. |
| `MODERATOR_UNSENT_IDS` | Production, Preview | Comma-separated list of real registered UNSENT IDs (leave empty initially until first steward registers; e.g. `@steward_alex_9f3b`). |
| `RATE_LIMIT_LOG_SECRET` | Production, Preview | 64-char random hex string (`openssl rand -hex 32`) — Min 32 bytes entropy. Keyed HMAC salt. |
| `UPSTASH_REDIS_REST_URL` | Production, Preview | Upstash REST URL from Step 2 |
| `UPSTASH_REDIS_REST_TOKEN`| Production, Preview | Upstash REST Token from Step 2 |

> [!WARNING]
> **No Placeholder Moderator IDs:**  
> Previous references to `@steward_primary,@ops_lead` are purely dummy placeholders. They do not exist in the database and do not grant access to any account. Do not put dummy handles in `MODERATOR_UNSENT_IDS`. See [Section 6](#6-provisioning-the-first-moderator-account-securely) for the secure provisioning procedure.

> [!TIP]
> **Generating Secrets Locally:**
> Generate cryptographic secrets on your local workstation without printing them to shared shell history:
> ```bash
> # Linux / macOS:
> openssl rand -hex 32 | tr -d '\n' | pbcopy   # Copies 64-char hex directly to clipboard
>
> # Windows PowerShell:
> $b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); ([BitConverter]::ToString($b) -replace '-').ToLower() | Set-Clipboard
> ```
> Paste directly into Vercel's Environment Variables dashboard.

---

## 5. Database Migration Execution & Safety Protocol

> [!CAUTION]
> **CRITICAL DATABASE MIGRATION SAFETY NOTICE:**
> - **The claim that `prisma migrate deploy` never drops tables or columns is FALSE.**
>   `prisma migrate deploy` executes the exact, unvetted raw SQL statements contained in pending migration files (`prisma/migrations/*/migration.sql`). If a migration file contains `DROP TABLE`, `DROP COLUMN`, `TRUNCATE`, or destructive type alterations, `prisma migrate deploy` **will execute them unconditionally** and permanently destroy data.
> - **Never run `pnpm prisma db push` against production:** `db push` bypasses version-controlled migration files and attempts to synchronize schema drift directly. If drift exists or `--accept-data-loss` is used, columns, tables, and data are silently truncated or dropped.
> - **Never run `pnpm prisma migrate reset` against production:** `migrate reset` drops the entire database schema, recreates it from scratch, and deletes 100% of user data.
> - **Initial deployment requirement:** The initial deployment must target a newly created, completely empty database. You must verify that no tables exist before applying `0_init`. Applying `0_init` against an existing database will fail or conflict.
> - **Never execute migrations against an unknown or existing database** without inspecting both the database schema and the `_prisma_migrations` history table.

### Pre-Migration Safety Checklist

Before running any migration command against production Neon, complete every item in this checklist:

1. [ ] **Target URL Verification:** Verify that `DIRECT_URL` and `DATABASE_URL` point to the correct production database instance and branch.
2. [ ] **Migration SQL Inspection:** Open every pending file in `prisma/migrations/*/migration.sql`. Review every line. Verify there are no unintentional `DROP TABLE`, `DROP COLUMN`, `TRUNCATE`, or destructive `ALTER` statements.
3. [ ] **Status Inspection (Dry Run):** Run `pnpm prisma migrate status` against `DIRECT_URL` to identify unapplied migrations without executing any DDL.
4. [ ] **Pre-Migration Snapshot:** For any database with existing data, perform an explicit manual snapshot using `pg_dump` before applying changes:
   ```bash
   pg_dump -d "$DIRECT_URL" -F c -b -v -f "unsent_pre_migration_$(date +%Y%m%d_%H%M%S).dump"
   ```
   *(Do not rely exclusively on Neon Free's 6-hour PITR window for disaster recovery).*
5. [ ] **Fresh Database Verification (Initial Setup Only):** If applying `0_init` for the first time, verify that the database is freshly provisioned and completely empty:
   ```sql
   SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
   -- Must return 0 rows
   ```
6. [ ] **Direct Connection Only:** Always apply migrations using the direct port `5432` unpooled connection string (`DIRECT_URL`). Connection poolers (PgBouncer port `6543`) do not support session-level advisory locks required by Prisma Migrate.
7. [ ] **Post-Migration Verification:** After execution, run `pnpm prisma migrate status` to confirm that all migrations are recorded in `_prisma_migrations` with valid checksums and timestamps.

### Migration Execution Commands

From your authenticated developer workstation:

```bash
# Linux / macOS:
DIRECT_URL="postgresql://user:pass@ep-xyz.eu-central-1.aws.neon.tech/unsent?sslmode=require" \
DATABASE_URL="postgresql://user:pass@ep-xyz.eu-central-1.aws.neon.tech/unsent?sslmode=require" \
pnpm prisma migrate deploy
```

On Windows PowerShell:
```powershell
$env:DIRECT_URL="postgresql://user:pass@ep-xyz.eu-central-1.aws.neon.tech/unsent?sslmode=require"
$env:DATABASE_URL="postgresql://user:pass@ep-xyz.eu-central-1.aws.neon.tech/unsent?sslmode=require"
pnpm prisma migrate deploy
```

---

## 6. Provisioning the First Moderator Account Securely

UNSENT does not include hardcoded administrator accounts, default passwords, or backdoor credentials. All steward access is verified through [`src/lib/auth/moderator.ts`](file:///C:/Users/hp/.gemini/antigravity/scratch/unsent/src/lib/auth/moderator.ts).

### Secure Moderator Provisioning Procedure:

1. **Register a Standard Account via the Live Application:**
   - Visit the production site (`https://<your-project>.vercel.app`).
   - Create a session (anonymous visit).
   - Navigate to `/register` (or `/login`) and register an account using a real phone number and strong password.
   - Note the assigned permanent `unsentId` displayed in your Sanctuary or account profile (e.g. `@steward_alex_9f3b`).

2. **Grant Moderator Privileges (Choose Method A or Method B):**

   - **Method A (Recommended — Direct Database Role Promotion):**
     Connect directly to the production Neon PostgreSQL database using the Neon Console SQL Editor or `psql` via `DIRECT_URL`:
     ```sql
     -- Promote the registered user to ADMIN or MODERATOR role
     UPDATE users
     SET role = 'ADMIN'
     WHERE unsent_id = '@steward_alex_9f3b';
     ```
     *Verification:*
     ```sql
     SELECT id, unsent_id, role, account_type FROM users WHERE unsent_id = '@steward_alex_9f3b';
     ```
     This role is stored directly in the `UserRole` enum (`USER`, `MODERATOR`, `ADMIN`) in PostgreSQL and grants persistent steward access across all sessions.

   - **Method B (Environment Variable Allowlist):**
     In Vercel Project Settings > Environment Variables, set:
     ```
     MODERATOR_UNSENT_IDS="@steward_alex_9f3b"
     ```
     (Or a comma-separated list of registered IDs: `@steward_one,@steward_two`).  
     Redeploy the application in Vercel to apply the updated environment variable.

3. **Steward Security Invariants:**
   - **Never grant privileges to unverified users:** Only promote explicitly trusted operator accounts.
   - **Do not commit steward IDs:** Never hardcode personal steward handles in repository files.
   - **No client exposure of tokens:** `MODERATOR_TOKEN` is strictly a server-side secret used for programmatic administrative scripts or automated integration test suites via the `x-moderator-token` or `Authorization: Bearer <token>` header. It must never be included in client bundles (`NEXT_PUBLIC_*`).
   - **Constant-time comparison:** All token checks in `src/lib/auth/moderator.ts` use `crypto.timingSafeEqual` with matched buffer lengths to eliminate timing side-channel attacks.

---

## 7. Verifying the Live Deployment

Once Vercel finishes deploying to `https://<your-project>.vercel.app`:

1. **Verify Health Endpoint:**
   ```bash
   curl -i https://<your-project>.vercel.app/api/health
   ```
   *Expected Response:* `HTTP/2 200` with JSON body:
   ```json
   {
     "status": "healthy",
     "timestamp": "2026-11-07T...",
     "region": "fra1",
     "uptimeSeconds": 1,
     "checks": {
       "database": "connected",
       "rateLimiter": {
         "backend": "redis",
         "configured": true,
         "reachable": true
       }
     },
     "latencyMs": 42
   }
   ```
2. **Verify Ephemeral Anonymous Session:**
   - Visit `https://<your-project>.vercel.app`.
   - Open browser Developer Tools > Application > Cookies.
   - Confirm `unsent_session` cookie is present with `HttpOnly`, `Secure`, and `SameSite=Lax`.
3. **Verify Letter Creation:**
   - Compose a private letter in the UI.
   - Confirm it is persisted in your Sanctuary without errors.
4. **Verify Moderator Access:**
   - Log in with the promoted steward account from Section 6.
   - Access `/moderation` and verify that the stewardship dashboard loads successfully.

---

## 8. Quota Exhaustion Behaviors & Resilience

| Service | Quota / Limit | Exact Quota Exhaustion Behavior & System Impact |
| :--- | :--- | :--- |
| **Upstash Redis** | 500,000 commands / month | Upstash REST API returns `ERR max monthly request limit exceeded...`. The UNSENT rate limiter logs `[CRITICAL_RATE_LIMITER_FAILURE]` and **fails closed** (`status: "service_unavailable"`, error: `"SERVICE_UNAVAILABLE"`). Protected operations (submit, login, register, report) return **HTTP 503**. Public unprotected reads continue serving. No charges are incurred. Resets on the 1st of the next month. |
| **Neon Compute** | 100 CU-hours / month | Neon suspends the project compute endpoint until the first day of the next calendar month. All database queries fail with connection timeout or connection refused errors. API routes dependent on the database return HTTP 500/503. Static assets continue serving from Vercel Edge. |
| **Neon Storage** | 1.0 GB data storage | Neon rejects write operations (`INSERT`, `UPDATE`, `CREATE TABLE`) with a storage full error. Existing letters and Orbit posts remain readable. |
| **Neon Bandwidth** | 5 GB egress / month | Egress bandwidth is throttled or suspended until the monthly cycle resets. |
| **Vercel Hobby** | 1,000,000 invocations / mo<br>100 GB Fast Data Transfer | Vercel throttles traffic or returns HTTP 402/503, pausing serverless function execution until the next monthly billing cycle. Hobby accounts cannot incur automatic paid overages. UNSENT does not promise continuous traffic availability if free limits are exhausted. |

---

## 9. Backup & Disaster Recovery Limitations on Free Tier

1. **Neon Free Point-in-Time Recovery (PITR):**
   - Free-tier Neon projects retain **6 hours** of continuous point-in-time recovery history (unlike paid plans which retain 30 days).
   - If an accidental schema change or data corruption occurs, recovery must be initiated within 6 hours via the Neon Console.
   - **Mandatory Practice:** Before applying any schema migration, export an explicit snapshot using `pg_dump`:
     ```bash
     pg_dump -d "$DIRECT_URL" -F c -b -v -f "unsent_backup_$(date +%Y%m%d_%H%M%S).dump"
     ```
2. **Upstash Redis Persistence:**
   - Free-tier databases are ephemeral and do not include automated daily cloud snapshot exports.
   - Because UNSENT uses Redis strictly for sliding-window rate limit counters and key correlation cache, losing Redis data does not destroy user identities, letters, or notifications. Rate counters simply start fresh.

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
        VercelFunc -->|"HTTPS REST (Rate Limiting)"| Upstash["Upstash Redis Free (eu-central-1)<br>10k commands/day | 256 MB RAM"]
        VercelFunc -->|"Pooled TLS :6543 (PgBouncer)"| NeonPool["Neon PostgreSQL Free (aws-eu-central-1)<br>1 GB Storage | 100 CU-hrs/mo"]
        NeonPool --> NeonStorage[("PostgreSQL Storage Engine")]
    end
    
    DevMachine["Developer Workstation"] -.->|"Direct TLS :5432 (prisma migrate deploy)"| NeonStorage
```

### Free-Tier Capacity Matrix

| Component | Provider & Plan | Cost | Hard Quota & Service Limits | Over-Quota Behavior |
| :--- | :--- | :--- | :--- | :--- |
| **Web & API Hosting** | **Vercel Hobby** | $0 / mo | 100 GB Fast Data Transfer / mo<br>100,000 Serverless Invocations / mo<br>1024 MB RAM per function<br>Default 10s timeout (max 60s)<br>Personal/non-commercial use | Requests throttled or 402/503 returned. Never automatically upgrades to Pro. |
| **Database** | **Neon Free Tier** | $0 / mo | 1 project, up to 10 branches<br>1.0 GB data storage<br>100 Compute Unit (CU) hours / mo<br>Scale-to-zero after 5 min idle | Writes rejected if 1 GB exceeded. Compute suspended until monthly reset if 100 CU-hrs exhausted. Reads/writes return connection errors. |
| **Rate Limiter** | **Upstash Redis Free** | $0 / mo | 1 Redis database<br>256 MB max storage<br>10,000 commands / day (~300k/mo)<br>Max 1000 concurrent conns | Commands rejected with `ERR daily limit exceeded`. UNSENT fails closed (HTTP 503), preventing abuse. No overage charges. |
| **Domain** | **Vercel Subdomain** | $0 / mo | Included `*.vercel.app` domain with automated SSL / TLS termination | N/A — Free and permanent. |

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
   - **Primary Plan:** Free ($0)
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

In **Vercel Project Settings > Environment Variables**, add the following keys for **Production** (and optionally **Preview**):

| Variable Name | Environment | Value / Generation Instructions |
| :--- | :--- | :--- |
| `NODE_ENV` | Production, Preview | `production` |
| `NEXT_PUBLIC_APP_URL` | Production | `https://<your-project-subdomain>.vercel.app` |
| `VERCEL_REGION` | Production, Preview | `fra1` |
| `DATABASE_URL` | Production, Preview | Pooled Neon connection string (`...-pooler...:6543/...`) |
| `DIRECT_URL` | Production, Preview | Direct unpooled Neon connection string (`...:5432/...`) |
| `SESSION_SECRET` | Production, Preview | 64-char random hex string (`openssl rand -hex 32`) |
| `MODERATOR_TOKEN` | Production, Preview | 32+ char secret for steward moderation (`openssl rand -hex 24`) |
| `MODERATOR_UNSENT_IDS` | Production, Preview | Initial steward IDs: `@steward_primary,@ops_lead` |
| `RATE_LIMIT_LOG_SECRET` | Production, Preview | 64-char random hex string (`openssl rand -hex 32`) — Min 32 bytes entropy |
| `UPSTASH_REDIS_REST_URL` | Production, Preview | Upstash REST URL from Step 2 |
| `UPSTASH_REDIS_REST_TOKEN`| Production, Preview | Upstash REST Token from Step 2 |

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

## 5. Safe Database Migration Execution ($0 / Local Execution)

Because Vercel serverless builds are ephemeral and should not execute long-running DDL migrations directly during the web build, apply database migrations securely from your authenticated local workstation against Neon's `DIRECT_URL`:

```bash
# 1. Ensure you have the direct Neon connection string:
# Format: postgresql://[user]:[password]@[endpoint].eu-central-1.aws.neon.tech/unsent?sslmode=require

# 2. Run Prisma migrate deploy over the direct port 5432:
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

> [!CAUTION]
> **Database Safety Invariants:**
> - **Never run `pnpm prisma db push` against production.**
> - **Never run `pnpm prisma migrate reset` against production.**
> - `pnpm prisma migrate deploy` only executes pending, version-controlled migrations from `prisma/migrations` and never drops tables or columns.

---

## 6. Verifying the Live Deployment

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

---

## 7. Quota Exhaustion Behaviors & Resilience

| Service | Condition | System Impact & Fail-Safe Behavior |
| :--- | :--- | :--- |
| **Upstash Redis** | Exceeds 10,000 commands/day | Rate limiter detects quota error and **fails closed**. Protected operations (submit, login, register, report) return HTTP 503 (`SERVICE_UNAVAILABLE`). Unprotected reads (viewing home, static assets) remain accessible. No charges are billed. Resets daily at 00:00 UTC. |
| **Neon Compute** | Exceeds 100 CU-hours/month | Neon suspends compute endpoint until the first day of the next calendar month. Requests requiring database access return 500/503 errors. Static pages continue serving from Vercel Edge. |
| **Neon Storage** | Reaches 1.0 GB data | Neon rejects further `INSERT` operations with a disk full error. Existing letters and Orbit posts remain readable. |
| **Vercel Hobby** | Exceeds 100k invocations or 100 GB transfer | Vercel throttles or temporarily suspends the deployment. Never charges any overage fee. Resets on monthly cycle. |

---

## 8. Backup & Disaster Recovery Limitations on Free Tier

1. **Neon Free Point-in-Time Recovery (PITR):**
   - Free tier Neon projects retain **24 hours** of continuous point-in-time recovery history (compared to 30 days on paid tiers).
   - If an accidental schema mistake occurs, restore must take place within 24 hours via the Neon web console.
   - **Recommended Best Practice:** Before running major migrations, export a snapshot using `pg_dump`:
     ```bash
     pg_dump -d "$DIRECT_URL" -F c -b -v -f "unsent_backup_$(date +%Y%m%d).dump"
     ```
2. **Upstash Redis Persistence:**
   - Free tier databases are ephemeral and do not include automated daily cloud snapshot exports.
   - Because UNSENT uses Redis strictly for sliding-window rate limit counters and key correlation cache, losing Redis data does not destroy user identities, letters, or notifications. Rate counters simply start fresh.

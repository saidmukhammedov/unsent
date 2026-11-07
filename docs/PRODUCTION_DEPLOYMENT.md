# UNSENT — Production Deployment & Architecture Guide

> [!IMPORTANT]
> **APPROVED $0 ARCHITECTURE STATUS:**
> The primary, mandatory production architecture for UNSENT is the **Strict $0 Free-Tier Architecture**:
> - **Web Hosting:** Vercel Hobby ($0 / month, personal/non-commercial use)
> - **Database:** Neon PostgreSQL Free ($0 / month, 1 GB storage, 100 CU-hrs/mo)
> - **Rate Limiting:** Upstash Redis Free ($0 / month, 10,000 commands/day)
> - **Domain:** Free `*.vercel.app` subdomain with automated TLS
>
> 📖 **Primary Deployment Guide:** Follow [FREE_TIER_DEPLOYMENT.md](./FREE_TIER_DEPLOYMENT.md) for complete step-by-step instructions.

---

> [!WARNING]
> **UNAPPROVED ARCHITECTURE NOTICE (GCP / CLOUD RUN):**
> Google Cloud Platform (Google Cloud Run, Cloud Build, Artifact Registry, and Secret Manager) is **EXPLICITLY DISAPPROVED AND NOT PART OF THE APPROVED PRODUCTION ARCHITECTURE**.
> - Google Cloud requires billing-enabled accounts, credit/debit card registration, and incurs unexpected pay-as-you-go costs.
> - **Do NOT deploy, build, or provision resources on GCP.**
> - The GCP and Dockerfile sections in this document are preserved strictly as an unapproved historical reference and for offline local container testing only.

---

## Architecture Comparison

| Feature | Approved $0 Architecture (Primary) | Disapproved Paid Architecture (Do Not Use) |
| :--- | :--- | :--- |
| **Hosting Platform** | **Vercel Hobby** (Serverless) | **Google Cloud Run** |
| **Database** | **Neon PostgreSQL Free Tier** | Neon Paid / Enterprise |
| **Rate Limiter** | **Upstash Redis Free Tier** | Upstash Paid / Redis Enterprise |
| **Build System** | Native Vercel Build | Google Cloud Build |
| **Container Registry** | Not needed (Serverless) | GCP Artifact Registry |
| **Secret Storage** | Vercel Environment Variables | GCP Secret Manager |
| **Monthly Cost** | **Strictly $0.00** | Paid / Metered billing |
| **Credit Card Required?** | **No** (None of the services require cards) | **Yes** (GCP requires credit/debit card) |
| **Auto-Upgrade Risk** | **Zero** (Hard quota caps, fails closed) | High (Auto-scales and incurs charges) |
| **Approved for Launch?** | **YES — Official Production Target** | **NO — FORBIDDEN** |

---

## 1. Approved Production Architecture: Vercel + Neon Free + Upstash Free

For complete step-by-step setup, see [FREE_TIER_DEPLOYMENT.md](./FREE_TIER_DEPLOYMENT.md).

### Summary Checklist:
1. **Neon PostgreSQL Free:**
   - Region: `Europe (Frankfurt) / aws-eu-central-1`
   - Pooled connection string (`port 6543`, `?pgbouncer=true`): Set as `DATABASE_URL`.
   - Direct connection string (`port 5432`): Set as `DIRECT_URL`.
2. **Upstash Redis Free:**
   - Region: `eu-central-1 (Frankfurt)`
   - REST API URL: Set as `UPSTASH_REDIS_REST_URL`.
   - REST API Token: Set as `UPSTASH_REDIS_REST_TOKEN`.
3. **Vercel Project Setup:**
   - Connect repository `saidmukhammedov/unsent`.
   - Function region: `fra1` (Frankfurt).
   - Framework preset: Next.js.
   - Build command: `pnpm build` (triggers `postinstall: prisma generate`).
4. **Environment Variables on Vercel:**
   - `NODE_ENV=production`
   - `NEXT_PUBLIC_APP_URL=https://<your-subdomain>.vercel.app`
   - `VERCEL_REGION=fra1`
   - `DATABASE_URL` (pooled)
   - `DIRECT_URL` (direct)
   - `SESSION_SECRET` (64 hex characters)
   - `MODERATOR_TOKEN` (32+ characters)
   - `MODERATOR_UNSENT_IDS=@steward_primary,@ops_lead`
   - `RATE_LIMIT_LOG_SECRET` (64 hex characters — min 32 bytes entropy)
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
5. **Database Migration Deployment:**
   - Run locally against Neon `DIRECT_URL`:
     ```bash
     DIRECT_URL="..." DATABASE_URL="..." pnpm prisma migrate deploy
     ```

---

## 2. [ARCHIVED / DISAPPROVED] Google Cloud Run & Docker Architecture

> [!CAUTION]
> The following section is **NOT APPROVED FOR PRODUCTION DEPLOYMENT**. It is retained purely for local containerization testing or offline reference.

### 2.1 Local Dockerfile Testing (No Cloud Deployment)
If running a local container build for offline debugging on a developer workstation:

```bash
# Enable standalone output if building locally with Docker:
BUILD_STANDALONE=true pnpm build

# Build local runner image:
docker build --target runner -t unsent-local:latest .

# Run local container on port 8080:
docker run -p 8080:8080 --env-file .env unsent-local:latest
```

### 2.2 Historical Cloud Run Deploy Command (Archived)
```bash
# ARCHIVED REFERENCE ONLY - DO NOT RUN IN PRODUCTION (VIOLATES $0 MANDATE)
gcloud run deploy unsent-web \
    --image="europe-west3-docker.pkg.dev/${PROJECT_ID}/unsent-repo/unsent-web:latest" \
    --region=europe-west3 \
    --platform=managed \
    --allow-unauthenticated \
    --memory=2Gi \
    --cpu=2 \
    --concurrency=40 \
    --port=8080 \
    --startup-probe="httpGet.path=/api/health,httpGet.port=8080,initialDelaySeconds=5,timeoutSeconds=3,periodSeconds=10,failureThreshold=6"
```

---

## 3. Production Verification & Monitoring

Once deployed to `https://<your-subdomain>.vercel.app`:

1. **Verify `/api/health`:**
   ```bash
   curl -i https://<your-subdomain>.vercel.app/api/health
   ```
   Must return HTTP 200 with `status: "healthy"`, `checks.database: "connected"`, `checks.rateLimiter.reachable: true`.

2. **Verify Fail-Closed Protection:**
   If Upstash Redis exceeds its 10,000 daily free commands, the API immediately responds with HTTP 503 (`SERVICE_UNAVAILABLE`), safely protecting user data without failing open or incurring charges.

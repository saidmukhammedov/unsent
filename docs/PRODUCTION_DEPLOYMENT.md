# UNSENT — Production Deployment & Operations Guide

**Architecture:** Google Cloud Run + Neon Serverless PostgreSQL + Upstash Redis  
**Target Region:** Frankfurt (`europe-west3` / `eu-central-1`)  
**Container Runtime:** Dockerized Standalone Next.js 16 (Node.js 22 LTS)  
**Security Standard:** Zero-Trust, Encrypted Identifiers, Native Argon2id, Ephemeral Anonymous Sessions

---

## 1. Required Accounts & Cloud Services

All production services should be co-located in Frankfurt to minimize network latency:

1. **Google Cloud Platform (GCP):**
   - Project created with billing enabled.
   - Region: `europe-west3` (Frankfurt).
   - Enabled APIs:
     - Cloud Run Admin API (`run.googleapis.com`)
     - Artifact Registry API (`artifactregistry.googleapis.com`)
     - Cloud Build API (`cloudbuild.googleapis.com`)
     - Secret Manager API (`secretmanager.googleapis.com`)
2. **Neon Serverless PostgreSQL:**
   - Account and project provisioned in **Europe (Frankfurt) / `aws-eu-central-1`**.
   - Generates two endpoints:
     - **Pooled endpoint (`-pooler` on port 6543):** For runtime Prisma Client queries via PgBouncer.
     - **Direct endpoint (port 5432):** For DDL migrations (`prisma migrate deploy`).
3. **Upstash Redis:**
   - Serverless Redis database created in **Europe (Frankfurt) / `eu-central-1`**.
   - Primary connectivity via REST API (`UPSTASH_REDIS_REST_URL` & `UPSTASH_REDIS_REST_TOKEN`).

---

## 2. Required Production Environment Variables

Store all production secrets in **Google Cloud Secret Manager**. Never hardcode or commit them to Git.

| Variable | Description | Required Format / Example |
| :--- | :--- | :--- |
| `NODE_ENV` | Production mode flag | `production` |
| `PORT` | Cloud Run listening port | `8080` |
| `NEXT_PUBLIC_APP_URL` | Public production domain | `https://unsent.space` |
| `CLOUD_RUN_REGION` | Deployment region | `europe-west3` |
| `DATABASE_URL` | Neon pooled connection string | `postgresql://user:pass@ep-xyz-pooler.eu-central-1.aws.neon.tech/unsent?sslmode=require` |
| `DIRECT_URL` | Neon direct connection string (unpooled) | `postgresql://user:pass@ep-xyz.eu-central-1.aws.neon.tech/unsent?sslmode=require` |
| `SESSION_SECRET` | 64-char random hex for session signature | `openssl rand -hex 32` |
| `MODERATOR_TOKEN` | 32+ char secret for steward moderation | `openssl rand -hex 24` |
| `MODERATOR_UNSENT_IDS` | Initial steward identities | `@steward_primary,@ops_lead` |
| `RATE_LIMIT_LOG_SECRET` | 32+ char secret for HMAC-SHA256 correlation logging | `openssl rand -hex 32` |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis Frankfurt REST URL | `https://eu1-active-slug.upstash.io` |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST access token | `AX7...` |

---

## 3. Provisioning the Cloud Services

### 3.1 Provision Neon PostgreSQL
1. Log in to [Neon Console](https://console.neon.tech/).
2. Create project `unsent-production` in region `Europe (Frankfurt)`.
3. In **Dashboard > Connection Details**:
   - Enable **Connection Pooling**.
   - Copy the pooled connection string as `DATABASE_URL`.
   - Copy the direct (unpooled) connection string as `DIRECT_URL`.

### 3.2 Provision Upstash Redis
1. Log in to [Upstash Console](https://console.upstash.com/).
2. Create a Redis database named `unsent-prod-ratelimit` in region `eu-central-1 (Frankfurt)`.
3. Select **REST API** tab.
4. Copy `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.

### 3.3 Create GCP Artifact Registry Repository
```bash
gcloud artifacts repositories create unsent-repo \
    --repository-format=docker \
    --location=europe-west3 \
    --description="UNSENT Docker container images"
```

### 3.4 Store Secrets in GCP Secret Manager
Create each secret in Secret Manager.

> [!IMPORTANT]
> **Cryptographic Entropy & Silent Generation:**
> Application secrets must possess cryptographically secure random entropy and be generated without printing to stdout, terminal logs, or saving to `.env` / shell history (`.bash_history`).
> Piping directly from `openssl` into `gcloud secrets create ... --data-file=-` streams entropy via stdin without terminal display or shell argument expansion.

```bash
# Database strings (from Neon console)
echo -n "postgresql://..." | gcloud secrets create unsent-database-url --data-file=- --replication-policy=automatic
echo -n "postgresql://..." | gcloud secrets create unsent-direct-url --data-file=- --replication-policy=automatic

# Application secrets (generated securely via stdin without terminal echo)
# RATE_LIMIT_LOG_SECRET: 32 bytes (256 bits) of entropy (64 hex characters)
openssl rand -hex 32 | tr -d '\n' | gcloud secrets create unsent-rate-limit-log-secret --data-file=- --replication-policy=automatic

# SESSION_SECRET: 32 bytes of entropy (64 hex characters)
openssl rand -hex 32 | tr -d '\n' | gcloud secrets create unsent-session-secret --data-file=- --replication-policy=automatic

# MODERATOR_TOKEN: 24 bytes of entropy (48 hex characters)
openssl rand -hex 24 | tr -d '\n' | gcloud secrets create unsent-moderator-token --data-file=- --replication-policy=automatic

# Upstash credentials (from Upstash console)
echo -n "https://..." | gcloud secrets create unsent-upstash-url --data-file=- --replication-policy=automatic
echo -n "..." | gcloud secrets create unsent-upstash-token --data-file=- --replication-policy=automatic
```

Grant Cloud Run's service account permission to read these secrets:
```bash
PROJECT_NUM=$(gcloud projects describe $(gcloud config get-value project) --format='value(projectNumber)')

gcloud secrets add-iam-policy-binding unsent-database-url \
    --member="serviceAccount:${PROJECT_NUM}-compute@developer.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"

# Repeat for unsent-direct-url, unsent-session-secret, unsent-moderator-token, unsent-upstash-url, unsent-upstash-token
```

---

## 4. Safe Production Database Migrations

### 4.1 Migration Execution Philosophy
- **Never run `prisma db push` in production.**
- **Never run `prisma migrate reset` in production.**
- All migrations must be applied using `prisma migrate deploy` over the **direct unpooled connection (`DIRECT_URL`)**.

### 4.2 Verified Migration Execution Strategies

> [!CAUTION]
> The production Next.js runner container (`unsent:latest`) is a minimal standalone image that intentionally excludes devDependencies (such as the Prisma CLI) and package managers (`pnpm`). Attempting to execute `pnpm prisma` inside the runner container will fail.

Use one of the two verified migration execution paths:

#### Option A: Dedicated Migration Container Image & Cloud Run Job (Recommended)
Build the dedicated `migrator` target defined in the multi-stage `Dockerfile`:

> [!NOTE]
> **Workstation Docker Status:** Because Docker CLI is not installed on the local developer workstation, the `migrator` stage is structurally verified and pinned in the Dockerfile, but its actual container execution must be verified during the initial Cloud Build run in GCP.

```bash
PROJECT_ID=$(gcloud config get-value project)
MIGRATOR_TAG="europe-west3-docker.pkg.dev/${PROJECT_ID}/unsent-repo/unsent-migrator:latest"

# 1. Build and push the dedicated migrator image target
docker build --target migrator -t "${MIGRATOR_TAG}" .
docker push "${MIGRATOR_TAG}"

# 2. Create the Cloud Run Job with secrets attached
gcloud run jobs create unsent-migrate \
    --image="${MIGRATOR_TAG}" \
    --region=europe-west3 \
    --set-secrets="DIRECT_URL=unsent-direct-url:latest,DATABASE_URL=unsent-database-url:latest"

# 3. Execute the migration job and wait for completion
gcloud run jobs execute unsent-migrate --region=europe-west3 --wait
```

#### Option B: Authenticated Cloud Build Pre-Deployment Step
In corporate CI/CD pipelines, execute migrations as a separate step before deploying the Cloud Run service:

```yaml
# cloudbuild.yaml snippet
steps:
  # Step 1: Run database migrations against direct Neon endpoint
  - name: 'node:22-bookworm-slim'
    id: 'prisma-migrate'
    entrypoint: 'sh'
    args:
      - '-c'
      - |
        apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates
        corepack enable && corepack prepare pnpm@12.15.0 --activate
        pnpm install --frozen-lockfile
        pnpm prisma migrate deploy
    secretEnv: ['DIRECT_URL', 'DATABASE_URL']

  # Step 2: Build and deploy standalone runner image
  - name: 'gcr.io/cloud-builders/docker'
    id: 'build-runner'
    args: ['build', '--target', 'runner', '-t', 'europe-west3-docker.pkg.dev/$PROJECT_ID/unsent-repo/unsent:$COMMIT_SHA', '.']
```

---

## 5. Deploying to Google Cloud Run

### 5.1 Build and Push the Container Image
```bash
PROJECT_ID=$(gcloud config get-value project)
IMAGE_TAG="europe-west3-docker.pkg.dev/${PROJECT_ID}/unsent-repo/unsent:$(git rev-parse --short HEAD)"

# Submit build to Cloud Build in Frankfurt region
gcloud builds submit \
    --region=europe-west3 \
    --tag="${IMAGE_TAG}" \
    .
```

### 5.2 Sizing & Concurrency for Argon2id
Argon2id allocates 64 MB of RAM and uses 4 CPU threads per hashing operation.
- **Recommended Memory:** `2Gi` (2048 MB)
- **Recommended CPU:** `2` vCPUs
- **Recommended Concurrency:** `40` (Internal semaphore in `password.ts` caps simultaneous Argon2 operations to 2 with a bounded queue of 10 and 5000ms timeout to avoid CPU thread context thrashing on 2-vCPU instances while keeping memory bounded to 128 MB)
- **CPU Boost:** `--cpu-boost` enabled to accelerate container cold starts.

### 5.3 Deploy the Service
```bash
gcloud run deploy unsent-web \
    --image="${IMAGE_TAG}" \
    --region=europe-west3 \
    --platform=managed \
    --allow-unauthenticated \
    --memory=2Gi \
    --cpu=2 \
    --concurrency=40 \
    --min-instances=1 \
    --max-instances=20 \
    --cpu-boost \
    --port=8080 \
    --startup-probe="httpGet.path=/api/health,httpGet.port=8080,initialDelaySeconds=5,timeoutSeconds=3,periodSeconds=10,failureThreshold=6" \
    --set-env-vars="NODE_ENV=production,CLOUD_RUN_REGION=europe-west3,NEXT_PUBLIC_APP_URL=https://unsent.space" \
    --set-secrets="\
DATABASE_URL=unsent-database-url:latest,\
DIRECT_URL=unsent-direct-url:latest,\
SESSION_SECRET=unsent-session-secret:latest,\
MODERATOR_TOKEN=unsent-moderator-token:latest,\
RATE_LIMIT_LOG_SECRET=unsent-rate-limit-log-secret:latest,\
UPSTASH_REDIS_REST_URL=unsent-upstash-url:latest,\
UPSTASH_REDIS_REST_TOKEN=unsent-upstash-token:latest"
```

### 5.4 Cloud Run Health Probe Architecture & Operational Cautions

#### Correct Cloud Run Probe Syntax
Cloud Run uses flat dot-notation `KEY=VALUE,...` syntax:
- `--startup-probe=KEY=VALUE,...`
- `--liveness-probe=KEY=VALUE,...`

Flag arguments such as `--startup-probe-path` or `--startup-probe-initial-delay` are **not** supported by the `gcloud run deploy` CLI and will cause deployment command failure.

#### 1. Startup Probe Configuration
- **Parameter Breakdown:**
  - `httpGet.path=/api/health`: Instructs Cloud Run to probe the HTTP endpoint `/api/health`.
  - `httpGet.port=8080`: Directs the probe to container listening port 8080.
  - `initialDelaySeconds=5`: Waits 5 seconds after container initialization before initiating the first probe.
  - `timeoutSeconds=3`: Sets 3000ms timeout for the health check response.
  - `periodSeconds=10`: Probes every 10 seconds during the startup phase.
  - `failureThreshold=6`: Allows up to 6 consecutive attempts (up to 65 seconds total) before marking container startup as failed.
- **Operational Value:** Traffic routing is strictly withheld until `/api/health` returns HTTP 200, guaranteeing that cold instances never receive user traffic before Prisma client initialization and startup environment validation have succeeded.

#### 2. Liveness Probe Cautions & Cascading Restart Loop Prevention
> [!WARNING]
> **Avoid Aggressive Dependency-Based Liveness Probes in Serverless Environments:**
> In our default deployment command above, `--liveness-probe` is intentionally omitted in favor of Google Cloud Run's default infrastructure-level container health checks.
>
> **The Risk of Cascading Restart Storms:**
> Because `/api/health` probes both Neon PostgreSQL and Upstash Redis, any transient upstream cloud blip (such as a 3-second network routing retry or Upstash failover) causes `/api/health` to return HTTP 503.
> If an aggressive HTTP liveness probe (e.g. failureThreshold=1 or 2, period=5s) is attached, Cloud Run will detect concurrent failures across **all running container instances at the exact same moment**. Cloud Run will then terminate and restart the entire fleet simultaneously, causing a total application outage and swamping the upstream database with simultaneous reconnection bursts during recovery.
>
> If your organization's security policy strictly mandates an HTTP liveness probe, use wide, conservative thresholds that allow sufficient time for transient upstream recovery without triggering container restarts:
> ```bash
> --liveness-probe="httpGet.path=/api/health,httpGet.port=8080,initialDelaySeconds=15,timeoutSeconds=3,periodSeconds=30,failureThreshold=5"
> ```

#### Internal Probe Isolation & Safety
- **Bounded Latency:** `/api/health` bounds the PostgreSQL query (`SELECT 1`) and the Redis ping (`redis.ping()`) to 2000ms each using `Promise.race`.
- **Zero Information Leakage:** Public responses contain only high-level status booleans (`connected`/`disconnected`, `configured`, `reachable`). Raw database errors, connection strings, Redis tokens, and stack traces are strictly scrubbed from public outputs.
- **Ordinary Request Isolation:** Ordinary user requests (such as viewing Orbit, saving letters, or authentication) never execute infrastructure health probes. Database connectivity is maintained via pooled Prisma connections, and rate-limiting uses direct sliding window Redis calls without triggering diagnostic ping probes.

---

## 6. Verifying the Production Deployment

Once the service URL is returned (e.g., `https://unsent-web-xyz.a.run.app`):

1. **Verify Health Check Endpoint:**
   ```bash
   curl -i https://unsent-web-xyz.a.run.app/api/health
   ```
   *Expected Response:* `HTTP/2 200` with JSON body:
   ```json
   {
     "status": "healthy",
     "region": "europe-west3",
     "database": "connected",
     "rateLimiter": "redis"
   }
   ```

2. **Verify Anonymous Session Bootstrap:**
   ```bash
   curl -i https://unsent-web-xyz.a.run.app/api/auth/me
   ```
   *Expected Response:* Sets `unsent_session` cookie (`HttpOnly; Secure; SameSite=Lax`).

3. **Verify Public Orbit Letter Reading:**
   ```bash
   curl -i https://unsent-web-xyz.a.run.app/api/orbit?mode=latest
   ```

4. **Verify Moderator Token Authorization:**
   ```bash
   curl -i -H "x-moderator-token: $MODERATOR_TOKEN" https://unsent-web-xyz.a.run.app/api/moderation/stats
   ```

---

## 7. Database Backups & Point-in-Time Recovery (PITR)

### 7.1 Automated Neon Backups
- Neon continuously writes Write-Ahead Logs (WAL) and maintains Point-in-Time Recovery (PITR).
- In the Neon Console under **Branches & Backups**, snapshots are retained automatically based on plan tier (7 to 30 days).

### 7.2 Creating a Named Backup Branch Before Major Upgrades
Before making structural updates or operational changes:
```bash
# Using Neon CLI or Console
neon branches create --name "backup-pre-launch-$(date +%F)" --project-id "unsent-production"
```

### 7.3 Restoring from Backup
If data recovery or rollbacks are ever required:
1. In Neon Console > **Branches**, click **Create branch from timeline point**.
2. Select the exact timestamp (down to the second) prior to the incident.
3. Update `DATABASE_URL` and `DIRECT_URL` in Secret Manager to point to the restored branch endpoint.
4. Redeploy Cloud Run to switch active database traffic immediately without downtime.

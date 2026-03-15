# Deploying Startup Copilot

**→ Step-by-step: [DEPLOY_NOW.md](./DEPLOY_NOW.md)** — Render (backend) + Vercel (frontend) in order, with env vars and CORS.

---

## Amazon Nova compatibility

This app is **compatible with Amazon Nova** (Bedrock) in any deployment where the backend can call AWS. All Nova calls go through the same backend (FastAPI); no frontend Bedrock usage.

**Required for Nova to work in production:**

| Env var | Purpose |
|--------|---------|
| `AWS_ACCESS_KEY_ID` | IAM credentials for Bedrock (and Polly, S3). |
| `AWS_SECRET_ACCESS_KEY` | Same. |
| `AWS_REGION` | Bedrock region; use `us-east-1` for Nova Pro, Lite, Sonic, Canvas, Reel, Embeddings. |
| `DEMO_GLOBAL=true` | Enables real Nova (otherwise the app uses mocks and does not call Bedrock). |

**In containers (Railway, Render, App Runner, ECS):** Use **IAM user access keys** in env. Do **not** rely on `AWS_PROFILE` / SSO; SSO requires interactive login and is for local dev only. Set the four variables above so every Nova feature (Converse, InvokeModel, bidirectional Sonic stream) works.

**Nova models used (all in `us.amazon.*` or `amazon.nova-*`):**

- **Nova Pro** (Converse) — ingest, Asset Forge, Code Lab, Reel scripts  
- **Nova 2 Lite** (Converse) — Market Intel, VC Scout, Finance, Virtual Tank fallback  
- **Nova 2 Sonic** (bidirectional stream) — Virtual Tank voice  
- **Nova Canvas** (InvokeModel) — images  
- **Nova Reel** (async InvokeModel) — pitch reel video  
- **Nova Multimodal Embeddings** (InvokeModel) — venture embedding when DB is used  

Ensure your hackathon/Bedrock access and IAM policy allow `bedrock:InvokeModel` and `bedrock:InvokeModelWithResponseStream` (for Sonic) in the chosen region.

---

## Hackathon Bedrock access vs hosting

- **Hackathon / Bedrock access** usually gives you **Amazon Nova (Bedrock) model usage** (API calls to Bedrock). It does **not** automatically include free **compute/hosting** for your app (servers, containers, serverless).
- **AWS Free Tier** (or hackathon credits) can cover **both** Bedrock usage and **some** hosting (e.g. EC2, App Runner, Lambda within limits). Check your specific hackathon rules for credits and what they apply to.
- You can **deploy the app anywhere** (not only AWS). As long as the **backend** has valid **AWS credentials** (for Bedrock, Polly, S3), it can run on Vercel + Railway, or 100% on AWS.

---

## Recommended free deployment (Vercel + Render)

For **free** hosting that **works well** with Nova, use:

| Part     | Platform | Why |
|----------|----------|-----|
| Frontend | **Vercel** | Free, zero-config for Next.js, global CDN. |
| Backend  | **Render** | Free tier (750 instance hours/month). Supports Docker, WebSockets, and env vars for AWS. |

**Steps:**

1. **Backend on Render**
   - Create a [Render](https://render.com) account.
   - New → **Web Service** → connect your repo (or push the repo first).
   - **Root directory:** `backend` (or leave blank and set build context below).
   - **Build:** Docker, or **Native** with build command `pip install -r requirements.txt` and start `uvicorn app.main:app --host 0.0.0.0 --port $PORT`. If using Docker, set **Dockerfile path** to `backend/Dockerfile` and **Docker context** to `backend` (or repo root with `docker build -f backend/Dockerfile backend`).
   - **Instance type:** Free.
   - **Environment:** Add `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION=us-east-1`, `DEMO_GLOBAL=true`. Optionally `S3_BUCKET` for pitch reel.
   - Deploy. Copy the backend URL (e.g. `https://your-app.onrender.com`).

2. **Frontend on Vercel**
   - Create a [Vercel](https://vercel.com) account → New Project → import your repo.
   - **Root directory:** `frontend` (if the Next.js app is in `frontend/`).
   - **Environment variable:** `NEXT_PUBLIC_BACKEND_URL` = your Render backend URL **including** `/api` (e.g. `https://your-app.onrender.com/api`). The frontend uses this for all REST and WebSocket (Virtual Tank) calls.
   - Deploy. Copy your frontend URL (e.g. `https://your-project.vercel.app`).

3. **CORS (required for judges)**
   - On **Render** (backend service), add an **environment variable:** `CORS_ORIGINS` = your exact Vercel frontend URL, e.g. `https://your-project.vercel.app`. For multiple origins use a comma (no spaces), e.g. `https://app1.vercel.app,https://app2.vercel.app`.
   - Redeploy the backend so the new env is applied. Without this, the browser will block requests from your frontend and the app will not work for judges.

**Caveats (Render free tier):**
- **Spin-down:** After ~15 minutes with no requests, the backend sleeps. The next request can take ~30–60 seconds (cold start). For a hackathon demo, use the app shortly before presenting or hit the backend health URL to wake it.
- **Ephemeral disk:** Anything written to disk (e.g. `state.json`, generated files under `backend/generated/`) is lost on restart/spin-down. For demo, re-upload a document after a cold start if needed, or use a free Postgres (e.g. Render PostgreSQL or Neon) and set `DATABASE_URL` for persistence.

**If you have AWS credits (hackathon):** You can instead run the backend on **AWS App Runner** (Free Tier has 2000 build min + 25k request min/month) and frontend on **Amplify** for an all-AWS setup that stays within free tier limits.

---

## Deployment path so judges can test

Follow this order so the **deployed app works end-to-end** for judges (no CORS errors, correct API and WebSocket URLs).

1. **Deploy backend first (e.g. Render)**
   - Build and deploy the backend (Docker or native).
   - Set env: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION=us-east-1`, `DEMO_GLOBAL=true`. Optionally `S3_BUCKET` for pitch reel.
   - **Do not set** `CORS_ORIGINS` yet (you need the frontend URL first).
   - Copy the backend base URL (e.g. `https://startup-copilot-backend.onrender.com`). The API base is that URL + `/api` (e.g. `https://startup-copilot-backend.onrender.com/api`).

2. **Deploy frontend (e.g. Vercel)**
   - Set **only** `NEXT_PUBLIC_BACKEND_URL` = backend API base from step 1 (e.g. `https://startup-copilot-backend.onrender.com/api`). The app uses this for all REST calls and derives the Virtual Tank WebSocket URL from it (`wss://.../api/virtual-tank/ws-sonic`).
   - Deploy. Copy the frontend URL (e.g. `https://startup-copilot.vercel.app`).

3. **Allow frontend in backend CORS**
   - On the **backend** (Render), add env: `CORS_ORIGINS` = your **exact** frontend URL from step 2 (e.g. `https://startup-copilot.vercel.app`). If you have multiple preview URLs, add them comma-separated (no spaces).
   - **Redeploy** the backend so the new env is applied.

4. **Verify**
   - Open the frontend URL. Log in (any founder name) → upload a document on onboarding → Mission Control should load.
   - Open **Virtual Tank** (“Let’s pitch”), start session, and confirm the sharks respond (WebSocket and Nova Sonic work).
   - If anything fails, check: backend health `https://your-backend.onrender.com/health`, browser devtools Network tab for CORS or 4xx errors, and that `NEXT_PUBLIC_BACKEND_URL` and `CORS_ORIGINS` match your deployed URLs (no trailing slash except after `/api` in BACKEND_URL).

5. **Share with judges**
   - Use `JUDGE_TEST_CREDENTIALS.md`: replace the placeholder with your **frontend URL**, then submit that doc (or its contents) so judges can open the app, log in with any name, upload a doc, and test all features.

---

## Easiest deployment options

### Option A: Easiest overall (no AWS for hosting)

| Part      | Where        | Free tier / cost |
|-----------|-------------|-------------------|
| Frontend  | **Vercel**  | Free (Next.js); connect repo, auto-deploy. |
| Backend   | **Railway** or **Render** | Free tier (e.g. Railway $5/mo credit, Render free tier). Deploy backend as a service (Docker or “run command”). |
| Bedrock   | Your AWS account (hackathon access) | Backend calls Bedrock using `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` (or profile) set as **env vars** on Railway/Render. |

- **Flow:** Frontend (Vercel) → `NEXT_PUBLIC_BACKEND_URL` = your Railway/Render backend URL. Backend uses env vars to call Bedrock/Polly/S3.
- **Pros:** Minimal setup, no AWS infra. Bedrock is still used; only hosting is off AWS.
- **Cons:** Backend must store AWS credentials in the platform’s env (use a dedicated IAM user with minimal Bedrock/Polly/S3 permissions).

### Option B: All on AWS (use Free Tier / credits)

| Part      | Where        | Notes |
|-----------|-------------|--------|
| Frontend  | **Amplify Hosting** or **S3 + CloudFront** | Amplify: connect repo, build Next.js. Free tier limits apply. |
| Backend   | **AWS App Runner** or **ECS (Fargate)** | Use the provided `backend/Dockerfile`; push image to ECR, create service. Free tier may cover small usage. |
| DB        | **RDS** (PostgreSQL) or keep **no DB** | Without `DATABASE_URL`, app uses `state.json` and mocks. For DB, RDS Free Tier or external (e.g. Neon, Supabase). |
| Bedrock   | Same AWS account (hackathon) | Backend uses instance role (App Runner/ECS) or IAM user keys in env. |

- **Pros:** Everything in one cloud; can use IAM roles instead of long-lived keys.
- **Cons:** More steps; Free Tier limits (e.g. hours, GB) still apply.

### Option C: One platform for both (simplest single place)

- **Railway** or **Render** can host **both** Next.js and FastAPI (two services in one project).
- Set **env** on the backend service: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, and any `DEMO_*` / `S3_BUCKET` / `DATABASE_URL` you need.
- Frontend service: set `NEXT_PUBLIC_BACKEND_URL` to the backend service URL.

---

## What to set in production

**Backend (all options) — must be set for Amazon Nova calls:**

- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` (required for Nova in deployed environments; IAM user keys recommended).
- `AWS_SESSION_TOKEN` only if using temporary credentials.
- `AWS_REGION=us-east-1` (or another Bedrock-supported region where Nova is available).
- `DEMO_GLOBAL=true` (or per-feature `DEMO_INGEST`, `DEMO_MARKET`, etc.) so the app calls real Nova/Bedrock instead of mocks.
- Do **not** rely on `AWS_PROFILE`/SSO in containers; use env vars above for Nova compatibility.

**Optional:**

- `S3_BUCKET` if you use pitch reel (Nova Reel).
- `DATABASE_URL` if you use PostgreSQL (optional; otherwise `state.json`).
- CORS: in `app/main.py`, add your frontend origin (e.g. `https://your-app.vercel.app`).

**Minimal IAM policy for Nova + Polly + S3 (attach to the user whose keys you use):**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Action": ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"], "Resource": "*" },
    { "Effect": "Allow", "Action": ["polly:SynthesizeSpeech", "polly:DescribeVoices"], "Resource": "*" },
    { "Effect": "Allow", "Action": ["s3:PutObject", "s3:GetObject", "s3:ListBucket"], "Resource": ["arn:aws:s3:::YOUR-BUCKET", "arn:aws:s3:::YOUR-BUCKET/*"] }
  ]
}
```

**Frontend:**

- `NEXT_PUBLIC_BACKEND_URL` = backend API base URL (e.g. `https://your-backend.railway.app/api` or `https://xxx.us-east-1.awsapprunner.com/api`).

---

## Backend Docker image (for Railway, Render, App Runner, ECS)

From repo root:

```bash
cd backend
docker build -t startup-copilot-backend .
docker run -p 8000:8000 --env-file .env startup-copilot-backend
```

Or from repo root:

```bash
docker build -f backend/Dockerfile -t startup-copilot-backend backend
```

Then push the image to a registry (Docker Hub, ECR) and point Railway/Render/App Runner/ECS at it.

---

## Summary

- **Hackathon Bedrock access** = use Nova/Bedrock from your backend; it does **not** by itself provide free app hosting.
- **Easiest path:** Frontend on **Vercel**, backend on **Railway** or **Render**, with AWS credentials in backend env so Bedrock works. All free tiers apply to hosting; Bedrock usage follows your hackathon/AWS credits.
- **All-AWS path:** Frontend on **Amplify**, backend on **App Runner** (or ECS) using the `backend/Dockerfile`; use Free Tier or hackathon credits for both compute and Bedrock.

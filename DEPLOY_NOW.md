# Deploy Now: Render (Backend) + Vercel (Frontend)

Follow these steps in order so the live app works for judges (CORS and API URL set correctly).

---

## Part 1: Backend on Render

### 1.1 Push your repo to GitHub (or GitLab)

Ensure your project is in a Git repo and pushed to GitHub (or a Git host Render supports).

### 1.2 Create Render account and connect repo

1. Go to [render.com](https://render.com) and sign up / log in.
2. **Dashboard** → **New +** → **Blueprint**.
3. Connect your Git provider and select the **STARTUP COPILOT** repo (or the repo that contains `backend/` and `render.yaml`).
4. Render will detect `render.yaml` in the root. Click **Apply**.

### 1.3 Set environment variables on Render

In the Render Dashboard, open your new **startup-copilot-backend** service → **Environment** tab.

Add these (the Blueprint marks some as “sync: false”, so you’ll be prompted to set them):

| Key | Value |
|-----|--------|
| `AWS_ACCESS_KEY_ID` | Your IAM user access key (for Bedrock/Polly/S3). |
| `AWS_SECRET_ACCESS_KEY` | Your IAM user secret key. |
| `AWS_REGION` | `us-east-1` (already in Blueprint). |
| `DEMO_GLOBAL` | `true` (already in Blueprint). |
| `CORS_ORIGINS` | Leave **empty** for now. You’ll set it after the frontend is deployed. |

Save. Let the service deploy (or trigger **Manual Deploy**).

### 1.4 Copy the backend URL

From the service page, copy the **URL** (e.g. `https://startup-copilot-backend.onrender.com`).

The **API base** the frontend needs is: **that URL + `/api`**

Example: `https://startup-copilot-backend.onrender.com/api`

---

## Part 2: Frontend on Vercel

### 2.1 Create Vercel account and import repo

1. Go to [vercel.com](https://vercel.com) and sign up / log in (e.g. with GitHub).
2. **Add New** → **Project** → import the **same repo** (STARTUP COPILOT).
3. **Configure Project**:
   - **Root Directory:** click **Edit** and set to **`frontend`** (so Vercel builds the Next.js app).
   - **Build Command:** leave default (`npm run build` or auto-detected).
   - **Output Directory:** leave default (Next.js uses `.next`; no override needed).

### 2.2 Set environment variable

In **Environment Variables** (during import or in Project → Settings → Environment Variables), add:

| Name | Value |
|------|--------|
| `NEXT_PUBLIC_BACKEND_URL` | Your backend **API base** from step 1.4, e.g. `https://startup-copilot-backend.onrender.com/api` (no trailing slash after `api`). |

Save.

### 2.3 Deploy

Click **Deploy**. Wait for the build to finish.

### 2.4 Copy the frontend URL

From the deployment or project page, copy the **production URL** (e.g. `https://startup-copilot.vercel.app`).

---

## Part 3: CORS (so judges can use the app)

### 3.1 Set CORS on the backend

1. In **Render** → your **startup-copilot-backend** service → **Environment**.
2. Set **`CORS_ORIGINS`** to your **exact** Vercel frontend URL from step 2.4, e.g.:
   - `https://startup-copilot.vercel.app`
3. If you use multiple frontend URLs (e.g. preview deployments), add them **comma-separated, no spaces**, e.g.:
   - `https://startup-copilot.vercel.app,https://startup-copilot-git-xyz.vercel.app`
4. Save.

### 3.2 Redeploy the backend

In Render, trigger **Manual Deploy** so the new `CORS_ORIGINS` is applied. Without this, the browser will block requests from your frontend.

---

## Part 4: Verify and share with judges

1. **Verify**
   - Open your **frontend URL** (e.g. `https://startup-copilot.vercel.app`).
   - Log in with any founder name → complete onboarding (upload a document) → open Mission Control.
   - Open **Virtual Tank** (“Let’s pitch”) and confirm the sharks respond (WebSocket + Nova Sonic).

2. **Share with judges**
   - Open **`JUDGE_TEST_CREDENTIALS.md`** in this repo.
   - Replace the **App URL** placeholder with your **frontend URL**.
   - Share that doc (or its contents) so judges can open the app, log in, upload a doc, and test.

---

## Quick reference

| What | Where |
|------|--------|
| Backend API base | `https://<your-backend>.onrender.com/api` |
| Frontend URL | `https://<your-project>.vercel.app` |
| Backend env (Render) | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION=us-east-1`, `DEMO_GLOBAL=true`, `CORS_ORIGINS=<frontend URL>` |
| Frontend env (Vercel) | `NEXT_PUBLIC_BACKEND_URL=<backend API base>` |

**Render free tier:** Backend may sleep after ~15 minutes of no traffic; the next request can take ~30–60 s (cold start). Use the app shortly before a demo or hit the backend health URL to wake it.

**Backend health check:** `https://<your-backend>.onrender.com/health`

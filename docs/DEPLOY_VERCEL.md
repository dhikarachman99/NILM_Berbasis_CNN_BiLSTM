# Deploy NILM Dashboard to Vercel

This project has **two parts**:

| Component | Host | Why |
|-----------|------|-----|
| **Next.js dashboard** (`/`) | [Vercel](https://vercel.com) | Optimized for Next.js |
| **ML service** (`ml_service/`) | [Render](https://render.com) (or Railway/Fly.io) | Flask + TensorFlow cannot run on Vercel Serverless |

The browser only talks to your Vercel app (`/api/blynk/latest`). Vercel server-side code calls ThingsBoard and your public ML service URL.

---

## Architecture

```
Browser → Vercel (Next.js)
              ├→ ThingsBoard API (env: THINGSBOARD_*)
              └→ ML service URL (env: ML_SERVICE_URL)
                     Render / Railway (Flask + model)
```

---

## 1. Push code to GitHub

```bash
git add .
git commit -m "Prepare Vercel deployment"
git push origin main
```

Ensure `src/nilm_models_v9/best_nilm_model.keras` is committed (required by ML service on Render).

**Do not commit `.env`** — it contains secrets. Use `.env.example` as reference.

---

## 2. Deploy ML service (Render)

1. Go to [render.com](https://render.com) → **New** → **Blueprint** (or **Web Service**).
2. Connect your GitHub repo.
3. If using **Blueprint**, Render reads [`render.yaml`](../render.yaml) at repo root.
4. If manual:
   - **Root directory:** `ml_service`
   - **Build:** `pip install -r requirements.txt`
   - **Start:** `gunicorn --bind 0.0.0.0:$PORT --workers 1 --threads 2 --timeout 120 app:app`
   - **Environment:** `NILM_MODEL_DIR=src/nilm_models_v9`
5. Wait for deploy (first build installs TensorFlow — can take 10–15 minutes).
6. Copy the public URL, e.g. `https://nilm-ml-service.onrender.com`.
7. Test: open `https://YOUR-ML-URL/health` — should return JSON OK.

**Free tier note:** Render free instances spin down after idle; first request may be slow (cold start).

---

## 3. Deploy dashboard (Vercel)

### Option A — Vercel Dashboard (recommended)

1. Go to [vercel.com/new](https://vercel.com/new).
2. **Import** your GitHub repository.
3. Framework preset: **Next.js** (auto-detected).
4. **Root directory:** leave as `.` (repository root).
5. **Build command:** `npm run build` (default).
6. Add **Environment Variables** (Production + Preview):

| Variable | Example | Notes |
|----------|---------|--------|
| `NILM_DATA_SOURCE` | `thingsboard` | or `blynk` |
| `USE_DUMMY_BLYNK` | `false` | `true` = no external APIs |
| `THINGSBOARD_BASE_URL` | `https://eu.thingsboard.cloud` | no trailing slash |
| `THINGSBOARD_ACCESS_TOKEN` | `j9b5w...` | device token |
| `THINGSBOARD_API_TOKEN` | `tb_...` | optional REST token |
| `THINGSBOARD_DEVICE_ID` | `da473900-...` | optional |
| `THINGSBOARD_USERNAME` | | fallback login |
| `THINGSBOARD_PASSWORD` | | fallback login |
| `THINGSBOARD_KEY_*` | | telemetry key names |
| `ML_SERVICE_URL` | `https://nilm-ml-service.onrender.com` | **public** ML URL, no trailing slash |
| `NEXT_PUBLIC_REFRESH_INTERVAL` | `3000` | ms, client-visible |

7. Click **Deploy**.

### Option B — Vercel CLI

```bash
npm i -g vercel
vercel login
vercel link
vercel env add ML_SERVICE_URL
# ... add other variables
vercel --prod
```

---

## 4. Verify production

1. Open your Vercel URL, e.g. `https://tugas-akhir.vercel.app`.
2. Dashboard should load telemetry and device detection.
3. If errors:
   - **"ML service HTML"** → wrong `ML_SERVICE_URL` or ML service sleeping (Render cold start).
   - **ThingsBoard error** → check tokens and `THINGSBOARD_BASE_URL`.
   - **Timeout** → Vercel Hobby limit is 10s per function; upgrade to Pro or increase `NEXT_PUBLIC_REFRESH_INTERVAL`.

---

## 5. Local vs production `.env`

| File | Use |
|------|-----|
| `.env.local` | Local development (gitignored) |
| Vercel Project → Settings → Environment Variables | Production |

Copy from [`.env.example`](../.env.example).

---

## 6. Optional settings

- **Region:** [`vercel.json`](../vercel.json) sets `sin1` (Singapore). Change if your users are elsewhere.
- **Dummy mode:** `USE_DUMMY_BLYNK=true` — works without ThingsBoard/ML (demo only).
- **ML on same machine:** only for local dev — `ML_SERVICE_URL=http://127.0.0.1:5001` does **not** work from Vercel cloud.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Build fails on Vercel | Run `npm run build` locally; fix TypeScript/ESLint errors |
| ML always "unknown" | Check `ML_SERVICE_URL` and `/health` on Render |
| 502 from `/api/blynk/latest` | ThingsBoard credentials or ML timeout |
| Model not found on Render | Set `NILM_MODEL_DIR=src/nilm_models_v9` and ensure keras file is in repo |

---

## Security checklist

- [ ] `.env` is **not** in Git
- [ ] Rotate any credentials that were ever committed
- [ ] Use Vercel **encrypted** env vars for passwords/tokens
- [ ] Do not set `NEXT_PUBLIC_` prefix on secret keys (only `NEXT_PUBLIC_REFRESH_INTERVAL` is safe)

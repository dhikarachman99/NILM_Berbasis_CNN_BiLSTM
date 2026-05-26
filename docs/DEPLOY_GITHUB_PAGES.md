# Deploy Dashboard on GitHub Pages

Static Next.js dashboard on **GitHub Pages** + ML on **Hugging Face Spaces**.

GitHub Pages cannot run Next.js API routes or TensorFlow. The browser calls your HF Space endpoint `/dashboard/latest`, which reads ThingsBoard and runs inference server-side.

---

## Architecture

```text
Browser (GitHub Pages)
    └── GET https://<hf-space>.hf.space/dashboard/latest
            ├── ThingsBoard (env on HF Space)
            └── NILM model inference
```

---

## Part 1 — Hugging Face ML service

See [DEPLOY_HUGGINGFACE.md](DEPLOY_HUGGINGFACE.md).

Add **ThingsBoard secrets on the HF Space** (not in GitHub Pages):

| Variable | Example |
|----------|---------|
| `THINGSBOARD_BASE_URL` | `https://eu.thingsboard.cloud` |
| `THINGSBOARD_ACCESS_TOKEN` | device token ESP32 |
| `THINGSBOARD_API_TOKEN` | optional REST token |
| `THINGSBOARD_DEVICE_ID` | optional UUID |
| `THINGSBOARD_KEY_*` | `tegangan`, `arus`, `daya`, … |
| `NILM_MODEL_DIR` | `src/nilm_models_v9` |
| `CORS_ORIGINS` | `*` or `https://youruser.github.io` |

Test:

```text
https://<username>-<space>.hf.space/dashboard/latest
https://<username>-<space>.hf.space/health
```

---

## Part 2 — Enable GitHub Pages

1. Push once to `main` (workflow creates branch `gh-pages`).
2. Repo → **Settings** → **Pages**
3. **Build and deployment** → Source: **Deploy from a branch**
4. Branch: **`gh-pages`** / folder **`/(root)`**
5. Save. Site URL:

```text
https://<username>.github.io/<repo-name>/
```

> Jika sebelumnya memakai **GitHub Actions** sebagai source dan error `upload-pages-artifact`, ganti ke **branch `gh-pages`** seperti di atas.

---

## Part 3 — GitHub repository secrets

**Settings** → **Secrets and variables** → **Actions** → **New repository secret**:

| Secret | Value |
|--------|--------|
| `ML_SERVICE_URL` | `https://yourusername-nilm-ml.hf.space` |

Optional **Variables** (not secret):

| Variable | Value |
|----------|--------|
| `USE_DUMMY_BLYNK` | `false` |
| `REFRESH_INTERVAL` | `3000` |

---

## Part 4 — Push to deploy

```bash
git add .
git commit -m "Configure GitHub Pages deployment"
git push origin main
```

Workflow: [`.github/workflows/deploy-pages.yml`](../.github/workflows/deploy-pages.yml)

- `npm run build` → folder `out/`
- Push ke branch **`gh-pages`** via `peaceiris/actions-gh-pages` (lebih stabil daripada `upload-pages-artifact`)

---

## Local development

`.env.local`:

```env
NEXT_PUBLIC_ML_SERVICE_URL=http://127.0.0.1:5001
NEXT_PUBLIC_USE_DUMMY_BLYNK=false
NEXT_PUBLIC_REFRESH_INTERVAL=3000
```

Terminal 1:

```bash
cd ml_service
python app.py
```

Terminal 2:

```bash
npm run dev
```

---

## Custom domain / root site

If the repo is `<username>.github.io` (user site), set repository variable or edit workflow:

```yaml
NEXT_PUBLIC_BASE_PATH: ""
```

For project pages `username.github.io/repo-name/`, default `/repo-name` is applied automatically.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Blank page / 404 assets | Check Pages URL includes repo name; verify `NEXT_PUBLIC_BASE_PATH` |
| CORS error | Set `CORS_ORIGINS` on HF Space to your `*.github.io` URL |
| ML error in UI | Open `/dashboard/latest` on HF directly |
| Build fails | Run `npm run build` locally |
| `upload-pages-artifact` error | Workflow sudah pakai `peaceiris/actions-gh-pages`; set Pages source ke branch `gh-pages` |
| Internal server error GitHub | Re-run workflow; atau tunggu beberapa menit lalu push lagi |
| Secrets in static JS | Only `NEXT_PUBLIC_*` are embedded — never put TB passwords in GitHub build secrets for Pages; keep them on HF Space |

---

## Dummy mode (no ThingsBoard)

HF Space: `USE_DUMMY_BLYNK=true`

GitHub variable: `USE_DUMMY_BLYNK=true`

Rebuild both.

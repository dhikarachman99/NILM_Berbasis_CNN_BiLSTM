# Deploy ML Service on Hugging Face Spaces

Use **Hugging Face Spaces (Docker)** for the Flask + TensorFlow ML service.  
Deploy the **Next.js dashboard** on [Vercel](DEPLOY_VERCEL.md) separately.

---

## 1. Create a Docker Space

1. Open [huggingface.co/new-space](https://huggingface.co/new-space).
2. Fill in:

| Field | Value |
|-------|--------|
| **Owner** | Your HF username or org |
| **Space name** | e.g. `nilm-ml-service` |
| **License** | MIT (or your choice) |
| **Select the Space SDK** | **Docker** |
| **Space hardware** | CPU basic (free) — upgrade if build is too slow |
| **Visibility** | Public (required for free API URL) |

3. Create Space.

---

## 2. Connect GitHub repository

1. In the Space → **Settings** → **Repository**.
2. Connect repo: `dhikarachman99/NILM_Berbasis_CNN_BiLSTM` (or your repo).
3. Ensure these files exist on `main`:

| File | Purpose |
|------|---------|
| [`Dockerfile`](../Dockerfile) | Builds ML service |
| [`ml_service/`](../ml_service/) | Flask app |
| [`src/nilm_models_v9/best_nilm_model.keras`](../src/nilm_models_v9/) | Model weights |

4. **Factory reboot** or push to `main` to trigger build.

---

## 3. Space README (optional)

Copy content from [`README_HF_SPACE.md`](../README_HF_SPACE.md) into the Space `README.md` on Hugging Face (YAML frontmatter + description).

---

## 4. Environment variables (HF Space)

In Space → **Settings** → **Variables and secrets**:

| Key | Value |
|-----|--------|
| `NILM_MODEL_DIR` | `src/nilm_models_v9` |
| `NILM_PRELOAD_MODEL` | `1` |

`PORT` is set to `7860` in the Dockerfile — do not override unless you change the Dockerfile.

---

## 5. Verify deployment

Your public API base URL:

```text
https://<username>-<space-name>.hf.space
```

Examples:

- Health: `https://yourusername-nilm-ml-service.hf.space/health`
- Root: `https://yourusername-nilm-ml-service.hf.space/`

First request after idle may take 1–2 minutes (cold start + TensorFlow load).

---

## 6. ThingsBoard env on HF Space (for GitHub Pages)

Set on the Space (Settings → Variables), **not** in the static site:

```env
THINGSBOARD_BASE_URL=https://eu.thingsboard.cloud
THINGSBOARD_ACCESS_TOKEN=your_device_token
THINGSBOARD_API_TOKEN=optional
THINGSBOARD_DEVICE_ID=optional
CORS_ORIGINS=*
```

## 7. Connect GitHub Pages

GitHub repo → **Settings** → **Secrets** → Actions:

| Secret | Value |
|--------|--------|
| `ML_SERVICE_URL` | `https://yourusername-nilm-ml-service.hf.space` |

See [DEPLOY_GITHUB_PAGES.md](DEPLOY_GITHUB_PAGES.md).

---

## 7. Local Docker test (optional)

```bash
docker build -t nilm-ml .
docker run -p 7860:7860 -e NILM_PRELOAD_MODEL=1 nilm-ml
curl http://localhost:7860/health
```

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Build OOM / timeout | Use Space **CPU upgrade** or reduce TensorFlow in `requirements.txt` |
| Model not found | Confirm `best_nilm_model.keras` is in Git LFS if file > 10MB |
| 502 from Vercel | Wait for HF Space to finish building; open `/health` in browser |
| Wrong URL | Use `.hf.space` URL, no trailing slash |

### Git LFS for large model

If `best_nilm_model.keras` is rejected by GitHub:

```bash
git lfs install
git lfs track "*.keras"
git add .gitattributes src/nilm_models_v9/best_nilm_model.keras
git commit -m "Track keras model with LFS"
git push
```

---

## Architecture

```text
Browser → Vercel (Next.js)
            ├→ ThingsBoard
            └→ https://<user>-<space>.hf.space/ingest
```

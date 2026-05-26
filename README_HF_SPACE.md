---
title: NILM ML Service
emoji: ⚡
colorFrom: blue
colorTo: orange
sdk: docker
app_port: 7860
pinned: false
license: mit
---

# NILM ML Service (v9 multilabel)

Flask API for NILM device inference. Used by the Next.js dashboard on Vercel.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Service & model status |
| GET | `/latest` | Latest inference result |
| POST | `/ingest` | Send sensor sample, run inference |
| GET | `/labels` | Model label list |

## Environment

| Variable | Default |
|----------|---------|
| `NILM_MODEL_DIR` | `src/nilm_models_v9` |

## Connect from Vercel

```env
ML_SERVICE_URL=https://YOUR-USERNAME-YOUR-SPACE-NAME.hf.space
```

No trailing slash. Test: `https://YOUR-SPACE.hf.space/health`

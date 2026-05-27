# Production: GitHub Pages + Hugging Face

Setup aktif Anda:

| Layer | URL |
|-------|-----|
| **Frontend (FE)** | https://dhikarachman99.github.io/NILM_Berbasis_CNN_BiLSTM/ |
| **ML service** | https://dhikarachman-nilm-ml-service.hf.space |
| **HF Space settings** | https://huggingface.co/spaces/dhikarachman/nilm-ml-service/settings |

```text
Browser (GitHub Pages)
    └── GET https://dhikarachman-nilm-ml-service.hf.space/predict/live
            ├── ThingsBoard (env di HF Space)
            └── Inferensi NILM v9
```

---

## 1. Hugging Face Space — Variables & secrets

Space → **Settings** → **Variables and secrets**:

```env
NILM_MODEL_DIR=src/nilm_models_v9
NILM_PRELOAD_MODEL=1
USE_DUMMY_BLYNK=false

THINGSBOARD_BASE_URL=https://eu.thingsboard.cloud
THINGSBOARD_API_TOKEN=tb_...
THINGSBOARD_DEVICE_ID=<DEVICE_UUID>

THINGSBOARD_KEY_VOLTAGE=tegangan
THINGSBOARD_KEY_CURRENT=arus
THINGSBOARD_KEY_POWER=daya
THINGSBOARD_KEY_ENERGY=kwh
THINGSBOARD_KEY_FREQUENCY=frekuensi
THINGSBOARD_KEY_POWER_FACTOR=power_factor

CORS_ORIGINS=https://dhikarachman99.github.io,http://localhost:3000,http://127.0.0.1:3000
```

**Penting:** `CORS_ORIGINS` harus memuat `https://dhikarachman99.github.io` (tanpa path repo).

Tes:

- https://dhikarachman-nilm-ml-service.hf.space/health
- https://dhikarachman-nilm-ml-service.hf.space/telemetry/latest
- https://dhikarachman-nilm-ml-service.hf.space/predict/live

---

## 2. GitHub — Secret Actions

| Secret | Value |
|--------|--------|
| `ML_SERVICE_URL` | `https://dhikarachman-nilm-ml-service.hf.space` |

Push ke `main` → deploy ke folder `docs/`.

---

## 3. GitHub Pages

**Settings** → **Pages** → branch **`main`**, folder **`/docs`**.

---

## Troubleshooting (dashboard kosong / Offline)

| Gejala | Solusi |
|--------|--------|
| Semua `--` | Wake HF Space: buka `/health`, tunggu 1–2 menit |
| CORS error | Set `CORS_ORIGINS` di HF (lihat atas) |
| 502 / TB error | Cek `THINGSBOARD_*` di HF Variables |
| Build FE lama | Push `main` ulang setelah set secret |

Console (F12): `predict/live` harus HTTP **200**, `ok: true`.

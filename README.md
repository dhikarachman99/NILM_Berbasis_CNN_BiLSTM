# NILM Energy Monitoring Dashboard

Dashboard modern untuk sistem Non-Intrusive Load Monitoring (NILM) berbasis Deep Learning dengan sumber data dari `ESP32 + PZEM-004T` melalui `ThingsBoard`, lalu diteruskan ke service inferensi model.

> **Live dashboard (GitHub Pages):** setelah deploy, buka  
> `https://<username>.github.io/<nama-repo>/`  
> Bukan halaman README repo — atur **Settings → Pages → branch `main` → folder `/docs`**.  
> Panduan: [doc/DEPLOY_GITHUB_PAGES.md](doc/DEPLOY_GITHUB_PAGES.md)

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Recharts
- Lucide React

## Fitur Utama

- Monitoring parameter listrik real-time
- Dashboard statis (GitHub Pages) hanya memanggil endpoint publik Hugging Face Space
- Hugging Face Space membaca telemetry live dari ThingsBoard via REST API tenant, lalu menjalankan inferensi NILM
- Fallback mock data untuk simulasi saat mode dummy diaktifkan
- Summary cards, power chart, device detection panel, energy cost estimation
- System status page dan settings page
- Responsive layout untuk desktop dan smartphone

## Install Dependencies

```bash
npm install
```

## Menjalankan Project

```bash
npm run dev
```

Lalu buka `http://localhost:3000`.

## Build Production

```bash
npm run build
npm run start
```

## Deploy

| Part | Platform |
|------|----------|
| Dashboard (Next.js static) | **GitHub Pages** — [doc/DEPLOY_GITHUB_PAGES.md](doc/DEPLOY_GITHUB_PAGES.md) |
| ML + ThingsBoard pipeline | **Hugging Face Spaces (Docker)** — [doc/DEPLOY_HUGGINGFACE.md](doc/DEPLOY_HUGGINGFACE.md) |

GitHub Pages dashboard memanggil base URL HF Space lewat `NEXT_PUBLIC_ML_SERVICE_URL`.

## Arsitektur (aman)

```text
Browser (GitHub Pages)
  └── GET https://<user>-<space>.hf.space/predict/live
        ├── ThingsBoard tenant REST API (Secrets/Variables di HF)
        └── NILM inference (model di HF Space)
```

- Dashboard tidak pernah memanggil ThingsBoard langsung.
- Tidak ada token/password/API key ThingsBoard yang dikirim ke browser.

## Environment Variables

### 1) GitHub Pages (public)

Set di build environment untuk frontend (hanya yang aman dipublikasi):

```env
NEXT_PUBLIC_ML_SERVICE_URL=https://<user>-<space>.hf.space
NEXT_PUBLIC_REFRESH_INTERVAL=3000
NEXT_PUBLIC_USE_DUMMY_BLYNK=false
```

### 2) Hugging Face Space (server-only)

Semua `THINGSBOARD_*` harus disimpan di HF Space **Secrets/Variables** (bukan di source code dan bukan di `NEXT_PUBLIC_*`).

**HF Space Variables (Public/Variables)**

```env
NILM_MODEL_DIR=src/nilm_models_v9
NILM_DATA_SOURCE=thingsboard
USE_DUMMY_BLYNK=false
CORS_ORIGINS=https://dhikarachman99.github.io,http://localhost:3000,http://localhost:5173

THINGSBOARD_BASE_URL=https://eu.thingsboard.cloud
THINGSBOARD_DEVICE_ID=<DEVICE_UUID>
THINGSBOARD_KEY_VOLTAGE=tegangan
THINGSBOARD_KEY_CURRENT=arus
THINGSBOARD_KEY_POWER=daya
THINGSBOARD_KEY_ENERGY=kwh
THINGSBOARD_KEY_FREQUENCY=frekuensi
THINGSBOARD_KEY_POWER_FACTOR=power_factor
```

**HF Space Secrets (Private/Secrets)**

```env
THINGSBOARD_API_TOKEN=tb_...
# optional fallback jika ApiKey tidak tersedia:
THINGSBOARD_USERNAME=...
THINGSBOARD_PASSWORD=...
```

Catatan: `THINGSBOARD_ACCESS_TOKEN` adalah credential device untuk publish telemetry, bukan untuk baca telemetry dashboard.

## Endpoint (HF Space)

- `GET /health`
- `GET /telemetry/latest`
- `GET /predict/live`
- `GET /dashboard/latest` (legacy untuk kompatibilitas)

## Testing (curl)

```bash
curl -s https://<user>-<space>.hf.space/health
curl -s https://<user>-<space>.hf.space/telemetry/latest
curl -s https://<user>-<space>.hf.space/predict/live
```

## Contoh Response

### Sukses: `/predict/live`

```json
{
  "ok": true,
  "source": "thingsboard",
  "device_id": "sha256:1a2b3c4d",
  "telemetry": {
    "voltage": {"key": "tegangan", "value": 216.5, "ts": 1716812786000},
    "current": {"key": "arus", "value": 0.161, "ts": 1716812786000},
    "power": {"key": "daya", "value": 20.8, "ts": 1716812786000},
    "energy": {"key": "kwh", "value": 3.825, "ts": 1716812786000},
    "frequency": {"key": "frekuensi", "value": 50.0, "ts": 1716812786000},
    "power_factor": {"key": "power_factor", "value": 0.6, "ts": 1716812786000}
  },
  "prediction": {
    "ok": true,
    "data": {
      "label": "idle",
      "confidence": 21.2,
      "model_version": "v9_multilabel",
      "timestamp": "2026-05-27T12:26:26.296434Z",
      "buffer": {"received": 1, "window": 30, "status": "WARMING", "bar": "[#-------------------]"}
    },
    "error": null
  },
  "warnings": []
}
```

### Error aman: autentikasi gagal

```json
{
  "ok": false,
  "source": "thingsboard",
  "error": "ThingsBoard authentication failed"
}
```

## Debug cepat (telemetry kosong / HF sleep)

- HF Space idle/cold start: buka `/health` dulu, tunggu sampai siap.
- CORS error di browser: pastikan `CORS_ORIGINS` hanya berisi origin tanpa path (contoh: `https://dhikarachman99.github.io`).
- Telemetry kosong: cek key ThingsBoard (`THINGSBOARD_KEY_*`) sesuai yang dipublish device.
- 401/403: cek `THINGSBOARD_API_TOKEN` atau kredensial login di HF Secrets.

## Menjalankan ML Service (lokal)

```bash
cd ml_service
python app.py
```

Service Flask berjalan default di `http://127.0.0.1:5001`.

Untuk local dev, simpan credential ThingsBoard di `.env.local` (file ini tidak boleh di-commit).

## Key Telemetry ThingsBoard

- `tegangan -> voltage`
- `arus -> current`
- `daya -> power`
- `kwh -> energy`
- `frekuensi -> frequency`
- `power_factor -> power_factor`

Output inferensi yang dikembalikan backend:

- `device_detected`
- `confidence`
- `model_version`
- `timestamp`

## Cara Ganti Tarif Listrik

- Buka menu `Settings`
- Ubah field `Tarif listrik per kWh`
- Nilai otomatis disimpan di browser melalui `localStorage`

## Catatan Security

- Jangan taruh `THINGSBOARD_*` (token/password/device id) di GitHub Pages, `NEXT_PUBLIC_*`, atau source code.
- Jangan simpan token ThingsBoard di `localStorage/sessionStorage`.

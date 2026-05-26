# Dev lokal — dashboard memakai HF Space (disarankan)

Dashboard di laptop memanggil API cloud; **tidak perlu** menjalankan `python app.py` lokal.

```powershell
cd c:\Users\Dhikarachman\tugas_akhir
copy env.local.example .env.local
npm install
npm run dev
```

Buka: http://localhost:3000

Default API: `https://dhikarachman-nilm-ml-service.hf.space`

**HF Space → CORS_ORIGINS** harus mencakup:

```env
CORS_ORIGINS=https://dhikarachman99.github.io,http://localhost:3000,http://127.0.0.1:3000
```

Tes API:

```powershell
.\scripts\test-hf-api.ps1
```

---

## Mode lama — ML service lokal (opsional)

Hanya jika ingin debug Flask di port 5001:

```powershell
cd c:\Users\Dhikarachman\tugas_akhir\ml_service
python app.py
```

`.env.local`:

```env
NEXT_PUBLIC_ML_SERVICE_URL=http://127.0.0.1:5001
ML_SERVICE_URL=http://127.0.0.1:5001
```

---

## Quick start (satu script)

```powershell
cd c:\Users\Dhikarachman\tugas_akhir
.\quick_start.ps1
```

Lalu di terminal lain: `npm run dev`

---

## Troubleshooting

| Masalah | Solusi |
|---------|--------|
| ML service gagal load model | Cek `src/nilm_models_v9/best_nilm_model.keras` ada |
| Dashboard "ML service error" | Pastikan terminal ML masih jalan; buka `/health` |
| ThingsBoard 401 | Token `tb_*` harus REST API key (Profile → Security). Restart ML service setelah ubah `.env` |
| ThingsBoard error lain | Cek token di `.env`; atau `USE_DUMMY_BLYNK=true` |
| CORS error + 404 `/dashboard/latest` | Proses lama masih jalan di port 5001. Hentikan lalu restart `python app.py` (lihat bawah) |
| CORS error saja | Restart `python app.py` (sudah ada flask-cors) |

**404 `/dashboard/latest`:** buka http://127.0.0.1:5001/ — jika daftar endpoint **tidak** memuat `/dashboard/latest`, server masih versi lama:

```powershell
# Cari PID di port 5001 (Windows)
netstat -ano | findstr :5001
# Hentikan (ganti <PID>)
taskkill /PID <PID> /F
cd c:\Users\Dhikarachman\tugas_akhir\ml_service
python app.py
```

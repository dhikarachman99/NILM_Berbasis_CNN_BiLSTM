# Jalankan semuanya di local (tanpa Hugging Face)

Bisa. ML service + dashboard bisa jalan sepenuhnya di komputer Anda.

> **Catatan:** GitHub Pages (online) tidak bisa memanggil `http://127.0.0.1` di laptop Anda.  
> Mode local ini untuk development / demo di PC yang sama.

---

## Terminal 1 — ML service

```powershell
cd c:\Users\Dhikarachman\tugas_akhir\ml_service
pip install -r requirements.txt
python app.py
```

Tunggu sampai muncul **Model SIAP** dan:

```text
Server: http://127.0.0.1:5001
```

Tes di browser:

- http://127.0.0.1:5001/health
- http://127.0.0.1:5001/dashboard/latest

---

## Terminal 2 — Dashboard

```powershell
cd c:\Users\Dhikarachman\tugas_akhir
npm install
npm run dev
```

Buka: http://localhost:3000

---

## File `.env` (sudah Anda punya)

Pastikan ada:

```env
NILM_MODEL_DIR=src/nilm_models_v9
NILM_DATA_SOURCE=thingsboard
ML_SERVICE_URL=http://127.0.0.1:5001
THINGSBOARD_BASE_URL=https://eu.thingsboard.cloud
THINGSBOARD_ACCESS_TOKEN=...
# ... key telemetry lainnya
USE_DUMMY_BLYNK=false
```

`ML_SERVICE_URL` otomatis dipakai dashboard saat `npm run dev`.

Tanpa ThingsBoard (simulasi saja):

```env
USE_DUMMY_BLYNK=true
```

di HF Space / ml_service env — atau set di `.env` dan jalankan ML dengan dummy (lihat bawah).

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
| ThingsBoard error | Cek token di `.env`; atau `USE_DUMMY_BLYNK=true` |
| CORS error | Restart `python app.py` (sudah ada flask-cors) |

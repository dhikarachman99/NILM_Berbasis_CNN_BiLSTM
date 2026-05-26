# Jalankan ML service dari folder ml_service (memuat .env dari root proyek)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $PSScriptRoot

if (-not (Test-Path (Join-Path $root "src\nilm_models_v9\best_nilm_model.keras"))) {
  Write-Host "ERROR: Model tidak ditemukan di src\nilm_models_v9\" -ForegroundColor Red
  Write-Host "Pastikan best_nilm_model.keras dan meta_nilm.json ada." -ForegroundColor Yellow
  exit 1
}

$env:NILM_MODEL_DIR = "src/nilm_models_v9"
Write-Host "Memulai ML service (port 5001)..." -ForegroundColor Cyan
python app.py

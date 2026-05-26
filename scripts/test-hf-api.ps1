# Tes koneksi ke HF ML Space
$Base = "https://dhikarachman-nilm-ml-service.hf.space"

Write-Host "GET $Base/health" -ForegroundColor Cyan
Invoke-RestMethod "$Base/health" | ConvertTo-Json -Depth 5

Write-Host "`nGET $Base/dashboard/latest" -ForegroundColor Cyan
Invoke-RestMethod "$Base/dashboard/latest" | ConvertTo-Json -Depth 6

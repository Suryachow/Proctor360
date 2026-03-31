Write-Host "Starting Proctor360 stack..." -ForegroundColor Cyan
if (-Not (Test-Path "../.env")) {
  Write-Host "No .env found. Creating from template." -ForegroundColor Yellow
  Copy-Item "../.env.example" "../.env"
}
Push-Location ".."
docker compose up --build
Pop-Location

Write-Host "Starting Proctor360 Local Development Stack..." -ForegroundColor Cyan

# Start API server
Write-Host "Starting API Server on port 8000..." -ForegroundColor Green
Push-Location "../services/api"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"
Pop-Location

# Start AI Engine
Write-Host "Starting AI Engine on port 8100..." -ForegroundColor Green
Push-Location "../services/ai-engine"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "uvicorn app.main:app --host 0.0.0.0 --port 8100 --reload"
Pop-Location

# Start Student Portal
Write-Host "Starting Student Portal on port 5173..." -ForegroundColor Green
Push-Location "../apps/student-portal"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "npm run dev"
Pop-Location

# Start Admin Dashboard
Write-Host "Starting Admin Dashboard on port 5174..." -ForegroundColor Green
Push-Location "../apps/admin-dashboard"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "npm run dev"
Pop-Location

Write-Host ""
Write-Host "All services starting locally!" -ForegroundColor Cyan
Write-Host "  API:              http://localhost:8000" -ForegroundColor White
Write-Host "  AI Engine:        http://localhost:8100" -ForegroundColor White
Write-Host "  Student Portal:   http://localhost:5173" -ForegroundColor White
Write-Host "  Admin Dashboard:  http://localhost:5174" -ForegroundColor White

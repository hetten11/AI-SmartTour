@echo off
title SmartTour AI - Da Nang Launcher
echo ==============================================
echo    SmartTour AI - Da Nang: Khoi dong he thong
echo ==============================================

start "SmartTour API (Port 8000)" cmd /k "cd /d %~dp0api && pnpm dev"
start "SmartTour Web (Port 3000)" cmd /k "cd /d %~dp0web && pnpm dev"

echo.
echo [DA XONG] Backend va Frontend dang khoi dong trong 2 cua so rieng!
echo - Backend API : http://localhost:8000
echo - Frontend Web: http://localhost:3000
echo.
pause


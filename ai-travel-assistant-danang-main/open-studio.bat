@echo off
title Prisma Studio - SmartTour Database Viewer
echo ====================================================
echo   Dang khoi dong Prisma Studio de xem du lieu...
echo ====================================================

cd /d %~dp0api
pnpm prisma studio
pause


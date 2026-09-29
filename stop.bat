@echo off
setlocal
title LiveFlow - Stop
cd /d "%~dp0"

echo Arresto LiveKit nativo...
taskkill /f /im livekit-server.exe >nul 2>&1

echo Arresto LiveKit Egress worker...
docker rm -f liveflow-egress >nul 2>&1

echo Arresto dei container LiveFlow (Postgres / Redis / MediaMTX)...
docker compose -f docker-compose.dev.yml down

echo(
echo Container fermati. I dati del database restano nei volumi Docker.
echo Per cancellare anche i dati:  docker compose -f docker-compose.dev.yml down -v
echo(
echo NB: eventuali finestre con "pnpm dev" vanno chiuse con CTRL+C.
pause
endlocal

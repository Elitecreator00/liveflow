@echo off
setlocal enabledelayedexpansion
title LiveFlow - Avvio
set "COREPACK_ENABLE_DOWNLOAD_PROMPT=0"
cd /d "%~dp0"

echo(
echo ===============================================
echo            LIVEFLOW - avvio ambiente
echo ===============================================
echo(

REM --- 1. Docker Desktop in esecuzione? --------------------------------
echo [1/7] Verifica Docker...
docker info >nul 2>&1
if errorlevel 1 (
  echo    Docker non attivo: avvio Docker Desktop e attendo...
  start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
  call :waitdocker
)
echo    Docker OK.

REM --- 1b. ffmpeg (serve al fan-out verso le piattaforme) --------------
where ffmpeg >nul 2>&1
if errorlevel 1 (
  echo    ATTENZIONE: ffmpeg non e' nel PATH. Il fan-out verso le piattaforme
  echo    non funzionera'. Installa con:  winget install Gyan.FFmpeg
  echo    e poi RIAPRI il terminale.
)

REM --- 2. File .env (creali se mancanti) -------------------------------
echo [2/7] Configurazione .env...
if not exist "apps\api\.env" copy /y "apps\api\.env.example" "apps\api\.env" >nul
if not exist "apps\console\.env.local" ( >"apps\console\.env.local" echo NEXT_PUBLIC_API_URL=http://localhost:3001 )
if not exist "apps\creator\.env.local" ( >"apps\creator\.env.local" echo NEXT_PUBLIC_API_URL=http://localhost:3001 )
echo    OK.

REM --- 3. Dipendenze ---------------------------------------------------
echo [3/7] Dipendenze (pnpm)...
if not exist "node_modules" (
  echo    Installazione in corso, puo' richiedere qualche minuto...
  call pnpm install
  if errorlevel 1 ( echo    ERRORE: pnpm install & goto fail )
) else (
  echo    Gia' installate.
)

REM --- 4. Infrastruttura Docker ----------------------------------------
REM   NB: il servizio "livekit" del compose NON va avviato (gira nativo, sotto).
echo [4/7] Avvio Postgres / Redis / MediaMTX...
docker compose -f docker-compose.dev.yml up -d postgres redis mediamtx
if errorlevel 1 ( echo    ERRORE: docker compose & goto fail )
echo    Attendo che Postgres sia pronto...
call :waitpg
echo    Postgres pronto.

REM --- 4b. LiveKit: SELF-HOST PUBBLICO SUL VPS (non piu' locale) -------
REM   Il LiveKit nativo su Windows e' stato dismesso: causava una sfilza di
REM   problemi (IP DHCP che cambia, adattatore WSL, mDNS di Chrome che nasconde
REM   l'IP dell'operatore -> "could not establish pc connection"). Ora puntiamo a
REM   un LiveKit self-host sul VPS (IP pubblico): creator, operatore e farm si
REM   connettono via il loro candidato pubblico, niente piu' problemi di rete
REM   locale. E' anche necessario per l'app creator su telefono.
REM   Setup VPS: spikes/multibrowser/setup-livekit-public.sh.
echo [4b/7] LiveKit: uso il self-host sul VPS (57.131.31.233:7880)...
set "LIVEKIT_HOST=57.131.31.233"
set "LIVEKIT_API_KEY=LKf6e5136854"
REM   Data-plane orchestrator (farm multi-browser) sul VPS: l'API gli passa la
REM   launch spec per accendere le sessioni browser isolate (ADR-0010).
set "ORCHESTRATOR_URL=http://57.131.31.233:7090"
REM   Segreti (LIVEKIT_API_SECRET, ORCH_TOKEN) fuori dal codice: stanno in
REM   secrets.local.bat, escluso da git. Modello: secrets.local.example.bat.
if not exist "%~dp0secrets.local.bat" (
  echo ERRORE: manca secrets.local.bat accanto a start.bat.
  echo Copia secrets.local.example.bat in secrets.local.bat e inserisci i valori.
  pause
  exit /b 1
)
call "%~dp0secrets.local.bat"
taskkill /f /im livekit-server.exe >nul 2>&1

REM --- 4c. LiveKit Egress worker (render scena -> RTMP) ---------------
REM   Worker Linux in Docker: si registra su Redis e, su richiesta, lancia
REM   Chrome headless per comporre la scena e fare push RTMP. Idle = leggero;
REM   pesante solo durante un render attivo.
echo [4c/7] Avvio LiveKit Egress worker...
docker rm -f liveflow-egress >nul 2>&1
docker run -d --name liveflow-egress --restart unless-stopped --cap-add SYS_ADMIN ^
  -e EGRESS_CONFIG_FILE=/etc/egress.yaml ^
  -v "%~dp0tools\livekit\egress.dev.yaml:/etc/egress.yaml:ro" ^
  livekit/egress:latest >nul 2>&1
if errorlevel 1 ( echo    NB: Egress non avviato ^(non bloccante^). )

REM --- 5. Build design-system -----------------------------------------
echo [5/7] Build design-system...
call pnpm --filter @liveflow/design-system build
if errorlevel 1 ( echo    ERRORE: build design-system & goto fail )

REM --- 6. Database: schema + dati demo (idempotente) ------------------
echo [6/7] Database: schema + dati demo...
call pnpm --filter @liveflow/api run db:generate
call pnpm --filter @liveflow/api run db:push
call pnpm --filter @liveflow/api run db:seed

REM --- 7. Avvio app ----------------------------------------------------
echo [7/7] Avvio app (API :3001 + Web :3000)...
echo(
echo ---------------------------------------------------------------
echo   App in avvio. Il browser si aprira' tra ~15 secondi.
echo(
echo   Console Agenzia:  http://localhost:3000
echo   App Creator:      http://localhost:3100
echo   API:              http://localhost:3001/health
echo(
echo   Login demo:  demo@liveflow.dev  /  liveflow123
echo(
echo   Lascia APERTA questa finestra. CTRL+C per fermare le app.
echo   Per fermare i container Docker: stop.bat
echo ---------------------------------------------------------------
echo(

REM Apre il browser dopo 15s su Console (3000) e App Creator (3100)
start "" cmd /c "timeout /t 15 >nul & explorer http://localhost:3000 & explorer http://localhost:3100"

REM URL che il container Egress deve raggiungere sull'host (host.docker.internal):
REM la pagina-scena (console :3000) e il composite RTMP (MediaMTX :1935).
set "SCENE_RENDER_BASE_URL=http://host.docker.internal:3000"
set "COMPOSITE_RTMP_BASE=rtmp://host.docker.internal:1935/composite"

REM URL LiveKit calcolati dall'IP rilevato allo step 4b: vincono sui valori
REM (eventualmente stantii) di apps\api\.env perche' sono process env.
REM   LIVEKIT_URL          = API -> LiveKit (room mgmt)  -> VPS pubblico
REM   LIVEKIT_WS_PUBLIC_URL = browser/creator/operatore -> VPS pubblico
set "LIVEKIT_URL=ws://%LIVEKIT_HOST%:7880"
set "LIVEKIT_WS_PUBLIC_URL=ws://%LIVEKIT_HOST%:7880"

REM Avvia API + Web insieme (turbo). Rimane in esecuzione qui.
call pnpm dev

echo(
echo Le app si sono fermate.
pause
goto end

REM ===================== SUBROUTINE =====================
:waitdocker
docker info >nul 2>&1
if errorlevel 1 (
  timeout /t 3 >nul
  goto waitdocker
)
goto :eof

:waitpg
docker exec liveflow-postgres pg_isready -U liveflow >nul 2>&1
if errorlevel 1 (
  timeout /t 3 >nul
  goto waitpg
)
goto :eof

:fail
echo(
echo *** Avvio interrotto. Leggi i messaggi qui sopra. ***
pause
goto end

:end
endlocal

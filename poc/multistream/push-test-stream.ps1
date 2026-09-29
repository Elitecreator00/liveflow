# ──────────────────────────────────────────────────────────────────
# LiveFlow PoC — Script di test push stream (PowerShell / Windows)
# Simula il device inviando un segnale di test verso MediaMTX.
# Richiede: ffmpeg nel PATH (installabile con: winget install ffmpeg)
#
# Uso:
#   .\push-test-stream.ps1
#   .\push-test-stream.ps1 -StreamKey mykey -RtmpHost 192.168.1.x
# ──────────────────────────────────────────────────────────────────

param(
    [string]$StreamKey = $env:STREAM_KEY ?? "liveflow_secret",
    [string]$RtmpHost  = $env:RTMP_HOST  ?? "localhost",
    [string]$RtmpPort  = $env:RTMP_PORT  ?? "1935",
    [int]   $Duration  = 0
)

$TargetUrl = "rtmp://${RtmpHost}:${RtmpPort}/live/${StreamKey}"

Write-Host ""
Write-Host "LiveFlow PoC --- Test Stream Push (Windows)" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Target:  $TargetUrl"
Write-Host "Video:   testsrc2 (1280x720, 30fps)"
Write-Host "Audio:   sine 440Hz"
Write-Host ""
Write-Host "Verifica fan-out (apri in browser o VLC):"
Write-Host "  http://localhost:8081/hls/stream1/index.m3u8" -ForegroundColor Green
Write-Host "  http://localhost:8082/hls/stream2/index.m3u8" -ForegroundColor Green
Write-Host ""
Write-Host "Ctrl+C per fermare."
Write-Host ""

# Controlla ffmpeg
if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
    Write-Host "[ERRORE] ffmpeg non trovato nel PATH." -ForegroundColor Red
    Write-Host "Installa con: winget install ffmpeg" -ForegroundColor Yellow
    Write-Host "Oppure scarica da: https://ffmpeg.org/download.html"
    exit 1
}

$ffmpegArgs = @(
    "-hide_banner",
    "-re",
    "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=30",
    "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-tune", "zerolatency",
    "-b:v", "2000k",
    "-maxrate", "2500k",
    "-bufsize", "4000k",
    "-g", "60",
    "-c:a", "aac",
    "-b:a", "128k",
    "-ar", "44100"
)

if ($Duration -gt 0) {
    $ffmpegArgs += @("-t", "$Duration")
}

$ffmpegArgs += @("-f", "flv", $TargetUrl)

& ffmpeg @ffmpegArgs

Write-Host ""
Write-Host "Stream terminato." -ForegroundColor Cyan

<#
.SYNOPSIS
  Sobe o OCI DocGen em modo desenvolvimento (hot reload), sem rebuild de imagem.

.DESCRIPTION
  - Redis em container Docker (oci-docgen-redis, porta 6379)
  - API FastAPI local com uvicorn --reload   -> http://127.0.0.1:8000
  - Worker Celery local (pool solo, Windows)  -> reinicie manualmente ao mudar o codigo dele
  - Frontend estatico local                   -> http://localhost:3000

  Cada servico abre em uma janela propria do PowerShell.

.PARAMETER Install
  Forca reinstalar as dependencias do backend (pip install -r requirements.txt).

.PARAMETER Stop
  Encerra as janelas abertas por este script e para o container do Redis.

.EXAMPLE
  .\scripts\dev.ps1
  .\scripts\dev.ps1 -Install
  .\scripts\dev.ps1 -Stop
#>
param(
    [switch]$Install,
    [switch]$Stop
)

# 'Continue' de proposito: no Windows PowerShell 5.1, texto no stderr de comandos
# nativos (docker, pip) vira erro fatal com 'Stop'. As falhas sao checadas via $LASTEXITCODE.
$ErrorActionPreference = 'Continue'

$Root        = Split-Path $PSScriptRoot -Parent
$Backend     = Join-Path $Root 'backend'
$Frontend    = Join-Path $Root 'frontend'
$Venv        = Join-Path $Backend '.venv'
$VenvPython  = Join-Path $Venv 'Scripts\python.exe'
$EnvFile     = Join-Path $Root '.env'
$PidFile     = Join-Path $Root '.dev-pids'
$RedisName   = 'oci-docgen-redis'
$RedisUrl    = 'redis://localhost:6379/0'
$ApiPort     = 8000
$FrontPort   = 3000

function Write-Step($msg) { Write-Host "==> $msg" -ForegroundColor Cyan }

# ---------------------------------------------------------------------------
# -Stop
# ---------------------------------------------------------------------------
if ($Stop) {
    Write-Step 'Encerrando servicos'
    if (Test-Path $PidFile) {
        foreach ($p in Get-Content $PidFile) {
            if ($p -match '^\d+$') { & taskkill /PID $p /T /F 2>$null | Out-Null }
        }
        Remove-Item $PidFile -Force
    }
    & docker stop $RedisName 2>$null | Out-Null
    Write-Host 'Pronto. (O container do Redis foi parado, nao removido.)'
    exit 0
}

# ---------------------------------------------------------------------------
# SECRET_KEY: reaproveita a do .env; se nao existir, gera e salva.
# Manter fixa evita invalidar credenciais de perfis ja salvos no SQLite local.
# ---------------------------------------------------------------------------
Write-Step 'Verificando SECRET_KEY'
$secret = $null
if (Test-Path $EnvFile) {
    $line = Select-String -Path $EnvFile -Pattern '^\s*SECRET_KEY\s*=\s*(.+)$' | Select-Object -First 1
    if ($line) { $secret = $line.Matches[0].Groups[1].Value.Trim() }
}
if (-not $secret -or $secret -eq 'change-me-to-a-random-secret') {
    $bytes = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $secret = ($bytes | ForEach-Object { $_.ToString('x2') }) -join ''
    if (Test-Path $EnvFile) {
        $content = (Get-Content $EnvFile -Raw) -replace '(?m)^\s*SECRET_KEY\s*=.*\r?\n?', ''
        Set-Content -Path $EnvFile -Value ($content.TrimEnd() + "`r`nSECRET_KEY=$secret`r`n") -Encoding ascii
    } else {
        Set-Content -Path $EnvFile -Value "SECRET_KEY=$secret`r`n" -Encoding ascii
    }
    Write-Host "    SECRET_KEY gerada e salva em .env (ignorado pelo git)."
}

# ---------------------------------------------------------------------------
# Docker + Redis
# ---------------------------------------------------------------------------
Write-Step 'Verificando Docker'
& docker info *> $null
if ($LASTEXITCODE -ne 0) {
    $dd = 'C:\Program Files\Docker\Docker\Docker Desktop.exe'
    if (-not (Test-Path $dd)) { throw 'Docker nao encontrado. Instale o Docker Desktop.' }
    Write-Host '    Docker nao esta rodando. Iniciando o Docker Desktop...'
    Start-Process $dd
    $ok = $false
    for ($i = 0; $i -lt 60; $i++) {
        Start-Sleep -Seconds 3
        & docker info *> $null
        if ($LASTEXITCODE -eq 0) { $ok = $true; break }
    }
    if (-not $ok) { throw 'Docker nao ficou pronto em 3 minutos. Abra o Docker Desktop manualmente e rode de novo.' }
}

Write-Step "Subindo Redis ($RedisName)"
$status = (& docker ps -a --filter "name=^$RedisName$" --format '{{.Status}}')
if (-not $status) {
    & docker run -d --name $RedisName -p 6379:6379 redis:7-alpine | Out-Null
} elseif ($status -notmatch '^Up') {
    & docker start $RedisName | Out-Null
}
if ($LASTEXITCODE -ne 0) { throw 'Falha ao subir o Redis (a porta 6379 pode estar em uso).' }

# ---------------------------------------------------------------------------
# venv + dependencias (reinstala quando requirements.txt mudar)
# ---------------------------------------------------------------------------
Write-Step 'Verificando ambiente Python'
if (-not (Test-Path $VenvPython)) {
    & python -m venv $Venv
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao criar o venv. Python 3.10+ esta no PATH?' }
}
$req      = Join-Path $Backend 'requirements.txt'
$hashFile = Join-Path $Venv 'requirements.hash'
$newHash  = (Get-FileHash $req -Algorithm SHA256).Hash
$oldHash  = if (Test-Path $hashFile) { (Get-Content $hashFile -Raw).Trim() } else { '' }
if ($Install -or $newHash -ne $oldHash) {
    Write-Host '    Instalando dependencias...'
    & $VenvPython -m pip install --quiet --upgrade pip
    & $VenvPython -m pip install --quiet -r $req
    if ($LASTEXITCODE -ne 0) { throw 'pip install falhou.' }
    Set-Content -Path $hashFile -Value $newHash -Encoding ascii
}

# ---------------------------------------------------------------------------
# Abre cada servico em uma janela propria
# ---------------------------------------------------------------------------
# Variaveis herdadas pelas janelas filhas (evita segredo na linha de comando e
# evita -EncodedCommand, que antivirus como Bitdefender bloqueiam).
$env:SECRET_KEY = $secret
$env:REDIS_URL  = $RedisUrl

$Runner = Join-Path $PSScriptRoot 'run-service.ps1'

function Start-Service-Window($service) {
    $proc = Start-Process powershell -PassThru -ArgumentList @(
        '-NoExit', '-ExecutionPolicy', 'Bypass', '-File', "`"$Runner`"", $service
    )
    Add-Content -Path $PidFile -Value $proc.Id
}

if (Test-Path $PidFile) { Remove-Item $PidFile -Force }

Write-Step 'Iniciando API, Worker e Frontend'
Start-Service-Window 'api'
Start-Service-Window 'worker'
Start-Service-Window 'frontend'

Start-Sleep -Seconds 3
Start-Process "http://localhost:$FrontPort"

Write-Host ''
Write-Host "Frontend: http://localhost:$FrontPort" -ForegroundColor Green
Write-Host "API:      http://127.0.0.1:$ApiPort  (Swagger: /docs)" -ForegroundColor Green
Write-Host ''
Write-Host 'API recarrega sozinha. Worker NAO: Ctrl+C na janela dele e rode de novo ao mudar oci_connector.py / celery_worker.py.'
Write-Host 'Para encerrar tudo: .\scripts\dev.ps1 -Stop'

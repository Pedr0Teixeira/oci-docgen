<#
.SYNOPSIS
  Executa UM servico de desenvolvimento (api | worker | frontend).
  Chamado pelo dev.ps1 -- nao precisa ser executado diretamente.

  SECRET_KEY e REDIS_URL chegam por variaveis de ambiente herdadas do dev.ps1
  (nada de segredo na linha de comando).
#>
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('api', 'worker', 'frontend')]
    [string]$Service
)

$Root       = Split-Path $PSScriptRoot -Parent
$Backend    = Join-Path $Root 'backend'
$Frontend   = Join-Path $Root 'frontend'
$VenvPython = Join-Path $Backend '.venv\Scripts\python.exe'
$env:PYTHONUNBUFFERED = '1'

switch ($Service) {
    'api' {
        $Host.UI.RawUI.WindowTitle = 'OCI DocGen - API'
        Set-Location $Backend
        & $VenvPython -m uvicorn main:app --reload --port 8000
    }
    'worker' {
        $Host.UI.RawUI.WindowTitle = 'OCI DocGen - Worker'
        Set-Location $Backend
        & $VenvPython -m celery -A celery_worker.celery_app worker --loglevel=info --pool=solo
    }
    'frontend' {
        $Host.UI.RawUI.WindowTitle = 'OCI DocGen - Frontend'
        Set-Location $Root
        & $VenvPython -m http.server 3000 --bind 127.0.0.1 --directory $Frontend
    }
}

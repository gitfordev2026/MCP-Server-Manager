param(
    [int]$Port = 8090
)

$root = Split-Path -Parent $PSScriptRoot
$venvActivate = Join-Path $root "backend_env\Scripts\Activate.ps1"

if (Test-Path $venvActivate) {
    . $venvActivate
} else {
    Write-Error "backend_env virtual environment not found at $venvActivate"
    exit 1
}

Set-Location $root
uvicorn backend.main:app --reload --port $Port


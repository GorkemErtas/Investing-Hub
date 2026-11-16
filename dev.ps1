param([switch]$Install, [switch]$Check, [switch]$NoML)
$ErrorActionPreference = 'Stop'
$previousSkipMl = $env:INVESTING_HUB_SKIP_ML
Push-Location $PSScriptRoot
try {
    if (-not (Get-Command node -ErrorAction SilentlyContinue) -or -not (Get-Command npm -ErrorAction SilentlyContinue)) {
        throw 'Install Node.js 24 or 26 first.'
    }
    if ($Install) {
        & npm.cmd ci
        if ($LASTEXITCODE -ne 0) { throw 'npm install failed.' }
        if (-not (Test-Path -LiteralPath '.venv\Scripts\python.exe')) {
            & py -3.13 -m venv .venv
            if ($LASTEXITCODE -ne 0) { throw 'Install Python 3.13 with the Windows Python launcher.' }
        }
        & .\.venv\Scripts\python.exe -m pip install -r ml/requirements-objectives.txt
        if ($LASTEXITCODE -ne 0) { throw 'Python dependency installation failed.' }
    }
    if ($NoML) { $env:INVESTING_HUB_SKIP_ML = '1' }
    if ($Check) { & npm.cmd run local:check } else { & npm.cmd run dev }
    exit $LASTEXITCODE
} finally {
    if ($NoML) { $env:INVESTING_HUB_SKIP_ML = $previousSkipMl }
    Pop-Location
}

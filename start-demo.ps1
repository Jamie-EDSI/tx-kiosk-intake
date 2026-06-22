param(
  [int]$Port = 4173
)

$ErrorActionPreference = "Stop"
$appRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

Set-Location -LiteralPath $appRoot

Write-Host "Serving Intake App demo from: $appRoot"
Write-Host "Open: http://127.0.0.1:$Port/"
Write-Host "Press Ctrl+C to stop the demo server."

python -m http.server $Port --bind 127.0.0.1

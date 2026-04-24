param()

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
& (Join-Path $scriptRoot 'workbench-parity-smoke.ps1') -Assert -Quiet
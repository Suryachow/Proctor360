param(
  [switch]$Quiet
)

$ErrorActionPreference = 'Stop'

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$parityScript = Join-Path $scriptRoot 'workbench-parity-smoke.ps1'
$fairnessScript = Join-Path $scriptRoot 'proctor-fairness-smoke.ps1'

if (-not $Quiet) {
  Write-Host 'Running consolidated proctor validation suite...' -ForegroundColor Cyan
}

if (-not (Test-Path $parityScript)) {
  throw "Missing required script: $parityScript"
}

if (-not (Test-Path $fairnessScript)) {
  throw "Missing required script: $fairnessScript"
}

$parity = & $parityScript -Assert -Quiet | ConvertFrom-Json
$fairness = & $fairnessScript -Assert -Quiet | ConvertFrom-Json

$result = [pscustomobject]@{
  Timestamp = (Get-Date).ToString('s')
  ParityPassed = $true
  FairnessPassed = $true
  ParitySessionPrimary = $parity.SessionPrimary
  ParitySessionSecondary = $parity.SessionSecondary
  FairnessSession = $fairness.SessionFairness
  EscalationSession = $fairness.SessionEscalation
  FairnessStatus = $fairness.FairnessStatus
  FairnessRisk = $fairness.FairnessRisk
  EscalationFinalStatus = $fairness.EscalationFinalStatus
  EscalationMaxRisk = $fairness.EscalationMaxRisk
}

if (-not $Quiet) {
  Write-Host 'Consolidated proctor validation completed.' -ForegroundColor Green
}

$result | ConvertTo-Json -Depth 8

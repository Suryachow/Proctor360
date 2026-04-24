param()

$ErrorActionPreference = 'Stop'

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$suiteScript = Join-Path $scriptRoot 'proctor-validation-suite.ps1'

if (-not (Test-Path $suiteScript)) {
  Write-Output "FAIL missing_suite_script path=$suiteScript"
  exit 1
}

try {
  $raw = & $suiteScript -Quiet
  $result = $raw | ConvertFrom-Json

  $line = @(
    'PASS',
    "parity=$($result.ParityPassed)",
    "fairness=$($result.FairnessPassed)",
    "fairness_status=$($result.FairnessStatus)",
    "fairness_risk=$($result.FairnessRisk)",
    "escalation_status=$($result.EscalationFinalStatus)",
    "escalation_max_risk=$($result.EscalationMaxRisk)",
    "session_fairness=$($result.FairnessSession)",
    "session_escalation=$($result.EscalationSession)"
  ) -join ' '

  Write-Output $line
  exit 0
} catch {
  $msg = $_.Exception.Message -replace '\s+', ' '
  Write-Output "FAIL error=$msg"
  exit 1
}

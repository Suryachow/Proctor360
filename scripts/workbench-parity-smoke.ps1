param(
  [switch]$Assert,
  [switch]$Quiet
)

$ErrorActionPreference = 'Stop'

$base = 'http://localhost:8000/api/v1'

function To-JsonBody {
  param($Object)
  return ($Object | ConvertTo-Json -Depth 8)
}

function Invoke-RetryGet {
  param(
    [string]$Uri,
    [hashtable]$Headers,
    [int]$Attempts = 5,
    [int]$DelayMs = 700,
    [scriptblock]$Predicate = { param($r) ($r | Measure-Object).Count -ge 1 }
  )

  for ($i = 1; $i -le $Attempts; $i++) {
    $response = Invoke-RestMethod -Method Get -Uri $Uri -Headers $Headers
    if (& $Predicate $response) {
      return $response
    }
    if ($i -lt $Attempts) {
      Start-Sleep -Milliseconds $DelayMs
    }
  }

  return $response
}

if (-not $Quiet) {
  Write-Host "Running Innovation Workbench parity smoke..." -ForegroundColor Cyan
}

$adminBody = @{ email = 'admin@proctor360.com'; password = 'Admin123!'; mfa_code = '123456' } | ConvertTo-Json
$studentBody = @{ email = 'student@test.com'; password = 'Student123!'; device_hash = 'test-device' } | ConvertTo-Json

$adminLogin = Invoke-RestMethod -Method Post -Uri "$base/auth/admin/login" -ContentType 'application/json' -Body $adminBody
$studentLogin = Invoke-RestMethod -Method Post -Uri "$base/auth/login" -ContentType 'application/json' -Body $studentBody
$ah = @{ Authorization = "Bearer $($adminLogin.access_token)" }
$sh = @{ Authorization = "Bearer $($studentLogin.access_token)" }

# Setup primary active session
$qPayload = @{ questions = @(
  @{ prompt = '3 + 2 = ?'; option_a = '5'; option_b = '4'; option_c = '6'; option_d = '7'; correct_option = 'A'; topic = 'math'; sub_topic = 'easy' },
  @{ prompt = '15 * 3 = ?'; option_a = '35'; option_b = '45'; option_c = '40'; option_d = '55'; correct_option = 'B'; topic = 'math'; sub_topic = 'hard' }
)}
$qRes = Invoke-RestMethod -Method Post -Uri "$base/admin/questions/bulk" -Headers $ah -ContentType 'application/json' -Body (To-JsonBody $qPayload)

$code = ('WB' + (Get-Date -Format 'HHmmss'))
$examPayload = @{ code = $code; title = 'Workbench Parity'; question_ids = @([int]$qRes.question_ids[0], [int]$qRes.question_ids[1]); student_emails = @('student@test.com') }
$examRes = Invoke-RestMethod -Method Post -Uri "$base/admin/exams" -Headers $ah -ContentType 'application/json' -Body (To-JsonBody $examPayload)

Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap 320, 240
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::White)
$ms = New-Object System.IO.MemoryStream
$bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Jpeg)
$img = [Convert]::ToBase64String($ms.ToArray())

$startPayload = @{ exam_code = $examRes.exam_code; verification_code = $examRes.verification_code; live_image_base64 = $img; device_fingerprint = 'device-workbench' }
$startRes = Invoke-RestMethod -Method Post -Uri "$base/exam/start" -Headers $sh -ContentType 'application/json' -Body (To-JsonBody $startPayload)
$sessionId = [int]$startRes.session_id

# 1) Interventions + Chat
Invoke-RestMethod -Method Post -Uri "$base/innovations/proctor/interventions" -Headers $ah -ContentType 'application/json' -Body (To-JsonBody @{ session_id = $sessionId; action_type = 'warn'; payload = @{ message = 'focus' } }) | Out-Null
$ivList = Invoke-RestMethod -Method Get -Uri "$base/innovations/proctor/interventions/$sessionId" -Headers $ah
Invoke-RestMethod -Method Post -Uri "$base/innovations/proctor/chat/admin/send" -Headers $ah -ContentType 'application/json' -Body (To-JsonBody @{ session_id = $sessionId; message = 'Admin ping' }) | Out-Null
Invoke-RestMethod -Method Post -Uri "$base/innovations/proctor/chat/student/send" -Headers $sh -ContentType 'application/json' -Body (To-JsonBody @{ session_id = $sessionId; message = 'Student pong' }) | Out-Null
$chat = Invoke-RestMethod -Method Get -Uri "$base/innovations/proctor/chat/$sessionId" -Headers $ah

# 2) Appeals
$appeal = Invoke-RestMethod -Method Post -Uri "$base/innovations/appeals" -Headers $sh -ContentType 'application/json' -Body (To-JsonBody @{ session_id = $sessionId; reason = 'parity check' })
Invoke-RestMethod -Method Post -Uri "$base/innovations/appeals/$($appeal.appeal_id)/decision" -Headers $ah -ContentType 'application/json' -Body (To-JsonBody @{ decision = 'reviewing'; admin_notes = 'parity' }) | Out-Null
$appeals = Invoke-RestMethod -Method Get -Uri "$base/innovations/appeals/admin?status=reviewing" -Headers $ah

# 3) Notifications + Branding
Invoke-RestMethod -Method Post -Uri "$base/innovations/tenant/branding" -Headers $ah -ContentType 'application/json' -Body (To-JsonBody @{ tenant_slug = 'default'; brand_name = 'Parity Brand'; primary_color = '#111827' }) | Out-Null
$brand = Invoke-RestMethod -Method Get -Uri "$base/innovations/tenant/branding/default"
Invoke-RestMethod -Method Post -Uri "$base/innovations/notifications/routes" -Headers $ah -ContentType 'application/json' -Body (To-JsonBody @{ tenant_slug = 'default'; channel_type = 'webhook'; target_url = 'https://example.org/hook'; severity_min = 'medium' }) | Out-Null
$routes = Invoke-RestMethod -Method Get -Uri "$base/innovations/notifications/routes" -Headers $ah
$dispatch = Invoke-RestMethod -Method Post -Uri "$base/innovations/notifications/dispatch-test" -Headers $ah -ContentType 'application/json' -Body (To-JsonBody @{ event_type = 'parity.test'; payload = @{ ok = $true } })

# 4) Quality + Cohort
Invoke-RestMethod -Method Post -Uri "$base/innovations/quality/recompute" -Headers $ah | Out-Null
$qualityRows = Invoke-RetryGet -Uri "$base/innovations/quality/questions" -Headers $ah -Attempts 6 -DelayMs 800
$cohort = Invoke-RestMethod -Method Get -Uri "$base/innovations/analytics/cohort-risk" -Headers $ah

# 5) Certificates
Invoke-RestMethod -Method Post -Uri "$base/exam/answer" -Headers $sh -ContentType 'application/json' -Body (To-JsonBody @{ session_id = $sessionId; question_id = [int]$qRes.question_ids[0]; selected_option = 'A' }) | Out-Null
Invoke-RestMethod -Method Post -Uri "$base/exam/submit/$sessionId" -Headers $sh -ContentType 'application/json' -Body (To-JsonBody @{}) | Out-Null
$issue = Invoke-RestMethod -Method Post -Uri "$base/admin/certificates/issue" -Headers $ah -ContentType 'application/json' -Body (To-JsonBody @{ session_id = $sessionId; student_email = 'student@test.com' })
$verifyBefore = Invoke-RestMethod -Method Get -Uri "$base/innovations/certificates/verify/$($issue.verification_hash)"
Invoke-RestMethod -Method Post -Uri "$base/innovations/certificates/revoke" -Headers $ah -ContentType 'application/json' -Body (To-JsonBody @{ verification_hash = $issue.verification_hash; reason = 'parity' }) | Out-Null
$verifyAfter = Invoke-RestMethod -Method Get -Uri "$base/innovations/certificates/verify/$($issue.verification_hash)"

# 6) Trust + Plagiarism (secondary active session)
$code2 = ('WT' + (Get-Date -Format 'HHmmss'))
$examRes2 = Invoke-RestMethod -Method Post -Uri "$base/admin/exams" -Headers $ah -ContentType 'application/json' -Body (To-JsonBody @{ code = $code2; title = 'Trust Plag Parity'; question_ids = @([int]$qRes.question_ids[0]); student_emails = @('student@test.com') })
$startRes2 = Invoke-RestMethod -Method Post -Uri "$base/exam/start" -Headers $sh -ContentType 'application/json' -Body (To-JsonBody @{ exam_code = $examRes2.exam_code; verification_code = $examRes2.verification_code; live_image_base64 = $img; device_fingerprint = 'device-workbench-2' })
$sessionId2 = [int]$startRes2.session_id
$runNonce = [guid]::NewGuid().ToString('N').Substring(0, 12)
$trust = Invoke-RestMethod -Method Post -Uri "$base/innovations/trust/ingest" -Headers $sh -ContentType 'application/json' -Body (To-JsonBody @{ session_id = $sessionId2; signals = @{ vpn = $true; vm = $false; remote_desktop = $false; fingerprint_drift = $true } })
$trustHist = Invoke-RestMethod -Method Get -Uri "$base/innovations/trust/$sessionId2" -Headers $ah
Invoke-RestMethod -Method Post -Uri "$base/innovations/plagiarism/subjective-answer" -Headers $sh -ContentType 'application/json' -Body (To-JsonBody @{ session_id = $sessionId2; question_prompt = 'Explain UDP'; answer_text = 'UDP is connectionless and low-latency' }) | Out-Null
$plagRun = Invoke-RestMethod -Method Post -Uri "$base/innovations/plagiarism/run" -Headers $ah -ContentType 'application/json' -Body (To-JsonBody @{ threshold = 0.2 })
$plagAlerts = Invoke-RetryGet -Uri "$base/innovations/plagiarism/alerts" -Headers $ah -Attempts 6 -DelayMs 800

# 7) Network + Adaptive + Evidence Chain
$hb = Invoke-RestMethod -Method Post -Uri "$base/innovations/network/heartbeat" -Headers $sh -ContentType 'application/json' -Body (To-JsonBody @{ session_id = $sessionId2; latency_ms = 1400; packet_loss_percent = 22; jitter_ms = 60; offline_buffer_count = 2 })
$adaptive = Invoke-RestMethod -Method Post -Uri "$base/innovations/adaptive/next-question" -Headers $sh -ContentType 'application/json' -Body (To-JsonBody @{ session_id = $sessionId2; previous_correct = $true })
$anchor = Invoke-RestMethod -Method Post -Uri "$base/innovations/evidence/chain/anchor" -Headers $ah -ContentType 'application/json' -Body (To-JsonBody @{ session_id = $sessionId2; source_type = 'manual'; source_id = "parity-$runNonce"; metadata = @{ note = 'parity'; nonce = $runNonce } })
$chain = Invoke-RestMethod -Method Get -Uri "$base/innovations/evidence/chain/$sessionId2" -Headers $ah
$bundle = Invoke-WebRequest -UseBasicParsing -Method Get -Uri "$base/innovations/evidence/incident-bundle/$sessionId2" -Headers $ah

$result = [pscustomobject]@{
  SessionPrimary = $sessionId
  SessionSecondary = $sessionId2
  InterventionsCount = ($ivList | Measure-Object).Count
  ChatCount = ($chat | Measure-Object).Count
  AppealsReviewing = ($appeals | Measure-Object).Count
  BrandingName = $brand.brand_name
  RoutesCount = ($routes | Measure-Object).Count
  DispatchCount = $dispatch.dispatched
  QualityRows = ($qualityRows | Measure-Object).Count
  CohortBuckets = ($cohort | Measure-Object).Count
  CertValidBefore = $verifyBefore.valid
  CertValidAfter = $verifyAfter.valid
  TrustScore = $trust.trust_score
  TrustRows = ($trustHist | Measure-Object).Count
  PlagRunId = $plagRun.run_id
  PlagRows = ($plagAlerts | Measure-Object).Count
  GraceApplied = $hb.grace_applied
  AdaptiveChosen = $adaptive.chosen_difficulty
  ChainCount = ($chain | Measure-Object).Count
  BundleStatus = $bundle.StatusCode
  BundleType = $bundle.Headers['Content-Type']
}

if ($Assert) {
  $checks = @(
    @{ Name = 'InterventionsCount'; Pass = ($result.InterventionsCount -ge 1) }
    @{ Name = 'ChatCount'; Pass = ($result.ChatCount -ge 2) }
    @{ Name = 'AppealsReviewing'; Pass = ($result.AppealsReviewing -ge 1) }
    @{ Name = 'DispatchCount'; Pass = ($result.DispatchCount -ge 1) }
    @{ Name = 'QualityRows'; Pass = ($result.QualityRows -ge 1) }
    @{ Name = 'CohortBuckets'; Pass = ($result.CohortBuckets -ge 1) }
    @{ Name = 'CertValidBefore'; Pass = ($result.CertValidBefore -eq $true) }
    @{ Name = 'CertValidAfter'; Pass = ($result.CertValidAfter -eq $false) }
    @{ Name = 'TrustRows'; Pass = ($result.TrustRows -ge 1) }
    @{ Name = 'PlagRows'; Pass = ($result.PlagRows -ge 1) }
    @{ Name = 'GraceApplied'; Pass = ($result.GraceApplied -eq $true) }
    @{ Name = 'AdaptiveChosen'; Pass = ($result.AdaptiveChosen -in @('easy', 'medium', 'hard')) }
    @{ Name = 'ChainCount'; Pass = ($result.ChainCount -ge 1) }
    @{ Name = 'BundleStatus'; Pass = ($result.BundleStatus -eq 200) }
    @{ Name = 'BundleType'; Pass = ($result.BundleType -eq 'application/zip') }
  )

  $failed = $checks | Where-Object { -not $_.Pass }
  if ($failed) {
    $failedNames = ($failed | ForEach-Object { $_.Name }) -join ', '
    throw "Parity assert failed for: $failedNames"
  }
}

if (-not $Quiet) {
  Write-Host "Parity smoke completed." -ForegroundColor Green
}
$result | ConvertTo-Json -Depth 8

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

function New-JpegBase64 {
  Add-Type -AssemblyName System.Drawing
  $bmp = New-Object System.Drawing.Bitmap 320, 240
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear([System.Drawing.Color]::White)
  $ms = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Jpeg)
  return [Convert]::ToBase64String($ms.ToArray())
}

if (-not $Quiet) {
  Write-Host "Running proctor fairness smoke..." -ForegroundColor Cyan
}

# Auth
$adminBody = @{ email = 'admin@proctor360.com'; password = 'Admin123!'; mfa_code = '123456' } | ConvertTo-Json
$studentBody = @{ email = 'student@test.com'; password = 'Student123!'; device_hash = 'test-device' } | ConvertTo-Json

$adminLogin = Invoke-RestMethod -Method Post -Uri "$base/auth/admin/login" -ContentType 'application/json' -Body $adminBody
$studentLogin = Invoke-RestMethod -Method Post -Uri "$base/auth/login" -ContentType 'application/json' -Body $studentBody
$ah = @{ Authorization = "Bearer $($adminLogin.access_token)" }
$sh = @{ Authorization = "Bearer $($studentLogin.access_token)" }

# Build simple exam with one question for deterministic session setup
$qPayload = @{ questions = @(
  @{ prompt = '2 + 2 = ?'; option_a = '4'; option_b = '5'; option_c = '3'; option_d = '6'; correct_option = 'A'; topic = 'math'; sub_topic = 'easy' }
)}
$qRes = Invoke-RestMethod -Method Post -Uri "$base/admin/questions/bulk" -Headers $ah -ContentType 'application/json' -Body (To-JsonBody $qPayload)
$qid = [int]$qRes.question_ids[0]
$img = New-JpegBase64

# Session A: Fairness check (single tab switch should not instantly auto-submit)
$codeA = ('PF' + (Get-Date -Format 'HHmmss'))
$examA = Invoke-RestMethod -Method Post -Uri "$base/admin/exams" -Headers $ah -ContentType 'application/json' -Body (To-JsonBody @{ code = $codeA; title = 'Proctor Fairness'; question_ids = @($qid); student_emails = @('student@test.com') })
$startA = Invoke-RestMethod -Method Post -Uri "$base/exam/start" -Headers $sh -ContentType 'application/json' -Body (To-JsonBody @{ exam_code = $examA.exam_code; verification_code = $examA.verification_code; live_image_base64 = $img; device_fingerprint = 'device-fairness' })
$sessionA = [int]$startA.session_id

$firstTab = Invoke-RestMethod -Method Post -Uri "$base/exam/event" -Headers $sh -ContentType 'application/json' -Body (To-JsonBody @{ session_id = $sessionA; event_type = 'tab_switch'; detail = 'smoke_single_tab_switch' })
$fairnessStatus = [string]$firstTab.session_status
$fairnessRisk = [double]$firstTab.total_risk
$fairnessPassed = $fairnessStatus -notin @('auto_submitted', 'terminated', 'malpractice', 'completed', 'submitted')

# Session B: Escalation check (repeated severe events should eventually auto-submit)
$codeB = ('PE' + (Get-Date -Format 'HHmmss'))
$examB = Invoke-RestMethod -Method Post -Uri "$base/admin/exams" -Headers $ah -ContentType 'application/json' -Body (To-JsonBody @{ code = $codeB; title = 'Proctor Escalation'; question_ids = @($qid); student_emails = @('student@test.com') })
$startB = Invoke-RestMethod -Method Post -Uri "$base/exam/start" -Headers $sh -ContentType 'application/json' -Body (To-JsonBody @{ exam_code = $examB.exam_code; verification_code = $examB.verification_code; live_image_base64 = $img; device_fingerprint = 'device-escalation' })
$sessionB = [int]$startB.session_id

$statuses = @()
$risks = @()
for ($i = 1; $i -le 4; $i++) {
  $evt = Invoke-RestMethod -Method Post -Uri "$base/exam/event" -Headers $sh -ContentType 'application/json' -Body (To-JsonBody @{ session_id = $sessionB; event_type = 'developer_tools_detected'; detail = "smoke_repeat_$i" })
  $statuses += [string]$evt.session_status
  $risks += [double]$evt.total_risk
  if ($evt.session_status -in @('auto_submitted', 'terminated', 'malpractice', 'completed', 'submitted')) {
    break
  }
}

$escalationFinalStatus = if ($statuses.Count -gt 0) { $statuses[-1] } else { 'unknown' }
$maxEscalationRisk = if ($risks.Count -gt 0) { ($risks | Measure-Object -Maximum).Maximum } else { 0 }
$escalationPassed = ($escalationFinalStatus -in @('auto_submitted', 'terminated', 'malpractice', 'completed', 'submitted')) -or ([double]$maxEscalationRisk -ge 85)

# Session C: Multiple faces should not auto-submit immediately
$codeC = ('PM' + (Get-Date -Format 'HHmmss'))
$examC = Invoke-RestMethod -Method Post -Uri "$base/admin/exams" -Headers $ah -ContentType 'application/json' -Body (To-JsonBody @{ code = $codeC; title = 'Proctor Multiple Faces'; question_ids = @($qid); student_emails = @('student@test.com') })
$startC = Invoke-RestMethod -Method Post -Uri "$base/exam/start" -Headers $sh -ContentType 'application/json' -Body (To-JsonBody @{ exam_code = $examC.exam_code; verification_code = $examC.verification_code; live_image_base64 = $img; device_fingerprint = 'device-multiple-faces' })
$sessionC = [int]$startC.session_id
$multipleFaces = Invoke-RestMethod -Method Post -Uri "$base/exam/event" -Headers $sh -ContentType 'application/json' -Body (To-JsonBody @{ session_id = $sessionC; event_type = 'multiple_faces'; detail = 'smoke_multiple_faces' })
$multipleFacesStatus = [string]$multipleFaces.session_status
$multipleFacesRisk = [double]$multipleFaces.total_risk
$multipleFacesPassed = $multipleFacesStatus -notin @('auto_submitted', 'submitted', 'terminated', 'malpractice', 'completed')

# Session D: Face mismatch should auto-submit immediately
$codeD = ('PFM' + (Get-Date -Format 'HHmmss'))
$examD = Invoke-RestMethod -Method Post -Uri "$base/admin/exams" -Headers $ah -ContentType 'application/json' -Body (To-JsonBody @{ code = $codeD; title = 'Proctor Face Mismatch'; question_ids = @($qid); student_emails = @('student@test.com') })
$startD = Invoke-RestMethod -Method Post -Uri "$base/exam/start" -Headers $sh -ContentType 'application/json' -Body (To-JsonBody @{ exam_code = $examD.exam_code; verification_code = $examD.verification_code; live_image_base64 = $img; device_fingerprint = 'device-face-mismatch' })
$sessionD = [int]$startD.session_id
$faceMismatch = Invoke-RestMethod -Method Post -Uri "$base/exam/event" -Headers $sh -ContentType 'application/json' -Body (To-JsonBody @{ session_id = $sessionD; event_type = 'face_mismatch'; detail = 'smoke_face_mismatch' })
$faceMismatchStatus = [string]$faceMismatch.session_status
$faceMismatchPassed = $faceMismatchStatus -in @('auto_submitted', 'submitted', 'terminated')

$result = [pscustomobject]@{
  SessionFairness = $sessionA
  SessionEscalation = $sessionB
  SessionMultipleFaces = $sessionC
  SessionFaceMismatch = $sessionD
  FairnessStatus = $fairnessStatus
  FairnessRisk = $fairnessRisk
  FairnessPassed = $fairnessPassed
  EscalationStatuses = $statuses
  EscalationRisks = $risks
  EscalationMaxRisk = $maxEscalationRisk
  EscalationFinalStatus = $escalationFinalStatus
  EscalationPassed = $escalationPassed
  MultipleFacesStatus = $multipleFacesStatus
  MultipleFacesRisk = $multipleFacesRisk
  MultipleFacesPassed = $multipleFacesPassed
  FaceMismatchStatus = $faceMismatchStatus
  FaceMismatchPassed = $faceMismatchPassed
}

if ($Assert) {
  $failed = @()
  if (-not $fairnessPassed) { $failed += 'FairnessPassed' }
  if (-not $escalationPassed) { $failed += 'EscalationPassed' }
  if (-not $multipleFacesPassed) { $failed += 'MultipleFacesPassed' }
  if (-not $faceMismatchPassed) { $failed += 'FaceMismatchPassed' }
  if ($failed.Count -gt 0) {
    throw ("Proctor fairness smoke failed: " + ($failed -join ', '))
  }
}

if (-not $Quiet) {
  Write-Host "Proctor fairness smoke completed." -ForegroundColor Green
}

$result | ConvertTo-Json -Depth 8

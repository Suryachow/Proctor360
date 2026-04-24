# Phase 1 Advanced Proctoring - Integration Guide

## Overview

Phase 1 implementation includes 5 advanced proctoring modules with complete backend support, database schema, and frontend UI components.

## Module Overview

### Module 1A: Multi-Camera Proctoring 📱
**Endpoint:** `POST /api/v1/phase1/camera/register-secondary`
- Register mobile/tablet as secondary camera
- Tracks multiple camera streams for desk/environment monitoring

**Endpoint:** `POST /api/v1/phase1/camera/submit-secondary-frame`
- Submit video frames from secondary camera
- AI analysis detects external assistance and collaboration
- Risk escalation on cheating indicators

### Module 1B: Audio Intelligence 🎙️
**Endpoint:** `POST /api/v1/phase1/audio/submit-sample`
- Submit audio chunks for analysis
- Detects multiple speakers (collaboration)
- Identifies cheating keywords
- Whisper transcription integration (placeholder)

### Module 1C: Behavioral Fingerprinting ⌨️
**Endpoint:** `POST /api/v1/phase1/behavior/typing-pattern`
- Monitors typing speed (WPM)
- Tracks accuracy and keystroke intervals
- Detects impersonation (typing pattern deviation >30%)

**Endpoint:** `POST /api/v1/phase1/behavior/mouse-movement`
- Monitors mouse velocity and acceleration
- Detects RDP/remote access signatures
- Identifies unnatural movement patterns

### Module 1D: Eye Tracking & Attention 👁️
**Endpoint:** `POST /api/v1/phase1/eye-tracking/gaze-sample`
- Submit gaze coordinates and pupil data
- Tracks attention to exam vs. off-screen areas
- Real-time focus monitoring

**Endpoint:** `GET /api/v1/phase1/eye-tracking/attention-score/{session_id}`
- Retrieves computed attention and focus scores
- Aggregates gaze samples into 1-minute windows
- Returns: attention_percent, focus_score, gaze_stability

### Module 1E: Zero Trust Verification 🔐
**Endpoint:** `POST /api/v1/phase1/zero-trust/verify-device`
- Continuous device fingerprint verification
- VPN/proxy detection
- Network topology analysis

**Endpoint:** `POST /api/v1/phase1/zero-trust/request-identity-reverification`
- Admin-initiated identity re-verification
- Scheduled per exam configuration (default: every 10 min)

**Endpoint:** `POST /api/v1/phase1/zero-trust/submit-reverification`
- Student submits live image for biometric comparison
- Similarity scoring (threshold: 0.65)

## Database Schema

### New Tables (11 total)

**phase in_exam_proctoring_secondary_cameras:**
- session_id (FK) | device_id | camera_type | registration_time | last_frame_timestamp | sync_offset_ms

**phase1_exam_proctoring_camera_sync_frames:**
- session_id (FK) | camera_id (FK) | frame_base64 | timestamp | frame_index | cheating_indicators (JSON)

**phase1_exam_proctoring_audio_samples:**
- session_id (FK) | audio_base64 | duration_seconds | timestamp | sample_index | audio_analysis (JSON)

**phase1_exam_proctoring_behavioral_metrics:**
- session_id (FK) | metric_type | baseline_value | current_value | deviation_percent | is_anomaly | confidence_score

**phase1_exam_proctoring_typing_patterns:**
- session_id (FK) | wpm | accuracy_percent | avg_keystroke_interval_ms | hold_time_distribution (JSON)

**phase1_exam_proctoring_mouse_movements:**
- session_id (FK) | velocity_px_per_sec | acceleration_px_per_sec2 | jitter_score | teleport_events

**phase1_exam_proctoring_eye_gaze_samples:**
- session_id (FK) | gaze_x / gaze_y (normalized 0-1) | pupil_diameter_mm | confidence | is_on_screen | region_of_interest

**phase1_exam_proctoring_attention_scores:**
- session_id (FK) | window_start_time | window_end_time | attention_percent | focus_score | gaze_stability

**phase1_exam_proctoring_device_verification_checks:**
- session_id (FK) | check_type | check_timestamp | result | details (JSON)

**phase1_exam_proctoring_identity_reverification_events:**
- session_id (FK) | scheduled_time | actual_time | live_image_base64 | similarity_score | passed

### Extended Columns on exam_sessions

- device_integrity_score (Float, default 100.0)
- attention_score (Float, default 100.0)
- behavioral_consistency_score (Float, default 100.0)
- multi_camera_enabled (Boolean, default False)
- audio_enabled (Boolean, default False)
- eye_tracking_enabled (Boolean, default False)

## API Response Formats

### Violation Event (WebSocket Broadcast)
```json
{
  "event_type": "phase1_violation",
  "session_id": "uuid",
  "violation_type": "secondary_camera_cheating_detected",
  "severity": "high",
  "student_email": "test@example.com",
  "timestamp": "2024-01-15T10:30:00Z",
  "risk_delta": 35,
  "details": { "threat_level": "high", "indicators": [...] }
}
```

### Attention Score Response
```json
{
  "session_id": "uuid",
  "attention_percent": 82.5,
  "focus_score": 65.3,
  "gaze_stability": 0.92,
  "window_start": "2024-01-15T10:30:00Z",
  "window_end": "2024-01-15T10:31:00Z"
}
```

### Device Verification Response
```json
{
  "session_id": "uuid",
  "verification_id": "uuid",
  "passed": true,
  "details": {
    "device_fingerprint": "matched",
    "vpn_detected": false,
    "network_type": "direct"
  }
}
```

## Frontend Components

### Student Portal (src/components/Phase1UI.jsx)
- **SecondCameraSetup**: Register and stream secondary camera
- **AudioCapture**: Enable microphone and submit audio samples
- **BehavioralMonitoring**: Start typing and mouse pattern tracking
- **AttentionScoreDisplay**: Real-time attention score widget
- **ZeroTrustVerification**: Identity re-verification modal
- **Phase1FeaturePanel**: Main control panel with feature toggles

### Admin Dashboard (src/components/Phase1Dashboard.jsx)
- **AttentionScoreChart**: Real-time attention timeline graph
- **BehavioralHeatmap**: Typing speed & mouse movement heatmaps
- **DeviceVerificationStatus**: Device integrity timeline
- **ZeroTrustTimeline**: Identity verification event timeline
- **Phase1MetricsPanel**: Quick 4-metric display (device, attention, behavioral, trust)
- **Phase1AdminDashboard**: Complete monitoring suite

## Testing Checklist

### Phase 1A: Multi-Camera
- [ ] POST /phase1/camera/register-secondary → Returns camera_id
- [ ] POST /phase1/camera/submit-secondary-frame → Processes frame, broadcasts violation if cheating detected
- [ ] WebSocket broadcast received on admin_violations channel

### Phase 1B: Audio
- [ ] POST /phase1/audio/submit-sample → Processes audio, detects voices
- [ ] Multiple speaker detection triggers violation (risk_delta=25)
- [ ] Cheating keyword detection triggers violation (risk_delta=15)

### Phase 1C: Behavioral
- [ ] POST /phase1/behavior/typing-pattern → Accepts WPM, accuracy, keystroke intervals
- [ ] Deviation >30% WPM or >25% accuracy triggers impersonation violation
- [ ] POST /phase1/behavior/mouse-movement → Accepts velocity, acceleration, jitter, teleports
- [ ] RDP signature (teleports>5, velocity>1000) triggers violation (risk_delta=35)

### Phase 1D: Eye Tracking
- [ ] POST /phase1/eye-tracking/gaze-sample → Stores gaze samples with region classification
- [ ] GET /phase1/eye-tracking/attention-score/{session_id} → Returns computed scores
- [ ] Attention <60% triggers low-attention warning

### Phase 1E: Zero Trust
- [ ] POST /phase1/zero-trust/verify-device → Device fingerprint verification
- [ ] POST /phase1/zero-trust/request-identity-reverification → Admin triggers reverification
- [ ] POST /phase1/zero-trust/submit-reverification → Student submits image, receives similarity score

## Placeholder Integrations

The following require AI engine or third-party library integration:

1. **Audio Transcription**: `_analyze_audio_with_whisper()` 
   - Currently: Returns mock transcription
   - TODO: Integrate Whisper API or local model

2. **Eye Tracking**: `phase1Extensions.initializeEyeTracking()`
   - Currently: CDN link to tracking.js (untested)
   - TODO: Integrate with eye-tracking library (webgazer.js recommended)

3. **Biometric Verification**: `_verify_identity_biometric()`
   - Currently: Returns mock similarity score
   - TODO: Integrate with face verification API (AWS Rekognition, Azure Face API)

## Configuration & Thresholds

All thresholds are defined as constants in their respective service classes:

- **Typing Pattern**: WPM deviation >30% OR accuracy deviation >25% = violation
- **Mouse Movement**: RDP signature = (teleports > 5 OR velocity > 1000) AND (jitter < 0.2)
- **Attention**: Focus score < 60% = low attention warning
- **Eye Gaze**: Off-screen > 30% in 1-min window = attention violation
- **Device Integrity**: <65% overall score = device integrity violation
- **Zero Trust**: Identity similarity < 0.65 = reverification failure
- **Behavioral Consistency**: <70% = behavioral anomaly warning

## Deployment Notes

- **Migration Status**: 002_phase1_advanced_features.py applied successfully
- **Router Status**: phase1 router registered in main.py
- **WebSocket Status**: Broadcasting to admin_violations channel
- **Session Updates**: All endpoints update exam_sessions metrics
- **Risk Score**: All violations increment session.risk_score

## Next Steps

1. **Frontend Testing**: Load student-portal and test Phase 1UI components
2. **Admin Dashboard**: Access Phase 1 Proctoring module in admin dashboard
3. **End-to-End Testing**: Simulate full exam session with Phase 1 features
4. **AI Integration**: Connect Whisper, eye-tracking, and biometric APIs
5. **Performance Tuning**: Load test with concurrent student submissions
6. **Phase 2**: Enterprise integrations (SSO, LMS, Compliance)

---

**Last Updated**: January 2024
**Status**: Phase 1 Backend ✅ | Phase 1 Frontend 🔄 | Phase 1 AI Integration ⏳

# High-Level Architecture

Student Portal (React)
 -> WebSocket + HTTPS
 -> Proctoring API (FastAPI)
 -> AI Engine (FastAPI, OpenCV/MediaPipe/YOLO hooks)
 -> Violation Engine + PostgreSQL/Redis
 -> Admin Dashboard (React)

## Runtime flows
1. Student logs in with JWT + device binding hash.
2. Student client emits behavior events (tab switch, fullscreen exit, copy/paste attempts, audio spikes).
3. Snapshot frames are sent to API and delegated to AI Engine for detections.
4. API computes violation risk score and pushes real-time alerts to admin dashboard.
5. Auto-submit triggers when policy thresholds are exceeded.

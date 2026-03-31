# Enterprise Roadmap

## Phase 1: MVP hardening
- Add role-based auth for admin operators
- Replace in-memory websocket state with Redis pub/sub
- Add Alembic migrations
- Add structured logging and tracing

## Phase 2: AI scale
- Replace placeholder phone detection with YOLOv8 model serving
- Add MediaPipe gaze + head pose estimation pipeline
- Tune event thresholds using labeled data

## Phase 3: Operations
- Kubernetes deployment
- Horizontal autoscaling for AI workers
- S3-compatible snapshot and recording retention jobs
- SOC2 controls and audit trail exports

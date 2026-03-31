def compute_advanced_signals(face_count: int) -> list[dict]:
    events: list[dict] = []

    # Placeholder: plug MediaPipe gaze and head-pose estimation here.
    if face_count == 1:
        events.append(
            {
                "event_type": "gaze_deviation",
                "detail": "Eye gaze deviated from screen center",
                "score": 0.72,
                "explainability": "Flagged because: gaze deviation 72% over the last sample window",
            }
        )
        events.append(
            {
                "event_type": "suspicious_pose",
                "detail": "Head pose variance above expected exam baseline",
                "score": 0.44,
                "explainability": "Flagged because: pose instability exceeded baseline threshold",
            }
        )
        events.append(
            {
                "event_type": "whisper_detected",
                "detail": "Low amplitude speech-like segments detected",
                "score": 0.36,
                "explainability": "Flagged because: whisper-like voice pattern observed",
            }
        )
        events.append(
            {
                "event_type": "multiple_voices",
                "detail": "Secondary voice frequency profile detected",
                "score": 0.34,
                "explainability": "Flagged because: multiple voice signatures appeared in same time window",
            }
        )

    return events

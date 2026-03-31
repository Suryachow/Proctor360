RISK_WEIGHTS = {
    "tab_switch": 15.0,
    "fullscreen_exit": 20.0,
    "copy_paste_attempt": 10.0,
    "no_face": 25.0,
    "multiple_faces": 35.0,
    "phone_detected": 30.0,
    "unknown_person_detected": 40.0,
    "audio_spike": 10.0,
    "looking_away": 8.0,
    "gaze_deviation": 18.0,
    "object_book_detected": 22.0,
    "second_screen_detected": 28.0,
    "suspicious_pose": 15.0,
    "multiple_voices": 25.0,
    "whisper_detected": 14.0,
    "suspicious_behavior": 20.0,
    "device_fingerprint_mismatch": 50.0,
    "face_similarity_drop": 40.0,
    "developer_tools_detected": 45.0,
    "restricted_keyboard_shortcut": 15.0,
    "window_blur": 12.0,
    "mouse_left_window": 10.0,
    "no_device": 25.0,
    "workflow_warn": 5.0,
    "suspicious_pointer_behavior": 35.0,
    "suspicious_keyboard_pattern": 30.0,
    "remote_desktop_detected": 50.0,
    "virtual_machine_detected": 45.0,
    "virtual_webcam_detected": 40.0,
    "virtual_microphone_detected": 35.0,
    "vpn_detected": 30.0,
    "screen_sharing_detected": 40.0,
}


EXPLAINABLE_REASONS = {
    "tab_switch": "Browser tab hidden during active exam.",
    "fullscreen_exit": "Fullscreen mode exited while exam is active.",
    "copy_paste_attempt": "Clipboard or shortcut interaction was blocked.",
    "no_face": "No face found in frame.",
    "multiple_faces": "More than one face detected in frame.",
    "phone_detected": "Phone-like object detected by vision heuristics.",
    "unknown_person_detected": "Face in frame does not match registered student profile.",
    "audio_spike": "Audio amplitude crossed suspicious threshold.",
    "looking_away": "Gaze moved away from exam area repeatedly.",
    "gaze_deviation": "Eye gaze deviation sustained above policy threshold.",
    "object_book_detected": "Book-like object found near candidate workspace.",
    "second_screen_detected": "Possible second screen/object detected.",
    "suspicious_pose": "Head/pose movement pattern exceeds baseline.",
    "multiple_voices": "Multiple simultaneous voices detected.",
    "whisper_detected": "Whisper-like voice signature detected.",
    "suspicious_behavior": "Combined behavior signals exceed baseline.",
    "device_fingerprint_mismatch": "Device identification changed during exam. Possible exam switching to different device.",
    "face_similarity_drop": "Face similarity with registered image dropped below security threshold during exam.",
    "developer_tools_detected": "Browser developer tools were opened during exam.",
    "restricted_keyboard_shortcut": "Restricted keyboard shortcut was attempted during exam.",
    "window_blur": "Exam application lost focus/window was minimized.",
    "mouse_left_window": "Mouse cursor left the exam application window.",
    "no_device": "Camera or microphone device not available.",
    "workflow_warn": "Admin issued warning for suspicious activity.",
    "suspicious_pointer_behavior": "Mouse cursor showed unnatural jumping/teleportation patterns typical of remote control.",
    "suspicious_keyboard_pattern": "Keyboard input pattern consistent with robotic/automated typing or remote control.",
    "remote_desktop_detected": "Remote Desktop Protocol (RDP) or similar remote access detected.",
    "virtual_machine_detected": "Virtual machine environment detected. Exam must be taken on native OS.",
    "virtual_webcam_detected": "Virtual or emulated webcam detected. Physical device required.",
    "virtual_microphone_detected": "Virtual or emulated microphone detected. Physical device required.",
    "vpn_detected": "VPN or proxy connection detected. Direct internet connection required.",
    "screen_sharing_detected": "Screen sharing or remote collaboration tool detected.",
}


def get_risk_delta(event_type: str) -> float:
    return RISK_WEIGHTS.get(event_type, 5.0)


def get_reason(event_type: str) -> str:
    return EXPLAINABLE_REASONS.get(event_type, "Policy rule matched an unusual behavior pattern.")


def get_severity(risk_delta: float) -> str:
    if risk_delta >= 30:
        return "high"
    if risk_delta >= 15:
        return "medium"
    return "low"


def should_auto_submit(total_risk: float) -> bool:
    return total_risk > 70.0


def normalize_risk(total_risk: float) -> float:
    if total_risk < 0:
        return 0.0
    if total_risk > 100:
        return 100.0
    return round(total_risk, 2)

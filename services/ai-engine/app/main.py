import cv2
from fastapi import FastAPI, HTTPException

from app.detectors.advanced_behavior import compute_advanced_signals
from app.detectors.face_detector import face_detector, face_similarity_score
from app.schemas.analyze import AnalyzeRequest, VerifyIdentityRequest
from app.services.frame_decode import decode_base64_image

app = FastAPI(title="Proctor360 AI Engine", version="1.0.0")


def _contains_phone_like_object(frame) -> bool:
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, 40, 140)

    contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    frame_area = frame.shape[0] * frame.shape[1]

    for contour in contours:
        contour_area = cv2.contourArea(contour)
        if contour_area <= 0:
            continue

        peri = cv2.arcLength(contour, True)
        approx = cv2.approxPolyDP(contour, 0.03 * peri, True)
        if len(approx) < 4 or len(approx) > 8:
            continue

        x, y, w, h = cv2.boundingRect(contour)
        area = w * h
        if area < frame_area * 0.003 or area > frame_area * 0.45:
            continue

        ratio = w / max(h, 1)
        phone_like_ratio = 0.35 <= ratio <= 0.85 or 1.2 <= ratio <= 2.8

        # Rectangular objects with dense edges are common for phone screens.
        extent = contour_area / max(area, 1)
        roi = edges[y : y + h, x : x + w]
        edge_density = float(cv2.countNonZero(roi)) / max(area, 1)
        rectangular_strength = extent >= 0.55
        screen_like = edge_density >= 0.025

        # Focus on candidate objects near the center where students typically hold phones.
        cx = x + (w / 2)
        cy = y + (h / 2)
        center_distance = abs(cx - (frame.shape[1] / 2)) + abs(cy - (frame.shape[0] / 2))
        near_center = center_distance <= (frame.shape[1] * 0.7)

        if phone_like_ratio and rectangular_strength and screen_like and near_center:
            return True
    return False


def _contains_id_card_like_object(frame) -> bool:
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, 50, 150)

    contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    frame_area = frame.shape[0] * frame.shape[1]

    for contour in contours:
        peri = cv2.arcLength(contour, True)
        approx = cv2.approxPolyDP(contour, 0.04 * peri, True)
        if len(approx) != 4:
            continue

        x, y, w, h = cv2.boundingRect(contour)
        area = w * h
        if area < frame_area * 0.06 or area > frame_area * 0.7:
            continue

        ratio = max(w, h) / max(min(w, h), 1)
        if 1.35 <= ratio <= 1.95:
            return True
    return False


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/analyze")
def analyze(payload: AnalyzeRequest):
    frame = decode_base64_image(payload.image_base64)
    if frame is None:
        raise HTTPException(status_code=400, detail="Invalid image payload")

    face_boxes = face_detector.detect_boxes(frame)
    face_count = len(face_boxes)
    events = []

    if face_count == 0:
        events.append(
            {
                "event_type": "no_face",
                "detail": "No student face detected",
                "explainability": "Face detector confidence below threshold for entire frame",
            }
        )
    elif face_count > 1:
        events.append(
            {
                "event_type": "multiple_faces",
                "detail": "More than one face detected",
                "explainability": "Detected 2+ face bounding boxes in single frame",
            }
        )

    if _contains_phone_like_object(frame):
        events.append(
            {
                "event_type": "phone_detected",
                "detail": "Phone-like object detected in camera frame",
                "explainability": "Detected rectangular object with phone-like aspect ratio and contour",
            }
        )

    identity_similarity = None
    if payload.reference_face_image_base64 and face_count == 1:
        reference_frame = decode_base64_image(payload.reference_face_image_base64)
        if reference_frame is not None:
            identity_similarity = face_similarity_score(frame, reference_frame)
            if identity_similarity is not None and identity_similarity < 0.55:
                events.append(
                    {
                        "event_type": "unknown_person_detected",
                        "detail": "Detected face does not match registered student",
                        "explainability": f"Face similarity score {identity_similarity:.2f} is below threshold 0.55",
                    }
                )

    advanced = []
    if payload.include_advanced:
        advanced = compute_advanced_signals(face_count)
        for item in advanced:
            if item.get("score", 0) > 0.3:
                events.append(
                    {
                        "event_type": item["event_type"],
                        "detail": item["detail"],
                        "explainability": item.get("explainability", "Signal threshold exceeded"),
                    }
                )

    suspicious_score = min(1.0, 0.25 * len(events) + (0.2 if face_count > 1 else 0.0))

    return {
        "events": events,
        "metrics": {
            "face_count": face_count,
            "suspicious_score": suspicious_score,
            "identity_similarity": identity_similarity,
            "advanced_signals": advanced,
        },
    }


@app.post("/verify-identity")
def verify_identity(payload: VerifyIdentityRequest):
    registered_frame = decode_base64_image(payload.registered_face_image_base64)
    live_frame = decode_base64_image(payload.live_image_base64)
    id_card_frame = decode_base64_image(payload.id_card_image_base64)

    if registered_frame is None or live_frame is None or id_card_frame is None:
        raise HTTPException(status_code=400, detail="Invalid identity image payload")

    similarity = face_similarity_score(live_frame, registered_frame)
    if similarity is None:
        return {
            "face_match": False,
            "similarity": 0.0,
            "id_card_detected": _contains_id_card_like_object(id_card_frame),
            "reason": "Face not clearly detected in live or registered image",
        }

    id_card_detected = _contains_id_card_like_object(id_card_frame)
    face_match = similarity >= 0.55

    return {
        "face_match": face_match,
        "similarity": round(float(similarity), 4),
        "id_card_detected": id_card_detected,
        "reason": "ok" if face_match and id_card_detected else "Identity verification failed",
    }

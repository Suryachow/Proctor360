import cv2
import numpy as np


class FaceDetector:
    def __init__(self):
        self.classifier = cv2.CascadeClassifier(
            cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        )

    def detect(self, frame):
        return len(self.detect_boxes(frame))

    def detect_boxes(self, frame):
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        faces = self.classifier.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=4)
        return list(faces)

    def largest_face_crop(self, frame):
        faces = self.detect_boxes(frame)
        if not faces:
            return None

        x, y, w, h = max(faces, key=lambda f: f[2] * f[3])
        return frame[y:y + h, x:x + w]


def face_similarity_score(frame_a, frame_b) -> float | None:
    face_a = face_detector.largest_face_crop(frame_a)
    face_b = face_detector.largest_face_crop(frame_b)
    if face_a is None or face_b is None:
        return None

    gray_a = cv2.cvtColor(face_a, cv2.COLOR_BGR2GRAY)
    gray_b = cv2.cvtColor(face_b, cv2.COLOR_BGR2GRAY)
    gray_a = cv2.resize(gray_a, (128, 128))
    gray_b = cv2.resize(gray_b, (128, 128))

    hist_a = cv2.calcHist([gray_a], [0], None, [64], [0, 256])
    hist_b = cv2.calcHist([gray_b], [0], None, [64], [0, 256])
    cv2.normalize(hist_a, hist_a)
    cv2.normalize(hist_b, hist_b)

    corr = float(cv2.compareHist(hist_a, hist_b, cv2.HISTCMP_CORREL))
    corr_norm = max(0.0, min(1.0, (corr + 1.0) / 2.0))

    diff = np.mean(np.abs(gray_a.astype(np.float32) - gray_b.astype(np.float32))) / 255.0
    diff_score = max(0.0, min(1.0, 1.0 - float(diff)))

    return round((0.65 * corr_norm) + (0.35 * diff_score), 4)


face_detector = FaceDetector()

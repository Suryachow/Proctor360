/**
 * Local Proctor Engine — Client-side AI Detection
 * Ported from CameraModule's high-performance monitor.js
 * 
 * Uses MediaPipe FaceDetection + COCO-SSD for real-time proctoring
 * without round-tripping every frame to the backend.
 * Evidence screenshots are captured locally and synced on submit.
 */

// ─── CDN Script Loader ───
function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

const CDN_SCRIPTS = [
  "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.16.0",
  "https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd",
  "https://cdn.jsdelivr.net/npm/@mediapipe/face_detection/face_detection.js",
  "https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js",
];

// ─── Production Config (BALANCED MODE - SMART ENFORCEMENT) ───
const CONFIG = {
  FACE_MIN_CONFIDENCE: 0.75,
  PHONE_MIN_CONFIDENCE: 0.30,
  MAX_FPS: 18, // Stable 18 FPS for balanced monitoring
  MOTION_THROTTLE_MS: 100,
  PHONE_THROTTLE_MS: 150,
  CAPTURE_QUALITY: 0.5,
  EVIDENCE_MAX_COUNT: 100,
  NO_FACE_THRESHOLD_FRAMES: 4, // 0.2s grace period
};

// ─── State ───
let faceDetection = null;
let cocoModel = null;
let modelsReady = false;
let _camera = null;
let _isProcessingFace = false;
let _lastFaceProcessTime = 0;
let _healthMetrics = {
  lastFaceLatency: 0,
  faceFps: 0,
  errors: 0
};

// ─── Evidence Store ───
const evidenceShots = [];
const lastCaptureTime = {};
const CAPTURE_THROTTLE_MS = 600; // Take evidence faster for rapid violations
const MAX_EVIDENCE_SHOTS = 60;

// ─── Metrics ───
let credibilityScore = 100;
let noFaceFrames = 0;
let motionWarningCount = 0;
let noFaceSeconds = 0;
let multiplePersonSeconds = 0;
let mobileSeconds = 0;
let focusLostSeconds = 0;
let tabSwitchCount = 0;

// ─── Motion Detection ───
let prevFrame = null;
let monitorInterval = null;
let phoneInterval = null;
const MOTION_ACCUMULATOR_LIMIT = 30; // Balanced motion sensitivity

/**
 * Load all CDN scripts for MediaPipe and TensorFlow
 */
export async function loadAIScripts() {
  for (const src of CDN_SCRIPTS) {
    try {
      await loadScript(src);
    } catch (e) {
      console.warn(`Failed to load: ${src}`, e);
    }
  }
}

/**
 * Initialize AI models (MediaPipe FaceDetection + COCO-SSD)
 * Returns true if both models loaded successfully.
 */
export async function initModels(onFaceResult) {
  try {
    // Fast parallel polling for libraries
    for (let i = 0; i < 100; i++) {
      if (typeof window.FaceDetection !== "undefined" && typeof window.tf !== "undefined") break;
      await new Promise(r => setTimeout(r, 50)); 
    }

    if (typeof window.FaceDetection === "undefined" || typeof window.tf === "undefined") {
      console.error("AI Libraries (MediaPipe/TFJS) failed to load");
      return false;
    }

    faceDetection = new window.FaceDetection({
      locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/face_detection/${f}`,
    });
    faceDetection.setOptions({ 
      model: "short", 
      minDetectionConfidence: CONFIG.FACE_MIN_CONFIDENCE 
    });
    faceDetection.onResults(onFaceResult);

    // Load COCO-SSD for phone detection
    if (window.cocoSsd && !cocoModel) {
      cocoModel = await window.cocoSsd.load();
    }

    modelsReady = true;
    return true;
  } catch (e) {
    console.error("AI Model init failed:", e);
    return false;
  }
}

/**
 * Start a passive detection loop that feeds frames to FaceDetection
 */
export function startFaceLoop(videoEl) {
  if (!faceDetection || !videoEl) return;
  
  let rafId = null;
  const tick = async () => {
    if (!modelsReady || !faceDetection || videoEl.paused || videoEl.ended) {
      rafId = requestAnimationFrame(tick);
      return;
    }

    const now = Date.now();
    const interval = 1000 / CONFIG.MAX_FPS;

    if (!_isProcessingFace && videoEl.videoWidth > 0) {
      if (now - _lastFaceProcessTime >= interval) {
        _isProcessingFace = true;
        const start = Date.now();
        try {
          // Send frame to MediaPipe
          await faceDetection.send({ image: videoEl });
          _healthMetrics.lastFaceLatency = Date.now() - start;
          _lastFaceProcessTime = now;
          _healthMetrics.faceFps = 1000 / (Math.max(1, Date.now() - now));
        } catch (e) {
          _healthMetrics.errors++;
        } finally {
          _isProcessingFace = false;
        }
      }
    }
    rafId = requestAnimationFrame(tick);
  };

  rafId = requestAnimationFrame(tick);
  
  // Store the stop function to be called by stopAllDetection
  _faceLoopRafId = rafId;
}

let _faceLoopRafId = null;

/**
 * Start phone/object detection interval using COCO-SSD
 */
export function startPhoneDetection(videoEl, onDetected) {
  if (phoneInterval) clearInterval(phoneInterval);

  phoneInterval = setInterval(async () => {
    if (!videoEl || !videoEl.videoWidth || !cocoModel) return;
    try {
      const predictions = await cocoModel.detect(videoEl);
      const phone = predictions.find(p => (p.class === "cell phone" || p.class === "remote") && p.score > CONFIG.PHONE_MIN_CONFIDENCE);
      if (phone) {
        onDetected(phone.score, phone.class);
        mobileSeconds += (CONFIG.PHONE_THROTTLE_MS / 1000);
      }
    } catch { _healthMetrics.errors++; }
  }, CONFIG.PHONE_THROTTLE_MS);
}

/**
 * Start motion detection using frame differencing
 */
export function startMotionDetection(videoEl, onMotion) {
  if (monitorInterval) clearInterval(monitorInterval);

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const W = 160, H = 120;
  let motionAccumulator = 0;

  monitorInterval = setInterval(() => {
    if (!videoEl || !videoEl.videoWidth) return;
    try {
      ctx.drawImage(videoEl, 0, 0, W, H);
      const frame = ctx.getImageData(0, 0, W, H);
      if (prevFrame) {
        let diff = 0;
        for (let i = 0; i < frame.data.length; i += 16) {
          diff += Math.abs(frame.data[i] - prevFrame.data[i]);
        }
        diff /= (W * H);
        motionAccumulator += diff;
        if (motionAccumulator > MOTION_ACCUMULATOR_LIMIT) {
          motionWarningCount++;
          motionAccumulator = 0;
          onMotion(motionWarningCount);
        }
      }
      prevFrame = frame;
    } catch { _healthMetrics.errors++; }
  }, CONFIG.MOTION_THROTTLE_MS);
}

/**
 * Capture an evidence screenshot from the video element.
 * Throttled per-reason to avoid flooding.
 */
export function captureEvidence(videoEl, reason) {
  if (!videoEl) return null;

  const now = Date.now();
  if (lastCaptureTime[reason] && now - lastCaptureTime[reason] < CAPTURE_THROTTLE_MS) return null;
  if (evidenceShots.length >= MAX_EVIDENCE_SHOTS) return null;

  lastCaptureTime[reason] = now;

  const canvas = document.createElement("canvas");
  const w = videoEl.videoWidth || videoEl.clientWidth || 640;
  const h = videoEl.videoHeight || videoEl.clientHeight || 480;
  if (w === 0 || h === 0) return null;

  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");

  try {
    ctx.drawImage(videoEl, 0, 0, w, h);
    const dataUrl = canvas.toDataURL("image/jpeg", CONFIG.CAPTURE_QUALITY);
    if (!dataUrl || dataUrl === "data:,") return null;

    const shot = { reason, time: now, image: dataUrl };
    evidenceShots.push(shot);
    return shot;
  } catch {
    _healthMetrics.errors++;
    return null;
  }
}

/**
 * Reduce credibility score
 */
export function reduceCredibility(amount) {
  credibilityScore = Math.max(0, credibilityScore - amount);
  return credibilityScore;
}

/**
 * Get current credibility score
 */
export function getCredibilityScore() {
  return credibilityScore;
}

/**
 * Get all captured evidence shots
 */
export function getEvidenceShots() {
  return [...evidenceShots];
}

/**
 * Get proctoring metrics summary
 */
export function getMetricsSummary() {
  return {
    credibilityScore,
    motionWarningCount,
    noFaceSeconds: parseFloat(noFaceSeconds.toFixed(1)),
    multiplePersonSeconds: parseFloat(multiplePersonSeconds.toFixed(1)),
    mobileSeconds: parseFloat(mobileSeconds.toFixed(1)),
    focusLostSeconds,
    tabSwitchCount,
    evidenceCount: evidenceShots.length,
    health: { ..._healthMetrics }
  };
}

/**
 * Record a no-face frame (called from face detection results handler)
 */
export function recordNoFace() {
  noFaceFrames++;
  if (noFaceFrames > CONFIG.NO_FACE_THRESHOLD_FRAMES) {
    noFaceSeconds += (1 / CONFIG.MAX_FPS);
    reduceCredibility(0.5);
    return { shouldWarn: true, shouldCapture: noFaceFrames % (CONFIG.MAX_FPS * 2) === 0, streak: noFaceFrames };
  }
  return { shouldWarn: false, shouldCapture: false, streak: noFaceFrames };
}

/**
 * Record multiple faces detected
 */
export function recordMultipleFaces() {
  multiplePersonSeconds += 0.03;
  reduceCredibility(2);
  noFaceFrames = 0;
  return { shouldCapture: true };
}

/**
 * Record a single face detected (resets no-face counter)
 */
export function recordFaceDetected() {
  noFaceFrames = 0;
}

/**
 * Record a tab switch event
 */
export function recordTabSwitch() {
  focusLostSeconds++;
  tabSwitchCount++;
  reduceCredibility(5);
}

/**
 * Check if models are ready
 */
export function areModelsReady() {
  return modelsReady;
}

/**
 * Stop all detection loops and clean up
 */
export function stopAllDetection() {
  if (monitorInterval) { clearInterval(monitorInterval); monitorInterval = null; }
  if (phoneInterval) { clearInterval(phoneInterval); phoneInterval = null; }
  if (_camera) { try { _camera.stop(); } catch { } _camera = null; }
  if (_faceLoopRafId) { cancelAnimationFrame(_faceLoopRafId); _faceLoopRafId = null; }
  prevFrame = null;
}

/**
 * Reset all state for a new session
 */
export function resetState() {
  stopAllDetection();
  evidenceShots.length = 0;
  Object.keys(lastCaptureTime).forEach(k => delete lastCaptureTime[k]);
  credibilityScore = 100;
  noFaceFrames = 0;
  motionWarningCount = 0;
  noFaceSeconds = 0;
  multiplePersonSeconds = 0;
  mobileSeconds = 0;
  focusLostSeconds = 0;
  tabSwitchCount = 0;
  prevFrame = null;
}

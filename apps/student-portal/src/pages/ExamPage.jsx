import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../services/api";
import { useProctoring } from "../hooks/useProctoring";
import {
  validateExamDevice,
  preventDeveloperTools,
  enforceKeyboardRestrictions,
  generateDeviceFingerprint,
  validateBrowserContext
} from "../utils/securitUtils";
import {
  validateDirectAccess,
  monitorPointerBehavior,
  monitorKeyboardBehavior,
} from "../utils/remoteAccessDetection";
import * as LocalProctor from "../utils/localProctorEngine";

const EXAM_DURATION_SECONDS = 20 * 60;
const AUTO_SUBMIT_RISK_THRESHOLD = 90.0;

function UiIcon({ name, size = 18 }) {
  const common = {
    className: "icon-svg",
    style: { width: `${size}px`, height: `${size}px` },
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2.5",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true",
  };
  if (name === "refresh") return <svg {...common}><path d="M21 12a9 9 0 1 1-2.6-6.4" /><path d="M21 4v6h-6" /></svg>;
  if (name === "check") return <svg {...common}><polyline points="20 6 9 17 4 12" /></svg>;
  if (name === "shield") return <svg {...common}><path d="M12 3l8 3v6c0 4.6-3 7.8-8 9-5-1.2-8-4.4-8-9V6z" /><path d="M9 12l2 2 4-4" /></svg>;
  if (name === "camera") return <svg {...common}><path d="M4 8h3l2-2h6l2 2h3v10H4z" /><circle cx="12" cy="13" r="3.5" /></svg>;
  if (name === "wifi") return <svg {...common}><path d="M5 12.55a11 11 0 0 1 14.08 0" /><path d="M1.42 9a16 16 0 0 1 21.16 0" /><path d="M8.53 16.11a6 6 0 0 1 6.95 0" /><line x1="12" y1="20" x2="12.01" y2="20" /></svg>;
  if (name === "mic") return <svg {...common}><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>;
  return <svg {...common}><path d="M5 12h14" /></svg>;
}

const parseQuestionPrompt = (p) => {
  const n = String(p || "").replace(/\r\n/g, "\n");
  let u = "";
  const m = n.replace(/\[\[IMAGE_URL\]\]([\s\S]*?)(?=\[\[|$)/g, (_, v) => { u = String(v || "").trim(); return ""; });
  return { text: m.trim(), imageUrl: u };
};

export default function ExamPage({ token, email, selectedExamCode: preferredCode, onBackToDashboard, onSubmitted }) {
  const [sessionId, setSessionId] = useState(null);
  const [riskScore, setRiskScore] = useState(0);
  const [status, setStatus] = useState("idle");
  const [selectedExamCode, setSelectedExamCode] = useState(preferredCode || "");
  const [verificationCode, setVerificationCode] = useState("");
  const [availableExams, setAvailableExams] = useState([]);
  const [examQuestions, setExamQuestions] = useState([]);
  const [consented, setConsented] = useState(false);
  const [timeLeft, setTimeLeft] = useState(EXAM_DURATION_SECONDS);
  const [error, setError] = useState("");
  const [selectedAnswers, setSelectedAnswers] = useState({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [verificationLiveImage, setVerificationLiveImage] = useState("");
  const [healthStatus, setHealthStatus] = useState({ camera: "pending", mic: "pending", network: "pending", browser: "pending" });
  const [showFullscreenOverlay, setShowFullscreenOverlay] = useState(false);
  const [, setMultipleFacesTimer] = useState(0);
  const [lastWarningTime, setLastWarningTime] = useState(0);
  const [warningCount, setWarningCount] = useState(0);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [frameDebug, setFrameDebug] = useState({ faceCount: 0, events: [], status: "idle", risk: 0 });
  const [liveEventTimeline, setLiveEventTimeline] = useState([]);
  const [visitedIndices, setVisitedIndices] = useState(new Set([0]));
  const [flaggedIds, setFlaggedIds] = useState(new Set());
  const terminalStatuses = new Set(["submitted", "auto_submitted", "terminated", "completed"]);
  const monitoringActive = Boolean(sessionId) && !terminalStatuses.has(String(status || "").toLowerCase());
  const currentQuestionData = useMemo(() => examQuestions[currentQuestionIndex] || null, [examQuestions, currentQuestionIndex]);

  const saveAnswer = async (questionId, optionIndex, currentIdx) => {
    const currentStatus = String(status || "").toLowerCase();
    if (terminalStatuses.has(currentStatus)) {
      setError(`Terminal Session ${currentStatus.toUpperCase()}. Compliance state prevents further input.`);
      return;
    }
    const optionLetter = String.fromCharCode(65 + optionIndex);
    setSelectedAnswers(prev => ({ ...prev, [questionId]: optionLetter }));
    try {
      await api.post("/exam/answer", { session_id: sessionId, question_id: questionId, selected_option: optionLetter }, { headers: { Authorization: `Bearer ${token}` } });
    } catch (err) {
      console.warn("Answer sync failed:", err);
    }
  };

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const verificationVideoRef = useRef(null);
  const verificationCanvasRef = useRef(null);
  const verificationStreamRef = useRef(null);
  const hasAutoSubmittedRef = useRef(false);
  const submitInFlightRef = useRef(false);
  const submittedSessionIdRef = useRef(null);
  const reportDownloadedSessionIdRef = useRef(null);
  const deviceFingerprintRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const lastInterventionIdRef = useRef(0);
  const lastAdminChatIdRef = useRef(0);
  const clientMonitorsBootedRef = useRef(false);
  const noFaceStreakRef = useRef(0);
  const recentFaceSeenAtRef = useRef(0);
  const lastLookAwayWarningRef = useRef(0);
  const strikeThrottleRef = useRef(0);
  const strikeReasonAtRef = useRef({});
  const examStartedAtRef = useRef(0);
  const temporalLookAwayRef = useRef({ streak: 0, lastEmitMs: 0 });
  const violationCooldownRef = useRef({});
  const warningToneCtxRef = useRef(null);
  const multipleFacesDetectedAtRef = useRef(0);
  const phoneDetectionCountRef = useRef(0);
  const currentFaceCountRef = useRef(0);
  const screenStreamRef = useRef(null);
  const [screenShareActive, setScreenShareActive] = useState(false);
  const [localAIStatus, setLocalAIStatus] = useState("idle"); // idle | loading | ready | failed
  const localProctorBootedRef = useRef(false);
  const multipleFacesStrikeCountRef = useRef(0);
  const multipleFacesStreakRef = useRef(0);
  const localNoFaceStreakRef = useRef(0);
  const phoneStrikeCountRef = useRef(0);
  const phoneLastStrikeRef = useRef(0);
  const audioMonitorRef = useRef({
    ctx: null,
    analyser: null,
    source: null,
    data: null,
    rafId: 0,
    spikeCount: 0,
    lastViolationMs: 0,
  });

  // ── SENSOR HYDRATION & EVIDENCE CAPTURE ──
  const startEvidenceRecording = (stream) => {
    if (!stream) return;
    recordedChunksRef.current = [];
    const mr = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' });
    mr.ondataavailable = (e) => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
    mr.onstop = () => {
      const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `PROCTOR_EVIDENCE_${sessionId || "SESSION"}.webm`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    };
    mediaRecorderRef.current = mr;
    mr.start(1000); // Record in 1s chunks
  };

  // ── SENSOR HYDRATION ──
  const startVerificationCamera = useCallback(async () => {
    try {
      if (verificationStreamRef.current) return;
      const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      verificationStreamRef.current = s;
      if (verificationVideoRef.current) { verificationVideoRef.current.srcObject = s; }
      setHealthStatus(prev => ({ ...prev, camera: "success" }));
    } catch { setHealthStatus(prev => ({ ...prev, camera: "warning" })); }
  }, []);

  const startScreenShare = async () => {
    try {
      const ms = await navigator.mediaDevices.getDisplayMedia({ video: true });
      screenStreamRef.current = ms;
      setScreenShareActive(true);
      ms.getVideoTracks()[0].onended = () => {
        setScreenShareActive(false);
        onViolation("screen_share_stopped", "Candidate stopped screen sharing during exam.");
      };
    } catch {
      setError("Screen sharing is required to start the exam.");
    }
  };

  useEffect(() => { startVerificationCamera(); return () => { 
    verificationStreamRef.current?.getTracks().forEach(t => t.stop()); 
    screenStreamRef.current?.getTracks().forEach(t => t.stop());
  }; }, [startVerificationCamera]);

  const captureVerificationImage = () => {
    if (!verificationVideoRef.current || !verificationCanvasRef.current) return;
    const v = verificationVideoRef.current; const c = verificationCanvasRef.current;
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext("2d").drawImage(v, 0, 0);
    setVerificationLiveImage(c.toDataURL("image/jpeg", 0.9));
  };

  const runSystemHealthCheck = async () => {
    setHealthStatus(p => ({ ...p, network: "pending", mic: "pending" }));
    const browserOk = validateBrowserContext().cookiesEnabled && !/Mobi|Android/i.test(navigator.userAgent);
    setHealthStatus(p => ({ ...p, browser: browserOk ? "success" : "error" }));
    try {
      // ── FIXED 404 ENPOINT ROUTING ──
      await api.get("/health");
      setHealthStatus(p => ({ ...p, network: "success" }));
    } catch { setHealthStatus(p => ({ ...p, network: "warning" })); }
    try {
      const ms = await navigator.mediaDevices.getUserMedia({ audio: true });
      ms.getTracks().forEach(t => t.stop());
      setHealthStatus(p => ({ ...p, mic: "success" }));
    } catch { setHealthStatus(p => ({ ...p, mic: "warning" })); }
    if (verificationStreamRef.current) setHealthStatus(p => ({ ...p, camera: "success" }));
  };

  const submitExam = useCallback(async () => {
    if (!sessionId) return;
    if (submitInFlightRef.current) return;
    if (submittedSessionIdRef.current === sessionId) return;

    const currentStatus = String(status || "").toLowerCase();
    if (terminalStatuses.has(currentStatus)) return;

    submitInFlightRef.current = true;
    try {
      try { window.speechSynthesis?.cancel(); } catch { }

      // ── CONCLUDE RECORDING ──
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }

      // ── UPLOAD LOCAL AI EVIDENCE ──
      LocalProctor.stopAllDetection();
      const shots = LocalProctor.getEvidenceShots();
      const metrics = LocalProctor.getMetricsSummary();
      if (shots.length > 0 || metrics.credibilityScore < 100) {
        try {
          await api.post("/exam/evidence", {
            session_id: sessionId,
            evidence_shots: shots,
            metrics,
          }, { headers: { Authorization: `Bearer ${token}` } });
        } catch (e) { console.warn("Evidence upload failed:", e); }
      }

      const { data } = await api.post(`/exam/submit/${sessionId}`, {}, { headers: { Authorization: `Bearer ${token}` } });
      submittedSessionIdRef.current = sessionId;
      setStatus(data.status);
      if (document.fullscreenElement) await document.exitFullscreen();

      // ── AUTO DOWNLOAD PDF REPORT ──
      if (reportDownloadedSessionIdRef.current !== sessionId) {
        try {
          const pdfRes = await api.get(`/exam/report/${sessionId}/pdf`, { responseType: 'blob', headers: { Authorization: `Bearer ${token}` } });
          const url = window.URL.createObjectURL(new Blob([pdfRes.data]));
          const link = document.createElement('a');
          link.href = url;
          link.setAttribute('download', `INTEGRITY_REPORT_${sessionId}.pdf`);
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          reportDownloadedSessionIdRef.current = sessionId;
        } catch (pdfErr) { console.error("Report Generation Node Failure:", pdfErr); }
      }

      if (onSubmitted) onSubmitted(data);
    } catch {
      submittedSessionIdRef.current = null;
      setError("Submission terminal failure.");
    } finally {
      submitInFlightRef.current = false;
    }
  }, [sessionId, status, token, onSubmitted]);

  const playWarningTone = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!warningToneCtxRef.current) {
        warningToneCtxRef.current = new AudioCtx();
      }
      const ctx = warningToneCtxRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = 820;
      gain.gain.value = 0.0001;
      osc.connect(gain);
      gain.connect(ctx.destination);
      const now = ctx.currentTime;
      gain.gain.exponentialRampToValueAtTime(0.12, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
      osc.start(now);
      osc.stop(now + 0.23);
    } catch {
      // Keep warning pipeline resilient even if audio context fails.
    }
  }, []);

  const speakWarning = useCallback((text, callback) => {
    const safeDone = () => { if (callback) callback(); };

    if (!text || !monitoringActive || submitInFlightRef.current || hasAutoSubmittedRef.current) {
      safeDone();
      return;
    }

    playWarningTone();
    if (!window.speechSynthesis) {
      safeDone();
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.35;
    utterance.pitch = 1.0;
    utterance.onend = safeDone;
    utterance.onerror = safeDone;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    setLastWarningTime(Date.now());
  }, [monitoringActive, playWarningTone]);

  const requestAutoSubmit = useCallback((voiceMessage = "") => {
    if (hasAutoSubmittedRef.current || submitInFlightRef.current) return;
    hasAutoSubmittedRef.current = true;

    const doSubmit = () => {
      try { window.speechSynthesis?.cancel(); } catch { }
      submitExam();
    };

    if (voiceMessage) {
      speakWarning(voiceMessage, doSubmit);
      return;
    }
    doSubmit();
  }, [speakWarning, submitExam]);

  const handleMalpracticeStrike = useCallback((reason) => {
    const etype_map = {
      "phone_detected": "Mobile device present",
      "no_face": "No face found",
      "whisper_detected": "Voice anomaly detected",
      "tab_switch": "Tab switching",
      "fullscreen_exit": "Fullscreen escape",
      "copy_paste_attempt": "Clipboard operation blocked",
      "multiple_faces": "Multiple persons detected",
      "excessive_motion": "Unusual movement detected",
      "remote_access_detected": "Remote access tools detected"
    };
    const friendlyReason = etype_map[reason] || reason.replace("_", " ");
    const reasonKey = String(reason || "unknown").toLowerCase();

    const now = Date.now();
    const tabLike = new Set(["tab_switch", "fullscreen_exit", "window_blur"]);
    const examAgeMs = examStartedAtRef.current ? now - examStartedAtRef.current : Number.MAX_SAFE_INTEGER;

    if (tabLike.has(reasonKey) && examAgeMs < 15000) {
      return;
    }

    const strikeCooldownByReason = {
      tab_switch: 3000,
      no_face: 1500,
      looking_away: 1500,
      multiple_faces: 2000,
      phone_detected: 2000,
    };
    const strikeCooldownMs = strikeCooldownByReason[reasonKey] ?? 2000;

    const lastReasonAt = strikeReasonAtRef.current[reasonKey] || 0;
    if (now - lastReasonAt < strikeCooldownMs) return;
    strikeReasonAtRef.current[reasonKey] = now;

    if (now - strikeThrottleRef.current < strikeCooldownMs) return;
    strikeThrottleRef.current = now;

    setWarningCount(prev => {
      const next = prev + 1;
      setLastWarningTime(now);

      if (next === 1) {
        speakWarning(`Violation detected: ${friendlyReason}. Stay compliant.`);
        setError(`Warning (1/4): ${friendlyReason}. Please stay compliant.`);
      } else if (next === 2) {
        speakWarning(`Second warning: ${friendlyReason}. Compliance record updated.`);
        setError(`Warning (2/4): ${friendlyReason}. Compliance record updated.`);
      } else if (next === 3) {
        speakWarning(`Final warning: ${friendlyReason}. Any further violation will end the exam.`);
        setError(`FINAL WARNING (3/4): ${friendlyReason}. Any further violation will end the exam.`);
      } else if (next >= 4) {
        setError(`Integrity threshold reached (4/4). Continuing in monitored mode.`);
        appendTimelineEvent("strike_limit", "Maximum warnings reached", "client");
      }
      return next;
    });
  }, [speakWarning, requestAutoSubmit]);

  const appendTimelineEvent = useCallback((eventType, detail = "", source = "client", confidence = null) => {
    const item = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      at: new Date().toLocaleTimeString(),
      eventType: String(eventType || "unknown"),
      detail: String(detail || ""),
      source,
      confidence,
    };
    setLiveEventTimeline((prev) => [item, ...prev].slice(0, 14));
  }, []);

  const onViolation = useCallback(async (event_type, detail = "") => {
    if (!sessionId || !monitoringActive) return;

    const now = Date.now();
    const cooldownByEvent = {
      suspicious_pointer_behavior: 2000,
      suspicious_keyboard_pattern: 2000,
      mouse_left_window: 2000,
      window_blur: 0,
      tab_switch: 0,
      audio_spike: 4000,
      fullscreen_exit: 0,
      developer_tools_detected: 0,
      copy_paste_attempt: 500,
      looking_away: 400,
      gaze_deviation: 400,
      no_face: 400,
    };
    const cooldown = cooldownByEvent[event_type] ?? 800;
    const lastSent = violationCooldownRef.current[event_type] || 0;
    if (now - lastSent < cooldown) return;
    violationCooldownRef.current[event_type] = now;

    appendTimelineEvent(event_type, detail, "client", null);
    
    // Auto-capture evidence for ANY critical violation if not captured recently
    if (["tab_switch", "fullscreen_exit", "copy_paste_attempt", "looking_away", "no_face", "developer_tools_detected", "multiple_faces", "phone_detected"].includes(event_type)) {
       LocalProctor.captureEvidence(videoRef.current, event_type);
    }

    // SYNC WITH LOCAL PROCTOR ENGINE
    if (event_type === "tab_switch" || event_type === "window_blur") {
      LocalProctor.recordTabSwitch();
    }

    if (event_type === "fullscreen_exit" || event_type === "tab_switch") {
      setShowFullscreenOverlay(true);
    }

    const strikeEvents = new Set([
      "tab_switch",
      "fullscreen_exit",
      "copy_paste_attempt",
      "developer_tools_detected",
      "remote_access_detected",
      "restricted_keyboard_shortcut",
      "no_face",
      "multiple_faces",
      "phone_detected",
    ]);
    if (strikeEvents.has(event_type)) {
      handleMalpracticeStrike(event_type);
    }

    try {
      const { data } = await api.post("/exam/event", { session_id: sessionId, event_type, detail });
      setRiskScore(data.total_risk); setStatus(data.session_status);

      // BALANCED: Instant kill only for serious security breaches
      // Instant kill disabled per user request
      if (event_type === "fullscreen_exit" || event_type === "developer_tools_detected" || event_type === "remote_access_detected") {
        setError(`Security violation: ${event_type}. Recorded for review.`);
      }
    } catch (err) {
      const detail = String(err?.response?.data?.detail || "");
      if (err?.response?.status === 400 && /INACTIVE/i.test(detail)) {
        setStatus("terminated");
        setError("Session inactive. Start a new exam session.");
      }
    }
  }, [sessionId, monitoringActive, handleMalpracticeStrike, appendTimelineEvent, requestAutoSubmit]);

  useProctoring({
    active: monitoringActive,
    onViolation,
    minHiddenMs: 1500,
    minBlurMs: 1400,
    fullscreenCooldownMs: 8000,
  });

  useEffect(() => {
    if (!monitoringActive || clientMonitorsBootedRef.current) return;

    clientMonitorsBootedRef.current = true;

    preventDeveloperTools();
    enforceKeyboardRestrictions(onViolation);
    monitorPointerBehavior(onViolation);
    monitorKeyboardBehavior(onViolation);

    const onDevToolsDetected = () => onViolation("developer_tools_detected", "Developer tools window detected");
    window.addEventListener("devToolsDetected", onDevToolsDetected);

    LocalProctor.loadAIScripts().catch(() => { }); // Pre-load heavy AI scripts early
    return () => {
      window.removeEventListener("devToolsDetected", onDevToolsDetected);
      clientMonitorsBootedRef.current = false;
    };
  }, [monitoringActive, onViolation]);

  const loadAvailableExams = useCallback(async () => {
    try {
      const { data } = await api.get("/exam/available", { headers: { Authorization: `Bearer ${token}` } });
      setAvailableExams(data); if (data.length && !selectedExamCode) setSelectedExamCode(data[0].exam_code);
    } catch { }
  }, [selectedExamCode, token]);

  const reEnterFullscreen = async () => {
    try {
      await document.documentElement.requestFullscreen();
      setShowFullscreenOverlay(false);
      setError("");
    } catch {
      setError("Fullscreen entry blocked. Please allow fullscreen to continue.");
    }
  };

  const startExam = async () => {
    setError("");
    if (!verificationLiveImage) { setError("Capture your Live Identity Feed first."); return; }
    if (!verificationCode) { setError("Enter your OTP Validation Key."); return; }
    if (!termsAccepted) { setError("Please accept the Neural Assessment Protocols first."); return; }
    if (!screenShareActive) { setError("Start Screen Sharing before entering the exam."); return; }
    try {
      const remote = await validateDirectAccess();
      if (!remote.isAllowed) { setError(remote.reason); return; }

      // Reset integrity counters and one-shot guards for a fresh session.
      setWarningCount(0);
      setLastWarningTime(0);
      setLiveEventTimeline([]);
      noFaceStreakRef.current = 0;
      recentFaceSeenAtRef.current = 0;
      lastLookAwayWarningRef.current = 0;
      temporalLookAwayRef.current = { streak: 0, lastEmitMs: 0 };
      strikeThrottleRef.current = 0;
      strikeReasonAtRef.current = {};
      examStartedAtRef.current = Date.now();
      submittedSessionIdRef.current = null;
      reportDownloadedSessionIdRef.current = null;
      submitInFlightRef.current = false;

      verificationStreamRef.current?.getTracks().forEach(t => t.stop());
      try { await document.documentElement.requestFullscreen(); } catch { }
      
      let ms;
      try {
        ms = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      } catch (audioErr) {
        console.warn("Audio access failed, falling back to video only:", audioErr);
        ms = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      
      streamRef.current = ms;
      
      if (videoRef.current) {
        videoRef.current.srcObject = ms;
        await new Promise((resolve) => {
          videoRef.current.onloadedmetadata = () => {
            videoRef.current.play().then(resolve).catch(resolve);
          };
          // Fallback if event already fired
          if (videoRef.current.readyState >= 2) resolve();
        });
      }
      
      startEvidenceRecording(ms);

      const { data } = await api.post("/exam/start", { 
        exam_code: selectedExamCode, 
        verification_code: verificationCode.trim(), 
        live_image_base64: verificationLiveImage 
      }, { headers: { Authorization: `Bearer ${token}` } });
      setSessionId(data.session_id); setStatus(data.status); setConsented(true);
      const qRes = await api.get(`/exam/${selectedExamCode}/questions`, { headers: { Authorization: `Bearer ${token}` } });
      setExamQuestions(qRes.data);
    } catch (e) { setError(e?.response?.data?.detail || "Initial Terminal Error. Check Biometric Feed."); }
  };

  useEffect(() => {
    if (status === "active") {
      const timer = setInterval(() => {
        setTimeLeft(p => { if (p <= 1) { clearInterval(timer); submitExam(); return 0; } return p - 1; });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [status, submitExam]);

  // Redundant monitoring logic removed. Local Proctor Engine is now the primary detector.

  useEffect(() => {
    if (!monitoringActive || !sessionId) return;

    const pollLiveProctorSignals = async () => {
      if (hasAutoSubmittedRef.current || submitInFlightRef.current || !monitoringActive) return;
      try {
        const [interventionsRes, chatRes] = await Promise.all([
          api.get(`/innovations/proctor/interventions/student/${sessionId}`, { headers: { Authorization: `Bearer ${token}` } }),
          api.get(`/innovations/proctor/chat/student/${sessionId}`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);

        const interventions = Array.isArray(interventionsRes?.data) ? interventionsRes.data : [];
        const chats = Array.isArray(chatRes?.data) ? chatRes.data : [];

        for (const row of interventions) {
          const id = Number(row?.id || 0);
          if (!id || id <= lastInterventionIdRef.current) continue;

          const actionType = String(row?.action_type || "").toLowerCase();
          const message = String(row?.payload?.message || "").trim();
          if (actionType === "warn") {
            speakWarning(message || "Live proctor warning. Please remain focused.");
            setError(message || "LIVE PROCTOR WARNING: Please remain focused.");
            appendTimelineEvent("proctor_warn", message || "Live proctor warning", "proctor", null);
          } else if (actionType === "lock_navigation") {
            setShowFullscreenOverlay(true);
            setError(message || "LIVE PROCTOR ACTION: Navigation locked. Return to fullscreen.");
            appendTimelineEvent("proctor_lock_navigation", message || "Navigation locked", "proctor", null);
          } else if (actionType === "pause_timer") {
            setStatus("paused");
            setError(message || "LIVE PROCTOR ACTION: Exam paused by proctor.");
            appendTimelineEvent("proctor_pause", message || "Exam paused", "proctor", null);
          } else if (actionType === "force_reverify") {
            setStatus("paused");
            setError(message || "LIVE PROCTOR ACTION: Reverification required.");
            appendTimelineEvent("proctor_reverify", message || "Reverification required", "proctor", null);
          }
          lastInterventionIdRef.current = id;
        }

        for (const row of chats) {
          const id = Number(row?.id || 0);
          if (!id || id <= lastAdminChatIdRef.current) continue;
          if (String(row?.sender_role || "").toLowerCase() === "admin") {
            const chatMsg = String(row?.message || "").trim();
            if (chatMsg) {
              speakWarning(`Proctor message: ${chatMsg}`);
              setError(`PROCTOR MESSAGE: ${chatMsg}`);
              appendTimelineEvent("proctor_chat", chatMsg, "proctor", null);
            }
          }
          lastAdminChatIdRef.current = id;
        }
      } catch {
        // Keep exam flow resilient if live-proctor polling momentarily fails.
      }
    };

    pollLiveProctorSignals();
    const interval = setInterval(pollLiveProctorSignals, 4000);
    return () => clearInterval(interval);
  }, [monitoringActive, sessionId, token, appendTimelineEvent]);

  useEffect(() => {
    if (!monitoringActive || !streamRef.current) return;

    let cancelled = false;

    const bootAudioMonitor = async () => {
      try {
        if (audioMonitorRef.current.ctx) return;

        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;

        const ctx = new AudioCtx();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
        const source = ctx.createMediaStreamSource(streamRef.current);
        source.connect(analyser);

        const data = new Uint8Array(analyser.fftSize);
        audioMonitorRef.current = {
          ctx,
          analyser,
          source,
          data,
          rafId: 0,
          spikeCount: 0,
          lastViolationMs: 0,
        };

        const tick = () => {
          if (cancelled) return;

          const ref = audioMonitorRef.current;
          ref.analyser.getByteTimeDomainData(ref.data);

          let sumSquares = 0;
          for (let i = 0; i < ref.data.length; i += 1) {
            const centered = (ref.data[i] - 128) / 128;
            sumSquares += centered * centered;
          }
          const rms = Math.sqrt(sumSquares / ref.data.length);

          if (rms > 0.11) {
            ref.spikeCount += 1;
          } else {
            ref.spikeCount = Math.max(0, ref.spikeCount - 1);
          }

          const now = Date.now();
          if (ref.spikeCount >= 26 && now - ref.lastViolationMs > 12000) {
            ref.lastViolationMs = now;
            onViolation("audio_spike", `Sustained audio spike detected (rms=${rms.toFixed(3)})`);
          }

          ref.rafId = window.requestAnimationFrame(tick);
        };

        audioMonitorRef.current.rafId = window.requestAnimationFrame(tick);
      } catch {
        // Keep exam flow resilient if browser blocks audio analysis APIs.
      }
    };

    bootAudioMonitor();

    return () => {
      cancelled = true;
      const ref = audioMonitorRef.current;
      if (ref.rafId) window.cancelAnimationFrame(ref.rafId);
      try { ref.source?.disconnect(); } catch { }
      try { ref.analyser?.disconnect(); } catch { }
      try { ref.ctx?.close(); } catch { }
      audioMonitorRef.current = {
        ctx: null,
        analyser: null,
        source: null,
        data: null,
        rafId: 0,
        spikeCount: 0,
        lastViolationMs: 0,
      };
    };
  }, [monitoringActive, onViolation]);

  useEffect(() => {
    if (status === "active" && streamRef.current && videoRef.current) {
      if (videoRef.current.srcObject !== streamRef.current) {
        videoRef.current.srcObject = streamRef.current;
        videoRef.current.play().catch(() => { });
      }
    }
  }, [status, monitoringActive, consented]);

  // ── LOCAL AI PROCTORING ENGINE (MediaPipe + COCO-SSD) ──
  useEffect(() => {
    if (!monitoringActive || !consented || !videoRef.current || localProctorBootedRef.current) return;
    if (status === "terminated" || status === "submitted") {
      LocalProctor.stopAllDetection();
      return;
    }
    localProctorBootedRef.current = true;

    const bootLocalAI = async () => {
      // Wait for the video feed to actually have pixels
      let attempts = 0;
      while (attempts < 10 && (!videoRef.current || videoRef.current.videoWidth === 0)) {
        await new Promise(r => setTimeout(r, 500));
        attempts++;
      }
      
      if (!videoRef.current || videoRef.current.videoWidth === 0) {
         console.warn("AI Boot skipped: Video not ready after 5s");
         localProctorBootedRef.current = false;
         return;
      }

      setLocalAIStatus("loading");
      try {
        LocalProctor.resetState();
        await LocalProctor.loadAIScripts();

        const onFaceResult = (results) => {
          if (!monitoringActive || hasAutoSubmittedRef.current) return;
          const detections = results?.detections || [];

          currentFaceCountRef.current = detections.length;
          if (detections.length === 0) {
            multipleFacesStreakRef.current = 0;
            const { shouldWarn, shouldCapture } = LocalProctor.recordNoFace();
            if (shouldWarn) {
              onViolation("no_face", "Local AI: No face detected");
            }
            if (shouldCapture) {
              LocalProctor.captureEvidence(videoRef.current, "no_face");
            }
          } else if (detections.length === 1) {
            multipleFacesStreakRef.current = 0;
            LocalProctor.recordFaceDetected();

            // ── NEW: LOCAL GAZE / LOOK-AWAY LOGIC ──
            const det = detections[0];
            const box = det.boundingBox;
            if (box) {
              const cx = box.xCenter; // 0 to 1
              const cy = box.yCenter; // 0 to 1
              const aspect = box.width / box.height;
              
              const isOffCenter = Math.abs(cx - 0.5) > 0.22 || Math.abs(cy - 0.5) > 0.28;
              const isSideProfile = aspect < 0.65; // Relaxed from 0.75

              if (isOffCenter || isSideProfile) {
                temporalLookAwayRef.current.streak += 1;
                const nowMs = Date.now();
                if (temporalLookAwayRef.current.streak >= 2 && nowMs - temporalLookAwayRef.current.lastEmitMs > 2000) {
                  temporalLookAwayRef.current.lastEmitMs = nowMs;
                  const detail = isOffCenter ? "Head positioned off-center" : "Side-profile detected";
                  onViolation("looking_away", `Balanced AI: ${detail}`);
                  LocalProctor.captureEvidence(videoRef.current, "looking_away");
                }
              } else {
                temporalLookAwayRef.current.streak = Math.max(0, temporalLookAwayRef.current.streak - 1);
              }
            }
          } else if (detections.length > 1) {
            multipleFacesStreakRef.current += 1;
            if (multipleFacesStreakRef.current >= 3) {
              multipleFacesStreakRef.current = 0;
              multipleFacesStrikeCountRef.current++;
              LocalProctor.recordMultipleFaces();
              LocalProctor.captureEvidence(videoRef.current, "multiple_faces");
              onViolation("multiple_faces", `Multiple persons detected (Strike ${multipleFacesStrikeCountRef.current}/4)`);
              
              if (multipleFacesStrikeCountRef.current >= 4) {
                requestAutoSubmit("Multiple persons detected consistently. Exam terminated.");
              }
            }
          } else {
            multipleFacesStreakRef.current = 0;
          }
        };

        const ok = await LocalProctor.initModels(onFaceResult);
        if (!ok) { setLocalAIStatus("failed"); return; }

        LocalProctor.startFaceLoop(videoRef.current);

        // Phone detection with 4-Strike Policy
        LocalProctor.startPhoneDetection(videoRef.current, (score, label) => {
          const now = Date.now();
          if (now - phoneLastStrikeRef.current > 2000) {
            phoneLastStrikeRef.current = now;
            phoneStrikeCountRef.current++;
            LocalProctor.captureEvidence(videoRef.current, "phone_detected");
            onViolation("phone_detected", `Phone detected (Strike ${phoneStrikeCountRef.current}/4)`);
            if (phoneStrikeCountRef.current >= 4) {
              requestAutoSubmit("Mobile device detected repeatedly. Exam terminated.");
            }
          }
        });

        // Motion detection
        LocalProctor.startMotionDetection(videoRef.current, (count) => {
          if (count >= 3) { 
            LocalProctor.captureEvidence(videoRef.current, "excessive_motion");
            onViolation("excessive_motion", "Unusual movement detected.");
          }
        });

        setLocalAIStatus("ready");
        appendTimelineEvent("local_ai_ready", "Client-side AI engine initialized (MediaPipe + COCO-SSD)", "system", null);

        // UI Throttle: Update the debug box every 1s instead of every frame
        const uiInterval = setInterval(() => {
          if (status === "terminated") { clearInterval(uiInterval); return; }
          const metrics = LocalProctor.getMetricsSummary();
          setFrameDebug(prev => ({
            ...prev,
            faceCount: currentFaceCountRef.current,
            status: "ready",
            risk: metrics.credibilityScore
          }));
        }, 1000);

      } catch (e) {
        console.error("Local AI boot failed:", e);
        setLocalAIStatus("failed");
        appendTimelineEvent("local_ai_failed", "Client-side AI engine failed to load", "system", null);
      }
    };

    bootLocalAI();
    return () => { LocalProctor.stopAllDetection(); localProctorBootedRef.current = false; };
  }, [monitoringActive, consented, onViolation, handleMalpracticeStrike, appendTimelineEvent]);

  // ── PROACTIVE FULLSCREEN ENFORCEMENT ──
  useEffect(() => {
    if (!monitoringActive) return;
    
    const enforce = () => {
      if (!document.fullscreenElement && !document.hidden) {
        setShowFullscreenOverlay(true);
      }
    };
    
    window.addEventListener("focus", enforce);
    document.addEventListener("visibilitychange", enforce);
    // Periodic check as fallback
    const interval = setInterval(enforce, 2000);
    
    return () => {
      window.removeEventListener("focus", enforce);
      document.removeEventListener("visibilitychange", enforce);
      clearInterval(interval);
    };
  }, [monitoringActive]);

  useEffect(() => { loadAvailableExams(); }, [loadAvailableExams]);

  if (!consented) {
    return (
      <div className="shell scroll-container" style={{ background: "linear-gradient(135deg, #f8fafc 0%, #eff6ff 100%)", height: "100vh", overflowY: "auto" }}>
        <canvas ref={verificationCanvasRef} style={{ display: "none" }} />
        <section style={{ maxWidth: "1000px", margin: "0 auto", padding: "40px 20px" }}>
          <header style={{ textAlign: "center", marginBottom: "40px" }}>
            <div style={{ display: "inline-block", padding: "6px 14px", background: "rgba(99,102,241,0.1)", color: "var(--primary)", borderRadius: "100px", fontWeight: 900, textTransform: "uppercase", fontSize: "0.65rem" }}>Security Protocol Active</div>
            <h1 style={{ fontSize: "2.2rem", fontWeight: 900, margin: "12px 0" }}>Identity Gatekeeper</h1>
          </header>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "40px", marginBottom: "40px" }}>
            <div>
              <h3 style={{ fontSize: "1rem", fontWeight: 900, marginBottom: "20px" }}>Neural Diagnostics</h3>
              <div style={{ display: "grid", gap: "12px" }}>
                {[
                  { l: "Identity Feed", i: "camera", s: verificationLiveImage ? "success" : healthStatus.camera },
                  { l: "Voice Sensor", i: "mic", s: healthStatus.mic },
                  { l: "Latency Node", i: "wifi", s: healthStatus.network },
                  { l: "Neural Engine", i: "shield", s: healthStatus.browser },
                  { l: "Screen Stream", i: "report", s: screenShareActive ? "success" : "pending" }
                ].map(h => (
                  <div key={h.l} style={{ background: "#fff", padding: "16px", borderRadius: "18px", border: "1.5px solid var(--border)", display: "flex", alignItems: "center", gap: "16px" }}>
                    <div style={{ width: "35px", height: "35px", borderRadius: "10px", background: h.s === "success" ? "rgba(16, 185, 129, 0.1)" : "rgba(0,0,0,0.03)", color: h.s === "success" ? "var(--success)" : "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center" }}><UiIcon name={h.i} /></div>
                    <strong style={{ flex: 1, fontSize: "0.85rem" }}>{h.l}</strong>
                    {h.s === "success" ? <UiIcon name="check" /> : <UiIcon name="refresh" />}
                  </div>
                ))}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginTop: "16px" }}>
                <button onClick={runSystemHealthCheck} style={{ width: "100%", borderRadius: "14px", height: "50px", background: "#fff", color: "#000", border: "2px solid #000", fontWeight: 700, cursor: "pointer" }}>Run Global Audit</button>
                <button onClick={startScreenShare} style={{ width: "100%", borderRadius: "14px", height: "50px", background: "#000", color: "#fff", border: "none", fontWeight: 700, cursor: "pointer" }}>
                  {screenShareActive ? "Screen Linked" : "Link Screen"}
                </button>
              </div>
            </div>
            <div>
              <h1 style={{ fontSize: "1rem", fontWeight: 900, marginBottom: "16px" }}>Live Biometric Feed</h1>
              <div style={{ width: "100%", aspectRatio: "4/3", background: "#000", borderRadius: "24px", overflow: "hidden", position: "relative", border: "4px solid #fff", boxShadow: "0 15px 35px rgba(0,0,0,0.1)" }}>
                {verificationLiveImage ? <img src={verificationLiveImage} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <video ref={verificationVideoRef} autoPlay muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                <div style={{ position: "absolute", bottom: "16px", left: "16px", right: "16px" }}>
                  <button onClick={captureVerificationImage} style={{ width: "100%", borderRadius: "14px", padding: "14px", background: "#000", color: "#fff", border: "none", fontWeight: 800, cursor: "pointer", boxShadow: "0 10px 20px rgba(0,0,0,0.2)" }}>Capture Live Identity</button>
                </div>
                {verificationLiveImage && (
                  <button onClick={() => setVerificationLiveImage("")} style={{ position: "absolute", top: "12px", right: "12px", borderRadius: "10px", padding: "8px 12px", fontSize: "0.7rem", background: "#fff", color: "#000", border: "1.5px solid #000", fontWeight: 800, cursor: "pointer" }}>Retake Photo</button>
                )}
              </div>
            </div>
          </div>

          <div style={{ background: "#fff", padding: "40px", borderRadius: "24px", border: "1.5px solid var(--border)", boxShadow: "0 20px 40px rgba(0,0,0,0.05)", marginBottom: "40px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.2fr", gap: "24px", alignItems: "flex-end" }}>
               <div><label style={{ fontSize: "0.65rem", fontWeight: 900, opacity: 0.5, textTransform: "uppercase" }}>Target Unit</label>
                 <select value={selectedExamCode} onChange={e => setSelectedExamCode(e.target.value)} style={{ width: "100%", padding: "14px", borderRadius: "12px", border: "1.5px solid var(--border)", background: "#f8fafc", fontWeight: 700 }}>
                  <option value="">Select Assessment</option>
                  {availableExams.map(ex => <option key={ex.exam_code} value={ex.exam_code}>{ex.title}</option>)}
                 </select></div>
               <div><label style={{ fontSize: "0.65rem", fontWeight: 900, opacity: 0.5, textTransform: "uppercase" }}>Access Key (OTP)</label>
                 <input value={verificationCode} onChange={e => setVerificationCode(e.target.value.toUpperCase())} placeholder="XXXX" style={{ width: "100%", padding: "14px", borderRadius: "12px", border: "1.5px solid var(--border)", background: "#f8fafc", textAlign: "center", fontWeight: 900 }} /></div>
               <button onClick={startExam} style={{ width: "100%", height: "55px", borderRadius: "100px", fontSize: "1rem", background: "#000", color: "#fff", border: "none", fontWeight: 900, letterSpacing: "1px", cursor: "pointer", boxShadow: "0 10px 30px rgba(0,0,0,0.15)" }}>Initialize Terminal Session</button>
             </div>
             
             <div style={{ marginTop: "24px", padding: "16px", background: "#f8fafc", borderRadius: "14px", border: "1px dashed var(--border)", display: "flex", gap: "12px", alignItems: "center", cursor: "pointer" }} onClick={() => setTermsAccepted(!termsAccepted)}>
                 <input type="checkbox" checked={termsAccepted} readOnly style={{ width: "20px", height: "20px", cursor: "pointer" }} />
                 <span style={{ fontSize: "0.85rem", color: "var(--text-muted)", cursor: "pointer" }}>
                   I acknowledge that this assessment is proctored by **Proctor360 AI Engine**. I agree to continuous video/audio archival and the Three-Strike integrity policy.
                 </span>
              </div>

              {error && <div style={{ color: "var(--danger)", textAlign: "center", marginTop: "12px", fontWeight: 800 }}>{error}</div>}
           </div>
        </section>
      </div>
    );
  }

  // Full-screen loading overlay removed to prevent blocking the camera feed.
  // AI initialization now happens in the background.


  return (
    <div className="shell" style={{ padding: "40px", background: "#f8fafc" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "40px", background: "#fff", padding: "24px 40px", borderRadius: "24px", border: "1.5px solid var(--border)" }}>
        <div style={{ padding: "8px 16px", background: "var(--rail-bg)", color: "#fff", borderRadius: "100px", fontSize: "0.7rem", fontWeight: 900 }}>NEURAL SENTRY ACTIVE</div>
        <div style={{ fontSize: "2.4rem", fontWeight: 900 }}>{Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, "0")}</div>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: "30px" }}>
        <main className="question-panel card" style={{ padding: "40px" }}>
          {currentQuestionData ? (
            <>
              <h2 style={{ fontSize: "1.6rem", marginBottom: "32px", lineHeight: 1.4 }}>{parseQuestionPrompt(currentQuestionData.prompt).text}</h2>
              <div style={{ display: "grid", gap: "12px" }}>
                {currentQuestionData.options.map((o, i) => (
                  <div key={i} onClick={() => saveAnswer(currentQuestionData.id, i, currentQuestionIndex)} style={{ padding: "20px", borderRadius: "16px", border: "1.5px solid var(--border)", cursor: "pointer", background: selectedAnswers[currentQuestionData.id] === String.fromCharCode(65 + i) ? "rgba(99,102,241,0.08)" : "", borderColor: selectedAnswers[currentQuestionData.id] === String.fromCharCode(65 + i) ? "var(--primary)" : "" }}>
                    <strong>{String.fromCharCode(65 + i)}.</strong> <span style={{ marginLeft: "12px" }}>{o}</span>
                  </div>
                ))}
              </div>
              
              <div style={{ display: "flex", gap: "12px", marginTop: "40px" }}>
                <button onClick={() => {
                  const nextIdx = currentQuestionIndex - 1;
                  setCurrentQuestionIndex(nextIdx);
                  setVisitedIndices(prev => new Set([...prev, nextIdx]));
                }} disabled={currentQuestionIndex === 0} style={{ flex: 1, padding: "14px", borderRadius: "12px", background: "#fff", color: "#000", border: "2px solid #000", fontWeight: 700, cursor: currentQuestionIndex === 0 ? "not-allowed" : "pointer", opacity: currentQuestionIndex === 0 ? 0.5 : 1 }}>Previous</button>
                
                <button onClick={() => {
                  setFlaggedIds(prev => {
                    const next = new Set(prev);
                    if (next.has(currentQuestionData.id)) next.delete(currentQuestionData.id);
                    else next.add(currentQuestionData.id);
                    return next;
                  });
                }} style={{ padding: "14px 20px", borderRadius: "12px", background: flaggedIds.has(currentQuestionData.id) ? "#8b5cf6" : "#fff", color: flaggedIds.has(currentQuestionData.id) ? "#fff" : "#000", border: "2px solid " + (flaggedIds.has(currentQuestionData.id) ? "#8b5cf6" : "#000"), fontWeight: 700, cursor: "pointer" }}>
                  {flaggedIds.has(currentQuestionData.id) ? "Flagged" : "Flag Unit"}
                </button>

                <button onClick={() => {
                   const nextIdx = currentQuestionIndex + 1;
                   setCurrentQuestionIndex(nextIdx);
                   setVisitedIndices(prev => new Set([...prev, nextIdx]));
                }} disabled={currentQuestionIndex === examQuestions.length - 1} style={{ flex: 1, padding: "14px", borderRadius: "12px", background: "#000", color: "#fff", border: "none", fontWeight: 700, cursor: currentQuestionIndex === examQuestions.length - 1 ? "not-allowed" : "pointer", opacity: currentQuestionIndex === examQuestions.length - 1 ? 0.5 : 1 }}>Next Unit</button>
              </div>

              <div style={{ marginTop: "24px", borderTop: "1.5px solid var(--border)", paddingTop: "24px" }}>
                <button onClick={submitExam} style={{ width: "100%", padding: "16px", borderRadius: "14px", background: "#000", color: "#fff", border: "none", fontWeight: 900, cursor: "pointer", letterSpacing: "1px", boxShadow: "0 10px 25px rgba(0,0,0,0.15)" }}>Finalize Neural Session</button>
              </div>
            </>
          ) : "...Initializing Neural Stream..."}
        </main>
        <aside style={{ display: "grid", gap: "20px", position: "sticky", top: "40px", height: "fit-content" }}>
          <div className="card" style={{ padding: "10px", background: "#000", overflow: "hidden" }}>
            <video ref={videoRef} autoPlay muted playsInline style={{ width: "100%", borderRadius: "14px" }} />
            <canvas ref={canvasRef} style={{ display: "none" }} />
          </div>

          {/* Question Navigator Grid */}
          <div className="card" style={{ padding: "20px" }}>
            <div style={{ fontSize: "0.75rem", fontWeight: 900, textTransform: "uppercase", opacity: 0.5, marginBottom: "16px", letterSpacing: "0.05em" }}>Exam Navigator</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "8px" }}>
              {examQuestions.map((q, idx) => {
                const isCurrent = currentQuestionIndex === idx;
                const isAnswered = !!selectedAnswers[q.id];
                const isFlagged = flaggedIds.has(q.id);
                const isVisited = visitedIndices.has(idx);

                let bg = "#f1f5f9";
                let color = "#64748b";
                let border = "1px solid #e2e8f0";

                if (isCurrent) {
                  bg = "#000";
                  color = "#fff";
                  border = "1px solid #000";
                } else if (isFlagged) {
                  bg = "#8b5cf6";
                  color = "#fff";
                  border = "1px solid #8b5cf6";
                } else if (isAnswered) {
                  bg = "#10b981";
                  color = "#fff";
                  border = "1px solid #10b981";
                } else if (isVisited) {
                  bg = "#fff";
                  color = "#000";
                  border = "1px solid #000";
                }

                return (
                  <button
                    key={q.id}
                    onClick={() => {
                      setCurrentQuestionIndex(idx);
                      setVisitedIndices(prev => new Set([...prev, idx]));
                    }}
                    style={{
                      aspectRatio: "1/1",
                      borderRadius: "8px",
                      background: bg,
                      color: color,
                      border: border,
                      fontSize: "0.8rem",
                      fontWeight: 800,
                      cursor: "pointer",
                      transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center"
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Updated Answering Legend */}
          <div className="card" style={{ padding: "20px" }}>
            <div style={{ fontSize: "0.75rem", fontWeight: 900, textTransform: "uppercase", opacity: 0.5, marginBottom: "16px", letterSpacing: "0.05em" }}>Status Legend</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.7rem", fontWeight: 700 }}>
                <div style={{ width: "10px", height: "100%", background: "#000", borderRadius: "3px", minHeight: "14px" }} /> Current
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.7rem", fontWeight: 700 }}>
                <div style={{ width: "10px", height: "100%", background: "#10b981", borderRadius: "3px", minHeight: "14px" }} /> Answered
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.7rem", fontWeight: 700 }}>
                <div style={{ width: "10px", height: "100%", background: "#8b5cf6", borderRadius: "3px", minHeight: "14px" }} /> Flagged
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.7rem", fontWeight: 700 }}>
                <div style={{ width: "10px", height: "100%", background: "#fff", border: "1px solid #000", borderRadius: "3px", minHeight: "14px" }} /> Visited
              </div>
            </div>
          </div>

          {/* Hidden Internal Data */}
          <div style={{ display: "none" }}>
            <div style={{ fontSize: "0.8rem", fontWeight: 800, marginBottom: "8px" }}>Neural Stability Signal: {((100 - riskScore)).toFixed(1)}%</div>
            <div>risk: {frameDebug.risk.toFixed(1)}</div>
            <div>credibility: {LocalProctor.getCredibilityScore()}%</div>
          </div>
        </aside>
      </div>

      {showFullscreenOverlay && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.98)", backdropFilter: "blur(20px)", zIndex: 10000, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px", textAlign: "center", color: "#fff" }}>
           <div style={{ width: "80px", height: "80px", borderRadius: "50%", background: "rgba(239, 68, 68, 0.1)", color: "var(--danger)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "32px", border: "2px solid var(--danger)", boxShadow: "0 0 30px rgba(239, 68, 68, 0.2)" }}>
              <UiIcon name="shield" size={40} />
           </div>
           <h1 style={{ fontSize: "2.4rem", fontWeight: 900, marginBottom: "16px", letterSpacing: "-0.02em" }}>NEURAL LOCKDOWN ACTIVE</h1>
           <p style={{ maxWidth: "500px", fontSize: "1.1rem", opacity: 0.7, lineHeight: 1.6, marginBottom: "40px" }}>
              Your terminal session has been interrupted by an external window switch or fullscreen exit. This incident has been logged as a **Strike Violation**.
           </p>
           <div style={{ background: "rgba(255,255,255,0.05)", padding: "24px 40px", borderRadius: "24px", border: "1px solid rgba(255,255,255,0.1)", marginBottom: "40px" }}>
              <div style={{ fontSize: "0.8rem", fontWeight: 800, opacity: 0.5, textTransform: "uppercase", marginBottom: "12px" }}>Immediate Action Required</div>
              <button className="primary" onClick={reEnterFullscreen} style={{ padding: "20px 60px", borderRadius: "100px", fontSize: "1.1rem", fontWeight: 900 }}>RE-ENTER FULLSCREEN PROTOCOL</button>
           </div>
           <p style={{ fontSize: "0.85rem", opacity: 0.4 }}>Attempting to circumvent this barrier will result in immediate terminal termination.</p>
        </div>
      )}

      {error && (
        <div style={{ position: "fixed", bottom: "40px", left: "50%", transform: "translateX(-50%)", zIndex: 1000, minWidth: "400px", background: "var(--danger)", color: "#fff", padding: "16px 24px", borderRadius: "16px", boxShadow: "0 20px 40px rgba(239, 68, 68, 0.2)", display: "flex", alignItems: "center", gap: "16px", animation: "vp-pulse 2s infinite" }}>
          <div style={{ width: "30px", height: "30px", borderRadius: "50%", background: "#fff", color: "var(--danger)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900 }}>!</div>
          <div style={{ flex: 1, fontSize: "0.9rem", fontWeight: 800 }}>{error}</div>
          <button onClick={() => setError("")} style={{ background: "transparent", border: "none", color: "#fff", cursor: "pointer", fontWeight: 900, fontSize: "1.2rem", padding: "8px" }}>×</button>
        </div>
      )}
    </div>
  );
}

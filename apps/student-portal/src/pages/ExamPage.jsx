import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../services/api";
import { useProctoring } from "../hooks/useProctoring";
import { 
  validateExamDevice, 
  preventDeveloperTools, 
  enforceKeyboardRestrictions,
  monitorBrowserActivity,
  generateDeviceFingerprint,
  validateBrowserContext
} from "../utils/securitUtils";
import {
  validateDirectAccess,
  monitorPointerBehavior,
  monitorKeyboardBehavior,
} from "../utils/remoteAccessDetection";

const EXAM_DURATION_SECONDS = 20 * 60;
const AUTO_SUBMIT_RISK_THRESHOLD = 70.0;

function UiIcon({ name }) {
  const common = {
    className: "icon-svg",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true",
  };

  if (name === "back") {
    return (
      <svg {...common}>
        <path d="M14 6l-6 6 6 6" />
        <path d="M8 12h12" />
      </svg>
    );
  }
  if (name === "shield") {
    return (
      <svg {...common}>
        <path d="M12 3l8 3v6c0 4.6-3 7.8-8 9-5-1.2-8-4.4-8-9V6z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    );
  }
  if (name === "camera") {
    return (
      <svg {...common}>
        <path d="M4 8h3l2-2h6l2 2h3v10H4z" />
        <circle cx="12" cy="13" r="3.5" />
      </svg>
    );
  }
  if (name === "capture") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="7" />
        <circle cx="12" cy="12" r="2.5" />
      </svg>
    );
  }
  if (name === "refresh") {
    return (
      <svg {...common}>
        <path d="M21 12a9 9 0 1 1-2.6-6.4" />
        <path d="M21 4v6h-6" />
      </svg>
    );
  }
  if (name === "check") {
    return (
      <svg {...common}>
        <path d="M5 13l4 4L19 7" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M5 12h14" />
    </svg>
  );
}

const parseQuestionPrompt = (prompt) => {
  const normalizedPrompt = String(prompt || "").replace(/\r\n/g, "\n");
  let imageUrl = "";
  let imageAlt = "";
  let diagramMermaid = "";
  let diagramAlt = "";

  const markerPattern = /\[\[(IMAGE_URL|IMAGE_ALT|DIAGRAM_MERMAID|DIAGRAM_ALT)\]\]([\s\S]*?)(?=\[\[(?:IMAGE_URL|IMAGE_ALT|DIAGRAM_MERMAID|DIAGRAM_ALT)\]\]|$)/g;
  const text = normalizedPrompt
    .replace(markerPattern, (_, marker, value) => {
      const normalizedValue = String(value || "").trim();
      if (marker === "IMAGE_URL") imageUrl = normalizedValue;
      if (marker === "IMAGE_ALT") imageAlt = normalizedValue;
      if (marker === "DIAGRAM_MERMAID") diagramMermaid = normalizedValue;
      if (marker === "DIAGRAM_ALT") diagramAlt = normalizedValue;
      return "";
    })
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return {
    text,
    imageUrl,
    imageAlt,
    diagramMermaid,
    diagramAlt,
  };
};

function MermaidDiagram({ code, diagramId, title }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || !code) return;

    let mounted = true;
    const render = async () => {
      try {
        const mermaid = await import("https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs");
        mermaid.default.initialize({ startOnLoad: false, theme: "default" });
        const { svg } = await mermaid.default.render(`mermaid-${diagramId}`, code);
        const hasSyntaxError =
          typeof svg === "string" &&
          (svg.toLowerCase().includes("syntax error in text") || svg.toLowerCase().includes("mermaid version"));
        if (mounted && containerRef.current) {
          containerRef.current.innerHTML = hasSyntaxError
            ? `<div class="question-diagram-fallback">Diagram preview unavailable for this question.</div>`
            : svg;
        }
      } catch {
        if (mounted && containerRef.current) {
          containerRef.current.innerHTML = `<div class="question-diagram-fallback">Diagram preview unavailable for this question.</div>`;
        }
      }
    };

    render();
    return () => {
      mounted = false;
    };
  }, [code, diagramId]);

  return (
    <div className="question-diagram-wrap">
      <p className="question-diagram-title">{title || "Question diagram"}</p>
      <div ref={containerRef} />
    </div>
  );
}

export default function ExamPage({ token, email, selectedExamCode: preferredExamCode, onBackToDashboard, onSubmitted }) {
  const [sessionId, setSessionId] = useState(null);
  const [riskScore, setRiskScore] = useState(0);
  const [status, setStatus] = useState("idle");
  const [selectedExamCode, setSelectedExamCode] = useState(preferredExamCode || "");
  const [verificationCode, setVerificationCode] = useState("");
  const [availableExams, setAvailableExams] = useState([]);
  const [examQuestions, setExamQuestions] = useState([]);
  const [examLoadError, setExamLoadError] = useState("");
  const [examsLoading, setExamsLoading] = useState(false);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [examsLoaded, setExamsLoaded] = useState(false);
  const [consented, setConsented] = useState(false);
  const [permissionsChecked, setPermissionsChecked] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [micReady, setMicReady] = useState(false);
  const [timeLeft, setTimeLeft] = useState(EXAM_DURATION_SECONDS);
  const [error, setError] = useState("");
  const [selectedAnswers, setSelectedAnswers] = useState({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [savingQuestionId, setSavingQuestionId] = useState(null);
  const [audioReady, setAudioReady] = useState(false);
  const [recordingState, setRecordingState] = useState("off");
  const [tabSwitched, setTabSwitched] = useState(false);
  const [verificationCameraReady, setVerificationCameraReady] = useState(false);
  const [verificationLiveImage, setVerificationLiveImage] = useState("");
  const [malpracticeRedirectSeconds, setMalpracticeRedirectSeconds] = useState(null);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const verificationVideoRef = useRef(null);
  const verificationCanvasRef = useRef(null);
  const verificationStreamRef = useRef(null);
  const recorderRef = useRef(null);
  const recordingChunksRef = useRef([]);
  const hasAutoSubmittedRef = useRef(false);
  const deviceFingerprintRef = useRef(null);

  useEffect(() => {
    const deviceValidation = validateExamDevice();
    if (!deviceValidation.isAllowed) {
      setError(deviceValidation.reason);
      return;
    }
    try {
      preventDeveloperTools();
    } catch (err) {
      console.warn("Security initialization warning:", err);
    }
    generateDeviceFingerprint().then((fingerprint) => {
      deviceFingerprintRef.current = fingerprint;
      localStorage.setItem("proctor_device_fingerprint", fingerprint.hash);
    });
    const browserContext = validateBrowserContext();
    if (!browserContext.cookiesEnabled || !browserContext.hasLocalStorage) {
      setError("Browser security settings are not compatible with exam.");
      return;
    }
  }, []);

  const startVerificationCamera = async () => {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      verificationStreamRef.current = stream;
      if (verificationVideoRef.current) {
        verificationVideoRef.current.srcObject = stream;
      }
      setVerificationCameraReady(true);
    } catch {
      setError("Unable to access camera for identity verification");
    }
  };

  const captureVerificationImage = () => {
    if (!verificationVideoRef.current || !verificationCanvasRef.current) {
      setError("Verification camera is not ready");
      return;
    }
    const video = verificationVideoRef.current;
    const canvas = verificationCanvasRef.current;
    if (!video.videoWidth || !video.videoHeight) {
      setError("Verification camera frame not ready yet");
      return;
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const image = canvas.toDataURL("image/jpeg", 0.9);
    setVerificationLiveImage(image);
    setError("");
  };

  const attachLiveVideoStream = async (stream) => {
    if (!videoRef.current || !stream) return false;
    const video = videoRef.current;
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    try { await video.play(); } catch {}
    if (video.videoWidth && video.videoHeight) { return true; }
    const ready = await new Promise((resolve) => {
      const timeout = window.setTimeout(() => resolve(false), 2200);
      const onReady = () => { window.clearTimeout(timeout); resolve(true); };
      video.addEventListener("loadedmetadata", onReady, { once: true });
    });
    return Boolean(ready && video.videoWidth && video.videoHeight);
  };

  const onViolation = useCallback(
    async (event_type, detail = "") => {
      if (!sessionId || status !== "active") return;
      if (event_type === "tab_switch") { setTabSwitched(true); }
      try {
        const { data } = await api.post("/exam/event", { session_id: sessionId, event_type, detail });
        setRiskScore(data.total_risk);
        setStatus(data.session_status);
      } catch {}
    },
    [sessionId, status]
  );

  useProctoring({ active: status === "active", onViolation });

  const loadAvailableExams = useCallback(async () => {
    setExamsLoading(true);
    try {
      const { data } = await api.get("/exam/available", { headers: { Authorization: `Bearer ${token}` } });
      setAvailableExams(data);
      if (data.length && !selectedExamCode) setSelectedExamCode(data[0].exam_code);
    } catch {
      setAvailableExams([]);
    } finally { setExamsLoading(false); }
  }, [selectedExamCode, token]);

  const loadExamQuestions = useCallback(async (examCode) => {
    if (!examCode) return;
    setQuestionsLoading(true);
    try {
      const { data } = await api.get(`/exam/${encodeURIComponent(examCode)}/questions`, { headers: { Authorization: `Bearer ${token}` } });
      setExamQuestions(data);
    } catch { setExamQuestions([]); } finally { setQuestionsLoading(false); }
  }, [token]);

  const loadSavedAnswers = useCallback(async (currentSessionId) => {
    if (!currentSessionId) return;
    try {
      const { data } = await api.get(`/exam/answers/${currentSessionId}`, { headers: { Authorization: `Bearer ${token}` } });
      setSelectedAnswers(data.answers || {});
    } catch { setSelectedAnswers({}); }
  }, [token]);

  const saveAnswer = async (questionId, optionIndex, qIndex) => {
    if (!sessionId || status !== "active") return;
    const selectedOption = String.fromCharCode(65 + optionIndex);
    setSelectedAnswers((prev) => ({ ...prev, [questionId]: selectedOption }));
    setSavingQuestionId(questionId);
    try {
      await api.post("/exam/answer", { session_id: sessionId, question_id: questionId, selected_option: selectedOption }, { headers: { Authorization: `Bearer ${token}` } });
      if (qIndex < examQuestions.length - 1) setCurrentQuestionIndex(qIndex + 1);
    } catch {
      setError("Unable to save answer.");
    } finally { setSavingQuestionId(null); }
  };

  const startExam = async () => {
    setError("");
    hasAutoSubmittedRef.current = false;
    try {
      if (!selectedExamCode || !verificationCode || !verificationLiveImage) {
        setError("Incomplete verification credentials.");
        return;
      }
      const remoteAccessValidation = await validateDirectAccess();
      if (!remoteAccessValidation.isAllowed) { setError(remoteAccessValidation.reason); return; }
      verificationStreamRef.current?.getTracks().forEach((track) => track.stop());
      try { await document.documentElement.requestFullscreen(); } catch {}
      let mediaStream = null;
      try { mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true }); } catch {
        try { mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false }); } catch { mediaStream = null; }
      }
      if (!mediaStream) { setError("Media capture hardware not detected."); return; }
      streamRef.current = mediaStream;
      const { data } = await api.post("/exam/start", {
          exam_code: selectedExamCode.trim(),
          verification_code: verificationCode.trim(),
          live_image_base64: verificationLiveImage,
          device_fingerprint: deviceFingerprintRef.current?.hash || "unknown",
        }, { headers: { Authorization: `Bearer ${token}` } });
      setSessionId(data.session_id);
      setStatus(data.status);
      setConsented(true);
      localStorage.setItem("proctor_active_session", String(data.session_id));
      await loadExamQuestions(selectedExamCode.trim());
      await loadSavedAnswers(data.session_id);
    } catch (err) { setError(err?.response?.data?.detail || "System initialization failure."); }
  };

  const submitExam = useCallback(async () => {
    if (!sessionId) return;
    try {
      const { data } = await api.post(`/exam/submit/${sessionId}`, {}, { headers: { Authorization: `Bearer ${token}` } });
      setStatus(data.status);
      localStorage.removeItem("proctor_active_session");
      if (document.fullscreenElement) await document.exitFullscreen();
      if (onSubmitted) onSubmitted(data);
    } catch { setError("Submission failed."); }
  }, [sessionId, token, onSubmitted]);

  useEffect(() => {
    if (status !== "active") return;
    enforceKeyboardRestrictions(onViolation);
    monitorBrowserActivity(onViolation);
    monitorPointerBehavior(onViolation);
    monitorKeyboardBehavior(onViolation);
  }, [status, onViolation]);

  useEffect(() => {
    if (tabSwitched && !hasAutoSubmittedRef.current) {
      hasAutoSubmittedRef.current = true;
      submitExam();
    }
  }, [tabSwitched, submitExam]);

  useEffect(() => {
    if (status === "active") {
      const timer = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) { clearInterval(timer); submitExam(); return 0; }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [status, submitExam]);

  useEffect(() => {
    if (status === "active" && sessionId) {
      const interval = setInterval(async () => {
        if (!videoRef.current || !canvasRef.current) return;
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video.videoWidth) return;
        const ctx = canvas.getContext("2d");
        canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);
        try {
          const { data } = await api.post("/exam/frame", { session_id: sessionId, image_base64: canvas.toDataURL("image/jpeg", 0.7) }, { headers: { Authorization: `Bearer ${token}` } });
          setRiskScore(data.total_risk);
          if (data.critical_violation_detected) { hasAutoSubmittedRef.current = true; submitExam(); }
        } catch {}
      }, 10000);
      return () => clearInterval(interval);
    }
  }, [status, sessionId, token, submitExam]);

  useEffect(() => {
    if (status === "active" && consented && streamRef.current && videoRef.current) {
      attachLiveVideoStream(streamRef.current);
    }
  }, [status, consented]);

  useEffect(() => {
    if (status === "malpractice") {
      setMalpracticeRedirectSeconds(5);
      const timer = setInterval(() => setMalpracticeRedirectSeconds(p => p > 0 ? p - 1 : 0), 1000);
      setTimeout(() => onBackToDashboard?.(), 5000);
      return () => clearInterval(timer);
    }
  }, [status, onBackToDashboard]);

  useEffect(() => {
    loadAvailableExams();
  }, [loadAvailableExams]);

  const currentQuestionData = examQuestions[currentQuestionIndex];

  if (status === "malpractice") {
    return (
      <div className="shell">
        <section className="card" style={{ maxWidth: "600px", textAlign: "center", border: "1px solid var(--danger)", background: "rgba(239, 68, 68, 0.05)" }}>
          <div style={{ fontSize: "4rem", marginBottom: "24px" }}>⚠️</div>
          <h1 style={{ color: "var(--danger)" }}>INTEGRITY VIOLATION</h1>
          <p>Autonomous surveillance detected a critical protocol breach.</p>
          <div style={{ background: "rgba(239, 68, 68, 0.2)", padding: "20px", borderRadius: "16px", marginTop: "32px" }}>
            <p style={{ fontWeight: 700, color: "var(--danger)" }}>SESSION TERMINATED</p>
            <p>Redirecting in {malpracticeRedirectSeconds}s...</p>
          </div>
        </section>
      </div>
    );
  }

  if (!consented) {
    return (
      <div className="shell">
        <section className="card" style={{ maxWidth: "800px" }}>
          <header style={{ textAlign: "center", marginBottom: "48px" }}>
             <h1 style={{ fontSize: "2.5rem" }}>System Readiness</h1>
             <p>Enterprise Assessment Node Initialization</p>
          </header>
          <div className="monitor-grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "48px" }}>
            <div className="checklist">
               <h3 style={{ color: "var(--primary)" }}>● Integrity Checklist</h3>
               <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "20px" }}>
                  <div style={{ background: "rgba(255,255,255,0.03)", padding: "16px", borderRadius: "16px", border: "1px solid var(--border)" }}>
                    <strong>Biometric Sensor</strong>: {cameraReady ? "READY" : "OFFLINE"}
                  </div>
                  <div style={{ background: "rgba(255,255,255,0.03)", padding: "16px", borderRadius: "16px", border: "1px solid var(--border)" }}>
                    <strong>Audio Feed</strong>: {micReady ? "READY" : "OFFLINE"}
                  </div>
               </div>
               <button className="secondary" style={{ width: "100%", marginTop: "24px" }} onClick={loadAvailableExams}>Sync Exam List</button>
               <select 
                 value={selectedExamCode} 
                 onChange={e => setSelectedExamCode(e.target.value)}
                 style={{ width: "100%", marginTop: "12px", background: "rgba(0,0,0,0.3)", border: "1px solid var(--border)", color: "#fff", padding: "12px", borderRadius: "12px" }}
               >
                 <option value="">Select Exam</option>
                 {availableExams.map(ex => <option key={ex.exam_code} value={ex.exam_code}>{ex.title}</option>)}
               </select>
            </div>
            <div className="scanner">
               <h3>Identity Verification</h3>
               <div style={{ width: "100%", aspectRatio: "4/3", background: "#000", borderRadius: "20px", overflow: "hidden", border: "1px solid var(--border)", position: "relative" }}>
                  <video ref={verificationVideoRef} autoPlay muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  <div style={{ position: "absolute", bottom: "12px", left: "12px", right: "12px", display: "flex", gap: "8px" }}>
                    <button className="secondary" style={{ flex: 1, padding: "8px", fontSize: "0.8rem" }} onClick={startVerificationCamera}>Start Sensor</button>
                    <button className="primary" style={{ flex: 1, padding: "8px", fontSize: "0.8rem" }} onClick={captureVerificationImage}>Verify</button>
                  </div>
               </div>
               <input 
                 value={verificationCode} 
                 onChange={e => setVerificationCode(e.target.value)} 
                 placeholder="SECRET ACCESS KEY" 
                 style={{ width: "100%", marginTop: "20px", textAlign: "center", letterSpacing: "2px", fontWeight: 700 }}
               />
            </div>
          </div>
          <div style={{ marginTop: "40px", display: "flex", gap: "16px" }}>
            <button className="secondary" onClick={onBackToDashboard} style={{ flex: 1 }}>Abort</button>
            <button className="primary" onClick={startExam} style={{ flex: 1 }} disabled={!verificationLiveImage || !selectedExamCode || !verificationCode}>Initialize Session</button>
          </div>
          {error && <div style={{ color: "var(--danger)", marginTop: "20px", textAlign: "center" }}>{error}</div>}
        </section>
      </div>
    );
  }

  return (
    <div className="shell" style={{ alignItems: "flex-start", padding: "20px" }}>
      <main className="card" style={{ maxWidth: "1600px", padding: 0, overflow: "hidden", background: "transparent", border: "none" }}>
        <header className="app-topbar" style={{ background: "var(--card)", padding: "20px 40px", borderRadius: "24px", border: "1px solid var(--card-border)", marginBottom: "30px" }}>
          <div>
            <strong style={{ fontSize: "1.2rem", letterSpacing: "1px", color: "var(--primary)" }}>PROCTOR360 GLOBAL</strong>
            <p style={{ margin: 0, fontSize: "0.85rem", opacity: 0.6 }}>Secure Terminal Node: {email}</p>
          </div>
          <div style={{ textAlign: "right" }}>
            <span style={{ fontSize: "0.75rem", textTransform: "uppercase", opacity: 0.6 }}>Time Remaining</span>
            <div style={{ fontSize: "2rem", fontWeight: 700, color: timeLeft < 300 ? "var(--danger)" : "#fff" }}>
              {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, "0")}
            </div>
          </div>
        </header>

        <div className="monitor-grid">
          <div className="questions">
            {questionsLoading ? <div className="question-panel"><div className="skeleton-line" /></div> : currentQuestionData ? (
              <div className="question-panel">
                <span className="badge badge-private">Unit {currentQuestionIndex + 1} of {examQuestions.length}</span>
                <h3 style={{ fontSize: "1.4rem", margin: "32px 0", lineHeight: "1.5" }}>{parseQuestionPrompt(currentQuestionData.prompt).text}</h3>
                <div className="option-list">
                  {currentQuestionData.options.map((opt, i) => (
                    <div key={i} className="option-item" onClick={() => saveAnswer(currentQuestionData.id, i, currentQuestionIndex)} style={{ background: selectedAnswers[currentQuestionData.id] === String.fromCharCode(65+i) ? "rgba(99,102,241,0.1)" : "" }}>
                      <div className="module-icon" style={{ background: selectedAnswers[currentQuestionData.id] === String.fromCharCode(65+i) ? "var(--primary)" : "" }}>{String.fromCharCode(65+i)}</div>
                      <span>{opt}</span>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: "40px", display: "flex", justifyContent: "space-between" }}>
                   <button className="secondary" disabled={currentQuestionIndex === 0} onClick={() => setCurrentQuestionIndex(p => p - 1)}>Previous</button>
                   <button className="primary" onClick={submitExam} style={{ background: "var(--danger)" }}>Finalize</button>
                   <button className="secondary" disabled={currentQuestionIndex === examQuestions.length - 1} onClick={() => setCurrentQuestionIndex(p => p + 1)}>Next</button>
                </div>
              </div>
            ) : <p>Unit load error.</p>}
          </div>
          <aside className="proctor">
            <div className="face-window">
               <video ref={videoRef} autoPlay muted playsInline style={{ width: "100%", borderRadius: "16px" }} />
               <canvas ref={canvasRef} style={{ display: "none" }} />
               <div style={{ marginTop: "20px" }}>
                 <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", marginBottom: "8px" }}>
                   <span>Integrity Risk</span>
                   <span>{riskScore.toFixed(1)}%</span>
                 </div>
                 <div style={{ height: "6px", background: "rgba(255,255,255,0.05)", borderRadius: "100px" }}>
                   <div style={{ height: "100%", background: riskScore > 50 ? "var(--danger)" : "var(--primary)", width: `${riskScore}%` }}></div>
                 </div>
               </div>
               <div style={{ marginTop: "20px", padding: "12px", background: "rgba(0,0,0,0.2)", borderRadius: "12px", fontSize: "0.85rem", border: "1px solid var(--border)" }}>
                 {riskScore > 30 ? "PROTOCOL BREACH WARNING" : "ENVIRONMENT SECURE"}
               </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

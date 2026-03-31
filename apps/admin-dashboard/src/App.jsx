import { useEffect, useMemo, useRef, useState } from "react";
import { api, createAdminSocket, getStoredAdminToken, isUsableAdminToken, setAdminToken } from "./services/api";
import MCQGenerator from "./components/MCQGenerator";

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

  if (name === "status") {
    return (
      <svg {...common}>
        <rect x="4" y="4" width="16" height="16" rx="3" />
        <path d="M8 15l2.5-3 2.5 2 3-4" />
      </svg>
    );
  }
  if (name === "exam") {
    return (
      <svg {...common}>
        <rect x="5" y="3" width="14" height="18" rx="2" />
        <path d="M8 8h8M8 12h8M8 16h5" />
      </svg>
    );
  }
  if (name === "rules") {
    return (
      <svg {...common}>
        <path d="M4 7h16M4 12h16M4 17h16" />
        <circle cx="8" cy="7" r="1.6" />
        <circle cx="14" cy="12" r="1.6" />
        <circle cx="10" cy="17" r="1.6" />
      </svg>
    );
  }
  if (name === "students") {
    return (
      <svg {...common}>
        <circle cx="9" cy="9" r="3" />
        <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
        <circle cx="17" cy="10" r="2" />
        <path d="M14.5 19a4 4 0 0 1 5.5-3.7" />
      </svg>
    );
  }
  if (name === "logout") {
    return (
      <svg {...common}>
        <path d="M10 17l-5-5 5-5" />
        <path d="M5 12h10" />
        <path d="M14 4h5v16h-5" />
      </svg>
    );
  }
  if (name === "menu") {
    return (
      <svg {...common}>
        <path d="M4 7h16M4 12h16M4 17h16" />
      </svg>
    );
  }
  if (name === "warn") {
    return (
      <svg {...common}>
        <path d="M12 3l9 16H3z" />
        <path d="M12 9v4M12 17h.01" />
      </svg>
    );
  }
  if (name === "pause") {
    return (
      <svg {...common}>
        <path d="M9 6v12M15 6v12" />
      </svg>
    );
  }
  if (name === "terminate") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <path d="M8.5 8.5l7 7M15.5 8.5l-7 7" />
      </svg>
    );
  }
  if (name === "report") {
    return (
      <svg {...common}>
        <path d="M5 4h14v16H5z" />
        <path d="M8 9h8M8 13h8M8 17h5" />
      </svg>
    );
  }
  if (name === "spark") {
    return (
      <svg {...common}>
        <path d="M12 3l2.2 5.4L20 10l-5.8 1.6L12 17l-2.2-5.4L4 10l5.8-1.6z" />
      </svg>
    );
  }
  if (name === "upload") {
    return (
      <svg {...common}>
        <path d="M12 15V4" />
        <path d="M8 8l4-4 4 4" />
        <path d="M4 20h16" />
      </svg>
    );
  }
  if (name === "create") {
    return (
      <svg {...common}>
        <path d="M12 5v14M5 12h14" />
      </svg>
    );
  }
  if (name === "save") {
    return (
      <svg {...common}>
        <path d="M5 4h12l2 2v14H5z" />
        <path d="M8 4v6h8" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path d="M5 12h14" />
    </svg>
  );
}

export default function App() {
  const modules = [
    { id: "status", label: "Status", note: "Live sessions, alerts, and timeline", icon: "status" },
    { id: "students", label: "Students", note: "Registered student records", icon: "students" },
    { id: "ai-generation", label: "AI Generation", note: "Auto-generate MCQs with GroQ engine", icon: "spark" },
    { id: "batch-import", label: "Asset Import", note: "Import CSV/JSON and orchestrate exams", icon: "upload" },
    { id: "created-exams", label: "Created Exams", note: "Published exams and OTP records", icon: "report" },
    { id: "workflow-rules", label: "Workflow Rules", note: "Automated policy actions", icon: "rules" },
  ];

  const [activeModule, setActiveModule] = useState("status");
  const [adminEmail, setAdminEmail] = useState("admin@proctor360.com");
  const [adminPassword, setAdminPassword] = useState("Admin123!");
  const [adminMfaCode, setAdminMfaCode] = useState("123456");
  const [authToken, setAuthToken] = useState(() => getStoredAdminToken());
  const [authError, setAuthError] = useState("");
  const [sessions, setSessions] = useState([]);
  const [students, setStudents] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [exams, setExams] = useState([]);
  const [workflowRules, setWorkflowRules] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [uploadJson, setUploadJson] = useState(`[
  {
    "prompt": "What is 2 + 2?",
    "option_a": "3",
    "option_b": "4",
    "option_c": "5",
    "option_d": "6",
    "correct_option": "B",
    "topic": "math"
  }
]`);
  const [examCode, setExamCode] = useState("MATH-101");
  const [examTitle, setExamTitle] = useState("Math Midterm");
  const [examAudience, setExamAudience] = useState("public");
  const [studentEmails, setStudentEmails] = useState("");
  const [createdExam, setCreatedExam] = useState(null);
  const [proctorReport, setProctorReport] = useState(null);
  const [proctorReportLoading, setProctorReportLoading] = useState(false);
  const [adminError, setAdminError] = useState("");
  const [csvFile, setCsvFile] = useState(null);
  const [ruleName, setRuleName] = useState("Auto terminate high risk");
  const [ruleMetric, setRuleMetric] = useState("risk_score");
  const [ruleThreshold, setRuleThreshold] = useState("70");
  const [ruleAction, setRuleAction] = useState("terminate");
  const selectedSessionRef = useRef(selectedSession);
  const postCreateClearTimerRef = useRef(null);
  const sessionsPollRef = useRef(null);
  const consecutiveSessionFetchFailuresRef = useRef(0);

  const onSelectModule = (moduleId) => {
    setActiveModule(moduleId);
  };

  const loginAdmin = async (event) => {
    event.preventDefault();
    setAuthError("");
    try {
      const { data } = await api.post("/auth/admin/login", {
        email: adminEmail.trim().toLowerCase(),
        password: adminPassword,
        mfa_code: adminMfaCode.trim(),
      });
      setAuthToken(data.access_token);
      setAdminToken(data.access_token);
    } catch (err) {
      setAuthError(err?.response?.data?.detail || "Admin login failed");
    }
  };

  const logoutAdmin = () => {
    setAuthToken("");
    setAdminToken("");
  };

  useEffect(() => {
    const onUnauthorized = () => {
      setAuthError("Session expired or invalid token. Please log in again.");
      logoutAdmin();
    };
    window.addEventListener("proctor-admin-unauthorized", onUnauthorized);
    return () => window.removeEventListener("proctor-admin-unauthorized", onUnauthorized);
  }, []);

  const loadSessions = async () => {
    try {
      const { data } = await api.get("/admin/sessions", { timeout: 7000 });
      consecutiveSessionFetchFailuresRef.current = 0;
      setSessions(data);
      if (!selectedSession && data.length) setSelectedSession(data[0].session_id);
      return data;
    } catch (err) {
      const status = err?.response?.status;
      if (status === 401) {
        // Let the interceptor/logout flow handle token reset; stop background polling immediately.
        if (sessionsPollRef.current) {
          clearInterval(sessionsPollRef.current);
          sessionsPollRef.current = null;
        }
        return [];
      }

      consecutiveSessionFetchFailuresRef.current += 1;
      if (consecutiveSessionFetchFailuresRef.current >= 3) {
        setAdminError("Unable to reach API server. Check backend status and login again.");
        if (sessionsPollRef.current) {
          clearInterval(sessionsPollRef.current);
          sessionsPollRef.current = null;
        }
      }
      return [];
    }
  };

  const loadQuestions = async () => {
    const { data } = await api.get("/admin/questions");
    setQuestions(data);
  };

  const loadStudents = async () => {
    const { data } = await api.get("/admin/students");
    setStudents(data);
  };

  const loadExams = async () => {
    const { data } = await api.get("/admin/exams");
    setExams(data);
  };

  const terminateExam = async (examCode) => {
    setAdminError("");
    try {
      await api.post(`/admin/exams/${encodeURIComponent(examCode)}/terminate`);
      await loadExams();
    } catch (err) {
      setAdminError(err?.response?.data?.detail || "Unable to terminate exam");
    }
  };

  const schedulePostCreateClear = () => {
    if (postCreateClearTimerRef.current) {
      clearTimeout(postCreateClearTimerRef.current);
    }
    postCreateClearTimerRef.current = setTimeout(() => {
      setQuestions([]);
      postCreateClearTimerRef.current = null;
    }, 10000);
  };

  const loadWorkflowRules = async () => {
    const { data } = await api.get("/enterprise/workflow/rules");
    setWorkflowRules(data);
  };

  const loadTimeline = async (sessionId) => {
    if (!sessionId) return;
    const { data } = await api.get(`/admin/violations/${sessionId}`);
    setTimeline(data);
  };

  const act = async (sessionId, action) => {
    await api.post(`/admin/action/${sessionId}/${action}`);
    await loadSessions();
    await loadTimeline(sessionId);
  };

  const uploadQuestions = async () => {
    setAdminError("");
    try {
      const parsed = JSON.parse(uploadJson);
      const payload = Array.isArray(parsed) ? { questions: parsed } : { questions: [] };
      await api.post("/admin/questions/bulk", payload);
      await loadQuestions();
    } catch (err) {
      setAdminError(err?.response?.data?.detail || "Invalid JSON or upload failed");
    }
  };

  const uploadQuestionsCsv = async () => {
    setAdminError("");
    if (!csvFile) {
      setAdminError("Select a CSV file before upload");
      return;
    }

    try {
      const formData = new FormData();
      formData.append("file", csvFile);
      await api.post("/admin/questions/upload-csv", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      await loadQuestions();
      setCsvFile(null);
    } catch (err) {
      setAdminError(err?.response?.data?.detail || "CSV upload failed");
    }
  };

  const createExam = async () => {
    setAdminError("");
    try {
      const emails = studentEmails
        .split(/[\n,]/)
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);

      if (examAudience === "private" && emails.length === 0) {
        setAdminError("Add at least one student email for a private exam, or switch to Public exam.");
        return;
      }

      const questionIds = questions.map((q) => q.id);
      if (!questionIds.length) {
        setAdminError("Upload or generate questions before creating an exam.");
        return;
      }

      const payload = {
        code: examCode,
        title: examTitle,
        question_ids: questionIds,
        student_emails: examAudience === "public" ? [] : emails,
      };
      const { data } = await api.post("/admin/exams", payload);
      setCreatedExam(data);
      await Promise.all([loadExams(), loadQuestions()]);
      schedulePostCreateClear();
    } catch (err) {
      setAdminError(err?.response?.data?.detail || "Exam creation failed");
    }
  };

  const createWorkflowRule = async () => {
    setAdminError("");
    try {
      await api.post("/enterprise/workflow/rules", {
        name: ruleName,
        metric: ruleMetric,
        threshold: Number(ruleThreshold),
        action: ruleAction,
      });
      await loadWorkflowRules();
    } catch (err) {
      setAdminError(err?.response?.data?.detail || "Workflow rule creation failed");
    }
  };

  const handleAiExamPublished = async () => {
    await Promise.all([loadQuestions(), loadExams()]);
  };

  useEffect(() => {
    return () => {
      if (postCreateClearTimerRef.current) {
        clearTimeout(postCreateClearTimerRef.current);
      }
    };
  }, []);

  const loadProctorReport = async (sessionId) => {
    if (!sessionId) return;
    setAdminError("");
    setProctorReportLoading(true);
    try {
      const { data } = await api.get(`/admin/proctor-report/${sessionId}`);
      setProctorReport(data);
    } catch (err) {
      setAdminError(err?.response?.data?.detail || "Unable to load proctor report");
      setProctorReport(null);
    } finally {
      setProctorReportLoading(false);
    }
  };

  useEffect(() => {
    if (!authToken) return;

    if (!isUsableAdminToken(authToken)) {
      setAuthError("Session expired or invalid token. Please log in again.");
      logoutAdmin();
      return;
    }

    setAdminToken(authToken);
    setAdminError("");
    consecutiveSessionFetchFailuresRef.current = 0;
    Promise.all([loadSessions(), loadStudents(), loadQuestions(), loadExams(), loadWorkflowRules()]).catch(() => { });
    sessionsPollRef.current = setInterval(() => {
      loadSessions().catch(() => { });
    }, 8000);
    return () => {
      if (sessionsPollRef.current) {
        clearInterval(sessionsPollRef.current);
        sessionsPollRef.current = null;
      }
    };
  }, [authToken]);

  useEffect(() => {
    loadTimeline(selectedSession).catch(() => { });
    setProctorReport(null);
  }, [selectedSession]);

  useEffect(() => {
    selectedSessionRef.current = selectedSession;
  }, [selectedSession]);

  useEffect(() => {
    if (!authToken) return;
    if (!isUsableAdminToken(authToken)) return;

    let closeAfterOpen = false;
    const ws = createAdminSocket(authToken);
    ws.onopen = () => {
      if (closeAfterOpen) {
        ws.close();
        return;
      }
      ws.send("listen");
    };
    ws.onmessage = (event) => {
      const payload = JSON.parse(event.data);
      setAlerts((prev) => [payload, ...prev].slice(0, 50));
      if (authToken) {
        loadSessions().catch(() => { });
      }
      if (payload.session_id === selectedSessionRef.current) {
        loadTimeline(selectedSessionRef.current).catch(() => { });
      }
    };
    return () => {
      if (ws.readyState === WebSocket.CONNECTING) {
        closeAfterOpen = true;
        return;
      }
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [authToken]);

  const riskStats = useMemo(() => {
    const total = sessions.length || 1;
    const high = sessions.filter((s) => s.risk_score >= 80).length;
    const medium = sessions.filter((s) => s.risk_score >= 40 && s.risk_score < 80).length;
    return {
      highPct: Math.round((high / total) * 100),
      mediumPct: Math.round((medium / total) * 100),
    };
  }, [sessions]);

  const dashboardStats = useMemo(() => {
    const activeSessions = sessions.filter((s) => s.status === "active" || s.status === "paused").length;
    return {
      totalSessions: sessions.length,
      activeSessions,
      totalExams: exams.length,
      totalQuestions: questions.length,
      totalRules: workflowRules.length,
      alertsInFeed: alerts.length,
    };
  }, [sessions, exams, questions, workflowRules, alerts]);

  if (!authToken) {
    return (
      <div className="admin-split-shell">
        {/* ── Left Auth Panel ── */}
        <section className="admin-left-panel">
          <div className="admin-form-container">
            <header>
              <div style={{ marginBottom: "40px", display: "flex", alignItems: "center", gap: "10px" }}>
                 <div style={{ width: "24px", height: "24px", background: "#000", borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <div style={{ width: "8px", height: "8px", background: "#fff", borderRadius: "50%" }}></div>
                 </div>
                 <span style={{ fontWeight: 800, fontSize: "0.85rem", letterSpacing: "2px" }}>INFRASTRUCTURE CONTROL</span>
              </div>
              <h1>System Access</h1>
              <p className="welcome-sub">Authorize with your corporate credentials to manage the proctoring infrastructure.</p>
            </header>
            
            <form onSubmit={loginAdmin} style={{ display: "flex", flexDirection: "column" }}>
              <div className="field-group">
                <label>Corporate Identifier</label>
                <input type="email" value={adminEmail} onChange={(event) => setAdminEmail(event.target.value)} required placeholder="it-admin@neuraltrix.io" />
              </div>
              <div className="field-group">
                <label>Security Key</label>
                <input type="password" value={adminPassword} onChange={(event) => setAdminPassword(event.target.value)} required placeholder="••••••••••••" />
              </div>
              <div className="field-group">
                <label>Node Access Token (MFA)</label>
                <input type="text" value={adminMfaCode} onChange={(event) => setAdminMfaCode(event.target.value)} required placeholder="6-digit PIN" maxLength={6} style={{ textAlign: "center", letterSpacing: "8px", fontWeight: 700, fontSize: "1.2rem", background: "#f9fafb" }} />
              </div>
              
              <div style={{ marginTop: "24px" }}>
                <button type="submit" className="btn-black" style={{ padding: "20px" }}>
                  <span>Enter Command Center</span>
                </button>
                <button type="button" className="btn-white" onClick={() => window.location.reload()} style={{ padding: "16px" }}>Cancel</button>
              </div>
            </form>
            
            {authError ? (
              <div style={{ marginTop: "24px", padding: "16px", background: "#fef2f2", color: "#b91c1c", borderRadius: "8px", fontSize: "0.85rem", textAlign: "center", fontWeight: 700, border: "1px solid #fee2e2" }}>
                {authError.toUpperCase()}
              </div>
            ) : null}

            <footer className="admin-footer-text">
              © PROCTOR360 GLOBAL • CORPORATE INFRASTRUCTURE 2024
            </footer>
          </div>
        </section>

        {/* ── Right Cinematic Visual ── */}
        <section className="admin-right-panel">
          <div className="infra-container-glass">
             <img src="/proctoring_map.png" className="infra-image-glass" alt="Proctoring Ecosystem" />
          </div>
        </section>
      </div>
    );
  }

  const selectedSessionRow = sessions.find((session) => session.session_id === selectedSession);

  const renderModule = () => {
    if (activeModule === "status") {
      return (
        <section className="module-grid">
          <article className="panel">
            <h2><UiIcon name="status" /> Session Queue</h2>
            <p className="panel-hint">Global monitoring of active and historical sessions.</p>
            <div className="table-container" style={{ marginTop: "24px" }}>
              <table>
                <thead>
                  <tr>
                    <th>Candidate</th>
                    <th>Region/Exam</th>
                    <th>Status</th>
                    <th>Risk Factor</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s) => {
                    const statusClass = `status-${s.status.toLowerCase()}`;
                    return (
                      <tr
                        key={s.session_id}
                        className={selectedSession === s.session_id ? "selected-row" : ""}
                        onClick={() => setSelectedSession(s.session_id)}
                      >
                        <td>
                          <div style={{ fontWeight: 600 }}>{s.student_email.split("@")[0]}</div>
                          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{s.student_email}</div>
                        </td>
                        <td>{s.exam_code}</td>
                        <td>
                          <span className={`chip ${statusClass}`}>{s.status}</span>
                        </td>
                        <td>
                          <div style={{ 
                            color: s.risk_score > 70 ? "var(--danger)" : s.risk_score > 30 ? "var(--warning)" : "var(--success)",
                            fontWeight: 700 
                          }}>
                            {s.risk_score.toFixed(1)}%
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </article>

          <article className="panel">
            <h2><UiIcon name="report" /> Intelligence Focus</h2>
            {selectedSessionRow ? (
              <div style={{ marginBottom: "32px" }}>
                <div className="session-focus">
                   <div style={{ background: "rgba(255,255,255,0.05)", padding: "16px", borderRadius: "16px", border: "1px solid var(--border)" }}>
                      <div style={{ color: "var(--text-muted)", fontSize: "0.75rem", textTransform: "uppercase", marginBottom: "4px" }}>Active Identifier</div>
                      <div style={{ fontSize: "1.1rem", fontWeight: 700 }}>{selectedSessionRow.student_email}</div>
                   </div>
                   <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginTop: "12px" }}>
                      <div style={{ background: "rgba(255,255,255,0.05)", padding: "12px", borderRadius: "12px" }}>
                        <div style={{ color: "var(--text-muted)", fontSize: "0.7rem" }}>EXAM CODE</div>
                        <strong>{selectedSessionRow.exam_code}</strong>
                      </div>
                      <div style={{ background: "rgba(255,255,255,0.05)", padding: "12px", borderRadius: "12px" }}>
                        <div style={{ color: "var(--text-muted)", fontSize: "0.7rem" }}>LIVE SCORE</div>
                        <strong>{selectedSessionRow.risk_score.toFixed(2)}</strong>
                      </div>
                   </div>
                </div>
                <div className="actions" style={{ marginTop: "24px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
                  <button className="btn-secondary" disabled={!selectedSession} onClick={() => act(selectedSession, "warn")}>
                    <UiIcon name="warn" /><span>Warning</span>
                  </button>
                  <button className="btn-secondary" disabled={!selectedSession} onClick={() => act(selectedSession, "pause")}>
                    <UiIcon name="pause" /><span>Hold</span>
                  </button>
                  <button className="btn-danger" disabled={!selectedSession} onClick={() => act(selectedSession, "terminate")}>
                    <UiIcon name="terminate" /><span>Stop</span>
                  </button>
                </div>
                <button 
                  className="btn-primary" 
                  style={{ marginTop: "12px", width: "100%", justifyContent: "center" }}
                  onClick={() => loadProctorReport(selectedSession)} 
                  disabled={!selectedSession || proctorReportLoading}
                >
                  <UiIcon name="report" />
                  <span>{proctorReportLoading ? "Processing Meta-Analysis..." : "Generate AI Incident Report"}</span>
                </button>
              </div>
            ) : (
              <div className="empty-state" style={{ margin: "40px 0" }}>
                <div className="brand-dot" style={{ margin: "0 auto 16px" }}></div>
                <p>Select a session to activate intelligence suite</p>
              </div>
            )}
            
            <h3 style={{ fontSize: "1rem", color: "var(--text-muted)", marginBottom: "16px" }}>Telemetry Data</h3>
            <div className="timeline">
              {timeline.map((v) => (
                <div key={v.id} className="timeline-item">
                  <span className="time">{new Date(v.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  <div className="event-info">
                    <strong>{v.event_type.replace(/_/g, " ").toUpperCase()}</strong>
                    <em>{v.detail}</em>
                  </div>
                  <span className="risk-delta">+{v.risk_delta}</span>
                </div>
              ))}
              {!timeline.length && <div style={{ textAlign: "center", padding: "20px", opacity: 0.5 }}>No recent events recorded</div>}
            </div>
          </article>

          <article className="panel" style={{ gridColumn: "span 2" }}>
            <h2><UiIcon name="spark" /> Live Global Stream</h2>
            <p className="panel-hint">Real-time heuristics and AI signal processing from all active clusters.</p>
            <div className="alerts" style={{ marginTop: "20px", display: "flex", flexDirection: "column", gap: "8px" }}>
              {alerts.map((a, index) => (
                <div key={index} style={{ background: "rgba(255,255,255,0.03)", padding: "12px 20px", borderRadius: "100px", border: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div style={{ width: "8px", height: "8px", background: a.risk_delta > 5 ? "var(--danger)" : "var(--primary)", borderRadius: "50%" }}></div>
                    <strong style={{ fontSize: "0.9rem" }}>{a.event_type.toUpperCase()}</strong>
                    <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>Node: {a.session_id.slice(0, 8)}</span>
                  </div>
                  <strong style={{ color: "var(--danger)", fontSize: "0.9rem" }}>+{a.risk_delta} RISK</strong>
                </div>
              ))}
              {!alerts.length && <div style={{ color: "var(--text-muted)", textAlign: "center", padding: "20px" }}>Awaiting signals from distributed nodes...</div>}
            </div>
          </article>

          {proctorReport ? (
            <article className="panel" style={{ gridColumn: "span 2", marginTop: "12px", border: "1px solid rgba(99, 102, 241, 0.4)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                <h2><UiIcon name="spark" /> Comprehensive Proctor Incident Analysis</h2>
                <span className="chip status-active" style={{ background: "rgba(99, 102, 241, 0.1)", color: "var(--primary)" }}>Generated by AI v4.2</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "40px" }}>
                <div>
                   <p className="panel-hint" style={{ marginBottom: "20px" }}>
                    Node Cluster: {proctorReport.session_id} | Identity: {proctorReport.student_email} | Peak Risk: {proctorReport.risk_score.toFixed(1)}%
                  </p>
                  <p style={{ lineHeight: "1.6", color: "var(--text-main)" }}>{proctorReport.recommendation}</p>
                </div>
                <div className="alerts">
                  {proctorReport.incident_snips.length ? (
                    proctorReport.incident_snips.map((snip, index) => (
                      <div key={`${snip.timestamp}-${index}`} style={{ background: "rgba(0,0,0,0.2)", padding: "16px", borderRadius: "16px", border: "1px solid var(--border)", marginBottom: "8px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                          <strong style={{ color: "var(--primary)" }}>{snip.event_type}</strong>
                          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{new Date(snip.timestamp).toLocaleString()}</span>
                        </div>
                        <p style={{ margin: 0, fontSize: "0.85rem" }}>{snip.detail}</p>
                      </div>
                    ))
                  ) : (
                    <div style={{ textAlign: "center", padding: "40px", opacity: 0.5 }}>Zero high-confidence violations detected in current dataset.</div>
                  )}
                </div>
              </div>
            </article>
          ) : null}
        </section>
      );
    }

    if (activeModule === "ai-generation") {
      return (
        <section className="module-grid one-column">
          <MCQGenerator onExamPublished={handleAiExamPublished} />
        </section>
      );
    }

    if (activeModule === "batch-import") {
      return (
        <section className="module-grid one-column">
          <article className="panel">
            <h2><UiIcon name="upload" /> Content Management</h2>
            <p className="panel-hint">Ingest assessment datasets via Enterprise protocols (CSV/JSON).</p>
            <div className="form-grid" style={{ marginBottom: "24px" }}>
               <div className="field-group">
                  <label>Raw Question Dataset (JSON)</label>
                  <textarea
                    rows={6}
                    value={uploadJson}
                    onChange={(event) => setUploadJson(event.target.value)}
                    style={{ width: "100%", height: "200px" }}
                    placeholder="Paste assessment JSON dataset..."
                  />
               </div>
            </div>
            <div className="actions actions-wrap" style={{ gap: "16px" }}>
              <button className="btn-primary" onClick={uploadQuestions}><UiIcon name="upload" /><span>Sync JSON Hub</span></button>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", background: "rgba(0,0,0,0.03)", padding: "4px 16px", borderRadius: "12px", border: "1px solid var(--border)" }}>
                  <UiIcon name="exam" />
                  <input type="file" accept=".csv" onChange={(event) => setCsvFile(event.target.files?.[0] || null)} style={{ border: "none", background: "transparent", padding: 0 }} />
              </div>
              <button className="btn-secondary" onClick={uploadQuestionsCsv}><UiIcon name="upload" /><span>Upload CSV Payload</span></button>
            </div>
            
            <div style={{ borderTop: "1px solid var(--border)", marginTop: "40px", paddingTop: "40px" }}>
              <h2><UiIcon name="create" /> Exam Node Orchestration</h2>
              <div className="form-grid" style={{ marginTop: "24px" }}>
                <div className="field-group">
                  <label>Master Code (Identifier)</label>
                  <input value={examCode} onChange={(event) => setExamCode(event.target.value)} placeholder="e.g. CORE-AI-2024" />
                </div>
                <div className="field-group">
                  <label>Public Workspace Label (Title)</label>
                  <input value={examTitle} onChange={(event) => setExamTitle(event.target.value)} placeholder="e.g. Advanced Neural Architectures" />
                </div>
              </div>
              <div className="actions actions-wrap" style={{ marginTop: "24px", gap: "24px" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
                  <input
                    type="radio"
                    name="exam-audience"
                    value="private"
                    checked={examAudience === "private"}
                    onChange={(event) => setExamAudience(event.target.value)}
                    style={{ width: "20px", height: "20px" }}
                  />
                  <span>Private Restricted whitelisting</span>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
                  <input
                    type="radio"
                    name="exam-audience"
                    value="public"
                    checked={examAudience === "public"}
                    onChange={(event) => setExamAudience(event.target.value)}
                    style={{ width: "20px", height: "20px" }}
                  />
                  <span>Global Public Open Node</span>
                </label>
              </div>
              {examAudience === "private" ? (
                <textarea
                  rows={4}
                  value={studentEmails}
                  onChange={(event) => setStudentEmails(event.target.value)}
                  placeholder="Enter employee identifiers separated by commas..."
                  style={{ width: "100%", marginTop: "20px" }}
                />
              ) : null}
              <button className="btn-primary" style={{ marginTop: "32px", padding: "16px 32px" }} onClick={createExam}>
                <UiIcon name="create" />
                <span>Publish Infrastructure Node</span>
              </button>
            </div>

            {createdExam ? (
              <div className="otp-box" style={{ marginTop: "40px", background: "rgba(16, 185, 129, 0.1)", border: "1px solid var(--success)", padding: "24px", borderRadius: "20px" }}>
                <div style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: "8px", color: "var(--success)" }}>Deployment Successful.</div>
                <div style={{ display: "grid", gap: "12px", fontSize: "0.95rem" }}>
                  <span>Master Key: <strong style={{ fontSize: "1.5rem", letterSpacing: "2px" }}>{createdExam.verification_code}</strong></span>
                </div>
              </div>
            ) : null}
            {adminError ? <p style={{ color: "var(--danger)", marginTop: "20px" }}>{adminError}</p> : null}
          </article>
        </section>
      );
    }

    if (activeModule === "students") {
      return (
        <section className="module-grid one-column">
          <article className="panel">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "32px" }}>
              <h2><UiIcon name="students" /> Identity Registry</h2>
              <button className="btn-secondary" onClick={loadStudents}><UiIcon name="spark" /><span>Refresh Clusters</span></button>
            </div>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Account Identifier</th>
                    <th>Node (Device) Hash</th>
                    <th>Status</th>
                    <th>Identity Verified</th>
                    <th>Usage Metrics</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((student) => (
                    <tr key={student.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{student.email}</div>
                        <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>UID: {String(student.id).slice(0, 12)}...</div>
                      </td>
                      <td><code style={{ background: "rgba(255,255,255,0.05)", padding: "4px 8px", borderRadius: "4px", fontSize: "0.75rem" }}>{student.device_hash?.slice(0, 16)}...</code></td>
                      <td><span className={`chip ${student.is_active ? "status-active" : "status-terminated"}`}>{student.is_active ? "Verified" : "Banned"}</span></td>
                      <td>{student.has_registered_face ? <span style={{ color: "var(--success)" }}>● Biometric Found</span> : <span style={{ color: "var(--muted)" }}>No Biometric</span>}</td>
                      <td><strong>{student.session_count}</strong> Sessions</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!students.length ? <div className="empty-state" style={{ marginTop: "32px" }}>No identity records found in current global cluster.</div> : null}
          </article>
        </section>
      );
    }

    if (activeModule === "created-exams") {
      return (
        <section className="module-grid one-column">
          <article className="panel">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "32px" }}>
              <h2><UiIcon name="report" /> Published Infrastructure</h2>
              <button className="btn-secondary" onClick={loadExams}><UiIcon name="spark" /><span>Refresh Nodes</span></button>
            </div>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Exam Node</th>
                    <th>Master Key</th>
                    <th>Status</th>
                    <th>Payload</th>
                    <th>Assignment</th>
                    <th>Created At</th>
                    <th>Orchestration</th>
                  </tr>
                </thead>
                <tbody>
                  {exams.map((exam) => (
                    <tr key={exam.exam_code}>
                      <td>
                        <div style={{ fontWeight: 700 }}>{exam.exam_code}</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{exam.title}</div>
                      </td>
                      <td><code style={{ fontSize: "0.9rem", color: "var(--primary)", fontWeight: 700 }}>{exam.verification_code || "UNSET"}</code></td>
                      <td><span className={`chip ${exam.is_active ? "status-active" : "status-terminated"}`}>{exam.is_active ? "Online" : "Decommissioned"}</span></td>
                      <td>{exam.question_count} Units</td>
                      <td>{exam.is_public ? "Global" : `Whitelist (${exam.assigned_students})`}</td>
                      <td style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{exam.created_at ? new Date(exam.created_at).toLocaleDateString() : "-"}</td>
                      <td>
                        <button
                          className="btn-danger"
                          style={{ padding: "8px 12px", fontSize: "0.8rem" }}
                          onClick={() => terminateExam(exam.exam_code)}
                          disabled={!exam.is_active}
                        >
                          <UiIcon name="terminate" />
                          <span>Stop Node</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      );
    }

    if (activeModule === "workflow-rules") {
      return (
        <section className="module-grid one-column">
          <article className="panel">
            <h2><UiIcon name="rules" /> Autonomous Policy Engine</h2>
            <p className="panel-hint">Configure automated heuristics for real-time threat mitigation.</p>
            <div className="form-grid" style={{ marginTop: "32px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "16px" }}>
               <div className="field-group">
                 <label>Policy Name</label>
                 <input value={ruleName} onChange={(event) => setRuleName(event.target.value)} />
               </div>
               <div className="field-group">
                 <label>Risk Metric</label>
                 <select value={ruleMetric} onChange={(event) => setRuleMetric(event.target.value)}>
                    <option value="risk_score">Aggregate Risk</option>
                    <option value="no_face_duration">Face Obscurity</option>
                    <option value="multi_face_count">Identity Duplication</option>
                 </select>
               </div>
               <div className="field-group">
                 <label>Warning Threshold (%)</label>
                 <input type="number" value={ruleThreshold} onChange={(event) => setRuleThreshold(event.target.value)} />
               </div>
               <div className="field-group">
                 <label>Automation Action</label>
                 <select value={ruleAction} onChange={(event) => setRuleAction(event.target.value)}>
                    <option value="terminate">Immediate Termination</option>
                    <option value="warn">Broadcast Warning</option>
                    <option value="flag">Log for Audit</option>
                 </select>
               </div>
            </div>
            <button className="btn-primary" style={{ marginTop: "24px" }} onClick={createWorkflowRule}><UiIcon name="create" /><span>Deploy Policy</span></button>
            <h3 style={{ marginTop: "40px", marginBottom: "20px" }}>Active Global Policies</h3>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Rule Label</th>
                    <th>Monitor Metric</th>
                    <th>Critical Threshold</th>
                    <th>Triggered Action</th>
                  </tr>
                </thead>
                <tbody>
                  {workflowRules.map((rule, idx) => (
                    <tr key={idx}>
                      <td><strong>{rule.name}</strong></td>
                      <td><code style={{ fontSize: "0.8rem" }}>{rule.metric}</code></td>
                      <td><span style={{ color: "var(--danger)", fontWeight: 700 }}>{rule.threshold}%</span></td>
                      <td><span className="chip status-active" style={{ background: "rgba(239, 68, 68, 0.1)", color: "var(--danger)" }}>{rule.action.toUpperCase()}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      );
    }

    return <article className="panel">Module in development...</article>;
  };

  return (
    <main className="admin-shell">
      <nav className="module-rail">
        <header className="rail-header">
           <div className="brand-text">
              <div className="brand-dot"></div>
              <span>PROCTOR360<em style={{ fontStyle: "normal", opacity: 0.4, marginLeft: "4px" }}>Global</em></span>
           </div>
        </header>

        <div className="module-list">
          {modules.map((mod) => (
            <button
              key={mod.id}
              className={`module-item ${activeModule === mod.id ? "active" : ""}`}
              onClick={() => onSelectModule(mod.id)}
            >
              <UiIcon name={mod.icon} />
              <div className="module-info">
                <strong>{mod.label}</strong>
                <span>{mod.note}</span>
              </div>
            </button>
          ))}
        </div>

        <div className="logout-rail" style={{ padding: "16px", borderTop: "1px solid var(--border)" }}>
           <button onClick={logoutAdmin} style={{ width: "100%", justifyContent: "flex-start", opacity: 0.6 }}>
             <UiIcon name="logout" />
             <div className="module-info">
                <strong>Sign Out</strong>
             </div>
           </button>
        </div>
      </nav>

      <section className="workspace-area">
        <header className="workspace-header">
          <div className="workspace-title">
             <h2>{modules.find(m => m.id === activeModule)?.label || "Workspace"}</h2>
             <p>{modules.find(m => m.id === activeModule)?.note || "Global Operations Control"}</p>
          </div>
          <div className="stats">
            <div className="kpi-trend trend-up">
               <span style={{ fontSize: "0.75rem", border: "1px solid var(--success)", padding: "4px 8px", borderRadius: "100px" }}>● SYSTEM OPTIMAL</span>
            </div>
            <div className="user-chip">
              <div className="avatar">AD</div>
              <span>Chief Operations Officer</span>
            </div>
          </div>
        </header>

        <div className="kpi-strip">
          <div className="kpi-card">
            <span className="kpi-label">Active Global Nodes</span>
            <div className="kpi-value">{dashboardStats.activeSessions}</div>
            <div className="kpi-trend trend-up">
               <span>+12% in last 1hr</span>
            </div>
          </div>
          <div className="kpi-card">
            <span className="kpi-label">Critical Alerts (24h)</span>
            <div className="kpi-value">{dashboardStats.alertsInFeed}</div>
            <div className="kpi-trend trend-down">
               <span>High sensitivity mode active</span>
            </div>
          </div>
          <div className="kpi-card">
            <span className="kpi-label">Deployed Assets</span>
            <div className="kpi-value">{dashboardStats.totalExams}</div>
            <div className="kpi-trend">
               <span>0 decommissions pending</span>
            </div>
          </div>
          <div className="kpi-card">
            <span className="kpi-label">Identity Risk Avg</span>
            <div className="kpi-value">{riskStats.highPct}%</div>
            <div className="kpi-trend trend-up">
               <span>Standard deviation safe</span>
            </div>
          </div>
        </div>

        {renderModule()}
      </section>
    </main>
  );
}

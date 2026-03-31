import { useEffect, useMemo, useState } from "react";
import { api } from "../services/api";

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

  if (name === "refresh") {
    return (
      <svg {...common}>
        <path d="M21 12a9 9 0 1 1-2.6-6.4" />
        <path d="M21 4v6h-6" />
      </svg>
    );
  }
  if (name === "download") {
    return (
      <svg {...common}>
        <path d="M12 3v12" />
        <path d="M8 11l4 4 4-4" />
        <path d="M4 20h16" />
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
  if (name === "start") {
    return (
      <svg {...common}>
        <path d="M8 5l11 7-11 7z" />
      </svg>
    );
  }
  if (name === "overview") {
    return (
      <svg {...common}>
        <rect x="4" y="4" width="16" height="16" rx="3" />
        <path d="M8 15l2.5-3 2.5 2 3-4" />
      </svg>
    );
  }
  if (name === "available") {
    return (
      <svg {...common}>
        <path d="M5 5h14v14H5z" />
        <path d="M8 9h8M8 13h5" />
      </svg>
    );
  }
  if (name === "results") {
    return (
      <svg {...common}>
        <path d="M5 19h14" />
        <path d="M7 16V9" />
        <path d="M12 16V6" />
        <path d="M17 16v-4" />
      </svg>
    );
  }
  if (name === "ai") {
    return (
      <svg {...common}>
        <path d="M12 3l2.2 5.4L20 10l-5.8 1.6L12 17l-2.2-5.4L4 10l5.8-1.6z" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M5 12h14" />
    </svg>
  );
}

export default function StudentDashboardPage({ token, email, onTakeExam, onLogout, latestReport }) {
  const modules = [
    { id: "overview", label: "Overview", note: "Summary and quick actions", icon: "overview" },
    { id: "available", label: "Available Exams", note: "Start assigned exams", icon: "available" },
    { id: "results", label: "Results", note: "Attempt history and scores", icon: "results" },
    { id: "ai-report", label: "AI Report", note: "Performance intelligence", icon: "ai" },
  ];

  const [activeModule, setActiveModule] = useState("overview");
  const [assignedExams, setAssignedExams] = useState([]);
  const [attemptedExams, setAttemptedExams] = useState([]);
  const [error, setError] = useState("");
  const [dashboardLoading, setDashboardLoading] = useState(true);

  const loadDashboard = async () => {
    setError("");
    setDashboardLoading(true);
    try {
      const { data } = await api.get("/exam/dashboard", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setAssignedExams(data.assigned_exams || []);
      setAttemptedExams(data.attempted_exams || []);
    } catch (err) {
      if (err?.response?.status === 401) {
        return;
      }
      setError(err?.response?.data?.detail || "Unable to load dashboard");
    } finally {
      setDashboardLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, [token]);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(""), 7000);
    return () => clearTimeout(timer);
  }, [error]);

  const summary = useMemo(
    () => ({
      assignedCount: assignedExams.length,
      attemptedCount: attemptedExams.length,
      completedCount: attemptedExams.filter((attempt) => attempt.status === "completed").length,
      avgScore:
        attemptedExams.length > 0
          ? Math.round(
              attemptedExams.reduce((acc, attempt) => acc + Number(attempt.score_percent || 0), 0) / attemptedExams.length
            )
          : 0,
    }),
    [assignedExams, attemptedExams]
  );

  const downloadMyData = async () => {
    setError("");
    try {
      const { data } = await api.get("/compliance/my-data", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "my-proctor-data.json";
      link.click();
      URL.revokeObjectURL(url);
      setError("");
    } catch (err) {
      setError(err?.response?.data?.detail || "Unable to export your data");
    }
  };

  const downloadReportPdf = async (sessionId, examCode) => {
    setError("");
    try {
      const response = await api.get(`/exam/report/${sessionId}/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: "blob",
      });

      const contentType = String(response.headers?.["content-type"] || "").toLowerCase();
      const dataBlob = response.data;

      if (!(dataBlob instanceof Blob) || !contentType.includes("application/pdf")) {
        let detail = "Unable to download report PDF";
        if (dataBlob instanceof Blob) {
          const text = await dataBlob.text();
          try {
            const parsed = JSON.parse(text);
            detail = parsed?.detail || detail;
          } catch {
            if (text) detail = text;
          }
        }
        throw new Error(detail);
      }

      const blob = new Blob([dataBlob], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `exam-report-${String(examCode || "session").toLowerCase()}-${sessionId}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setError("");
    } catch (err) {
      const responseBlob = err?.response?.data;
      if (responseBlob instanceof Blob) {
        try {
          const text = await responseBlob.text();
          const parsed = JSON.parse(text);
          setError(parsed?.detail || "Unable to download report PDF");
          return;
        } catch {
          // Fall through to generic handling.
        }
      }
      setError(err?.message || err?.response?.data?.detail || "Unable to download report PDF");
    }
  };

  const renderAiReport = () => {
    if (!latestReport) {
      return (
        <article className="question-panel">
          <h3>AI Performance Intelligence Report</h3>
          <div className="empty-state">
            <div className="empty-icon">AI</div>
            <p>No report generated yet. Complete an exam to view analytics.</p>
          </div>
        </article>
      );
    }

    return (
      <article className="question-panel report-panel section-gap">
        <h3>AI Performance Intelligence Report</h3>
        <div className="muted-row">Stage: {latestReport.stage}</div>
        <div className="muted-row">Integrity Status: {latestReport.integrity_band}</div>
        <div className="muted-row">Score: {latestReport.score_percent}%</div>
        <p>{latestReport.overall_summary}</p>

        <h4>Strength Areas</h4>
        <ul className="plain-list compact-list">
          {(latestReport.strengths || []).length ? (
            latestReport.strengths.map((item, index) => <li key={`strength-${index}`}>{item}</li>)
          ) : (
            <li>No strong topic signals yet. Continue consistent practice.</li>
          )}
        </ul>

        <h4>Upgrade Areas</h4>
        <ul className="plain-list compact-list">
          {(latestReport.improvement_areas || []).length ? (
            latestReport.improvement_areas.map((item, index) => <li key={`improve-${index}`}>{item}</li>)
          ) : (
            <li>Performance is balanced across evaluated topics.</li>
          )}
        </ul>

        <h4>Professional Recommendations</h4>
        <ul className="plain-list compact-list">
          {(latestReport.recommended_actions || []).map((item, index) => (
            <li key={`recommend-${index}`}>{item}</li>
          ))}
        </ul>

        <h4>Topic Breakdown</h4>
        <div className="topic-table-wrap">
          <table className="topic-table">
            <thead>
              <tr>
                <th>Topic</th>
                <th>Correct</th>
                <th>Incorrect</th>
                <th>Unanswered</th>
                <th>Mastery %</th>
              </tr>
            </thead>
            <tbody>
              {(latestReport.topic_breakdown || []).map((row) => (
                <tr key={row.topic}>
                  <td>{row.topic}</td>
                  <td>{row.correct}</td>
                  <td>{row.incorrect}</td>
                  <td>{row.unanswered}</td>
                  <td>{row.mastery_percent}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    );
  };

  const renderAvailableExams = () => (
    <article className="question-panel">
      <h3 className="panel-title">Available Infrastructure Nodes</h3>
      {dashboardLoading ? (
         <div style={{ opacity: 0.5, padding: "20px" }}>Synchronizing...</div>
      ) : assignedExams.length ? (
        <ul className="exam-list">
          {assignedExams.map((exam) => (
            <li key={exam.exam_code} className="exam-item-card">
              <div className="exam-meta">
                <h4>{exam.title}</h4>
                <p>Node ID: {exam.exam_code} | Questions: {exam.question_count}</p>
              </div>
              <button className="primary" onClick={() => onTakeExam(exam.exam_code)}>
                <span>Initialize Node</span>
                <UiIcon name="start" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="empty-state" style={{ textAlign: "center", padding: "40px" }}>
          <p style={{ color: "var(--text-muted)" }}>No assessments assigned to this cluster.</p>
        </div>
      )}
    </article>
  );

  const renderResults = () => (
    <article className="question-panel">
      <h3 className="panel-title">Audit Log & Performance</h3>
      {dashboardLoading ? (
        <div style={{ opacity: 0.5, padding: "20px" }}>Accessing secure records...</div>
      ) : attemptedExams.length ? (
        <ul className="results-list">
          {attemptedExams.map((attempt) => (
            <li key={attempt.session_id} className="result-item-card">
              <div className="exam-meta">
                <h4>{attempt.title}</h4>
                <p>Node: {attempt.exam_code} | {new Date(attempt.started_at).toLocaleDateString()}</p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
                <div style={{ textAlign: "right" }}>
                   <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "1px" }}>Success Rate</div>
                   <strong style={{ fontSize: "1.2rem", color: attempt.score_percent >= 50 ? "var(--success)" : "var(--danger)" }}>{attempt.score_percent}%</strong>
                </div>
                <button className="secondary" style={{ padding: "10px 16px" }} onClick={() => downloadReportPdf(attempt.session_id, attempt.exam_code)}>
                  <UiIcon name="download" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="empty-state" style={{ textAlign: "center", padding: "40px", opacity: 0.5 }}>
          <p>No historical telemetry available.</p>
        </div>
      )}
    </article>
  );

  const renderModule = () => {
    if (activeModule === "available") {
      return <section className="dashboard-grid one-column">{renderAvailableExams()}</section>;
    }

    if (activeModule === "results") {
      return <section className="dashboard-grid one-column">{renderResults()}</section>;
    }

    if (activeModule === "ai-report") {
      return <section className="dashboard-grid one-column">{renderAiReport()}</section>;
    }

    const summaryCards = [
      { label: "Assigned Nodes", val: summary.assignedCount },
      { label: "Total Attempts", val: summary.attemptedCount },
      { label: "Nodes Completed", val: summary.completedCount },
      { label: "Fleet Success", val: `${summary.avgScore}%` },
    ];

    return (
      <section className="dashboard-grid">
         <div className="kpi-strip">
            {summaryCards.map((card, i) => (
              <div key={i} className="kpi-card">
                <span>{card.label}</span>
                <strong>{card.val}</strong>
              </div>
            ))}
         </div>
        {renderAvailableExams()}
        {renderResults()}
      </section>
    );
  };

  return (
    <main className="student-dashboard-shell">
      <aside className="student-module-rail">
        <header className="rail-header">
           <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
              <div className="brand-dot"></div>
              <strong style={{ fontSize: "0.85rem", letterSpacing: "2px", fontWeight: 800 }}>PROCTOR360 GLOBAL</strong>
           </div>
           <p style={{ fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.05em", opacity: 0.5 }}>Candidate Workspace</p>
        </header>

        <nav className="module-list">
          {modules.map((module) => (
            <button
              key={module.id}
              type="button"
              className={activeModule === module.id ? "module-item active" : "module-item"}
              onClick={() => setActiveModule(module.id)}
            >
              <div className="module-icon"><UiIcon name={module.icon} /></div>
              <div className="module-info">
                <strong>{module.label}</strong>
                <span>{module.note}</span>
              </div>
            </button>
          ))}
        </nav>

        <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: "16px" }}>
           <button className="module-item" onClick={onLogout} style={{ width: "100%", opacity: 0.6 }}>
              <div className="module-icon"><UiIcon name="logout" /></div>
              <div className="module-info">
                <strong>Sign Out</strong>
              </div>
           </button>
        </div>
      </aside>

      <section className="student-workspace-area">
        <header className="app-topbar">
          <div>
            <h2>{modules.find((m) => m.id === activeModule)?.label || "Student Dashboard"}</h2>
            <p style={{ color: "var(--text-muted)", fontSize: "0.95rem" }}>Distributed Proctoring Endpoint: {email}</p>
          </div>
          <div className="topbar-user">
            <div className="avatar">{email[0].toUpperCase()}</div>
            <span>{email.split("@")[0]}</span>
          </div>
        </header>

        <div className="actions-row" style={{ marginBottom: "32px", display: "flex", gap: "12px" }}>
          <button className="secondary" onClick={loadDashboard}><UiIcon name="refresh" /><span>Sync Node</span></button>
          <button className="secondary" onClick={downloadMyData}><UiIcon name="download" /><span>Archival PDF</span></button>
        </div>

        {error ? <div style={{ background: "rgba(239, 68, 68, 0.1)", color: "var(--danger)", padding: "16px", borderRadius: "16px", border: "1px solid rgba(239, 68, 68, 0.2)", marginBottom: "24px" }}>{error}</div> : null}

        {renderModule()}
      </section>
    </main>
  );
}

import { useEffect, useState, useCallback } from "react";
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
    width: "18px",
    height: "18px",
    "aria-hidden": "true",
  };


  if (name === "refresh") return <svg {...common}><path d="M21 12a9 9 0 1 1-2.6-6.4" /><path d="M21 4v6h-6" /></svg>;
  if (name === "download") return <svg {...common}><path d="M12 3v12" /><path d="M8 11l4 4 4-4" /><path d="M4 20h16" /></svg>;
  if (name === "logout") return <svg {...common}><path d="M10 17l-5-5 5-5" /><path d="M11 12h5" /><path d="M14 4h5v16h-5" /></svg>;
  if (name === "start") return <svg {...common}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 12h6" /></svg>;
  if (name === "overview") return <svg {...common}><path d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z" /></svg>;
  if (name === "available") return <svg {...common}><rect x="3" y="11" width="18" height="10" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>;
  if (name === "results") return <svg {...common}><path d="M12 2v20M2 12h20" /></svg>;
  if (name === "vault") return <svg {...common}><path d="M3 7h18" /><path d="M6 7V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2" /><rect x="3" y="7" width="18" height="14" rx="2" /><path d="M9 12h6" /></svg>;
  if (name === "ai") return <svg {...common}><path d="M12 3l2.2 5.4L20 10l-5.8 1.6L12 17l-2.2-5.4L4 10l5.8-1.6z" /></svg>;
  return <svg {...common}><path d="M5 12h14" /></svg>;
}

export default function StudentDashboardPage({ token, email, onTakeExam, onLogout, latestReport: initialReport }) {
  const [activeModule, setActiveModule] = useState("overview");
  const [assignedExams, setAssignedExams] = useState([]);
  const [attemptedExams, setAttemptedExams] = useState([]);
  const [activeReport, setActiveReport] = useState(initialReport || null);
  const [storedReports, setStoredReports] = useState([]);
  const [reportLoading, setReportLoading] = useState(false);
  const [vaultLoading, setVaultLoading] = useState(false);
  const [error, setError] = useState("");
  const [dashboardLoading, setDashboardLoading] = useState(true);

  const modules = [
    { id: "overview", label: "Status", note: "Live telemetry and nodes", icon: "overview" },
    { id: "available", label: "Assessments", note: "Pending logic units", icon: "available" },
    { id: "results", label: "Audit Log", note: "Historical performance", icon: "results" },
    { id: "reports", label: "Reports Vault", note: "Stored exam intelligence reports", icon: "vault" },
    { id: "ai-report", label: "AI Analytics", note: "Neural behavioral insights", icon: "ai" }
  ];

  const loadStoredReports = useCallback(async () => {
    setVaultLoading(true);
    try {
      const { data } = await api.get("/exam/reports", { headers: { Authorization: `Bearer ${token}` } });
      setStoredReports(Array.isArray(data) ? data : []);
    } catch {
      setError("Reports vault sync failed.");
    } finally {
      setVaultLoading(false);
    }
  }, [token]);

  const loadDashboard = useCallback(async () => {
    setDashboardLoading(true);
    try {
      const { data } = await api.get("/exam/dashboard", { headers: { Authorization: `Bearer ${token}` } });
      setAssignedExams(data.assigned_exams || []);
      setAttemptedExams(data.attempted_exams || []);
    } catch { setError("Neural Synchronization Failure."); } finally { setDashboardLoading(false); }
  }, [token]);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);
  useEffect(() => { loadStoredReports(); }, [loadStoredReports]);

  useEffect(() => {
    if (initialReport) setActiveReport(initialReport);
    loadStoredReports();
  }, [initialReport, loadStoredReports]);

  const fetchSessionReport = async (sessionId) => {
    setReportLoading(true);
    setActiveModule("ai-report");
    try {
      const { data } = await api.get(`/exam/report/${sessionId}`, { headers: { Authorization: `Bearer ${token}` } });
      setActiveReport(data);
      await loadStoredReports();
    } catch { setError("Report signal lost."); } finally { setReportLoading(false); }
  };

  const exportReportPdf = (sessionId) => {
    if (!sessionId) {
      setError("PDF export is available only for reports linked to an exam session.");
      return;
    }
    window.open(`${api.defaults.baseURL}/exam/report/${sessionId}/pdf`, "_blank");
  };

  const exportReportJson = (entry) => {
    const fileName = `${(entry.exam_code || "report").toLowerCase()}-${entry.session_id || "local"}.json`;
    const blob = new Blob([JSON.stringify(entry.report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const removeStoredReport = async (sessionId) => {
    if (!sessionId) return;
    try {
      await api.delete(`/exam/reports/${sessionId}`, { headers: { Authorization: `Bearer ${token}` } });
      if (activeReport?.session_id === sessionId) {
        setActiveReport(null);
      }
      await loadStoredReports();
    } catch {
      setError("Failed to delete stored report.");
    }
  };

  const clearStoredReports = async () => {
    try {
      await api.delete("/exam/reports", { headers: { Authorization: `Bearer ${token}` } });
      setActiveReport(null);
      await loadStoredReports();
    } catch {
      setError("Failed to clear reports vault.");
    }
  };

  const renderModule = () => {
    if (activeModule === "ai-report") {
      return (
        <div className="intelligence-workspace" style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: "24px" }}>
           <div className="card fade-in" style={{ padding: "32px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "32px" }}>
                 <h1 style={{ fontSize: "1.8rem", margin: 0 }}>Behavioral Analytics</h1>
                 <button className="secondary" onClick={() => window.open(`${api.defaults.baseURL}/exam/report/${activeReport?.session_id}/pdf`, '_blank')}>Export PDF</button>
              </div>
              {!activeReport ? <p>Select an assessment from history to activate.</p> : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "32px" }}>
                    <div className="kpi-card" style={{ padding: "20px" }}><span>Neural Consistency</span><br/><strong style={{ fontSize: "1.8rem" }}>{activeReport.neural_consistency}%</strong></div>
                    <div className="kpi-card" style={{ padding: "20px" }}><span>Cognitive Lag (Avg)</span><br/><strong style={{ fontSize: "1.8rem" }}>{activeReport.average_lag}s</strong></div>
                  </div>
                  {activeReport.topic_breakdown.map(t => (
                    <div key={t.topic} style={{ marginBottom: "16px" }}>
                       <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}><strong>{t.topic}</strong><span>{t.mastery_percent}%</span></div>
                       <div style={{ height: "6px", background: "#f1f5f9", borderRadius: "100px" }}><div style={{ width: `${t.mastery_percent}%`, height: "100%", background: "var(--primary)", borderRadius: "100px" }} /></div>
                    </div>
                  ))}
                </>
              )}
           </div>
           <div className="card fade-in" style={{ padding: "32px" }}>
              <h4>AI Optimization Focus</h4>
              {activeReport ? (
                <div style={{ display: "grid", gap: "12px" }}>
                  {activeReport.recommended_actions.map((act, i) => <div key={i} style={{ display: "flex", gap: "10px", padding: "16px", background: "#f8fafc", borderRadius: "12px", border: "1px solid var(--border)", fontSize: "0.85rem" }}>◆ {act}</div>)}
                </div>
              ) : <p>Telemetry signal lost.</p>}
           </div>
        </div>
      );
    }
    if (activeModule === "available") {
      return (
        <div className="fade-in card" style={{ padding: "40px" }}>
           <h2 style={{ marginBottom: "8px" }}>Assessments Awaiting Initiation</h2>
           <p style={{ opacity: 0.5, marginBottom: "32px" }}>Select a unit to begin high-fidelity proctoring session.</p>
           <div style={{ display: "grid", gap: "16px" }}>
              {assignedExams.length === 0 ? <p>No active assessments assigned to your node.</p> : assignedExams.map(ex => (
                <div key={ex.exam_code} style={{ padding: "24px", background: "#f8fafc", border: "1px solid var(--border)", borderRadius: "20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                   <div>
                      <strong style={{ fontSize: "1.1rem" }}>{ex.title}</strong>
                      <div style={{ fontSize: "0.8rem", opacity: 0.5, marginTop: "4px" }}>CODE: {ex.exam_code} • {ex.question_count} Questions</div>
                   </div>
                   <button className="primary" onClick={() => onTakeExam(ex.exam_code)}>Initialize Session</button>
                </div>
              ))}
           </div>
        </div>
      );
    }

    if (activeModule === "results") {
      return (
        <div className="fade-in card" style={{ padding: "40px" }}>
           <h2 style={{ marginBottom: "8px" }}>Audit History Log</h2>
           <p style={{ opacity: 0.5, marginBottom: "32px" }}>Historical assessment data and risk analysis telemetry.</p>
           <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ textAlign: "left", opacity: 0.4, fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "1px" }}><th>Unit</th><th>Status</th><th style={{ textAlign: "right" }}>Risk/Score</th><th style={{ textAlign: "right" }}>Report</th></tr></thead>
              <tbody>
                 {attemptedExams.length === 0 ? <tr><td colSpan="4" style={{ padding: "40px", textAlign: "center", opacity: 0.5 }}>No audit history available.</td></tr> : attemptedExams.map(s => (
                   <tr key={s.session_id} style={{ borderBottom: "1px solid #f1f5f9", cursor: "pointer" }} onClick={() => fetchSessionReport(s.session_id)}>
                      <td style={{ padding: "20px 0" }}><strong>{s.title}</strong></td>
                      <td><span style={{ color: "var(--success)", fontWeight: 900 }}>SUBMITTED</span></td>
                      <td style={{ textAlign: "right" }}><strong>{s.score_percent}%</strong></td>
                      <td style={{ textAlign: "right" }}>
                        <button
                          className="secondary"
                          onClick={(event) => {
                            event.stopPropagation();
                            fetchSessionReport(s.session_id);
                          }}
                        >
                          Save to Vault
                        </button>
                      </td>
                   </tr>
                 ))}
              </tbody>
           </table>
        </div>
      );
    }

    if (activeModule === "reports") {
      return (
        <div className="fade-in card" style={{ padding: "40px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
            <div>
              <h2 style={{ marginBottom: "8px" }}>Reports Vault</h2>
              <p style={{ opacity: 0.6 }}>Stored intelligence reports generated after your exam sessions.</p>
            </div>
            <button className="secondary" onClick={clearStoredReports} disabled={!storedReports.length}>Clear Vault</button>
          </div>

          {!storedReports.length ? (
            <div style={{ padding: "32px", border: "1px dashed var(--border)", borderRadius: "16px", opacity: 0.7 }}>
              No stored reports yet. Open any completed exam report from Audit Log to save it here.
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", opacity: 0.45, fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "1px" }}>
                  <th style={{ padding: "10px 0" }}>Exam</th>
                  <th>Integrity</th>
                  <th>Score</th>
                  <th>Stored</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {storedReports.map((entry) => (
                  <tr key={entry.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "16px 0" }}>
                      <strong>{entry.exam_title}</strong>
                      <div style={{ fontSize: "0.75rem", opacity: 0.55 }}>{entry.exam_code}</div>
                    </td>
                    <td>{entry.integrity_band}</td>
                    <td>{entry.score_percent}%</td>
                    <td>{new Date(entry.stored_at).toLocaleString()}</td>
                    <td style={{ textAlign: "right", display: "flex", justifyContent: "flex-end", gap: "8px", padding: "12px 0" }}>
                      <button className="secondary" onClick={() => { setActiveReport(entry.report); setActiveModule("ai-report"); }}>View</button>
                      <button className="secondary" onClick={() => exportReportJson(entry)}>JSON</button>
                      <button className="secondary" onClick={() => exportReportPdf(entry.session_id)} disabled={!entry.session_id}>PDF</button>
                      <button className="secondary" onClick={() => removeStoredReport(entry.session_id)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {vaultLoading ? <div style={{ marginTop: "12px", opacity: 0.55 }}>Syncing reports vault...</div> : null}
        </div>
      );
    }

    // Default overview/status
    return (
      <div className="fade-in" style={{ display: "grid", gap: "40px" }}>
         <div className="kpi-strip" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "24px", marginBottom: "32px" }}>
            {[
               { label: "Assigned Nodes", val: assignedExams.length },
               { label: "Neural History", val: attemptedExams.length },
               { label: "Mean Accuracy", val: `${Math.round(attemptedExams.reduce((acc, a) => acc + a.score_percent, 0) / (attemptedExams.length || 1))}%` },
               { label: "System Status", val: "Optimal" }
            ].map((k, i) => (
              <div key={i} className="kpi-card" style={{ padding: "24px", borderLeft: "4px solid var(--primary)" }}>
                 <p style={{ margin: 0, opacity: 0.5, textTransform: "uppercase", fontSize: "0.75rem", fontWeight: 800 }}>{k.label}</p>
                 <strong style={{ fontSize: "2rem", display: "block", marginTop: "8px" }}>{k.val}</strong>
              </div>
            ))}
         </div>

         <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "24px" }}>
            <div className="card" style={{ padding: "32px" }}>
               <h3>Live Terminal Feed (Active Log)</h3>
               <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "24px" }}>
                  <thead><tr style={{ textAlign: "left", opacity: 0.4, fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "1px" }}><th>Unit</th><th>Status</th><th style={{ textAlign: "right" }}>Score</th></tr></thead>
                  <tbody>
                     {attemptedExams.slice(0, 5).map(s => (
                       <tr key={s.session_id} style={{ borderBottom: "1px solid #f1f5f9", cursor: "pointer" }} onClick={() => fetchSessionReport(s.session_id)}>
                          <td style={{ padding: "16px 0" }}><strong>{s.title}</strong></td>
                          <td><span style={{ color: "var(--success)", fontWeight: 900 }}>SUBMITTED</span></td>
                          <td style={{ textAlign: "right" }}>{s.score_percent}%</td>
                       </tr>
                     ))}
                  </tbody>
               </table>
            </div>
            <div className="card" style={{ padding: "32px" }}>
               <h3>Immediate Initiation</h3>
               <div style={{ display: "grid", gap: "10px", marginTop: "24px" }}>
                  {assignedExams.slice(0, 3).map(ex => (
                    <div key={ex.exam_code} style={{ padding: "20px", background: "#f8fafc", border: "1px solid var(--border)", borderRadius: "16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                       <div><strong>{ex.title}</strong><div style={{ fontSize: "0.75rem", opacity: 0.5 }}>{ex.exam_code}</div></div>
                       <button className="primary" onClick={() => onTakeExam(ex.exam_code)}>Start</button>
                    </div>
                  ))}
               </div>
            </div>
         </div>
      </div>
    );

  };

  return (
    <div className="student-dashboard-shell" style={{ display: "grid", gridTemplateColumns: "300px 1fr", minHeight: "100vh" }}>
      <aside className="student-module-rail" style={{ background: "#000", color: "#fff", padding: "40px 20px", display: "flex", flexDirection: "column", position: "sticky", top: 0, height: "100vh" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "40px", padding: "0 10px" }}>
           <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#fff", boxShadow: "0 0 8px #fff" }} />
           <strong style={{ letterSpacing: "1px" }}>PROCTOR360 GLOBAL</strong>
        </div>
        <nav style={{ display: "grid", gap: "8px" }}>
           {modules.map(mod => (
             <button key={mod.id} onClick={() => setActiveModule(mod.id)} style={{ display: "flex", gap: "16px", alignItems: "center", padding: "18px", borderRadius: "16px", border: "none", background: activeModule === mod.id ? "rgba(255,255,255,0.1)" : "transparent", color: "#fff", textAlign: "left", cursor: "pointer" }}>
                <div style={{ opacity: activeModule === mod.id ? 1 : 0.5 }}><UiIcon name={mod.icon} /></div>
                <div><div style={{ fontWeight: 800, fontSize: "0.9rem" }}>{mod.label}</div><div style={{ fontSize: "0.65rem", opacity: 0.4 }}>{mod.note}</div></div>
             </button>
           ))}
        </nav>
        <button className="module-item" onClick={onLogout} style={{ marginTop: "auto", background: "rgba(239, 68, 68, 0.1)", color: "#ef4444", border: "1px solid rgba(239, 68, 68, 0.2)", cursor: "pointer", fontWeight: 800, display: "flex", gap: "8px", alignItems: "center", padding: "12px 18px", borderRadius: "12px", fontSize: "0.8rem", width: "fit-content", alignSelf: "center" }}><UiIcon name="logout" /> Disconnect</button>


      </aside>
      <main style={{ padding: "60px", background: "#fbfcfd", overflowY: "auto" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "60px" }}>
           <div><h1 style={{ margin: 0, fontSize: "2.4rem", fontWeight: 900 }}>{modules.find(m => m.id === activeModule)?.label || "Dashboard"}</h1><p style={{ opacity: 0.5 }}>Distributed proctoring node: <strong>{email}</strong></p></div>

           <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
              <div style={{ border: "1.5px solid var(--success)", padding: "8px 16px", color: "var(--success)", borderRadius: "100px", fontSize: "0.75rem", fontWeight: 900 }}>◆ NODE ONLINE</div>
              <div style={{ background: "#fff", border: "1px solid var(--border)", padding: "10px 20px", borderRadius: "100px", display: "flex", alignItems: "center", gap: "12px" }}>
                 <div style={{ width: "32px", height: "32px", background: "#000", color: "#fff", borderRadius: "100px", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900 }}>{email[0].toUpperCase()}</div>
                 <div style={{ textAlign: "left" }}><div style={{ fontSize: "0.85rem", fontWeight: 800 }}>{email.split("@")[0]}</div><div style={{ fontSize: "0.65rem", opacity: 0.5 }}>Candidate Node</div></div>
              </div>
           </div>
        </header>
        {renderModule()}
      </main>
    </div>
  );
}

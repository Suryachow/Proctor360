import { useEffect, useMemo, useState } from "react";
import { api } from "../services/api";

const INTERVENTION_ACTIONS = ["warn", "lock_navigation", "force_reverify", "pause_timer"];

export default function InnovationWorkbench({ selectedSessionId }) {
  const [activeTab, setActiveTab] = useState("interventions");
  const [error, setError] = useState("");

  const [sessionId, setSessionId] = useState(selectedSessionId || "");
  const [interventionAction, setInterventionAction] = useState("warn");
  const [interventionMessage, setInterventionMessage] = useState("Please stay focused on your exam window.");
  const [interventions, setInterventions] = useState([]);
  const [chatMessage, setChatMessage] = useState("Please confirm you can hear the proctor.");
  const [chatRows, setChatRows] = useState([]);

  const [appealStatusFilter, setAppealStatusFilter] = useState("open");
  const [appeals, setAppeals] = useState([]);

  const [tenantSlug, setTenantSlug] = useState("default");
  const [brandName, setBrandName] = useState("Proctor360 Enterprise");
  const [primaryColor, setPrimaryColor] = useState("#0f172a");
  const [brandingResult, setBrandingResult] = useState(null);

  const [routeChannel, setRouteChannel] = useState("webhook");
  const [routeTarget, setRouteTarget] = useState("https://example.org/hook");
  const [routeSeverity, setRouteSeverity] = useState("medium");
  const [routes, setRoutes] = useState([]);
  const [dispatchCount, setDispatchCount] = useState(null);

  const [qualityRows, setQualityRows] = useState([]);
  const [qualityFlaggedOnly, setQualityFlaggedOnly] = useState(false);
  const [lastQualityUpdated, setLastQualityUpdated] = useState(null);

  const [cohortExamCode, setCohortExamCode] = useState("");
  const [cohortRows, setCohortRows] = useState([]);

  const [certificateStudentEmail, setCertificateStudentEmail] = useState("student@test.com");
  const [certificateSessionId, setCertificateSessionId] = useState("");
  const [certificateHash, setCertificateHash] = useState("");
  const [certificateRevokeReason, setCertificateRevokeReason] = useState("Administrative review");
  const [certificateIssueResult, setCertificateIssueResult] = useState(null);
  const [certificateVerifyResult, setCertificateVerifyResult] = useState(null);

  const [trustSessionId, setTrustSessionId] = useState(selectedSessionId || "");
  const [trustSignals, setTrustSignals] = useState({
    vpn: false,
    vm: false,
    remote_desktop: false,
    fingerprint_drift: false,
  });
  const [trustIngestResult, setTrustIngestResult] = useState(null);
  const [trustHistory, setTrustHistory] = useState([]);
  const [plagiarismThreshold, setPlagiarismThreshold] = useState("0.72");
  const [plagiarismRunResult, setPlagiarismRunResult] = useState(null);
  const [plagiarismAlerts, setPlagiarismAlerts] = useState([]);

  const [networkSessionId, setNetworkSessionId] = useState(selectedSessionId || "");
  const [latencyMs, setLatencyMs] = useState("1400");
  const [packetLossPercent, setPacketLossPercent] = useState("22");
  const [jitterMs, setJitterMs] = useState("60");
  const [offlineBufferCount, setOfflineBufferCount] = useState("2");
  const [heartbeatResult, setHeartbeatResult] = useState(null);
  const [adaptivePreviousCorrect, setAdaptivePreviousCorrect] = useState("true");
  const [adaptiveResult, setAdaptiveResult] = useState(null);

  const [evidenceSessionId, setEvidenceSessionId] = useState(selectedSessionId || "");
  const [evidenceSourceType, setEvidenceSourceType] = useState("manual");
  const [evidenceSourceId, setEvidenceSourceId] = useState("admin-ui-anchor");
  const [evidenceNote, setEvidenceNote] = useState("Anchored from Innovation Workbench");
  const [evidenceAnchorResult, setEvidenceAnchorResult] = useState(null);
  const [evidenceChainRows, setEvidenceChainRows] = useState([]);
  const [evidenceBundleStatus, setEvidenceBundleStatus] = useState("");

  useEffect(() => {
    setSessionId(selectedSessionId || "");
    setTrustSessionId(selectedSessionId || "");
    setNetworkSessionId(selectedSessionId || "");
    setEvidenceSessionId(selectedSessionId || "");
  }, [selectedSessionId]);

  const clearError = () => setError("");

  const parseApiError = (err, fallback) => err?.response?.data?.detail || fallback;

  const loadInterventions = async (targetSessionId) => {
    const sid = Number(targetSessionId || sessionId || 0);
    if (!sid) return;
    clearError();
    try {
      const { data } = await api.get(`/innovations/proctor/interventions/${sid}`);
      setInterventions(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(parseApiError(err, "Failed to load interventions"));
    }
  };

  const loadChatMessages = async (targetSessionId = sessionId) => {
    const sid = Number(targetSessionId || 0);
    if (!sid) return;
    clearError();
    try {
      const { data } = await api.get(`/innovations/proctor/chat/${sid}`);
      setChatRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(parseApiError(err, "Failed to load chat messages"));
    }
  };

  const sendAdminChatMessage = async () => {
    const sid = Number(sessionId || 0);
    if (!sid) {
      setError("Session ID is required for chat.");
      return;
    }
    const message = String(chatMessage || "").trim();
    if (!message) {
      setError("Chat message cannot be empty.");
      return;
    }
    clearError();
    try {
      await api.post("/innovations/proctor/chat/admin/send", {
        session_id: sid,
        message,
      });
      await loadChatMessages(sid);
    } catch (err) {
      setError(parseApiError(err, "Failed to send admin chat message"));
    }
  };

  const createIntervention = async () => {
    const sid = Number(sessionId || 0);
    if (!sid) {
      setError("Session ID is required for intervention.");
      return;
    }
    clearError();
    try {
      await api.post("/innovations/proctor/interventions", {
        session_id: sid,
        action_type: interventionAction,
        payload: {
          message: interventionMessage.trim(),
        },
      });
      await loadInterventions(sid);
    } catch (err) {
      setError(parseApiError(err, "Failed to issue intervention"));
    }
  };

  const loadAppeals = async (status = appealStatusFilter) => {
    clearError();
    try {
      const { data } = await api.get(`/innovations/appeals/admin?status=${encodeURIComponent(status)}`);
      setAppeals(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(parseApiError(err, "Failed to load appeals"));
    }
  };

  const decideAppeal = async (appealId, decision) => {
    clearError();
    try {
      await api.post(`/innovations/appeals/${appealId}/decision`, {
        decision,
        admin_notes: `Set via admin dashboard on ${new Date().toISOString()}`,
      });
      await loadAppeals();
    } catch (err) {
      setError(parseApiError(err, "Failed to update appeal"));
    }
  };

  const saveBranding = async () => {
    clearError();
    try {
      await api.post("/innovations/tenant/branding", {
        tenant_slug: tenantSlug,
        brand_name: brandName,
        primary_color: primaryColor,
      });
      const { data } = await api.get(`/innovations/tenant/branding/${encodeURIComponent(tenantSlug)}`);
      setBrandingResult(data);
    } catch (err) {
      setError(parseApiError(err, "Failed to save branding"));
    }
  };

  const loadRoutes = async () => {
    clearError();
    try {
      const { data } = await api.get("/innovations/notifications/routes");
      setRoutes(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(parseApiError(err, "Failed to load routes"));
    }
  };

  const createRoute = async () => {
    clearError();
    try {
      await api.post("/innovations/notifications/routes", {
        tenant_slug: tenantSlug,
        channel_type: routeChannel,
        target_url: routeTarget,
        severity_min: routeSeverity,
      });
      await loadRoutes();
    } catch (err) {
      setError(parseApiError(err, "Failed to create route"));
    }
  };

  const testDispatch = async () => {
    clearError();
    try {
      const { data } = await api.post("/innovations/notifications/dispatch-test", {
        event_type: "admin.dashboard.dispatch_test",
        payload: {
          tenant_slug: tenantSlug,
          generated_at: new Date().toISOString(),
        },
      });
      setDispatchCount(data?.dispatched ?? 0);
    } catch (err) {
      setError(parseApiError(err, "Failed to dispatch test notification"));
    }
  };

  const recomputeQuality = async () => {
    clearError();
    try {
      const { data } = await api.post("/innovations/quality/recompute");
      setLastQualityUpdated(data?.updated_questions ?? 0);
      await loadQuality(qualityFlaggedOnly);
    } catch (err) {
      setError(parseApiError(err, "Failed to recompute quality metrics"));
    }
  };

  const loadQuality = async (flaggedOnly = qualityFlaggedOnly) => {
    clearError();
    try {
      const { data } = await api.get(`/innovations/quality/questions?flagged_only=${flaggedOnly ? "true" : "false"}`);
      setQualityRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(parseApiError(err, "Failed to load quality metrics"));
    }
  };

  const loadCohort = async () => {
    clearError();
    const query = cohortExamCode.trim() ? `?exam_code=${encodeURIComponent(cohortExamCode.trim().toUpperCase())}` : "";
    try {
      const { data } = await api.get(`/innovations/analytics/cohort-risk${query}`);
      setCohortRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(parseApiError(err, "Failed to load cohort analytics"));
    }
  };

  const loadTrustHistory = async (targetSessionId = trustSessionId) => {
    const sid = Number(targetSessionId || 0);
    if (!sid) return;
    clearError();
    try {
      const { data } = await api.get(`/innovations/trust/${sid}`);
      setTrustHistory(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(parseApiError(err, "Failed to load trust history"));
    }
  };

  const ingestTrustSignals = async () => {
    const sid = Number(trustSessionId || 0);
    if (!sid) {
      setError("Session ID is required for trust ingestion.");
      return;
    }
    clearError();
    setTrustIngestResult(null);
    try {
      const { data } = await api.post("/innovations/trust/ingest", {
        session_id: sid,
        signals: trustSignals,
      });
      setTrustIngestResult(data || null);
      await loadTrustHistory(sid);
    } catch (err) {
      setError(parseApiError(err, "Failed to ingest trust signals"));
    }
  };

  const runPlagiarismScan = async () => {
    const thresholdValue = Number(plagiarismThreshold);
    if (!Number.isFinite(thresholdValue) || thresholdValue < 0 || thresholdValue > 1) {
      setError("Plagiarism threshold must be between 0 and 1.");
      return;
    }
    clearError();
    setPlagiarismRunResult(null);
    try {
      const { data } = await api.post("/innovations/plagiarism/run", { threshold: thresholdValue });
      setPlagiarismRunResult(data || null);
      await loadPlagiarismAlerts();
    } catch (err) {
      setError(parseApiError(err, "Failed to run plagiarism scan"));
    }
  };

  const loadPlagiarismAlerts = async () => {
    clearError();
    try {
      const { data } = await api.get("/innovations/plagiarism/alerts");
      setPlagiarismAlerts(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(parseApiError(err, "Failed to load plagiarism alerts"));
    }
  };

  const submitNetworkHeartbeat = async () => {
    const sid = Number(networkSessionId || 0);
    if (!sid) {
      setError("Session ID is required for heartbeat.");
      return;
    }
    clearError();
    setHeartbeatResult(null);
    try {
      const { data } = await api.post("/innovations/network/heartbeat", {
        session_id: sid,
        latency_ms: Number(latencyMs),
        packet_loss_percent: Number(packetLossPercent),
        jitter_ms: Number(jitterMs),
        offline_buffer_count: Number(offlineBufferCount),
      });
      setHeartbeatResult(data || null);
    } catch (err) {
      setError(parseApiError(err, "Failed to submit network heartbeat"));
    }
  };

  const requestAdaptiveQuestion = async () => {
    const sid = Number(networkSessionId || 0);
    if (!sid) {
      setError("Session ID is required for adaptive decision.");
      return;
    }
    clearError();
    setAdaptiveResult(null);
    try {
      const previous =
        adaptivePreviousCorrect === "true"
          ? true
          : adaptivePreviousCorrect === "false"
            ? false
            : null;
      const payload = { session_id: sid };
      if (previous !== null) {
        payload.previous_correct = previous;
      }
      const { data } = await api.post("/innovations/adaptive/next-question", payload);
      setAdaptiveResult(data || null);
    } catch (err) {
      setError(parseApiError(err, "Failed to get adaptive next question"));
    }
  };

  const anchorEvidence = async () => {
    const sid = Number(evidenceSessionId || 0);
    if (!sid) {
      setError("Session ID is required for evidence anchor.");
      return;
    }
    clearError();
    setEvidenceAnchorResult(null);
    try {
      const { data } = await api.post("/innovations/evidence/chain/anchor", {
        session_id: sid,
        source_type: evidenceSourceType,
        source_id: evidenceSourceId.trim() || "admin-ui-anchor",
        metadata: { note: evidenceNote.trim() || "Anchored from admin UI" },
      });
      setEvidenceAnchorResult(data || null);
      await loadEvidenceChain(sid);
    } catch (err) {
      setError(parseApiError(err, "Failed to anchor evidence"));
    }
  };

  const loadEvidenceChain = async (targetSessionId = evidenceSessionId) => {
    const sid = Number(targetSessionId || 0);
    if (!sid) return;
    clearError();
    try {
      const { data } = await api.get(`/innovations/evidence/chain/${sid}`);
      setEvidenceChainRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(parseApiError(err, "Failed to load evidence chain"));
    }
  };

  const downloadIncidentBundle = async () => {
    const sid = Number(evidenceSessionId || 0);
    if (!sid) {
      setError("Session ID is required for incident bundle download.");
      return;
    }
    clearError();
    setEvidenceBundleStatus("");
    try {
      const response = await api.get(`/innovations/evidence/incident-bundle/${sid}`, {
        responseType: "blob",
      });
      const blob = new Blob([response.data], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `incident-bundle-${sid}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setEvidenceBundleStatus("Bundle downloaded.");
    } catch (err) {
      setError(parseApiError(err, "Failed to download incident bundle"));
    }
  };

  const issueCertificate = async () => {
    clearError();
    setCertificateIssueResult(null);
    try {
      const payload = {
        student_email: certificateStudentEmail.trim().toLowerCase(),
      };
      if (String(certificateSessionId).trim()) {
        payload.session_id = Number(certificateSessionId);
      }
      const { data } = await api.post("/admin/certificates/issue", payload);
      setCertificateIssueResult(data || null);
      if (data?.verification_hash) {
        setCertificateHash(data.verification_hash);
      }
    } catch (err) {
      setError(parseApiError(err, "Failed to issue certificate"));
    }
  };

  const verifyCertificate = async () => {
    const hash = String(certificateHash || "").trim();
    if (!hash) {
      setError("Verification hash is required.");
      return;
    }
    clearError();
    setCertificateVerifyResult(null);
    try {
      const { data } = await api.get(`/innovations/certificates/verify/${encodeURIComponent(hash)}`);
      setCertificateVerifyResult(data || null);
    } catch (err) {
      setError(parseApiError(err, "Failed to verify certificate"));
    }
  };

  const revokeCertificate = async () => {
    const hash = String(certificateHash || "").trim();
    if (!hash) {
      setError("Verification hash is required.");
      return;
    }
    clearError();
    try {
      await api.post("/innovations/certificates/revoke", {
        verification_hash: hash,
        reason: certificateRevokeReason.trim() || "Administrative review",
      });
      await verifyCertificate();
    } catch (err) {
      setError(parseApiError(err, "Failed to revoke certificate"));
    }
  };

  useEffect(() => {
    if (activeTab === "appeals") {
      loadAppeals().catch(() => {});
    }
    if (activeTab === "notifications") {
      loadRoutes().catch(() => {});
    }
    if (activeTab === "quality") {
      loadQuality(false).catch(() => {});
    }
    if (activeTab === "cohort") {
      loadCohort().catch(() => {});
    }
    if (activeTab === "certificates" && certificateHash) {
      verifyCertificate().catch(() => {});
    }
    if (activeTab === "trust-plagiarism") {
      if (trustSessionId) {
        loadTrustHistory(trustSessionId).catch(() => {});
      }
      loadPlagiarismAlerts().catch(() => {});
    }
    if (activeTab === "evidence-chain" && evidenceSessionId) {
      loadEvidenceChain(evidenceSessionId).catch(() => {});
    }
    if (activeTab === "interventions" && sessionId) {
      loadInterventions(sessionId).catch(() => {});
      loadChatMessages(sessionId).catch(() => {});
    }
  }, [activeTab]);

  const tabs = useMemo(
    () => [
      { id: "interventions", label: "Interventions" },
      { id: "appeals", label: "Appeals" },
      { id: "notifications", label: "Notifications + Branding" },
      { id: "quality", label: "Question Quality" },
      { id: "cohort", label: "Cohort Risk" },
      { id: "certificates", label: "Certificates" },
      { id: "trust-plagiarism", label: "Trust + Plagiarism" },
      { id: "network-adaptive", label: "Network + Adaptive" },
      { id: "evidence-chain", label: "Evidence Chain" },
    ],
    []
  );

  return (
    <section className="module-grid one-column">
      <article className="panel">
        <h2>Innovation Workbench</h2>
        <p className="panel-hint">Operate newly deployed innovation endpoints from one control surface.</p>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginBottom: "20px" }}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`chip ${activeTab === tab.id ? "status-active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
              style={{ border: "1px solid var(--border)", cursor: "pointer", background: activeTab === tab.id ? undefined : "#fff" }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {error ? <div style={{ color: "var(--danger)", marginBottom: "14px" }}>{error}</div> : null}

        {activeTab === "interventions" ? (
          <div style={{ display: "grid", gap: "16px" }}>
            <div className="form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 2fr auto", gap: "12px", alignItems: "end" }}>
              <div className="field-group" style={{ marginBottom: 0 }}>
                <label>Session ID</label>
                <input value={sessionId} onChange={(e) => setSessionId(e.target.value)} placeholder="e.g. 1" />
              </div>
              <div className="field-group" style={{ marginBottom: 0 }}>
                <label>Action</label>
                <select value={interventionAction} onChange={(e) => setInterventionAction(e.target.value)}>
                  {INTERVENTION_ACTIONS.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field-group" style={{ marginBottom: 0 }}>
                <label>Message</label>
                <input value={interventionMessage} onChange={(e) => setInterventionMessage(e.target.value)} placeholder="Optional message to student" />
              </div>
              <button className="btn-primary" onClick={createIntervention}>Issue</button>
            </div>

            <div>
              <button className="btn-secondary" onClick={() => loadInterventions(sessionId)}>Refresh Interventions</button>
            </div>

            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Action</th>
                    <th>Status</th>
                    <th>Issued By</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {interventions.map((row) => (
                    <tr key={row.id}>
                      <td>{row.id}</td>
                      <td>{row.action_type}</td>
                      <td>{row.status}</td>
                      <td>{row.issued_by}</td>
                      <td>{new Date(row.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                  {interventions.length === 0 ? (
                    <tr>
                      <td colSpan="5" style={{ textAlign: "center", opacity: 0.6 }}>
                        No interventions loaded.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="form-grid" style={{ display: "grid", gridTemplateColumns: "3fr auto auto", gap: "12px", alignItems: "end", marginTop: "8px" }}>
              <div className="field-group" style={{ marginBottom: 0 }}>
                <label>Admin Chat Message</label>
                <input
                  value={chatMessage}
                  onChange={(e) => setChatMessage(e.target.value)}
                  placeholder="Type message to candidate"
                />
              </div>
              <button className="btn-primary" onClick={sendAdminChatMessage}>Send Chat</button>
              <button className="btn-secondary" onClick={() => loadChatMessages(sessionId)}>Refresh Chat</button>
            </div>

            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Role</th>
                    <th>Sender</th>
                    <th>Message</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {chatRows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.id}</td>
                      <td>{row.sender_role}</td>
                      <td>{row.sender_email}</td>
                      <td>{row.message}</td>
                      <td>{new Date(row.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                  {chatRows.length === 0 ? (
                    <tr>
                      <td colSpan="5" style={{ textAlign: "center", opacity: 0.6 }}>
                        No chat messages loaded.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {activeTab === "appeals" ? (
          <div style={{ display: "grid", gap: "14px" }}>
            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <select value={appealStatusFilter} onChange={(e) => setAppealStatusFilter(e.target.value)}>
                <option value="open">open</option>
                <option value="reviewing">reviewing</option>
                <option value="accepted">accepted</option>
                <option value="rejected">rejected</option>
                <option value="all">all</option>
              </select>
              <button className="btn-secondary" onClick={() => loadAppeals(appealStatusFilter)}>Refresh Appeals</button>
            </div>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Student</th>
                    <th>Session</th>
                    <th>Reason</th>
                    <th>Status</th>
                    <th>Decision</th>
                  </tr>
                </thead>
                <tbody>
                  {appeals.map((row) => (
                    <tr key={row.id}>
                      <td>{row.id}</td>
                      <td>{row.student_email}</td>
                      <td>{row.session_id}</td>
                      <td>{row.reason}</td>
                      <td>{row.status}</td>
                      <td>
                        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                          <button className="btn-secondary" onClick={() => decideAppeal(row.id, "reviewing")}>Review</button>
                          <button className="btn-primary" onClick={() => decideAppeal(row.id, "accepted")}>Accept</button>
                          <button className="btn-danger" onClick={() => decideAppeal(row.id, "rejected")}>Reject</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {appeals.length === 0 ? (
                    <tr>
                      <td colSpan="6" style={{ textAlign: "center", opacity: 0.6 }}>
                        No appeals found.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {activeTab === "notifications" ? (
          <div style={{ display: "grid", gap: "24px" }}>
            <div className="form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: "12px", alignItems: "end" }}>
              <div className="field-group" style={{ marginBottom: 0 }}>
                <label>Tenant Slug</label>
                <input value={tenantSlug} onChange={(e) => setTenantSlug(e.target.value)} />
              </div>
              <div className="field-group" style={{ marginBottom: 0 }}>
                <label>Brand Name</label>
                <input value={brandName} onChange={(e) => setBrandName(e.target.value)} />
              </div>
              <div className="field-group" style={{ marginBottom: 0 }}>
                <label>Primary Color</label>
                <input value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} placeholder="#0f172a" />
              </div>
              <button className="btn-primary" onClick={saveBranding}>Save Branding</button>
            </div>

            {brandingResult ? (
              <div style={{ background: "#f8fafc", border: "1px solid var(--border)", borderRadius: "14px", padding: "14px" }}>
                Loaded branding: {brandingResult.brand_name} ({brandingResult.primary_color})
              </div>
            ) : null}

            <div className="form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr auto auto", gap: "12px", alignItems: "end" }}>
              <div className="field-group" style={{ marginBottom: 0 }}>
                <label>Channel</label>
                <select value={routeChannel} onChange={(e) => setRouteChannel(e.target.value)}>
                  <option value="webhook">webhook</option>
                  <option value="slack">slack</option>
                  <option value="teams">teams</option>
                </select>
              </div>
              <div className="field-group" style={{ marginBottom: 0 }}>
                <label>Target URL</label>
                <input value={routeTarget} onChange={(e) => setRouteTarget(e.target.value)} />
              </div>
              <div className="field-group" style={{ marginBottom: 0 }}>
                <label>Min Severity</label>
                <select value={routeSeverity} onChange={(e) => setRouteSeverity(e.target.value)}>
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                </select>
              </div>
              <button className="btn-secondary" onClick={createRoute}>Add Route</button>
              <button className="btn-primary" onClick={testDispatch}>Dispatch Test</button>
            </div>

            {dispatchCount !== null ? (
              <div style={{ color: "var(--success)", fontWeight: 700 }}>Dispatch sent to {dispatchCount} active route(s).</div>
            ) : null}

            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Tenant</th>
                    <th>Channel</th>
                    <th>Target</th>
                    <th>Severity</th>
                    <th>Active</th>
                  </tr>
                </thead>
                <tbody>
                  {routes.map((route) => (
                    <tr key={route.id}>
                      <td>{route.id}</td>
                      <td>{route.tenant_slug}</td>
                      <td>{route.channel_type}</td>
                      <td>{route.target_url}</td>
                      <td>{route.severity_min}</td>
                      <td>{String(route.is_active)}</td>
                    </tr>
                  ))}
                  {routes.length === 0 ? (
                    <tr>
                      <td colSpan="6" style={{ textAlign: "center", opacity: 0.6 }}>
                        No routes configured.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {activeTab === "quality" ? (
          <div style={{ display: "grid", gap: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <button className="btn-primary" onClick={recomputeQuality}>Recompute Metrics</button>
              <label style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <input
                  type="checkbox"
                  checked={qualityFlaggedOnly}
                  onChange={(e) => {
                    const value = e.target.checked;
                    setQualityFlaggedOnly(value);
                    loadQuality(value).catch(() => {});
                  }}
                />
                Flagged only
              </label>
              <button className="btn-secondary" onClick={() => loadQuality(qualityFlaggedOnly)}>Refresh</button>
              {lastQualityUpdated !== null ? (
                <span style={{ color: "var(--success)", fontWeight: 700 }}>Updated {lastQualityUpdated} question(s).</span>
              ) : null}
            </div>

            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Question</th>
                    <th>Attempts</th>
                    <th>Correct Rate</th>
                    <th>Discrimination</th>
                    <th>Flagged</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {qualityRows.map((row) => (
                    <tr key={row.question_id}>
                      <td>{row.question_id}</td>
                      <td>{row.attempts}</td>
                      <td>{Number(row.correct_rate || 0).toFixed(2)}</td>
                      <td>{Number(row.discrimination_index || 0).toFixed(2)}</td>
                      <td>{String(row.flagged)}</td>
                      <td>{row.flag_reason || "-"}</td>
                    </tr>
                  ))}
                  {qualityRows.length === 0 ? (
                    <tr>
                      <td colSpan="6" style={{ textAlign: "center", opacity: 0.6 }}>
                        No quality metrics available.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {activeTab === "cohort" ? (
          <div style={{ display: "grid", gap: "12px" }}>
            <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
              <input
                value={cohortExamCode}
                onChange={(e) => setCohortExamCode(e.target.value)}
                placeholder="Optional exam code"
                style={{ maxWidth: "280px" }}
              />
              <button className="btn-secondary" onClick={loadCohort}>Refresh Cohort</button>
            </div>

            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Hour Bucket</th>
                    <th>Total Sessions</th>
                    <th>High Risk Count</th>
                    <th>Average Risk</th>
                  </tr>
                </thead>
                <tbody>
                  {cohortRows.map((row) => (
                    <tr key={row.hour_bucket}>
                      <td>{row.hour_bucket}</td>
                      <td>{row.total_sessions}</td>
                      <td>{row.high_risk_count}</td>
                      <td>{row.avg_risk}</td>
                    </tr>
                  ))}
                  {cohortRows.length === 0 ? (
                    <tr>
                      <td colSpan="4" style={{ textAlign: "center", opacity: 0.6 }}>
                        No cohort analytics records available.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {activeTab === "certificates" ? (
          <div style={{ display: "grid", gap: "18px" }}>
            <div className="form-grid" style={{ display: "grid", gridTemplateColumns: "2fr 1fr auto", gap: "12px", alignItems: "end" }}>
              <div className="field-group" style={{ marginBottom: 0 }}>
                <label>Student Email</label>
                <input
                  value={certificateStudentEmail}
                  onChange={(e) => setCertificateStudentEmail(e.target.value)}
                  placeholder="student@test.com"
                />
              </div>
              <div className="field-group" style={{ marginBottom: 0 }}>
                <label>Session ID (optional)</label>
                <input
                  value={certificateSessionId}
                  onChange={(e) => setCertificateSessionId(e.target.value)}
                  placeholder="e.g. 12"
                />
              </div>
              <button className="btn-primary" onClick={issueCertificate}>Issue Certificate</button>
            </div>

            {certificateIssueResult ? (
              <div style={{ background: "#f8fafc", border: "1px solid var(--border)", borderRadius: "14px", padding: "14px" }}>
                <div style={{ fontWeight: 700, marginBottom: "6px" }}>Issued certificate metadata</div>
                <div>Student: {certificateIssueResult.student_email || "-"}</div>
                <div>Exam: {certificateIssueResult.exam_code || "-"}</div>
                <div>Score: {certificateIssueResult.score_percent ?? "-"}</div>
                <div>Integrity: {certificateIssueResult.integrity_band || "-"}</div>
              </div>
            ) : null}

            <div className="form-grid" style={{ display: "grid", gridTemplateColumns: "2fr auto", gap: "12px", alignItems: "end" }}>
              <div className="field-group" style={{ marginBottom: 0 }}>
                <label>Verification Hash</label>
                <input
                  value={certificateHash}
                  onChange={(e) => setCertificateHash(e.target.value)}
                  placeholder="Paste verification hash"
                />
              </div>
              <button className="btn-secondary" onClick={verifyCertificate}>Verify</button>
            </div>

            <div>
              <button
                className="btn-secondary"
                onClick={() => {
                  const hash = String(certificateHash || "").trim();
                  if (!hash) {
                    setError("Verification hash is required.");
                    return;
                  }
                  const base = String(api.defaults.baseURL || "").replace(/\/$/, "");
                  window.open(`${base}/innovations/certificates/verify/${encodeURIComponent(hash)}`, "_blank");
                }}
              >
                Open Public Verify URL
              </button>
            </div>

            {certificateVerifyResult ? (
              <div style={{ background: "#f8fafc", border: "1px solid var(--border)", borderRadius: "14px", padding: "14px" }}>
                <div style={{ fontWeight: 700, marginBottom: "6px" }}>
                  Verification Status: {certificateVerifyResult.valid ? "valid" : "revoked"}
                </div>
                <div>Student: {certificateVerifyResult.student_email || "-"}</div>
                <div>Exam: {certificateVerifyResult.exam_code || "-"}</div>
                <div>Score: {certificateVerifyResult.score_percent ?? "-"}</div>
                <div>Integrity: {certificateVerifyResult.integrity_band || "-"}</div>
                <div>Revocation reason: {certificateVerifyResult.revocation_reason || "-"}</div>
              </div>
            ) : null}

            <div className="form-grid" style={{ display: "grid", gridTemplateColumns: "2fr auto", gap: "12px", alignItems: "end" }}>
              <div className="field-group" style={{ marginBottom: 0 }}>
                <label>Revocation Reason</label>
                <input
                  value={certificateRevokeReason}
                  onChange={(e) => setCertificateRevokeReason(e.target.value)}
                  placeholder="Administrative review"
                />
              </div>
              <button className="btn-danger" onClick={revokeCertificate}>Revoke</button>
            </div>
          </div>
        ) : null}

        {activeTab === "trust-plagiarism" ? (
          <div style={{ display: "grid", gap: "24px" }}>
            <div className="form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 3fr auto", gap: "12px", alignItems: "end" }}>
              <div className="field-group" style={{ marginBottom: 0 }}>
                <label>Session ID</label>
                <input
                  value={trustSessionId}
                  onChange={(e) => setTrustSessionId(e.target.value)}
                  placeholder="e.g. 10"
                />
              </div>
              <div className="field-group" style={{ marginBottom: 0 }}>
                <label>Trust Signals</label>
                <div style={{ display: "flex", gap: "14px", flexWrap: "wrap" }}>
                  {Object.keys(trustSignals).map((key) => (
                    <label key={key} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.9rem" }}>
                      <input
                        type="checkbox"
                        checked={Boolean(trustSignals[key])}
                        onChange={(e) => setTrustSignals((prev) => ({ ...prev, [key]: e.target.checked }))}
                      />
                      {key}
                    </label>
                  ))}
                </div>
              </div>
              <button className="btn-primary" onClick={ingestTrustSignals}>Ingest Trust</button>
            </div>

            {trustIngestResult ? (
              <div style={{ color: "var(--success)", fontWeight: 700 }}>
                Trust score: {trustIngestResult.trust_score} ({trustIngestResult.risk_band})
              </div>
            ) : null}

            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Created</th>
                    <th>Trust Score</th>
                    <th>Risk Band</th>
                    <th>Signals</th>
                  </tr>
                </thead>
                <tbody>
                  {trustHistory.map((row, idx) => (
                    <tr key={`${row.created_at}-${idx}`}>
                      <td>{new Date(row.created_at).toLocaleString()}</td>
                      <td>{row.trust_score}</td>
                      <td>{row.risk_band}</td>
                      <td>{JSON.stringify(row.signals || {})}</td>
                    </tr>
                  ))}
                  {trustHistory.length === 0 ? (
                    <tr>
                      <td colSpan="4" style={{ textAlign: "center", opacity: 0.6 }}>
                        No trust snapshots loaded.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="form-grid" style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: "12px", alignItems: "end" }}>
              <div className="field-group" style={{ marginBottom: 0 }}>
                <label>Plagiarism Threshold (0-1)</label>
                <input
                  value={plagiarismThreshold}
                  onChange={(e) => setPlagiarismThreshold(e.target.value)}
                  placeholder="0.72"
                />
              </div>
              <button className="btn-primary" onClick={runPlagiarismScan}>Run Scan</button>
              <button className="btn-secondary" onClick={loadPlagiarismAlerts}>Refresh Alerts</button>
            </div>

            {plagiarismRunResult ? (
              <div style={{ color: "var(--success)", fontWeight: 700 }}>
                Run {plagiarismRunResult.run_id}: {plagiarismRunResult.alerts_created} alert(s) created.
              </div>
            ) : null}

            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Run</th>
                    <th>Session A</th>
                    <th>Session B</th>
                    <th>Similarity</th>
                    <th>Status</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {plagiarismAlerts.map((row) => (
                    <tr key={row.id}>
                      <td>{row.id}</td>
                      <td>{row.run_id}</td>
                      <td>{row.session_id_a}</td>
                      <td>{row.session_id_b}</td>
                      <td>{row.similarity_score}</td>
                      <td>{row.status}</td>
                      <td>{new Date(row.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                  {plagiarismAlerts.length === 0 ? (
                    <tr>
                      <td colSpan="7" style={{ textAlign: "center", opacity: 0.6 }}>
                        No plagiarism alerts found.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {activeTab === "network-adaptive" ? (
          <div style={{ display: "grid", gap: "24px" }}>
            <div className="form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr auto", gap: "12px", alignItems: "end" }}>
              <div className="field-group" style={{ marginBottom: 0 }}>
                <label>Session ID</label>
                <input value={networkSessionId} onChange={(e) => setNetworkSessionId(e.target.value)} placeholder="e.g. 11" />
              </div>
              <div className="field-group" style={{ marginBottom: 0 }}>
                <label>Latency (ms)</label>
                <input value={latencyMs} onChange={(e) => setLatencyMs(e.target.value)} />
              </div>
              <div className="field-group" style={{ marginBottom: 0 }}>
                <label>Packet Loss (%)</label>
                <input value={packetLossPercent} onChange={(e) => setPacketLossPercent(e.target.value)} />
              </div>
              <div className="field-group" style={{ marginBottom: 0 }}>
                <label>Jitter (ms)</label>
                <input value={jitterMs} onChange={(e) => setJitterMs(e.target.value)} />
              </div>
              <div className="field-group" style={{ marginBottom: 0 }}>
                <label>Offline Buffer Count</label>
                <input value={offlineBufferCount} onChange={(e) => setOfflineBufferCount(e.target.value)} />
              </div>
              <button className="btn-primary" onClick={submitNetworkHeartbeat}>Send Heartbeat</button>
            </div>

            {heartbeatResult ? (
              <div style={{ color: "var(--success)", fontWeight: 700 }}>
                Heartbeat accepted. Grace applied: {String(heartbeatResult.grace_applied)}
              </div>
            ) : null}

            <div className="form-grid" style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: "12px", alignItems: "end" }}>
              <div className="field-group" style={{ marginBottom: 0 }}>
                <label>Previous Answer Correct?</label>
                <select value={adaptivePreviousCorrect} onChange={(e) => setAdaptivePreviousCorrect(e.target.value)}>
                  <option value="true">true</option>
                  <option value="false">false</option>
                  <option value="none">unknown</option>
                </select>
              </div>
              <button className="btn-primary" onClick={requestAdaptiveQuestion}>Get Next Adaptive Question</button>
              <button className="btn-secondary" onClick={() => setAdaptiveResult(null)}>Clear</button>
            </div>

            {adaptiveResult ? (
              <div style={{ background: "#f8fafc", border: "1px solid var(--border)", borderRadius: "14px", padding: "14px" }}>
                <div>Chosen difficulty: <strong>{adaptiveResult.chosen_difficulty || "-"}</strong></div>
                <div>Next question ID: {adaptiveResult.next_question?.id ?? "none"}</div>
                <div>Prompt: {adaptiveResult.next_question?.prompt || "No pending question"}</div>
              </div>
            ) : null}
          </div>
        ) : null}

        {activeTab === "evidence-chain" ? (
          <div style={{ display: "grid", gap: "24px" }}>
            <div className="form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 2fr auto", gap: "12px", alignItems: "end" }}>
              <div className="field-group" style={{ marginBottom: 0 }}>
                <label>Session ID</label>
                <input value={evidenceSessionId} onChange={(e) => setEvidenceSessionId(e.target.value)} placeholder="e.g. 11" />
              </div>
              <div className="field-group" style={{ marginBottom: 0 }}>
                <label>Source Type</label>
                <input value={evidenceSourceType} onChange={(e) => setEvidenceSourceType(e.target.value)} placeholder="manual" />
              </div>
              <div className="field-group" style={{ marginBottom: 0 }}>
                <label>Source ID</label>
                <input value={evidenceSourceId} onChange={(e) => setEvidenceSourceId(e.target.value)} />
              </div>
              <div className="field-group" style={{ marginBottom: 0 }}>
                <label>Metadata Note</label>
                <input value={evidenceNote} onChange={(e) => setEvidenceNote(e.target.value)} />
              </div>
              <button className="btn-primary" onClick={anchorEvidence}>Anchor</button>
            </div>

            {evidenceAnchorResult ? (
              <div style={{ color: "var(--success)", fontWeight: 700 }}>
                Anchor hash: {evidenceAnchorResult.chain_hash}
              </div>
            ) : null}

            <div style={{ display: "flex", gap: "10px" }}>
              <button className="btn-secondary" onClick={() => loadEvidenceChain(evidenceSessionId)}>Refresh Chain</button>
              <button className="btn-primary" onClick={downloadIncidentBundle}>Download Incident Bundle</button>
              {evidenceBundleStatus ? <span style={{ alignSelf: "center", color: "var(--success)" }}>{evidenceBundleStatus}</span> : null}
            </div>

            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Source Type</th>
                    <th>Source ID</th>
                    <th>Content Hash</th>
                    <th>Previous Hash</th>
                    <th>Chain Hash</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {evidenceChainRows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.id}</td>
                      <td>{row.source_type}</td>
                      <td>{row.source_id}</td>
                      <td>{row.content_hash}</td>
                      <td>{row.previous_hash || "-"}</td>
                      <td>{row.chain_hash}</td>
                      <td>{new Date(row.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                  {evidenceChainRows.length === 0 ? (
                    <tr>
                      <td colSpan="7" style={{ textAlign: "center", opacity: 0.6 }}>
                        No evidence chain entries found.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </article>
    </section>
  );
}

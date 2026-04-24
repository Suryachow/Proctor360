import { useEffect, useState } from "react";
import { api } from "../services/api";

export const Phase1AdminDashboard = ({ selectedSessionId, sessionId }) => {
  const activeSessionId = selectedSessionId ?? sessionId ?? null;
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!activeSessionId) {
      setReport(null);
      setError("");
      setLoading(false);
      return;
    }

    let cancelled = false;

    const loadReport = async () => {
      setLoading(true);
      setError("");
      try {
        const { data } = await api.get(`/admin/proctor-report/${activeSessionId}`);
        if (!cancelled) {
          setReport(data);
        }
      } catch (requestError) {
        if (!cancelled) {
          setReport(null);
          setError(requestError?.response?.status === 404 ? "Session report not found." : "Unable to load the backend report.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadReport();

    return () => {
      cancelled = true;
    };
  }, [activeSessionId]);

  return (
    <div className="space-y-6 rounded-2xl border border-slate-200 bg-slate-50 p-6">
      <header>
        <h1 className="text-3xl font-bold text-slate-900">Phase 1 Session Report</h1>
        <p className="mt-2 text-sm text-slate-600">
          The backend owns the analysis. This dashboard only renders the stored report and incident summary.
        </p>
      </header>

      {!activeSessionId ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600">
          Select a live session from the Status tab to load its backend report.
        </div>
      ) : loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
          Loading backend report...
        </div>
      ) : report ? (
        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-lg bg-slate-50 p-4">
                <div className="text-xs uppercase tracking-wide text-slate-500">Risk Score</div>
                <div className="text-3xl font-bold text-slate-900">{Math.round(report.risk_score || 0)}</div>
              </div>
              <div className="rounded-lg bg-slate-50 p-4">
                <div className="text-xs uppercase tracking-wide text-slate-500">Status</div>
                <div className="text-lg font-semibold text-slate-900">{report.status || "Unknown"}</div>
              </div>
              <div className="rounded-lg bg-slate-50 p-4">
                <div className="text-xs uppercase tracking-wide text-slate-500">Unusual Activity</div>
                <div className="text-lg font-semibold text-slate-900">{report.unusual_activity_detected ? "Yes" : "No"}</div>
              </div>
            </div>

            <div className="mt-5">
              <div className="text-xs uppercase tracking-wide text-slate-500">Recommendation</div>
              <p className="mt-2 text-sm text-slate-700">{report.recommendation || "No recommendation available."}</p>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-lg font-semibold text-slate-900">Incident Snips</h2>
            {Array.isArray(report.incident_snips) && report.incident_snips.length > 0 ? (
              <div className="mt-4 space-y-3">
                {report.incident_snips.map((incident, index) => (
                  <div key={`${incident.timestamp}-${index}`} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <strong className="text-slate-900">{incident.event_type}</strong>
                      <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-slate-700">
                        {incident.severity}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-700">{incident.detail}</p>
                    <div className="mt-2 text-xs text-slate-500">{new Date(incident.timestamp).toLocaleString()}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
                No unusual incident snips were recorded for this session.
              </div>
            )}
          </section>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600">
          {error || "No backend report could be loaded for this session."}
        </div>
      )}
    </div>
  );
};

export default Phase1AdminDashboard;

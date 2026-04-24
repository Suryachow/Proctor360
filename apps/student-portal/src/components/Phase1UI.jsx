import { useEffect, useState } from "react";
import { api } from "../services/api";

export const Phase1FeaturePanel = ({ sessionId, report: initialReport = null }) => {
  const [report, setReport] = useState(initialReport);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setReport(initialReport || null);
  }, [initialReport]);

  useEffect(() => {
    if (!sessionId) {
      setLoading(false);
      setError("");
      return;
    }

    let cancelled = false;

    const loadReport = async () => {
      setLoading(true);
      setError("");
      try {
        const { data } = await api.get(`/exam/report/${sessionId}`);
        if (!cancelled) {
          setReport(data);
        }
      } catch (requestError) {
        if (!cancelled) {
          const status = requestError?.response?.status;
          setReport(null);
          setError(status === 404 ? "Backend analysis is not available yet for this session." : "Unable to load the backend report.");
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
  }, [sessionId]);

  return (
    <div className="space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Backend Report Preview</h2>
        <p className="mt-1 text-sm text-gray-600">
          All analysis runs on the server. This panel only shows the latest report once the backend has generated it.
        </p>
      </div>

      {!sessionId ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-4 text-sm text-gray-600">
          Start a session to enable backend reporting.
        </div>
      ) : loading ? (
        <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600">
          Waiting for backend analysis...
        </div>
      ) : report ? (
        <div className="grid gap-3 rounded-lg border border-gray-200 bg-white p-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="text-xs uppercase tracking-wide text-gray-500">Score</div>
              <div className="text-2xl font-bold text-slate-900">{Math.round(report.score_percent || 0)}%</div>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="text-xs uppercase tracking-wide text-gray-500">Integrity Band</div>
              <div className="text-lg font-semibold text-slate-900">{report.integrity_band || "Unknown"}</div>
            </div>
          </div>

          <div>
            <div className="text-xs uppercase tracking-wide text-gray-500">Stage</div>
            <div className="font-medium text-gray-900">{report.stage || "Generated"}</div>
          </div>

          <div>
            <div className="text-xs uppercase tracking-wide text-gray-500">Summary</div>
            <p className="mt-1 text-sm text-gray-700">{report.overall_summary || "No summary available yet."}</p>
          </div>

          {Array.isArray(report.recommended_actions) && report.recommended_actions.length > 0 ? (
            <div>
              <div className="text-xs uppercase tracking-wide text-gray-500">Recommended Actions</div>
              <ul className="mt-2 space-y-2 text-sm text-gray-700">
                {report.recommended_actions.map((action, index) => (
                  <li key={index} className="rounded-md bg-slate-50 px-3 py-2">{action}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-4 text-sm text-gray-600">
          {error || "Report will appear here after the backend finishes processing this session."}
        </div>
      )}
    </div>
  );
};

export default Phase1FeaturePanel;

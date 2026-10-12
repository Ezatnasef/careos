import { useEffect, useState, type FormEvent } from "react";
import { AlertCircle, BookOpen, CheckCircle2, FileText, Send, ShieldAlert, UserCheck } from "lucide-react";
import { getPatients, type ApiPatient } from "../../api";
import { ApiError } from "../../api/client";
import {
  getClinicalRagStats,
  queryClinicalRag,
  type ClinicalRagAnswerResponse,
  type ClinicalRagStatsResponse,
} from "../../api/chat";
import { PageHeading } from "../../components/PageHeading";
import { PanelHeading } from "../../components/PanelHeading";
import type { TranslationKey } from "../../i18n";

type Translator = (key: TranslationKey) => string;

export function Assistant({ t }: { t: Translator }) {
  const [patients, setPatients] = useState<ApiPatient[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>("");
  const [question, setQuestion] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ClinicalRagAnswerResponse | null>(null);
  const [stats, setStats] = useState<ClinicalRagStatsResponse | null>(null);

  useEffect(() => {
    let active = true;
    getPatients("", 1, 50)
      .then((list) => {
        if (active) setPatients(list);
      })
      .catch(() => {
        // Non-fatal if user cannot list patients
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    getClinicalRagStats(selectedPatientId || undefined)
      .then((data) => {
        if (active) setStats(data);
      })
      .catch(() => {
        if (active) setStats(null);
      });
    return () => {
      active = false;
    };
  }, [selectedPatientId]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || loading) return;

    setLoading(true);
    setError(null);
    try {
      const response = await queryClinicalRag(trimmed, {
        patientId: selectedPatientId || undefined,
        topK: 5,
      });
      setResult(response);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? t("sessionExpired")
          : err instanceof ApiError && err.status === 503
            ? t("clinicalAssistantNotConfigured")
            : err instanceof Error
              ? err.message
              : "Failed to query Clinical RAG assistant",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <PageHeading
        eyebrow={t("assistant")}
        title={t("assistantReady")}
        detail={t("assistantReadyDetail")}
      />
      <section className="panel assistant-panel">
        <PanelHeading
          title={t("assistantReady")}
          detail={
            stats
              ? `${stats.total_chunks} ${t("indexedChunks")} (${stats.guideline_chunks} ${t("guidelines")} · ${stats.patient_document_chunks} ${t("patientDocuments")})`
              : t("assistantReadyDetail")
          }
        />

        <form onSubmit={handleSubmit} className="assistant-question-form">
          <div className="assistant-question-grid">
            <label className="assistant-field">
              <span>{t("assistantPatientContext")}</span>
              <select
                value={selectedPatientId}
                onChange={(e) => setSelectedPatientId(e.target.value)}
                disabled={loading}
              >
                <option value="">{t("guidelineOnly")}</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.given_name} {p.family_name} ({p.medical_record_number})
                  </option>
                ))}
              </select>
            </label>

            <label className="assistant-field">
              <span>{t("clinicalQuestion")}</span>
              <div className="assistant-question-controls">
                <input
                  type="text"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder={t("clinicalQuestionPlaceholder")}
                  disabled={loading}
                />
                <button
                  type="submit"
                  className="primary-btn assistant-submit"
                  disabled={loading || !question.trim()}
                >
                  <Send size={16} />
                  {loading ? "..." : t("askQuestion")}
                </button>
              </div>
            </label>
          </div>
        </form>

        {stats?.total_chunks === 0 && (
          <div className="assistant-answer assistant-placeholder" role="status">
            <AlertCircle size={18} />
            <span>{t("clinicalAssistantNoGuidelines")}</span>
          </div>
        )}

        {error && (
          <div className="banner error-banner" role="alert" style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        {!result && !error && stats?.total_chunks !== 0 && (
          <div className="assistant-answer assistant-placeholder">
            <BookOpen size={18} />
            <span>{t("assistantReadyDetail")}</span>
          </div>
        )}

        {result && (
          <div className="clinical-rag-result" style={{ display: "grid", gap: "1rem" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
              <span
                className={`status-pill ${result.grounded ? "status-stable" : "status-warning"}`}
                style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
              >
                {result.grounded ? <CheckCircle2 size={14} /> : <ShieldAlert size={14} />}
                {result.grounded ? "Evidence Grounded" : "Abstained / Insufficient Evidence"}
              </span>
              <span className="status-pill">Mode: {result.query_mode}</span>
              <span className="status-pill">Chunks used: {result.chunks_used}</span>
              {result.patient_context_used && (
                <span className="status-pill" style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                  <UserCheck size={14} />
                  Patient context applied
                </span>
              )}
            </div>

            <div className="assistant-answer" style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
              {result.answer}
            </div>

            {result.patient_factors_applied.length > 0 && (
              <div className="card" style={{ padding: "0.85rem" }}>
                <strong style={{ display: "block", marginBottom: "0.4rem", fontSize: "0.9rem" }}>
                  Verified Patient Factors Applied
                </strong>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                  {result.patient_factors_applied.map((factor, idx) => (
                    <span key={idx} className="status-pill">
                      {factor}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {result.citations.length > 0 && (
              <div className="card" style={{ padding: "0.85rem" }}>
                <strong style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.9rem" }}>
                  Clinical Evidence Citations ({result.citations.length})
                </strong>
                <div style={{ display: "grid", gap: "0.6rem" }}>
                  {result.citations.map((cit, idx) => (
                    <div
                      key={cit.chunk_id}
                      style={{
                        padding: "0.65rem",
                        borderRadius: "0.5rem",
                        border: "1px solid rgba(148, 163, 184, 0.25)",
                        fontSize: "0.88rem",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.25rem", fontWeight: 600 }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", flexWrap: "wrap" }}>
                          <FileText size={14} />
                          [Source {idx + 1}] {cit.source} (Page {cit.page})
                          {cit.source_type && (
                            <span className="status-pill" style={{ fontSize: "0.75rem" }}>
                              {cit.source_type}
                            </span>
                          )}
                          {cit.document_id && (
                            <span className="status-pill" style={{ fontSize: "0.75rem" }}>
                              Doc ID: {cit.document_id}
                            </span>
                          )}
                        </span>
                        <span>Score: {(cit.relevance_score * 100).toFixed(1)}%</span>
                      </div>
                      <p style={{ margin: 0, opacity: 0.88 }}>{cit.excerpt}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {result.diagnostics && (
              <details
                className="card"
                data-testid="rag-retrieval-diagnostics"
                style={{ padding: "0.85rem", fontSize: "0.85rem" }}
              >
                <summary style={{ cursor: "pointer", fontWeight: 600 }}>
                  Retrieval & Grounding Diagnostics ({result.diagnostics.diagnostic_mode})
                </summary>
                <div style={{ display: "grid", gap: "0.5rem", marginTop: "0.65rem" }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                    {result.diagnostics.indexed_chunks_in_scope && (
                      <span className="status-pill">
                        Indexed in scope: {result.diagnostics.indexed_chunks_in_scope.total_chunks} (
                        {result.diagnostics.indexed_chunks_in_scope.patient_document_chunks} patient ·{" "}
                        {result.diagnostics.indexed_chunks_in_scope.guideline_chunks} guideline)
                      </span>
                    )}
                    <span className="status-pill">
                      Retrieved: {result.diagnostics.retrieved_chunks_count} (Above threshold:{" "}
                      {result.diagnostics.chunks_above_threshold_count})
                    </span>
                    <span className="status-pill">
                      Citations mapped: {result.diagnostics.all_citations_mapped ? "Yes" : "No"}
                    </span>
                    <span className="status-pill">
                      Abstained: {result.diagnostics.abstained ? `Yes (${result.diagnostics.abstention_reason || "unspecified"})` : "No"}
                    </span>
                  </div>
                  {result.diagnostics.retrieved_sources.length > 0 && (
                    <div>
                      <strong>Retrieved Candidate Chunks:</strong>
                      <ul style={{ margin: "0.35rem 0 0", paddingLeft: "1.2rem" }}>
                        {result.diagnostics.retrieved_sources.map((src) => (
                          <li key={src.chunk_id}>
                            <code>{src.source}</code> ({src.source_type}
                            {src.document_id ? `, doc=${src.document_id}` : ""}, p.{src.page}) — score:{" "}
                            <strong>{(src.score * 100).toFixed(1)}%</strong>{" "}
                            {src.selected_for_context ? "[selected]" : "[filtered]"}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </details>
            )}

            <p style={{ margin: 0, fontSize: "0.8rem", opacity: 0.75 }}>
              {result.disclaimer}
            </p>
          </div>
        )}
      </section>
    </>
  );
}

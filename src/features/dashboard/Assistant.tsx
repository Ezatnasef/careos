import { useEffect, useState, type FormEvent } from "react";
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  FileText,
  Send,
  ShieldAlert,
  UserCheck,
} from "lucide-react";
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
  // Patients list for context
  const [patients, setPatients] = useState<ApiPatient[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>("");

  // Clinical Document RAG State
  const [ragQuestion, setRagQuestion] = useState<string>("");
  const [ragLoading, setRagLoading] = useState<boolean>(false);
  const [ragError, setRagError] = useState<string | null>(null);
  const [ragResult, setRagResult] = useState<ClinicalRagAnswerResponse | null>(null);
  const [ragStats, setRagStats] = useState<ClinicalRagStatsResponse | null>(null);

  useEffect(() => {
    getPatients()
      .then((data) => setPatients(data))
      .catch(() => undefined);

    getClinicalRagStats()
      .then((stats) => setRagStats(stats))
      .catch(() => undefined);
  }, []);

  const handleRagSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ragQuestion.trim() || ragLoading) return;
    setRagLoading(true);
    setRagError(null);
    try {
      const response = await queryClinicalRag(ragQuestion.trim(), {
        patientId: selectedPatientId || undefined,
        topK: 5,
      });
      setRagResult(response);
    } catch (err) {
      setRagError(
        err instanceof ApiError && err.status === 401
          ? t("sessionExpired")
          : err instanceof ApiError && err.status === 503
            ? t("clinicalAssistantNotConfigured")
            : err instanceof Error
              ? err.message
              : t("assistantUnavailable"),
      );
    } finally {
      setRagLoading(false);
    }
  };

  return (
    <>
      <PageHeading
        eyebrow={t("assistant")}
        title={t("assistantPageTitle")}
        detail={t("assistantPageDetail")}
      />

      <div className="assistant-context" dir="auto">
        <label className="assistant-patient-field">
          <span>
          <UserCheck size={16} />
            {t("assistantContextLabel")}
          </span>
          <select
            value={selectedPatientId}
            onChange={(e) => setSelectedPatientId(e.target.value)}
          >
            <option value="">{t("generalClinicContext")}</option>
            {patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.given_name} {p.family_name} ({p.medical_record_number})
              </option>
            ))}
          </select>
        </label>
        {selectedPatientId && (
          <span className="status-pill status-stable">{t("attachedPatient")}</span>
        )}
      </div>

      <section className="panel assistant-panel">
        <PanelHeading
          title={t("clinicalRagTitle")}
          detail={
            ragStats
              ? `${ragStats.total_chunks} ${t("chunksUsed")} (${ragStats.guideline_chunks} · ${t("guidelines")} / ${ragStats.patient_document_chunks} · ${t("patientDocuments")})`
              : t("assistantReadyDetail")
          }
        />

        <form onSubmit={handleRagSubmit} className="assistant-form">
          <label className="assistant-patient-field">
            <span>{t("clinicalQuestion")}</span>
            <input
              className="assistant-question-input"
              type="text"
              value={ragQuestion}
              onChange={(e) => setRagQuestion(e.target.value)}
              placeholder={t("clinicalQuestionPlaceholder")}
              disabled={ragLoading}
              dir="auto"
            />
          </label>
          <button
            type="submit"
            className="primary-btn assistant-submit"
            disabled={ragLoading || !ragQuestion.trim()}
          >
            <Send size={16} />
            {ragLoading ? t("working") : t("askAssistantAction")}
          </button>
        </form>

        {ragError && (
          <div className="banner error-banner assistant-error" role="alert">
            <AlertCircle size={18} />
            <span>{ragError}</span>
          </div>
        )}

        {!ragResult && !ragError && (
          <div className="empty-state">
            <BookOpen size={28} />
            <p>{t("assistantEmptyPrompt")}</p>
          </div>
        )}

        {ragResult && (
          <div className="assistant-result-card" data-testid="rag-result-card">
            <div className="assistant-result-badges">
              <span
                className={`status-pill ${ragResult.grounded ? "status-stable" : "status-warning"}`}
              >
                {ragResult.grounded ? <CheckCircle2 size={14} /> : <ShieldAlert size={14} />}
                {ragResult.grounded ? t("evidenceGrounded") : t("insufficientEvidence")}
              </span>
              <span className="status-pill">{t("queryMode")}: {ragResult.query_mode}</span>
              <span className="status-pill">{t("chunksUsed")}: {ragResult.chunks_used}</span>
              {ragResult.patient_context_used && (
                <span className="status-pill">
                  <UserCheck size={14} />
                  {t("patientContextApplied")}
                </span>
              )}
            </div>

            <div className="assistant-answer" dir="auto">
              {ragResult.answer}
            </div>

            {ragResult.citations.length > 0 && (
              <div className="card assistant-citations">
                <strong>
                  {t("citationsTitle")} ({ragResult.citations.length})
                </strong>
                <div className="assistant-citation-list">
                  {ragResult.citations.map((cit, idx) => (
                    <div className="assistant-citation" key={cit.chunk_id}>
                      <div className="assistant-citation-heading">
                        <span>
                          <FileText size={14} />
                          [{t("sourceLabel")} {idx + 1}] {cit.source} ({t("pageLabel")} {cit.page})
                          {cit.source_type && <span className="status-pill">{cit.source_type}</span>}
                        </span>
                        <span>{t("scoreLabel")}: {(cit.relevance_score * 100).toFixed(1)}%</span>
                      </div>
                      <p dir="auto">{cit.excerpt}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </>
  );
}

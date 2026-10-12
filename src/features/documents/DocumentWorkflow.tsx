import { useEffect, useRef, useState, type FormEvent } from "react";
import { AlertTriangle, CheckCircle2, Database, FileText, Mic, RefreshCw, Save, Search, ShieldAlert, Square, Trash2 } from "lucide-react";
import {
  deletePatientDocument,
  extractPatientDocumentText,
  getLatestPatientEncounter,
  getPatientById,
  getTranscript,
  reviewTranscript,
  transcribeRecording,
  uploadEncounterRecording,
  downloadPatientDocument,
  type ApiEncounter,
  type ApiPatient,
  type ApiTranscript,
  type OcrDiagnostics,
  type StructuredClinicalCandidates,
  reviewPatientDocument,
  uploadPatientDocument,
} from "../../api";
import {
  queryClinicalRag,
  type ClinicalRagAnswerResponse,
} from "../../api/chat";
import { ApiError } from "../../api/client";
import { getPatients } from "../../api/patients";
import { PageHeading } from "../../components/PageHeading";
import { PanelHeading } from "../../components/PanelHeading";
import type { TranslationKey } from "../../i18n";

type Translator = (key: TranslationKey) => string;
type DocumentItem = {
  id: string;
  name: string;
  type: string;
  status: "uploaded" | "verified" | "rejected";
  uploadedAt: string;
  ocrStatus?: string;
  extractedText?: string | null;
  structuredCandidates?: StructuredClinicalCandidates;
  chunksIndexed?: number;
  ocrDiagnostics?: OcrDiagnostics;
};

function mapReviewStatus(reviewStatus?: string): DocumentItem["status"] {
  if (reviewStatus === "approved") return "verified";
  if (reviewStatus === "rejected") return "rejected";
  return "uploaded";
}

function mapSavedDocuments(
  records: Array<{
    id: string;
    filename: string;
    content_type: string;
    review_status: string;
    created_at: string;
    ocr_status?: string;
    extracted_text?: string | null;
    structured_candidates?: StructuredClinicalCandidates;
    chunks_indexed?: number;
  }> = [],
): DocumentItem[] {
  return records.map((document) => ({
    id: document.id,
    name: document.filename,
    type: document.content_type.split("/").pop()?.toUpperCase() || "FILE",
    status: mapReviewStatus(document.review_status),
    uploadedAt: new Date(document.created_at).toLocaleDateString(),
    ocrStatus: document.ocr_status,
    extractedText: document.extracted_text,
    structuredCandidates: document.structured_candidates,
    chunksIndexed: document.chunks_indexed ?? 0,
  }));
}

export function DocumentWorkflow({
  t,
  canReviewDocuments = true,
}: {
  t: Translator;
  canReviewDocuments?: boolean;
}) {
  const [patients, setPatients] = useState<ApiPatient[]>([]);
  const [loadingPatients, setLoadingPatients] = useState(true);
  const [patientsError, setPatientsError] = useState<string | null>(null);
  const [loadingDocuments, setLoadingDocuments] = useState(false);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [rerunningOcr, setRerunningOcr] = useState(false);
  const [reviewingStatus, setReviewingStatus] = useState<"approved" | "rejected" | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deletingDocument, setDeletingDocument] = useState(false);
  const [patientId, setPatientId] = useState<string>("");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [ragQuestion, setRagQuestion] = useState<string>("");
  const [ragLoading, setRagLoading] = useState<boolean>(false);
  const [ragError, setRagError] = useState<string | null>(null);
  const [ragResult, setRagResult] = useState<ClinicalRagAnswerResponse | null>(null);
  const [encounter, setEncounter] = useState<ApiEncounter | null>(null);
  const [transcript, setTranscript] = useState<ApiTranscript | null>(null);
  const [transcriptText, setTranscriptText] = useState("");
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [savingTranscript, setSavingTranscript] = useState(false);
  const [downloadingDocument, setDownloadingDocument] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState(t("recordingReady"));
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [encounterError, setEncounterError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const selectedDocument =
    documents.find((item) => item.id === selectedId) ?? documents[0];
  const documentStatus = (status: DocumentItem["status"]) =>
    status === "verified"
      ? t("documentStatusVerified")
      : status === "rejected"
        ? t("statusRejected")
        : t("documentStatusOcrReady");
  const documentStatusClass = (status: DocumentItem["status"]) =>
    status === "verified"
      ? "confirmed"
      : status === "rejected"
        ? "attention"
        : "pending";

  const refreshPatientDocuments = async (
    targetPatientId: string,
    preferredDocumentId?: string | null,
  ) => {
    const patient = await getPatientById(targetPatientId);
    const savedDocuments = mapSavedDocuments(patient.documents ?? []);
    setDocuments(savedDocuments);
    setSelectedId((current) => {
      const candidate = preferredDocumentId ?? current;
      if (candidate && savedDocuments.some((doc) => doc.id === candidate)) {
        return candidate;
      }
      return savedDocuments[0]?.id ?? null;
    });
  };

  useEffect(() => {
    let active = true;
    setLoadingPatients(true);
    setPatientsError(null);
    getPatients("", 1, 100)
      .then((records) => {
        if (!active) return;
        setPatients(records);
        setPatientId((current) =>
          records.some((item) => item.id === current) ? current : "",
        );
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setPatients([]);
        setPatientId("");
        const message =
          reason instanceof Error
            ? reason.message === "Insufficient permissions"
              ? t("permissionDenied")
              : reason.message
            : t("patientsUnavailable");
        setPatientsError(message);
      })
      .finally(() => {
        if (active) setLoadingPatients(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!patientId) {
      setDocuments([]);
      setSelectedId(null);
      setEncounter(null);
      setEncounterError(null);
      setTranscript(null);
      setTranscriptText("");
      return;
    }
    let active = true;
    setLoadingDocuments(true);
    setUploadError(null);
    setEncounterError(null);
    setTranscript(null);
    setTranscriptText("");

    getPatientById(patientId)
      .then((patient) => {
        if (!active) return;
        const savedDocuments = mapSavedDocuments(patient.documents ?? []);
        setDocuments(savedDocuments);
        setSelectedId(savedDocuments[0]?.id ?? null);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setDocuments([]);
        setSelectedId(null);
        setUploadError(
          reason instanceof Error ? reason.message : t("apiUnavailable"),
        );
      })
      .finally(() => {
        if (active) setLoadingDocuments(false);
      });

    getLatestPatientEncounter(patientId)
      .then((record) => {
        if (active) setEncounter(record);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setEncounter(null);
        setEncounterError(
          reason instanceof ApiError && reason.status === 404
            ? t("startEncounterRequired")
            : reason instanceof Error
              ? reason.message
              : t("apiUnavailable"),
        );
      });

    return () => {
      active = false;
    };
  }, [patientId]);

  useEffect(
    () => () => {
      if (recorder.current?.state === "recording") recorder.current.stop();
      stream.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  const startRecording = async () => {
    if (!encounter || recording || transcribing) return;
    let audioStream: MediaStream | null = null;
    try {
      const currentStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStream = currentStream;
      stream.current = currentStream;
      const mimeType = ["audio/webm;codecs=opus", "audio/webm"].find((type) =>
        MediaRecorder.isTypeSupported(type),
      );
      const nextRecorder = mimeType
        ? new MediaRecorder(currentStream, { mimeType })
        : new MediaRecorder(currentStream);
      chunks.current = [];
      nextRecorder.ondataavailable = (event) => {
        if (event.data.size) chunks.current.push(event.data);
      };
      nextRecorder.onstop = async () => {
        currentStream.getTracks().forEach((track) => track.stop());
        stream.current = null;
        const audio = new Blob(chunks.current, {
          type: nextRecorder.mimeType || "audio/webm",
        });
        setTranscribing(true);
        setVoiceError(null);
        setVoiceStatus(t("uploadingRecording"));
        try {
          const uploaded = await uploadEncounterRecording(encounter.id, audio);
          setVoiceStatus(t("transcribing"));
          await transcribeRecording(uploaded.id);
          let result = await getTranscript(uploaded.transcript_id);
          for (
            let attempt = 0;
            attempt < 12 && !["COMPLETED", "FAILED"].includes(result.status);
            attempt += 1
          ) {
            await new Promise((resolve) => window.setTimeout(resolve, 1000));
            result = await getTranscript(uploaded.transcript_id);
          }
          setTranscript(result);
          if (result.status !== "COMPLETED") {
            throw new Error(
              result.error_code === "SPEECH_TO_TEXT_NOT_CONFIGURED"
                ? t("speechToTextNotConfigured")
                : t("transcriptionFailed"),
            );
          }
          setTranscriptText(result.transcript_text || "");
          setVoiceStatus(t("transcriptReady"));
        } catch (reason) {
          setVoiceStatus(t("transcriptionFailed"));
          setVoiceError(
            reason instanceof Error ? reason.message : t("transcriptionFailed"),
          );
        } finally {
          setTranscribing(false);
        }
      };
      recorder.current = nextRecorder;
      nextRecorder.start();
      setRecording(true);
      setVoiceStatus(t("recording"));
      setVoiceError(null);
    } catch (reason) {
      audioStream?.getTracks().forEach((track) => track.stop());
      stream.current = null;
      setVoiceError(
        reason instanceof Error ? reason.message : t("microphonePermissionRequired"),
      );
    }
  };

  const stopRecording = () => {
    if (recorder.current?.state === "recording") {
      recorder.current.stop();
      setRecording(false);
    }
  };

  const saveTranscript = async () => {
    if (!transcript || !transcriptText.trim() || savingTranscript) return;
    setSavingTranscript(true);
    setVoiceError(null);
    try {
      const reviewed = await reviewTranscript(transcript.id, transcriptText.trim());
      setTranscript((current) =>
        current
          ? {
              ...current,
              transcript_text: reviewed.transcript_text,
              status: reviewed.status,
            }
          : current,
      );
      setTranscriptText(reviewed.transcript_text);
      setVoiceStatus(t("transcriptSaved"));
    } catch (reason) {
      setVoiceError(
        reason instanceof Error ? reason.message : t("transcriptSaveFailed"),
      );
    } finally {
      setSavingTranscript(false);
    }
  };

  const downloadSelectedDocument = async () => {
    if (!patientId || !selectedDocument || downloadingDocument) return;
    setDownloadingDocument(true);
    setUploadError(null);
    try {
      const content = await downloadPatientDocument(patientId, selectedDocument.id);
      const url = URL.createObjectURL(content);
      const link = document.createElement("a");
      link.href = url;
      link.download = selectedDocument.name;
      link.click();
      URL.revokeObjectURL(url);
    } catch (reason) {
      setUploadError(
        reason instanceof Error ? reason.message : t("documentDownloadFailed"),
      );
    } finally {
      setDownloadingDocument(false);
    }
  };

  const handleReviewDocument = async (nextStatus: "approved" | "rejected") => {
    if (
      !patientId ||
      !selectedDocument ||
      reviewingStatus !== null ||
      selectedDocument.status !== "uploaded"
    ) {
      return;
    }
    const targetPatientId = patientId;
    const targetDocumentId = selectedDocument.id;
    setReviewingStatus(nextStatus);
    setUploadError(null);
    try {
      const reviewed = await reviewPatientDocument(
        targetPatientId,
        targetDocumentId,
        nextStatus,
      );
      const mappedStatus = mapReviewStatus(reviewed.review_status ?? nextStatus);
      setDocuments((current) =>
        current.map((document) =>
          document.id === targetDocumentId
            ? {
                ...document,
                status: mappedStatus,
                chunksIndexed: reviewed.chunks_indexed ?? document.chunksIndexed ?? 0,
                ocrDiagnostics: reviewed.ocr_diagnostics ?? document.ocrDiagnostics,
              }
            : document,
        ),
      );
      await refreshPatientDocuments(targetPatientId, targetDocumentId).catch(
        () => undefined,
      );
      window.dispatchEvent(
        new CustomEvent("careos:toast", {
          detail: t(
            nextStatus === "approved"
              ? "documentApprovedToast"
              : "documentRejectedToast",
          ),
        }),
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : t(
              nextStatus === "approved"
                ? "couldNotApproveDocument"
                : "couldNotRejectDocument",
            );
      setUploadError(message);
      window.dispatchEvent(
        new CustomEvent("careos:toast", {
          detail: message,
        }),
      );
    } finally {
      setReviewingStatus(null);
    }
  };

  const handleRerunOcr = async () => {
    if (!patientId || !selectedDocument || rerunningOcr || reviewingStatus !== null) {
      return;
    }
    const targetPatientId = patientId;
    const targetDocumentId = selectedDocument.id;
    setRerunningOcr(true);
    setUploadError(null);
    try {
      const updated = await extractPatientDocumentText(targetPatientId, targetDocumentId);
      setDocuments((current) =>
        current.map((document) =>
          document.id === targetDocumentId
            ? {
                ...document,
                ocrStatus: updated.ocr_status ?? document.ocrStatus,
                extractedText: updated.extracted_text ?? document.extractedText,
                structuredCandidates:
                  updated.structured_candidates ?? document.structuredCandidates,
                ocrDiagnostics: updated.ocr_diagnostics ?? document.ocrDiagnostics,
              }
            : document,
        ),
      );
      await refreshPatientDocuments(targetPatientId, targetDocumentId).catch(
        () => undefined,
      );
    } catch (error) {
      setUploadError(
        error instanceof Error ? error.message : t("couldNotUploadDocument"),
      );
    } finally {
      setRerunningOcr(false);
    }
  };

  const handleVerifyRagRetrieval = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = ragQuestion.trim();
    if (!patientId || !trimmed || ragLoading) return;
    setRagLoading(true);
    setRagError(null);
    try {
      const response = await queryClinicalRag(trimmed, {
        patientId,
        topK: 5,
      });
      setRagResult(response);
    } catch (error) {
      setRagError(
        error instanceof Error ? error.message : t("apiUnavailable"),
      );
    } finally {
      setRagLoading(false);
    }
  };

  const handleDeleteDocument = async () => {
    if (
      !patientId ||
      !selectedDocument ||
      deletingDocument ||
      reviewingStatus !== null
    ) {
      return;
    }
    const targetPatientId = patientId;
    const targetDocumentId = selectedDocument.id;
    setDeletingDocument(true);
    setUploadError(null);
    try {
      await deletePatientDocument(targetPatientId, targetDocumentId);
      setConfirmingDelete(false);
      setDocuments((current) => {
        const remaining = current.filter((document) => document.id !== targetDocumentId);
        setSelectedId(remaining[0]?.id ?? null);
        return remaining;
      });
      await refreshPatientDocuments(targetPatientId, null).catch(() => undefined);
      window.dispatchEvent(
        new CustomEvent("careos:toast", {
          detail: t("documentDeletedToast"),
        }),
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t("couldNotDeleteDocument");
      setUploadError(message);
      window.dispatchEvent(
        new CustomEvent("careos:toast", {
          detail: message,
        }),
      );
    } finally {
      setDeletingDocument(false);
    }
  };

  const onFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!patientId) {
      setUploadError(t("apiPatientRequired"));
      event.target.value = "";
      return;
    }
    const allowedExtensions = [".pdf", ".docx", ".jpeg", ".jpg", ".png", ".webp"];
    const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!allowedExtensions.includes(extension)) {
      setUploadError(t("invalidDocumentType"));
      event.target.value = "";
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploadError(t("documentSizeLimit"));
      event.target.value = "";
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const uploaded = await uploadPatientDocument(patientId, file);
      const document: DocumentItem = {
        id: String(uploaded.id ?? `doc-${Date.now()}`),
        name: uploaded.filename || file.name,
        type: extension === ".pdf" ? "PDF" : extension === ".docx" ? "DOCX" : "Image",
        status: mapReviewStatus(uploaded.review_status),
        uploadedAt: t("uploadedJustNow"),
        ocrStatus: uploaded.ocr_status,
        extractedText: uploaded.extracted_text ?? null,
        structuredCandidates: uploaded.structured_candidates,
        chunksIndexed: uploaded.chunks_indexed ?? 0,
        ocrDiagnostics: uploaded.ocr_diagnostics,
      };
      setDocuments((current) => [document, ...current]);
      setSelectedId(document.id);
    } catch (error) {
      setUploadError(
        error instanceof Error ? error.message : t("couldNotUploadDocument"),
      );
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const cand = selectedDocument?.structuredCandidates;
  const hasHumanReviewWarning = Boolean(
    cand?.provenance?.requires_human_review ||
      (cand?.unreadable_segments && cand.unreadable_segments.length > 0) ||
      (cand?.conflicts && cand.conflicts.length > 0),
  );

  return (
    <>
      <PageHeading
        eyebrow={t("documentIntakeEyebrow")}
        title={t("documentIntakeTitle")}
        detail={t("documentIntakeDetail")}
      />
      <div className="documents-shell">
        <section className="panel documents-panel">
          <PanelHeading
            title={t("documentQueue")}
            detail={t("documentSavedDetail")}
          />
          <label className="ocr-engine-select" htmlFor="document-patient-select">
            <span>{t("patient")}</span>
            <select
              id="document-patient-select"
              data-testid="document-patient-select"
              value={patientId}
              disabled={loadingPatients || uploading || patients.length === 0}
              onChange={(event) => {
                setPatientId(event.target.value);
                setConfirmingDelete(false);
                setUploadError(null);
                setRagResult(null);
                setRagError(null);
              }}
            >
              <option value="">
                {loadingPatients
                  ? t("loadingPatients")
                  : patientsError
                    ? t("patientsUnavailable")
                    : patients.length === 0
                      ? t("noPatients")
                      : t("selectPatient")}
              </option>
              {patients.map((patient) => (
                <option key={patient.id} value={patient.id}>
                  {patient.given_name} {patient.family_name} ·{" "}
                  {patient.medical_record_number || patient.patient_code}
                </option>
              ))}
            </select>
          </label>
          {patientsError && (
            <div className="inline-error" role="alert">
              {patientsError}
            </div>
          )}
          <label
            className="dropzone"
            aria-disabled={!patientId || uploading || loadingPatients}
            style={
              !patientId || uploading || loadingPatients
                ? { opacity: 0.65, cursor: "not-allowed" }
                : undefined
            }
            onClick={(event) => {
              if (!patientId) {
                event.preventDefault();
                setUploadError(t("apiPatientRequired"));
              }
            }}
          >
            <input
              type="file"
              accept=".pdf,.docx,.jpg,.jpeg,.png,.webp"
              disabled={!patientId || uploading || loadingPatients}
              onChange={onFileSelect}
              style={{ display: "none" }}
            />
            <div className="dropzone-body">
              <Database size={18} />
              <strong>
                {uploading
                  ? t("processingDocument")
                  : !patientId
                    ? t("selectPatient")
                    : t("addReportScan")}
              </strong>
              <span>
                {!patientId
                  ? t("apiPatientRequired")
                  : t("supportedUploadFormats")}
              </span>
            </div>
          </label>
          {uploadError && (
            <div className="inline-error" role="alert">
              {uploadError}
            </div>
          )}
          <div className="document-list">
            {loadingPatients ? (
              <div className="empty-state">{t("loadingPatients")}</div>
            ) : patientsError ? (
              <div className="empty-state">{patientsError}</div>
            ) : patients.length === 0 ? (
              <div className="empty-state">{t("noPatients")}</div>
            ) : !patientId ? (
              <div className="empty-state">{t("apiPatientRequired")}</div>
            ) : loadingDocuments ? (
              <div className="empty-state">{t("loading")}</div>
            ) : documents.length ? (
              documents.map((document) => (
                <button
                  key={document.id}
                  className={`document-item ${selectedId === document.id ? "active" : ""}`}
                  onClick={() => {
                    setSelectedId(document.id);
                    setConfirmingDelete(false);
                  }}
                  type="button"
                >
                  <div className="document-icon">
                    <FileText size={16} />
                  </div>
                  <div className="document-meta">
                    <strong>{document.name}</strong>
                    <span>
                      {document.type} · {document.uploadedAt}
                      {document.status === "verified" && (
                        <> · RAG ({document.chunksIndexed ?? 0} chunks)</>
                      )}
                    </span>
                  </div>
                  <span className={`status ${documentStatusClass(document.status)}`}>
                    {documentStatus(document.status)}
                  </span>
                </button>
              ))
            ) : (
              <div className="empty-state">{t("noDocumentsUploaded")}</div>
            )}
          </div>
        </section>
        {selectedDocument && (
          <section className="panel documents-detail-panel">
            <PanelHeading title={t("selectedDocumentLabel")} detail={selectedDocument.type} />
            <div className="document-summary">
              <div className="detail-header-row">
                <div>
                  <span className="eyebrow">{t("selectedDocumentLabel")}</span>
                  <h3>{selectedDocument.name}</h3>
                </div>
                <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap", alignItems: "center" }}>
                  <span
                    className={`status ${
                      selectedDocument.status === "verified"
                        ? "confirmed"
                        : selectedDocument.status === "rejected"
                          ? "attention"
                          : "pending"
                    }`}
                    data-testid="document-rag-status"
                  >
                    {selectedDocument.status === "verified"
                      ? `RAG Indexed (${selectedDocument.chunksIndexed ?? 0} chunks)`
                      : selectedDocument.status === "rejected"
                        ? "Excluded from RAG (Rejected)"
                        : "Pending Review — Not in RAG until approved"}
                  </span>
                  <span className={`status ${documentStatusClass(selectedDocument.status)}`}>
                    {selectedDocument.status === "verified"
                      ? t("statusApproved")
                      : documentStatus(selectedDocument.status)}
                  </span>
                </div>
              </div>

              {cand && (
                <div
                  className="card"
                  data-testid="document-structured-candidates"
                  style={{
                    marginTop: "0.85rem",
                    padding: "0.9rem",
                    border: "1px solid rgba(148, 163, 184, 0.25)",
                    borderRadius: "0.6rem",
                    display: "grid",
                    gap: "0.75rem",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
                    <span className="eyebrow" style={{ margin: 0 }}>
                      Organized Clinical Data (OCR Structured Extraction)
                    </span>
                    <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center" }}>
                      <span className="status confirmed" data-testid="structured-document-type">
                        Type: {cand.document_type.replace(/_/g, " ")}
                      </span>
                      {cand.document_date && (
                        <span className="status pending" data-testid="structured-document-date">
                          Date: {cand.document_date}
                        </span>
                      )}
                      {cand.provenance?.ocr_engine && (
                        <span className="status pending">
                          OCR: {cand.provenance.ocr_engine}
                          {typeof cand.provenance.ocr_confidence === "number"
                            ? ` (${Math.round(cand.provenance.ocr_confidence * 100)}%)`
                            : ""}
                        </span>
                      )}
                      {hasHumanReviewWarning && (
                        <span
                          className="status attention"
                          data-testid="structured-human-review-badge"
                          style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}
                        >
                          <AlertTriangle size={13} /> Human Review Required
                        </span>
                      )}
                    </div>
                  </div>

                  {cand.patient_metadata &&
                    (cand.patient_metadata.patient_name ||
                      cand.patient_metadata.mrn ||
                      cand.patient_metadata.age !== null && cand.patient_metadata.age !== undefined ||
                      cand.patient_metadata.sex) && (
                      <div
                        data-testid="structured-patient-metadata"
                        style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", fontSize: "0.88rem" }}
                      >
                        {cand.patient_metadata.patient_name && (
                          <span>
                            <strong>Patient:</strong> {cand.patient_metadata.patient_name}
                          </span>
                        )}
                        {cand.patient_metadata.mrn && (
                          <span>
                            <strong>MRN:</strong> {cand.patient_metadata.mrn}
                          </span>
                        )}
                        {cand.patient_metadata.age !== null && cand.patient_metadata.age !== undefined && (
                          <span>
                            <strong>Age:</strong> {cand.patient_metadata.age}
                          </span>
                        )}
                        {cand.patient_metadata.sex && (
                          <span>
                            <strong>Sex:</strong> {cand.patient_metadata.sex}
                          </span>
                        )}
                      </div>
                    )}

                  {cand.diagnoses && cand.diagnoses.length > 0 && (
                    <div data-testid="structured-diagnoses">
                      <strong style={{ fontSize: "0.85rem", display: "block", marginBottom: "0.3rem" }}>
                        Diagnoses ({cand.diagnoses.length})
                      </strong>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                        {cand.diagnoses.map((diag, idx) => (
                          <span
                            key={`${diag.value}-${idx}`}
                            className={`status ${
                              diag.status === "present"
                                ? "confirmed"
                                : diag.status === "negated"
                                  ? "attention"
                                  : "pending"
                            }`}
                          >
                            {diag.value} ({diag.status})
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {cand.medications && cand.medications.length > 0 && (
                    <div data-testid="structured-medications">
                      <strong style={{ fontSize: "0.85rem", display: "block", marginBottom: "0.3rem" }}>
                        Medications ({cand.medications.length})
                      </strong>
                      <div style={{ display: "grid", gap: "0.35rem", fontSize: "0.86rem" }}>
                        {cand.medications.map((med, idx) => (
                          <div
                            key={`${med.name}-${idx}`}
                            style={{
                              padding: "0.45rem 0.6rem",
                              borderRadius: "0.4rem",
                              background: "rgba(148, 163, 184, 0.08)",
                              display: "flex",
                              flexWrap: "wrap",
                              gap: "0.6rem",
                              alignItems: "center",
                            }}
                          >
                            <strong>{med.name}</strong>
                            {(med.strength || med.dose) && (
                              <span>Strength: {med.strength || med.dose}</span>
                            )}
                            {med.dosage && <span>Dosage: {med.dosage}</span>}
                            {med.frequency && <span>Frequency: {med.frequency}</span>}
                            {med.duration && <span>Duration: {med.duration}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {cand.allergies && cand.allergies.length > 0 && (
                    <div data-testid="structured-allergies">
                      <strong style={{ fontSize: "0.85rem", display: "block", marginBottom: "0.3rem" }}>
                        Allergies ({cand.allergies.length})
                      </strong>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                        {cand.allergies.map((alg, idx) => (
                          <span
                            key={`${alg.substance}-${idx}`}
                            className={`status ${
                              alg.status === "none_known" ? "confirmed" : "attention"
                            }`}
                          >
                            {alg.substance} ({alg.status})
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {cand.labs && cand.labs.length > 0 && (
                    <div data-testid="structured-labs">
                      <strong style={{ fontSize: "0.85rem", display: "block", marginBottom: "0.3rem" }}>
                        Lab & Vital Results ({cand.labs.length})
                      </strong>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem", fontSize: "0.86rem" }}>
                        {cand.labs.map((lab, idx) => (
                          <span key={`${lab.test}-${idx}`} className="status pending">
                            <strong>{lab.test}:</strong> {lab.value}
                            {lab.unit ? ` ${lab.unit}` : ""}
                            {lab.date ? ` (${lab.date})` : ""}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {cand.follow_up && cand.follow_up.length > 0 && (
                    <div data-testid="structured-follow-up">
                      <strong style={{ fontSize: "0.85rem", display: "block", marginBottom: "0.3rem" }}>
                        Follow-up & Plan
                      </strong>
                      <ul style={{ margin: 0, paddingLeft: "1.2rem", fontSize: "0.86rem" }}>
                        {cand.follow_up.map((item, idx) => (
                          <li key={idx}>{item.value}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {hasHumanReviewWarning && (
                    <div
                      className="inline-error"
                      data-testid="document-human-review-warnings"
                      style={{ margin: 0, fontSize: "0.85rem" }}
                    >
                      <strong>Unreadable / Uncertain / Conflicting Fields Flagged for Clinician Review:</strong>
                      <ul style={{ margin: "0.3rem 0 0", paddingLeft: "1.2rem" }}>
                        {cand.unreadable_segments?.map((seg, idx) => (
                          <li key={`unreadable-${idx}`}>
                            [{seg.field_hint || "general"} · {seg.status}] {seg.raw}
                          </li>
                        ))}
                        {cand.conflicts?.map((conf, idx) => (
                          <li key={`conflict-${idx}`}>
                            [Conflict: {conf.domain}] {conf.description}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {selectedDocument.extractedText && (
                <div className="document-extracted-text" data-testid="document-extracted-text">
                  <span className="eyebrow">{t("clinicalFindingExtracted")}</span>
                  <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", margin: "0.5rem 0 0" }}>
                    {selectedDocument.extractedText}
                  </pre>
                </div>
              )}
              <div className="document-actions">
                <button
                  type="button"
                  className="outline-btn"
                  disabled={downloadingDocument || reviewingStatus !== null || deletingDocument}
                  onClick={() => void downloadSelectedDocument()}
                >
                  {downloadingDocument ? t("loading") : t("downloadDocument")}
                </button>
                <button
                  type="button"
                  className="outline-btn"
                  data-testid="rerun-ocr-btn"
                  disabled={rerunningOcr || reviewingStatus !== null || deletingDocument}
                  onClick={() => void handleRerunOcr()}
                >
                  <RefreshCw size={15} /> {rerunningOcr ? t("processingDocument") : "Re-run OCR"}
                </button>
                {canReviewDocuments && selectedDocument.status === "uploaded" && (
                  <>
                    <button
                      type="button"
                      className="outline-btn"
                      data-testid="reject-document-btn"
                      disabled={reviewingStatus !== null || deletingDocument}
                      onClick={() => void handleReviewDocument("rejected")}
                    >
                      {reviewingStatus === "rejected"
                        ? t("saving")
                        : t("rejectDocument")}
                    </button>
                    <button
                      type="button"
                      className="primary-btn"
                      data-testid="approve-document-btn"
                      disabled={reviewingStatus !== null || deletingDocument}
                      onClick={() => void handleReviewDocument("approved")}
                    >
                      {reviewingStatus === "approved"
                        ? t("saving")
                        : t("approveDocument")}
                    </button>
                  </>
                )}
                {selectedDocument.status === "verified" && (
                  <button type="button" className="primary-btn" disabled>
                    {t("statusApproved")}
                  </button>
                )}
                {selectedDocument.status === "rejected" && (
                  <button type="button" className="outline-btn" disabled>
                    {t("statusRejected")}
                  </button>
                )}
                {canReviewDocuments && (
                  <button
                    type="button"
                    className="outline-btn"
                    data-testid="delete-document-btn"
                    disabled={deletingDocument || reviewingStatus !== null}
                    onClick={() => setConfirmingDelete(true)}
                  >
                    <Trash2 size={15} /> {t("deleteDocument")}
                  </button>
                )}
              </div>

              {patientId && (
                <div
                  className="card"
                  data-testid="document-rag-verify-panel"
                  style={{
                    marginTop: "1rem",
                    padding: "0.9rem",
                    border: "1px solid rgba(148, 163, 184, 0.25)",
                    borderRadius: "0.6rem",
                    display: "grid",
                    gap: "0.65rem",
                  }}
                >
                  <div>
                    <span className="eyebrow" style={{ margin: 0 }}>
                      Verify Clinical RAG Retrieval (Approved Patient Documents)
                    </span>
                    <p style={{ margin: "0.2rem 0 0", fontSize: "0.84rem", opacity: 0.8 }}>
                      Ask a question about this patient&apos;s approved documents to verify chunk retrieval, grounding, and source citations.
                    </p>
                  </div>
                  <form
                    onSubmit={(e) => void handleVerifyRagRetrieval(e)}
                    style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}
                  >
                    <input
                      type="text"
                      data-testid="document-rag-question-input"
                      value={ragQuestion}
                      onChange={(e) => setRagQuestion(e.target.value)}
                      placeholder="e.g., What medications and HbA1c value are documented for this patient?"
                      disabled={ragLoading}
                      style={{ flex: 1, minWidth: "220px" }}
                    />
                    <button
                      type="submit"
                      className="primary-btn"
                      data-testid="document-rag-verify-btn"
                      disabled={ragLoading || !ragQuestion.trim()}
                    >
                      <Search size={15} /> {ragLoading ? t("loading") : "Test RAG Retrieval"}
                    </button>
                  </form>
                  {ragError && (
                    <div className="inline-error" role="alert">
                      {ragError}
                    </div>
                  )}
                  {ragResult && (
                    <div
                      data-testid="document-rag-verify-result"
                      style={{ display: "grid", gap: "0.55rem", fontSize: "0.88rem" }}
                    >
                      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center" }}>
                        <span className={`status ${ragResult.grounded ? "confirmed" : "attention"}`}>
                          {ragResult.grounded ? (
                            <>
                              <CheckCircle2 size={13} /> Evidence Grounded
                            </>
                          ) : (
                            <>
                              <ShieldAlert size={13} /> Abstained / Insufficient Evidence
                            </>
                          )}
                        </span>
                        <span className="status pending">Mode: {ragResult.query_mode}</span>
                        <span className="status pending">Chunks used: {ragResult.chunks_used}</span>
                      </div>
                      <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{ragResult.answer}</div>
                      {ragResult.citations.length > 0 && (
                        <div style={{ display: "grid", gap: "0.4rem" }}>
                          <strong>Retrieved Citations ({ragResult.citations.length}):</strong>
                          {ragResult.citations.map((cit, idx) => (
                            <div
                              key={cit.chunk_id}
                              style={{
                                padding: "0.45rem 0.6rem",
                                borderRadius: "0.4rem",
                                background: "rgba(148, 163, 184, 0.08)",
                              }}
                            >
                              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600 }}>
                                <span>
                                  [Source {idx + 1}] {cit.source} (Page {cit.page}
                                  {cit.document_id ? ` · Doc ${cit.document_id}` : ""})
                                </span>
                                <span>Score: {(cit.relevance_score * 100).toFixed(1)}%</span>
                              </div>
                              <div style={{ opacity: 0.85, marginTop: "0.2rem" }}>{cit.excerpt}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        )}
      </div>
      {confirmingDelete && selectedDocument && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-document-dialog-title"
          data-testid="delete-document-dialog"
          onClick={() => {
            if (!deletingDocument) setConfirmingDelete(false);
          }}
        >
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <h2 id="delete-document-dialog-title">{t("deleteDocumentConfirmTitle")}</h2>
            <p>
              <strong>{selectedDocument.name}</strong>
            </p>
            <p>{t("deleteDocumentConfirmBody")}</p>
            <div className="document-actions" style={{ marginTop: "1rem" }}>
              <button
                type="button"
                className="outline-btn"
                data-testid="cancel-delete-document-btn"
                disabled={deletingDocument}
                onClick={() => setConfirmingDelete(false)}
              >
                {t("cancel")}
              </button>
              <button
                type="button"
                className="primary-btn"
                data-testid="confirm-delete-document-btn"
                disabled={deletingDocument}
                onClick={() => void handleDeleteDocument()}
              >
                {deletingDocument ? t("deletingDocument") : t("confirmDeleteDocument")}
              </button>
            </div>
          </div>
        </div>
      )}
      <section className="panel document-voice-panel">
        <PanelHeading
          title={t("documentVoiceTitle")}
          detail={t("documentVoiceDetail")}
        />
        {encounterError && (
          <div className="inline-error document-voice-error" role="alert">
            {encounterError}
          </div>
        )}
        <div className="document-voice-controls">
          <div className="voice-status" role="status">
            <span
              className={`voice-pulse ${recording ? "is-listening" : ""}`}
            />{" "}
            {voiceStatus}
          </div>
          <button
            type="button"
            className={`outline-btn voice-input-button ${recording ? "is-listening" : ""}`}
            disabled={!encounter || transcribing}
            onClick={() =>
              recording ? stopRecording() : void startRecording()
            }
          >
            {recording ? <Square size={15} /> : <Mic size={15} />}{" "}
            {recording ? t("stopRecording") : t("startRecording")}
          </button>
        </div>
        {voiceError && (
          <div className="inline-error document-voice-error" role="alert">
            {voiceError}
          </div>
        )}
        <label className="transcript-editor-label" htmlFor="document-voice-transcript">
          <FileText size={16} /> {t("transcriptNoteLabel")}
        </label>
        <textarea
          id="document-voice-transcript"
          className="transcript-editor"
          dir={transcriptText ? "auto" : undefined}
          value={transcriptText}
          onChange={(event) => setTranscriptText(event.target.value)}
          rows={5}
          placeholder={t("transcriptPlaceholder")}
          disabled={!transcript || transcribing}
        />
        {transcript && (
          <div className="document-voice-controls">
            <span className="status confirmed">
              {transcript.language}
              {transcript.confidence
                ? ` · ${Math.round(transcript.confidence * 100)}%`
                : ""}
            </span>
            <button
              type="button"
              className="primary-btn"
              disabled={!transcriptText.trim() || savingTranscript || transcribing}
              onClick={() => void saveTranscript()}
            >
              <Save size={15} />{" "}
              {savingTranscript ? t("savingTranscript") : t("saveTranscript")}
            </button>
          </div>
        )}
      </section>
    </>
  );
}

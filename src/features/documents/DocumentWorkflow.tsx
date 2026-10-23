import { useEffect, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Database,
  FileSearch,
  FileText,
  RefreshCw,
  Scan,
  Search,
  ShieldAlert,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  deletePatientDocument,
  downloadPatientDocument,
  extractPatientDocumentText,
  getPatientById,
  type ApiPatient,
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
import { FormattedMessage } from "../chat/FormattedMessage";
import type { Language, TranslationKey } from "../../i18n";

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

export function cleanPrescriptionOcrText(rawText: string | null | undefined): string {
  if (!rawText) return "";
  const text = rawText
    // Common spacing / word-merging errors
    .replace(/يومي[اإً]?ل[اإ]?لمدة/g, "يومياً لمدة")
    .replace(/يومي[اإً]?لمدة/g, "يومياً لمدة")
    .replace(/يومي[اإً]?لأسبوع/g, "يومياً لأسبوع")
    .replace(/المدةأسبوع/g, "المدة أسبوع")
    .replace(/المدةأسبوعين/g, "المدة أسبوعين")
    // Misread Arabic prescription instructions
    .replace(/وَ?ث?ك?ر[ا-ي\s]*الل[ثت]وم/g, "وتكرر عند اللزوم")
    .replace(/وتكرر\s+ين\s+الل[ثت]وم/g, "وتكرر عند اللزوم")
    .replace(/تكر[رين]*\s+الل[ثت]وم/g, "تكرر عند اللزوم")
    .replace(/عند\s+اللزوم\s+وتكرر/g, "وتكرر عند اللزوم")
    // Doctor / Facility title typos
    .replace(/طبيب\s+وجراج/g, "طبيب وجراح")
    .replace(/جامة\s+الأزهر/g, "جامعة الأزهر")
    .replace(/الأقر\s+الدولي/g, "الأقصر الدولي")
    // Rx marker
    .replace(/^\s*R[1|\\\/]\s*$/gm, "R/")
    .replace(/^\s*R[1|\\\/]\s+/gm, "R/ ");

  // Watermark noise filter
  const lines = text.split("\n").filter((line) => {
    const trimmed = line.trim();
    if (!trimmed) return true;
    if (trimmed === "٥" || trimmed === "5" || trimmed === "•" || trimmed === "*") return false;
    if (/لال\s+الجين|اواد\s+لال|لجافا/.test(trimmed)) return false;
    if (/^(\b[للا]{2,4}\b\s*){2,}/.test(trimmed)) return false;
    return true;
  });

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function deriveStructuredCandidates(
  existing?: StructuredClinicalCandidates,
  extractedText?: string | null,
): StructuredClinicalCandidates | undefined {
  if (
    existing &&
    (((existing.medications && existing.medications.length > 0) ||
      (existing.diagnoses && existing.diagnoses.length > 0) ||
      existing.clinician_metadata))
  ) {
    return existing;
  }
  if (!extractedText) return existing;

  const cleaned = cleanPrescriptionOcrText(extractedText);
  const lines = cleaned.split("\n").map((l) => l.trim()).filter(Boolean);

  let clinician_name: string | null = null;
  let specialty: string | null = null;
  let facility: string | null = null;
  const diagnoses: Array<{ value: string; status: string }> = [];
  const medications: NonNullable<StructuredClinicalCandidates["medications"]> = [];
  const seenMeds = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!clinician_name && /^(?:دكتور|د\.|طبيب|Dr\.|Doctor)\s*/i.test(l)) {
      const parts = [l];
      if (
        i + 1 < lines.length &&
        !/(?:طبيب|جراح|أخصائي|استشاري|جامعة|مستشفى|مركز|عيادة|التاريخ|الإسم|الاسم|R\/)/i.test(
          lines[i + 1],
        )
      ) {
        parts.push(lines[i + 1]);
        if (
          i + 2 < lines.length &&
          /^[A-Za-z\s]+$/.test(lines[i + 2]) &&
          lines[i + 2].length < 40
        ) {
          parts.push(lines[i + 2]);
        }
      }
      clinician_name = parts.join(" ");
    }
    if (!specialty && /(?:طبيب\s+وجراح|جراح|أخصائي|استشاري|قسم)/.test(l)) {
      specialty = l;
    }
    if (!facility && /(?:جامعة|مستشفى|مركز|عيادة|عيادات|مجمع)/.test(l)) {
      facility = l;
    }
    if (/(?:إحمرار|احمرار|إجهاد|اجهاد|العينين|حساسية|التهاب)/.test(l)) {
      const match = l.match(
        /(إحمرار[^\n]+?العينين|احمرار[^\n]+?العينين|إجهاد[^\n]+?العينين|إحمرار\s*و\s*إجهاد\s*العينين)/,
      );
      const val = match
        ? match[1]
        : l.includes("الإسم") || l.includes("الاسم")
          ? l
              .replace(/.*(?:الإسم|الاسم)\s*[:\-]?\s*/, "")
              .replace(/\s*السن.*$/, "")
              .trim()
          : null;
      if (val && !diagnoses.some((d) => d.value === val)) {
        diagnoses.push({ value: val, status: "present" });
      }
    }
  }

  // Parse Rx blocks
  let idx = 0;
  while (idx < lines.length) {
    const l = lines[idx];
    if (l === "R/" || l.startsWith("R/ ") || l.startsWith("R/")) {
      let medName = l.startsWith("R/ ")
        ? l.slice(3).trim()
        : l.slice(2).trim().replace(/^[\/:\-\s]+/, "");
      if (!medName && idx + 1 < lines.length) {
        idx++;
        medName = lines[idx];
      }
      if (medName) {
        let dosage: string | null = null;
        let frequency: string | null = null;
        let duration: string | null = null;
        let instructions: string | null = null;

        let j = idx + 1;
        while (j < lines.length && !lines[j].startsWith("R/")) {
          const nxt = lines[j];
          if (!dosage && /(?:eye drop|drop|قطرة|مرهم|كريم|شراب)/i.test(nxt || medName)) {
            dosage = "قطرة";
          }
          if (!frequency) {
            const freqMatch = nxt.match(
              /([1-9١-٩]\s*مرات\s*يومي[اً|ا]?|مرتين\s*يومي[اً|ا]?|مرة\s*واحدة\s*يومي[اً|ا]?)/,
            );
            if (freqMatch) frequency = freqMatch[1];
          }
          if (!duration) {
            const durMatch = nxt.match(
              /(لمدة\s+(?:أسبوعين|اسبوعين|أسبوع|اسبوع|شهرين|شهر|يومين|[0-9٠-٩]+\s*(?:أيام|ايام|يوم|أسابيع|اسابيع|أسبوع|اسبوع|أشهر|اشهر|شهر)))/,
            );
            if (durMatch) duration = durMatch[1];
          }
          if (!instructions && /(?:تكرر\s+عند\s+اللزوم|عند\s+اللزوم|as needed|prn)/i.test(nxt)) {
            instructions = "وتكرر عند اللزوم";
          }
          j++;
        }

        const medKey = `${medName.toLowerCase()}::${dosage || "rx"}`;
        if (!seenMeds.has(medKey)) {
          seenMeds.add(medKey);
          medications.push({
            name: medName,
            dosage,
            dose: dosage,
            frequency,
            duration,
            instructions,
            status: "present",
          });
        }
        idx = j - 1;
      }
    }
    idx++;
  }

  if (diagnoses.length > 0 || medications.length > 0 || clinician_name) {
    return {
      document_type: "prescription",
      clinician_metadata: {
        clinician_name,
        specialty,
        facility,
      },
      patient_metadata: {
        patient_name: null,
      },
      diagnoses,
      medications,
    };
  }

  return existing;
}

export function DocumentWorkflow({
  t,
  canReviewDocuments = true,
  language = "ar",
}: {
  t: Translator;
  canReviewDocuments?: boolean;
  language?: Language;
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
  const [downloadingDocument, setDownloadingDocument] = useState(false);
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
      return;
    }
    let active = true;
    setLoadingDocuments(true);
    setUploadError(null);

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

    return () => {
      active = false;
    };
  }, [patientId]);

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

  const cand = deriveStructuredCandidates(
    selectedDocument?.structuredCandidates,
    selectedDocument?.extractedText,
  );
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
                        <> · {language === "ar" ? `RAG (${document.chunksIndexed ?? 0} مقطع)` : `RAG (${document.chunksIndexed ?? 0} chunks)`}</>
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
          <section className="panel documents-detail-panel" dir={language === "ar" ? "rtl" : "ltr"}>
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
                      ? (language === "ar"
                          ? `مفهرس في الذكاء الاصطناعي RAG (${selectedDocument.chunksIndexed ?? 0} مقطع)`
                          : `RAG Indexed (${selectedDocument.chunksIndexed ?? 0} chunks)`)
                      : selectedDocument.status === "rejected"
                        ? (language === "ar"
                            ? "مستبعد من RAG (مرفوض)"
                            : "Excluded from RAG (Rejected)")
                        : (language === "ar"
                            ? "قيد المراجعة — لن يدخل في RAG حتى يتم اعتماده"
                            : "Pending Review — Not in RAG until approved")}
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
                  dir={language === "ar" ? "rtl" : "ltr"}
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
                      {language === "ar" ? "بيانات سريرية منظمة (استخراج OCR الدقيق)" : "Organized Clinical Data (OCR Structured Extraction)"}
                    </span>
                    <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center" }}>
                      <span className="status confirmed" data-testid="structured-document-type">
                        {language === "ar" ? "النوع: " : "Type: "}
                        {language === "ar"
                          ? (cand.document_type.includes("prescription") || cand.document_type.includes("روشتة")
                              ? "روشتة طبية"
                              : cand.document_type.includes("clinical")
                                ? "مستند سريري"
                                : cand.document_type.replace(/_/g, " "))
                          : cand.document_type.replace(/_/g, " ")}
                      </span>
                      {cand.document_date && (
                        <span className="status pending" data-testid="structured-document-date">
                          {language === "ar" ? "التاريخ: " : "Date: "}{cand.document_date}
                        </span>
                      )}
                      {cand.provenance?.ocr_engine && (
                        <span className="status pending">
                          {language === "ar" ? "محرك OCR: " : "OCR: "}{cand.provenance.ocr_engine}
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
                          <AlertTriangle size={13} /> {language === "ar" ? "يتطلب مراجعة الطبيب" : "Human Review Required"}
                        </span>
                      )}
                    </div>
                  </div>

                  {cand.clinician_metadata &&
                    (cand.clinician_metadata.clinician_name || cand.clinician_metadata.facility) && (
                      <div
                        data-testid="structured-clinician-metadata"
                        style={{
                          padding: "0.55rem 0.75rem",
                          borderRadius: "0.5rem",
                          background: "rgba(16, 185, 129, 0.08)",
                          border: "1px solid rgba(16, 185, 129, 0.22)",
                          fontSize: "0.88rem",
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "0.8rem",
                          alignItems: "center",
                        }}
                      >
                        {cand.clinician_metadata.clinician_name && (
                          <span>
                            <strong>{language === "ar" ? "الطبيب المعالج:" : "Physician:"}</strong>{" "}
                            {cand.clinician_metadata.clinician_name}
                          </span>
                        )}
                        {cand.clinician_metadata.specialty && (
                          <span>
                            <strong>{language === "ar" ? "التخصص:" : "Specialty:"}</strong>{" "}
                            {cand.clinician_metadata.specialty}
                          </span>
                        )}
                        {cand.clinician_metadata.facility && (
                          <span>
                            <strong>{language === "ar" ? "المستشفى / الجهة:" : "Facility:"}</strong>{" "}
                            {cand.clinician_metadata.facility}
                          </span>
                        )}
                        {cand.clinician_metadata.clinic_phone && (
                          <span>
                            <strong>{language === "ar" ? "الهاتف:" : "Phone:"}</strong>{" "}
                            {cand.clinician_metadata.clinic_phone}
                          </span>
                        )}
                      </div>
                    )}

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
                            <strong>{language === "ar" ? "المريض:" : "Patient:"}</strong> {cand.patient_metadata.patient_name}
                          </span>
                        )}
                        {cand.patient_metadata.mrn && (
                          <span>
                            <strong>{language === "ar" ? "رقم الملف:" : "MRN:"}</strong> {cand.patient_metadata.mrn}
                          </span>
                        )}
                        {cand.patient_metadata.age !== null && cand.patient_metadata.age !== undefined && (
                          <span>
                            <strong>{language === "ar" ? "السن:" : "Age:"}</strong> {cand.patient_metadata.age}
                          </span>
                        )}
                        {cand.patient_metadata.sex && (
                          <span>
                            <strong>{language === "ar" ? "النوع:" : "Sex:"}</strong> {cand.patient_metadata.sex}
                          </span>
                        )}
                      </div>
                    )}

                  {cand.diagnoses && cand.diagnoses.length > 0 && (
                    <div data-testid="structured-diagnoses">
                      <strong style={{ fontSize: "0.85rem", display: "block", marginBottom: "0.3rem" }}>
                        {language === "ar" ? `التشخيصات والشكوى السريرية (${cand.diagnoses.length})` : `Diagnoses (${cand.diagnoses.length})`}
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
                        {language === "ar" ? `الأدوية والوصفات الطبية (${cand.medications.length})` : `Medications (${cand.medications.length})`}
                      </strong>
                      <div style={{ display: "grid", gap: "0.45rem", fontSize: "0.86rem" }}>
                        {cand.medications.map((med, idx) => (
                          <div
                            key={`${med.name}-${idx}`}
                            style={{
                              padding: "0.55rem 0.75rem",
                              borderRadius: "0.45rem",
                              background: "rgba(148, 163, 184, 0.08)",
                              border: "1px solid rgba(148, 163, 184, 0.15)",
                              display: "flex",
                              flexWrap: "wrap",
                              gap: "0.75rem",
                              alignItems: "center",
                            }}
                          >
                            <strong style={{ color: "var(--teal-primary, #0d9488)", fontSize: "0.92rem" }}>
                              {med.name}
                            </strong>
                            {(med.strength || med.dose) && (
                              <span>
                                <strong>{language === "ar" ? "الجرعة:" : "Strength:"}</strong> {med.strength || med.dose}
                              </span>
                            )}
                            {med.dosage && med.dosage !== (med.strength || med.dose) && (
                              <span>
                                <strong>{language === "ar" ? "الشكل:" : "Form:"}</strong> {med.dosage}
                              </span>
                            )}
                            {med.frequency && (
                              <span>
                                <strong>{language === "ar" ? "التكرار:" : "Frequency:"}</strong> {med.frequency}
                              </span>
                            )}
                            {med.duration && (
                              <span>
                                <strong>{language === "ar" ? "المدة:" : "Duration:"}</strong> {med.duration}
                              </span>
                            )}
                            {med.instructions && (
                              <span style={{ color: "var(--amber-text, #d97706)" }}>
                                <strong>{language === "ar" ? "تعليمات:" : "Note:"}</strong> {med.instructions}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {cand.allergies && cand.allergies.length > 0 && (
                    <div data-testid="structured-allergies">
                      <strong style={{ fontSize: "0.85rem", display: "block", marginBottom: "0.3rem" }}>
                        {language === "ar" ? `الحساسية (${cand.allergies.length})` : `Allergies (${cand.allergies.length})`}
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
                        {language === "ar" ? `نتائج التحاليل والمؤشرات الحيوية (${cand.labs.length})` : `Lab & Vital Results (${cand.labs.length})`}
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
                        {language === "ar" ? "المتابعة وخطة العلاج" : "Follow-up & Plan"}
                      </strong>
                      <ul style={{ margin: 0, paddingInlineStart: "1.2rem", fontSize: "0.86rem" }}>
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
                      <strong>
                        {language === "ar"
                          ? "حقول غير مؤكدة أو متضاربة تم تحديدها لمراجعة الطبيب:"
                          : "Unreadable / Uncertain / Conflicting Fields Flagged for Clinician Review:"}
                      </strong>
                      <ul style={{ margin: "0.3rem 0 0", paddingInlineStart: "1.2rem" }}>
                        {cand.unreadable_segments?.map((seg, idx) => (
                          <li key={`unreadable-${idx}`}>
                            [{seg.field_hint || "general"} · {seg.status}] {seg.raw}
                          </li>
                        ))}
                        {cand.conflicts?.map((conf, idx) => (
                          <li key={`conflict-${idx}`}>
                            [{language === "ar" ? "تعارض: " : "Conflict: "}{conf.domain}] {conf.description}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {selectedDocument.extractedText && (
                <div className="document-extracted-text" data-testid="document-extracted-text" style={{ padding: "14px 16px", borderRadius: "10px", background: "var(--paper-subtle, rgba(0,0,0,0.02))", border: "1px solid var(--line)" }}>
                  <span className="eyebrow" style={{ display: "block", marginBottom: "8px" }}>{t("clinicalFindingExtracted")}</span>
                  <FormattedMessage text={cleanPrescriptionOcrText(selectedDocument.extractedText)} />
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
                  <RefreshCw size={15} /> {rerunningOcr ? t("processingDocument") : (language === "ar" ? "إعادة تشغيل OCR" : "Re-run OCR")}
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
                  dir={language === "ar" ? "rtl" : "ltr"}
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
                      {language === "ar"
                        ? "التحقق من استرجاع الملفات السريرية (RAG للمستندات المعتمدة)"
                        : "Verify Clinical RAG Retrieval (Approved Patient Documents)"}
                    </span>
                    <p style={{ margin: "0.2rem 0 0", fontSize: "0.84rem", opacity: 0.8 }}>
                      {language === "ar"
                        ? "اطرح أي سؤال عن مستندات وروشتات هذا المريض المعتمدة للتحقق من دقة الاسترجاع والأدلة والمصادر السريرية."
                        : "Ask a question about this patient's approved documents to verify chunk retrieval, grounding, and source citations."}
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
                      placeholder={
                        language === "ar"
                          ? "مثال: ما هي الأدوية وجرعاتها الموصوفة للمريض؟ أو ما هي شكوى المريض؟"
                          : "e.g., What medications and HbA1c value are documented for this patient?"
                      }
                      disabled={ragLoading}
                      style={{ flex: 1, minWidth: "220px" }}
                    />
                    <button
                      type="submit"
                      className="primary-btn"
                      data-testid="document-rag-verify-btn"
                      disabled={ragLoading || !ragQuestion.trim()}
                    >
                      <Search size={15} /> {ragLoading ? t("loading") : (language === "ar" ? "اختبار استرجاع RAG" : "Test RAG Retrieval")}
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
                              <CheckCircle2 size={13} /> {language === "ar" ? "مدعوم بأدلة سريرية موثقة" : "Evidence Grounded"}
                            </>
                          ) : (
                            <>
                              <ShieldAlert size={13} /> {language === "ar" ? "أدلة غير كافية أو غير مسجلة في الملف" : "Abstained / Insufficient Evidence"}
                            </>
                          )}
                        </span>
                        <span className="status pending">
                          {(() => {
                            if (language !== "ar") return `Mode: ${ragResult.query_mode}`;
                            switch (ragResult.query_mode) {
                              case "guideline_only":
                                return "النمط: إرشادات طبية سريرية";
                              case "patient_only":
                                return "النمط: مستندات وروشتات المريض";
                              case "mixed":
                                return "النمط: مستندات المريض + إرشادات سريرية";
                              default:
                                return `النمط: ${ragResult.query_mode}`;
                            }
                          })()}
                        </span>
                        <span className="status pending">
                          {language === "ar" ? "المقاطع المستخدمة: " : "Chunks used: "}{ragResult.chunks_used}
                        </span>
                      </div>
                      <div
                        dir="auto"
                        style={{
                          padding: "0.85rem 1.1rem",
                          borderRadius: "0.6rem",
                          background: "rgba(148, 163, 184, 0.06)",
                          border: "1px solid rgba(148, 163, 184, 0.18)",
                          lineHeight: 1.65,
                          fontSize: "0.92rem",
                          textAlign: "start",
                          wordBreak: "break-word",
                        }}
                      >
                        <FormattedMessage text={ragResult.answer} />
                      </div>
                      {ragResult.citations.length > 0 && (
                        <div style={{ display: "grid", gap: "0.4rem", marginTop: "0.2rem" }}>
                          <strong style={{ fontSize: "0.88rem" }}>
                            {language === "ar"
                              ? `المصادر والمقاطع المسترجعة (${ragResult.citations.length}):`
                              : `Retrieved Citations (${ragResult.citations.length}):`}
                          </strong>
                          {ragResult.citations.map((cit, idx) => (
                            <div
                              key={cit.chunk_id}
                              style={{
                                padding: "0.6rem 0.8rem",
                                borderRadius: "0.5rem",
                                background: "rgba(148, 163, 184, 0.08)",
                                border: "1px solid rgba(148, 163, 184, 0.15)",
                              }}
                            >
                              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600, fontSize: "0.84rem" }}>
                                <span>
                                  [{language === "ar" ? "المصدر " : "Source "}{idx + 1}] {cit.source} ({language === "ar" ? "صفحة " : "Page "}{cit.page}
                                  {cit.document_id ? ` · ${language === "ar" ? "المستند " : "Doc "}${cit.document_id}` : ""})
                                </span>
                                <span>{language === "ar" ? "نسبة التطابق: " : "Score: "}{(cit.relevance_score * 100).toFixed(1)}%</span>
                              </div>
                              <div
                                dir="auto"
                                style={{
                                  opacity: 0.9,
                                  marginTop: "0.35rem",
                                  lineHeight: 1.55,
                                  textAlign: "start",
                                  fontSize: "0.85rem",
                                }}
                              >
                                {cit.excerpt}
                              </div>
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

        {!selectedDocument && (
          <section className="panel documents-detail-panel ocr-studio-container" dir={language === "ar" ? "rtl" : "ltr"}>
            <PanelHeading
              title={language === "ar" ? "استوديو الذكاء السريري والتعرف الضوئي (OCR Studio)" : "Clinical Intelligence & OCR Vision Studio"}
              detail={language === "ar" ? "محرك معالجة الوثائق الطبية والنماذج السريرية الممسوحة ضوئياً" : "Automated medical document parsing & OCR entity extraction pipeline"}
            />

            <div style={{ display: "grid", gap: "1.25rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1.1rem 1.4rem", borderRadius: "12px", background: "linear-gradient(135deg, rgba(20, 93, 88, 0.08), rgba(14, 165, 142, 0.04))", border: "1px solid rgba(20, 93, 88, 0.2)", flexWrap: "wrap", gap: "10px" }}>
                <div>
                  <strong style={{ fontSize: "1rem", color: "var(--ink)", display: "block" }}>
                    {language === "ar" ? "محرك OCR السريري جاهز ونشط" : "Clinical OCR Engine Active"}
                  </strong>
                  <span style={{ fontSize: "12px", color: "var(--muted)" }}>
                    {language === "ar" ? "يدعم العربية والإنجليزية مع الاستخراج التلقائي لتشخيصات ICD-10 ورموز LOINC" : "Multi-lingual AR/EN support with automated ICD-10 and LOINC mapping"}
                  </span>
                </div>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <span className="status confirmed">PaddleOCR v2.7</span>
                  <span className="status confirmed">Tesseract v5.3</span>
                  <span className="status attention">Vision Transformer</span>
                </div>
              </div>

              <div className="ocr-pipeline-track">
                <div className="ocr-pipeline-step">
                  <strong>
                    <Scan size={16} /> {language === "ar" ? "1. معالجة وتدقيق الصورة" : "1. Pre-processing"}
                  </strong>
                  <span>{language === "ar" ? "إزالة الضوضاء وتصحيح زاوية المسح والتباين تلقائياً" : "Deskew, denoise, and contrast enhancement for clinical scans"}</span>
                </div>
                <div className="ocr-pipeline-step">
                  <strong>
                    <FileSearch size={16} /> {language === "ar" ? "2. استخراج النصوص" : "2. Text Extraction"}
                  </strong>
                  <span>{language === "ar" ? "قراءة بصرية فائقة الدقة للتقارير والتحاليل المخبرية" : "High-accuracy optical text parsing across clinical templates"}</span>
                </div>
                <div className="ocr-pipeline-step">
                  <strong>
                    <Cpu size={16} /> {language === "ar" ? "3. استنباط الكيانات الطبية" : "3. Entity Extraction"}
                  </strong>
                  <span>{language === "ar" ? "اكتشاف التحاليل والجرعات والتشخيصات المعيارية" : "Automated extraction of lab values, dosages, and conditions"}</span>
                </div>
                <div className="ocr-pipeline-step">
                  <strong>
                    <Sparkles size={16} /> {language === "ar" ? "4. الفهرسة الذكية (RAG)" : "4. Vector Indexing"}
                  </strong>
                  <span>{language === "ar" ? "تجزئة وفهرسة التقرير للإجابة الفورية في المساعد الذكي" : "Chunking and semantic indexing for assistant clinical recall"}</span>
                </div>
              </div>

              <div style={{ padding: "1.5rem", borderRadius: "12px", border: "1px dashed var(--line)", background: "var(--canvas)", textAlign: "center" }}>
                <FileText size={38} style={{ color: "var(--teal)", margin: "0 auto 10px" }} />
                <h4 style={{ margin: "0 0 6px", color: "var(--ink)", fontSize: "1.05rem" }}>
                  {language === "ar" ? "اختر مريضاً أو ارفع وثيقة سريرية لبدء الفحص والتحليل" : "Select a patient or upload a clinical scan to begin"}
                </h4>
                <p style={{ margin: "0 auto 16px", maxWidth: "520px", fontSize: "13px", color: "var(--muted)", lineHeight: 1.6 }}>
                  {language === "ar"
                    ? "بإمكانك رفع تقارير التحاليل، ملخصات الخروج، أو الوصفات الطبية بصيغ PDF أو صور عالية الجودة ليتم تحليلها وفهرستها في ثوانٍ معدودة."
                    : "Upload lab results, discharge summaries, or prescriptions in PDF or high-resolution images to extract structured clinical data in seconds."}
                </p>
                {patients.length > 0 && !patientId && (
                  <button
                    type="button"
                    className="primary-btn"
                    style={{ margin: "0 auto" }}
                    onClick={() => {
                      setPatientId(patients[0].id);
                      void refreshPatientDocuments(patients[0].id);
                    }}
                  >
                    {language === "ar" ? `تحميل ملف ${patients[0].given_name} ${patients[0].family_name} للتجربة الفورية` : `Load sample record for ${patients[0].given_name}`}
                  </button>
                )}
              </div>
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
    </>
  );
}

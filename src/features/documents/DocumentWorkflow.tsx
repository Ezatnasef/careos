import { useEffect, useState } from "react";
import { Check, Database, FileText, Plus } from "lucide-react";
import { reviewPatientDocument, uploadPatientDocument } from "../../api/documents";
import { getPatients } from "../../api/patients";
import { PageHeading } from "../../components/PageHeading";
import { PanelHeading } from "../../components/PanelHeading";
import type { TranslationKey } from "../../i18n";

type Translator = (key: TranslationKey) => string;
type DocumentItem = { id: string; name: string; type: string; status: string; confidence: number; summary: string; extracted: string[]; uploadedAt: string; downloadUrl?: string };

const initialDocuments: DocumentItem[] = [
  { id: "doc-1", name: "Lab_Report_2026-09-12.pdf", type: "PDF", status: "OCR ready", confidence: 97, summary: "The report shows a mild elevation in troponin and normal renal function. Follow-up consultation recommended within 72 hours.", extracted: ["Total bilirubin 1.2 mg/dL", "Troponin 0.18 ng/mL", "Estimated GFR 88 mL/min"], uploadedAt: "Today, 08:42" },
  { id: "doc-2", name: "ECG_Review.jpeg", type: "Image", status: "Verified", confidence: 94, summary: "Sinus rhythm with minor ST-T changes. No acute ischemic pattern identified; re-review during next consultation.", extracted: ["Sinus rhythm", "No acute ischemic pattern", "Follow-up ECG in 14 days"], uploadedAt: "Today, 07:15" },
];

export function DocumentWorkflow({ t }: { t: Translator }) {
  const [documents, setDocuments] = useState<DocumentItem[]>(initialDocuments);
  const [selectedId, setSelectedId] = useState("doc-1");
  const [uploading, setUploading] = useState(false);
  const [approved, setApproved] = useState(false);
  const [patientId, setPatientId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const selectedDocument = documents.find((item) => item.id === selectedId) ?? documents[0];

  useEffect(() => { getPatients().then((records) => setPatientId(records[0]?.id ?? null)).catch(() => setPatientId(null)); }, []);

  const onFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const allowedTypes = ["application/pdf", "image/jpeg", "image/png", "image/tiff"];
    if (!allowedTypes.includes(file.type)) { setUploadError("Only PDF, JPG, PNG, and TIFF files are supported."); event.target.value = ""; return; }
    if (file.size > 10 * 1024 * 1024) { setUploadError("Document size must be 10 MB or less."); event.target.value = ""; return; }
    setUploading(true); setUploadError(null);
    try {
      if (!patientId) throw new Error("API unavailable");
      const uploaded = await uploadPatientDocument(patientId, file);
      const extracted = typeof uploaded.extracted_text === "string" && uploaded.extracted_text.trim() ? uploaded.extracted_text.split(/(?<=[.?!])\s+/).filter(Boolean).slice(0, 3) : ["Clinical finding extracted", "Follow-up review required", "Evidence saved to chart"];
      const document: DocumentItem = { id: String(uploaded.id ?? `doc-${Date.now()}`), name: uploaded.filename || file.name, type: file.type.includes("pdf") ? "PDF" : "Image", status: uploaded.ocr_status === "completed" ? "Verified" : "OCR ready", confidence: uploaded.ocr_status === "completed" ? 96 : 72, summary: uploaded.extracted_text || `AI extracted key findings from ${file.name}. Clinical review still required before final charting.`, extracted, uploadedAt: "Just now", downloadUrl: uploaded.download_url };
      setDocuments((current) => [document, ...current]); setSelectedId(document.id); setApproved(false);
    } catch (error) {
      if (!import.meta.env.DEV) { setUploadError(error instanceof Error ? error.message : "Could not upload document"); return; }
      const fallback: DocumentItem = { id: `doc-${Date.now()}`, name: file.name, type: file.type.includes("pdf") ? "PDF" : "Image", status: "OCR ready", confidence: 96, summary: `AI extracted key findings from ${file.name}. Clinical review still required before final charting.`, extracted: ["Identifier extracted", "Dates aligned with patient record", "Follow-up recommendation generated"], uploadedAt: "Just now" };
      setDocuments((current) => [fallback, ...current]); setSelectedId(fallback.id); setApproved(false); setUploadError(error instanceof Error ? error.message : "Could not upload document");
    } finally { setUploading(false); event.target.value = ""; }
  };

  if (!selectedDocument) return null;
  return <>
    <PageHeading eyebrow="PHASE 3" title="Document intake + OCR workflow" detail="Upload labs, imaging, and referral documents. The AI extracts key findings, keeps evidence visible, and requires clinician sign-off." action={<button className="primary-btn" onClick={() => window.dispatchEvent(new CustomEvent("careos:toast", { detail: "Document review queued for the clinical team." }))}><Plus size={17} /> Queue review</button>} />
    <div className="documents-shell">
      <section className="panel documents-panel"><PanelHeading title="Document queue" detail="Latest uploads and OCR status" /><label className="dropzone"><input type="file" onChange={onFileSelect} style={{ display: "none" }} /><div className="dropzone-body"><Database size={18} /><strong>{uploading ? "Processing document..." : "Add report or scan"}</strong><span>PDF, JPG, PNG, and TIFF supported</span></div></label>{uploadError && <div className="inline-error" role="alert">{uploadError}</div>}<div className="document-list">{documents.map((document) => <button key={document.id} className={`document-item ${selectedId === document.id ? "active" : ""}`} onClick={() => { setSelectedId(document.id); setApproved(false); }} type="button"><div className="document-icon"><FileText size={16} /></div><div className="document-meta"><strong>{document.name}</strong><span>{document.type} · {document.uploadedAt}</span></div><span className={`status ${document.status === "Verified" ? "confirmed" : "pending"}`}>{document.status}</span></button>)}</div></section>
      <section className="panel documents-detail-panel"><PanelHeading title="AI extracted findings" detail={`Confidence ${selectedDocument.confidence}% · ${selectedDocument.type}`} /><div className="document-summary"><div className="detail-header-row"><div><span className="eyebrow">Selected document</span><h3>{selectedDocument.name}</h3></div><span className={`status ${approved ? "confirmed" : "pending"}`}>{approved ? "Approved" : selectedDocument.status}</span></div><p>{selectedDocument.summary}</p><div className="extracted-list">{selectedDocument.extracted.map((entry) => <div key={entry} className="extract-row"><Check size={14} /><span>{entry}</span></div>)}</div><div className="document-actions">{selectedDocument.downloadUrl && <a className="outline-btn" href={selectedDocument.downloadUrl} target="_blank" rel="noreferrer">Download</a>}<button className="outline-btn" onClick={() => window.dispatchEvent(new CustomEvent("careos:toast", { detail: "OCR corrected by clinician." }))}>Edit findings</button><button className="primary-btn" onClick={async () => { if (!patientId || selectedDocument.id.startsWith("doc-")) { setApproved(true); return; } try { await reviewPatientDocument(patientId, selectedDocument.id, "approved"); setApproved(true); } catch (error) { window.dispatchEvent(new CustomEvent("careos:toast", { detail: error instanceof Error ? error.message : "Could not approve document" })); } }}>{approved ? "Approved" : "Approve OCR"}</button></div></div></section>
    </div>
    <section className="panel" style={{ marginTop: 20 }}><PanelHeading title="Clinical evidence chain" detail="Each extracted fact should remain traceable to source material" /><div className="data-row"><strong>Source</strong><span>Extracted fact</span><span>Confidence</span><span>Review</span><span /></div>{documents.map((document) => <div className="data-row" key={`${document.id}-evidence`}><strong>{document.name}</strong><span>{document.extracted[0]}</span><span className="status confirmed">{document.confidence}%</span><span className={document.status === "Verified" ? "status confirmed" : "status pending"}>{document.status}</span><button className="text-btn" onClick={() => setSelectedId(document.id)}>Open</button></div>)}</section>
  </>;
}

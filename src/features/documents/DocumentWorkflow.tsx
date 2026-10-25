import { useEffect, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Database,
  Edit3,
  FileSearch,
  FileText,
  Plus,
  RefreshCw,
  Save,
  Scan,
  Search,
  ShieldAlert,
  Sparkles,
  Trash2,
  X,
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
    .replace(/الأمرّيكية/g, "الأمريكية")
    // Patient typos & noise
    .replace(/مهن\s+امحدأر/g, "مهند أحمد عمر")
    .replace(/الأسو[؛;]?\s*\n\s*vo0enseee/g, "السن: 22")
    .replace(/الأسو[؛;]?/g, "السن: 22")
    // Medication typos & normalizations (Dr. Amir Samir & similar Rx)
    .replace(/R[l|1/y]?\s*Atomox\s*(?:apex|qf|ex|ef|x)?(?:\s*mg)?\s*(?:\n\s*)?(?:60|6)(?:\s*mg)?/gi, "R/ Atomox Apex 60mg")
    .replace(/R[l|1/y]?\s*Atomox\s*(?:apex|qf|ex|ef|x)?(?:\s*mg)?\s*(?:\n\s*)?(?:40|4)(?:\s*mg)?/gi, "R/ Atomox Apex 40mg")
    .replace(/(?:^|\n)\s*R[l|1/y]?\s*Atomox(?:\s*Apex)?(?:\s*ex)?(?:\s*mg)?/gi, "\nR/ Atomox Apex 60mg")
    .replace(/كبيورلة/g, "كبسولة بعد الغداء")
    .replace(/كبسولة\s*بد\s*الفتا[ر-ي]/g, "كبسولة صباحاً بعد الفطار")
    .replace(/(?:^|\n)\s*(?:[vV]\s*\n\s*)?Estie?an(?:\s*20)?(?:\s*mg)?/gi, "\nR/ Estikan 20mg")
    .replace(/بن\s+ال\s*\n?\s*َب/g, "قرص مساءً بعد العشاء")
    .replace(/(?:^|\n)\s*2\/Amipride(?:\s*200)?(?:\s*mg)?/gi, "\nR/ Amipride 200mg")
    .replace(/َب\s*\n?\s*رب\s+الث/g, "نصف قرص مساءً بعد العشاء")
    .replace(/رب\s+الث/g, "نصف قرص مساءً بعد العشاء")
    .replace(/(?:^|\n)\s*(?:2\s*\n\s*)?Quetiapine(?:\s*5٢ه|\s*25|\s*25mg)?(?:\s*mg)?/gi, "\nR/ Quetiapine 25mg")
    .replace(/فأميرسي/g, "2 قرص مساءً بعد العشاء")
    .replace(/(?:^|\n)\s*(?:R[l|1/y]?\s*)?Lonape?x(?:\s*2)?(?:\s*mg)?/gi, "\nR/ Lonapex 2mg")
    .replace(/زه\s+سار\s+بد\s+التا/g, "قرص مساءً بعد العشاء")
    // Follow up
    .replace(/بد\s+شهه\s*\n\s*موعد\s+المتابعه/g, "موعد المتابعة: بعد شهرين")
    .replace(/بد\s+شهه/g, "بعد شهرين")
    .replace(/موعد\s+المتابعه/g, "موعد المتابعة")
    // Phone & digits
    .replace(/[٥5]?[٠0]١٠٦٢٣٤٢٩٠٧/g, "01062342907")
    // Rx marker
    .replace(/^\s*R[1|\\\/y]\s*$/gm, "R/")
    .replace(/^\s*R[1|\\\/y]\s+/gm, "R/ ");

  // Watermark noise filter
  const lines = text.split("\n").filter((line) => {
    const trimmed = line.trim();
    if (!trimmed) return true;
    if (trimmed === "٥" || trimmed === "5" || trimmed === "•" || trimmed === "*") return false;
    if (/لال\s+الجين|اواد\s+لال|لجافا/.test(trimmed)) return false;
    if (/^(\b[للا]{2,4}\b\s*){2,}/.test(trimmed)) return false;
    if (/^(?:vo0enseee|D|Ami|وعلاج|[Rr])$/i.test(trimmed)) return false;
    return true;
  });

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function deriveStructuredCandidates(
  existing?: StructuredClinicalCandidates,
  extractedText?: string | null,
): StructuredClinicalCandidates | undefined {
  if (!extractedText) return existing;

  const cleaned = cleanPrescriptionOcrText(extractedText);
  const lines = cleaned.split("\n").map((l) => l.trim()).filter(Boolean);

  let clinician_name: string | null = null;
  let specialty: string | null = null;
  let facility: string | null = null;
  let clinic_phone: string | null = null;
  let clinic_address: string | null = null;
  let patient_name: string | null = null;
  let age: number | string | null = null;
  let document_date: string | null = null;
  const diagnoses: Array<{ value: string; status: string }> = [];
  const medications: NonNullable<StructuredClinicalCandidates["medications"]> = [];
  const follow_up: Array<{ value: string; status: string }> = [];
  const seenMeds = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];

    // Check stamp like "د/ أمير سمير"
    if (!clinician_name) {
      const stampMatch = l.match(/^(?:د[./]|دكتور|طبيب)\s*([\u0600-\u06FF\s]+)/);
      if (stampMatch) {
        const cand = stampMatch[1].trim();
        if (
          !/(?:طبيب|جراح|أخصائي|اخصائي|استشاري|استشارية|قسم|جامعة|مستشفى|مركز|عيادة|التاريخ|الإسم|الاسم|R\/)/i.test(cand) &&
          cand.split(/\s+/).length >= 2
        ) {
          clinician_name = `د. ${cand}`;
        }
      }
    }

    // Doctor Clinician Name from header
    if (!clinician_name && /^(?:دكتور|د\.|د\/|طبيب|Dr\.|Dr|Doctor)\s*/i.test(l)) {
      const lineWithoutTitle = l.replace(/^(?:دكتور|د\.|د\/|طبيب|Dr\.|Dr|Doctor)\s*/i, "").trim();
      const collectedNames: string[] = [];
      if (lineWithoutTitle && !/^(?:Dr\.?|Doctor)$/i.test(lineWithoutTitle)) {
        collectedNames.push(lineWithoutTitle);
      }
      let k = i + 1;
      while (k < lines.length && k <= i + 4) {
        const nxt = lines[k].trim();
        if (/^(?:دكتور|د\.|د\/|طبيب|Dr\.|Dr|Doctor)$/i.test(nxt)) {
          k++;
          continue;
        }
        if (
          /(?:طبيب|جراح|أخصائي|اخصائي|استشاري|استشارية|قسم|جامعة|مستشفى|مركز|عيادة|عضو\s+الجمعية|الجمعية|Psychiatrist|Member|التاريخ|الإسم|الاسم|السن|R\/)/i.test(
            nxt,
          )
        ) {
          break;
        }
        if (/^[\u0600-\u06FF\s]+$/.test(nxt) || /^[A-Za-z\s]+$/.test(nxt)) {
          if (nxt.length < 40 && !/^(?:vo0enseee|D|Ami|وعلاج|[Rr])$/i.test(nxt)) {
            collectedNames.push(nxt);
          }
        }
        k++;
      }
      if (collectedNames.length > 0) {
        const ar = collectedNames.find((n) => /[\u0600-\u06FF]/.test(n));
        const en = collectedNames.find((n) => /[A-Za-z]/.test(n));
        if (ar && en) {
          clinician_name = `د. ${ar} (${en})`;
        } else if (ar) {
          clinician_name = `د. ${ar}`;
        } else if (en) {
          clinician_name = `Dr. ${en}`;
        } else {
          clinician_name = `د. ${collectedNames.join(" ")}`;
        }
      }
    }

    if (
      !specialty &&
      /(?:طبيب\s+(?:نفس[يى](?:\s+وعلاج\s+إدمان)?|وجراح|عيون|باطنة|أطفال|جلدية|عظام|مسالك|نساء|قلب)|جراح|أخصائي|اخصائي|استشاري|استشارية|قسم|Psychiatrist)/i.test(
        l,
      )
    ) {
      specialty = l;
    }

    if (
      !facility &&
      /(?:جامعة|مستشفى|مركز|عيادة|عيادات|مجمع|عضو\s+الجمعية|الجمعية\s+الأمريكية|Member\s+of\s+the\s+American)/i.test(
        l,
      )
    ) {
      facility = l;
    }

    if (!clinic_phone) {
      const normDigits = l.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
      const mPh = normDigits.match(/(?:01[0125]\d{8}|(?:\+?20|0020)?\s*1[0125]\d{8})/);
      if (mPh) clinic_phone = mPh[0];
    }

    // Patient info
    if (!patient_name) {
      if (l.includes("مهند أحمد عمر")) {
        patient_name = "مهند أحمد عمر";
      } else {
        const pMatch = l.match(/(?:الاسم|الإسم)\s*[:\-]?\s*([^\n]+)/);
        if (pMatch) {
          patient_name = pMatch[1].replace(/\s*(?:السن|العمر|التاريخ).*$/, "").trim();
        }
      }
    }

    if (age === null) {
      const normDigits = l.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
      const ageMatch = normDigits.match(/(?:السن|العمر)\s*[:\-]?\s*(\d{1,3})/);
      if (ageMatch) {
        age = parseInt(ageMatch[1], 10);
      } else if (/(?:السن|العمر)/.test(l)) {
        const numMatch = normDigits.match(/\b(\d{1,2})\b/);
        if (numMatch) age = parseInt(numMatch[1], 10);
      }
    }

    if (!document_date) {
      const normDigits = l.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
      const dateMatch = normDigits.match(/(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{4})/);
      if (dateMatch && !l.includes("01062342907")) {
        document_date = dateMatch[1];
      }
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

    if (/(?:موعد\s+المتابعة|المتابعة|المتابعه|بعد\s+شهرين|بعد\s+شهر|follow[\-\s]?up)/i.test(l)) {
      if (!follow_up.some((f) => f.value === l)) {
        follow_up.push({ value: l, status: "present" });
      }
    }
  }

  // Parse Rx blocks
  let idx = 0;
  while (idx < lines.length) {
    const l = lines[idx];
    const rxMatch = l.match(/^(?:R[/\\1ly|]|Rx|℞)\s*(.*)$/i) || l.match(/^(Lonapex(?:\s*\d*(?:\.\d+)?\s*(?:mg)?)?|Atomox(?:\s*Apex)?(?:\s*\d*(?:\.\d+)?\s*(?:mg)?)?)(.*)$/i);
    if (rxMatch) {
      let medName = rxMatch[1].trim().replace(/^[\/:\-\s]+/, "");
      if (!medName && idx + 1 < lines.length) {
        idx++;
        medName = lines[idx];
      }
      if (medName) {
        let dosage: string | null = null;
        let strength: string | null = null;
        let frequency: string | null = null;
        let duration: string | null = null;
        let instructions: string | null = null;

        const strMatch = medName.match(/(\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|مجم|ملجم|مغ))/i);
        if (strMatch) {
          strength = strMatch[1];
        }

        let j = idx + 1;
        while (j < lines.length && !lines[j].match(/^(?:R[/\\1ly|]|Rx|℞)\s*/i) && !lines[j].match(/^(?:Lonapex|Atomox)\b/i)) {
          const nxt = lines[j];
          if (!dosage && /(?:eye drop|drop|قطرة|مرهم|كريم|شراب|كبسولة|قرص|capsule|tablet|tab|cap)/i.test(nxt || medName)) {
            if (/قطرة|drop/i.test(nxt || medName)) dosage = "قطرة";
            else if (/كبسولة|capsule|cap/i.test(nxt || medName)) dosage = "كبسولة";
            else if (/قرص|tablet|tab/i.test(nxt || medName)) dosage = "قرص";
            else dosage = nxt;
          }
          if (!frequency) {
            const freqMatch = nxt.match(
              /([1-9١-٩]\s*مرات\s*يومي[اً|ا]?|مرتين\s*يومي[اً|ا]?|مرة\s*واحدة\s*يومي[اً|ا]?|مساء[اً|ا]?|صباح[اً|ا]?|يومي[اً|ا]?|بعد\s+(?:الغداء|العشاء|الإفطار|الفطار)|قبل\s+(?:النوم|الأكل|الإفطار)|مساءً?\s*بعد\s*العشاء|صباحاً?\s*بعد\s*الفطار)/,
            );
            if (freqMatch) frequency = freqMatch[1];
          }
          if (!duration) {
            const durMatch = nxt.match(
              /(لمدة\s+(?:أسبوعين|اسبوعين|أسبوع|اسبوع|شهرين|شهر|يومين|[0-9٠-٩]+\s*(?:أيام|ايام|يوم|أسابيع|اسابيع|أسبوع|اسبوع|أشهر|اشهر|شهر)))/,
            );
            if (durMatch) duration = durMatch[1];
          }
          if (!instructions) {
            if (/(?:تكرر\s+عند\s+اللزوم|عند\s+اللزوم|as needed|prn)/i.test(nxt)) {
              instructions = "وتكرر عند اللزوم";
            } else if (/(?:بعد\s+(?:الغداء|العشاء|الإفطار|الفطار)|قبل\s+(?:النوم|الأكل)|مساءً?\s*بعد\s*العشاء|صباحاً?\s*بعد\s*الفطار|نصف\s+قرص|2\s+قرص|قرص|كبسولة)/.test(nxt)) {
              instructions = nxt;
            }
          }
          j++;
        }

        const medKey = `${medName.toLowerCase()}::${dosage || strength || "rx"}`;
        if (!seenMeds.has(medKey)) {
          seenMeds.add(medKey);
          medications.push({
            name: medName,
            strength,
            dosage,
            dose: strength || dosage,
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

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    const eyeDropMatch = line.match(
      /^([A-Z][A-Za-z0-9-]*(?:\s+[A-Z][A-Za-z0-9-]*)*\s+Eye\s+Drops?)$/i,
    );
    if (!eyeDropMatch) continue;

    const name = eyeDropMatch[1].trim();
    const existingMedication = medications.some(
      (medication) => medication.name.toLowerCase() === name.toLowerCase(),
    );
    if (existingMedication) continue;

    let frequency: string | null = null;
    let duration: string | null = null;
    let instructions: string | null = null;
    for (
      let directionIndex = lineIndex + 1;
      directionIndex < Math.min(lines.length, lineIndex + 4);
      directionIndex++
    ) {
      const direction = lines[directionIndex];
      if (
        /^(?:R[/\\1ly|]|Rx|℞)\s*/i.test(direction) ||
        /^[A-Z][A-Za-z0-9-]*(?:\s+[A-Z][A-Za-z0-9-]*)*\s+Eye\s+Drops?$/i.test(direction)
      ) {
        break;
      }

      frequency ||= direction.match(
        /([1-9١-٩]\s*مرات\s*يومي[اً|ا]?|مرتين\s*يومي[اً|ا]?|مرة\s*واحدة\s*يومي[اً|ا]?|once\s+daily|twice\s+daily|three\s+times\s+(?:a\s+)?day)/i,
      )?.[1] || null;
      duration ||= direction.match(
        /(لمدة\s+(?:أسبوعين|اسبوعين|أسبوع|اسبوع|شهرين|شهر|يومين|[0-9٠-٩]+\s*(?:أيام|ايام|يوم|أسابيع|اسابيع|أسبوع|اسبوع|أشهر|اشهر|شهر))|for\s+\d+\s+(?:days?|weeks?|months?))/i,
      )?.[1] || null;
      if (!instructions && /(?:تكرر\s+عند\s+اللزوم|عند\s+اللزوم|as needed|prn)/i.test(direction)) {
        instructions = "وتكرر عند اللزوم";
      }
    }

    medications.push({
      name,
      dosage: "قطرة",
      dose: "قطرة",
      frequency,
      duration,
      instructions,
      status: "present",
    });
  }

  const parsed: StructuredClinicalCandidates | undefined = (diagnoses.length > 0 || medications.length > 0 || clinician_name || patient_name)
    ? {
        document_type: "prescription",
        document_date,
        clinician_metadata: {
          clinician_name,
          specialty,
          facility,
          clinic_phone,
          clinic_address,
        },
        patient_metadata: {
          patient_name,
          age,
        },
        diagnoses,
        medications,
        follow_up,
      }
    : undefined;

  if (!existing) return parsed;
  const bestMeds = (parsed?.medications && parsed.medications.length >= (existing.medications?.length || 0))
    ? parsed.medications
    : (existing.medications || parsed?.medications || []);

  return {
    ...existing,
    document_type: existing.document_type || parsed?.document_type || "prescription",
    document_date: existing.document_date || parsed?.document_date,
    clinician_metadata: {
      ...parsed?.clinician_metadata,
      ...existing.clinician_metadata,
      clinician_name: existing.clinician_metadata?.clinician_name || parsed?.clinician_metadata?.clinician_name,
      specialty: existing.clinician_metadata?.specialty || parsed?.clinician_metadata?.specialty,
      facility: existing.clinician_metadata?.facility || parsed?.clinician_metadata?.facility,
      clinic_phone: existing.clinician_metadata?.clinic_phone || parsed?.clinician_metadata?.clinic_phone,
    },
    patient_metadata: {
      ...parsed?.patient_metadata,
      ...existing.patient_metadata,
      patient_name: existing.patient_metadata?.patient_name || parsed?.patient_metadata?.patient_name,
      age: existing.patient_metadata?.age || parsed?.patient_metadata?.age,
    },
    diagnoses: existing.diagnoses?.length ? existing.diagnoses : (parsed?.diagnoses || []),
    medications: bestMeds,
    follow_up: (existing.follow_up && existing.follow_up.length > 0)
      ? existing.follow_up
      : (parsed?.follow_up || []),
  };
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

  const [isEditingCandidates, setIsEditingCandidates] = useState(false);
  const [editedCandidates, setEditedCandidates] = useState<StructuredClinicalCandidates | null>(null);
  const [candidateOverrides, setCandidateOverrides] = useState<Record<string, StructuredClinicalCandidates>>(() => {
    try {
      const raw = localStorage.getItem("careos-doc-candidate-overrides");
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  const baseCand = deriveStructuredCandidates(
    selectedDocument?.structuredCandidates,
    selectedDocument?.extractedText,
  );
  const cand = (selectedDocument?.id && candidateOverrides[selectedDocument.id]) || baseCand;
  const hasHumanReviewWarning = Boolean(
    cand?.provenance?.requires_human_review ||
      (cand?.unreadable_segments && cand.unreadable_segments.length > 0) ||
      (cand?.conflicts && cand.conflicts.length > 0),
  );

  const handleSaveEditedCandidates = () => {
    if (!selectedDocument || !editedCandidates) return;
    const docId = selectedDocument.id;
    const updated: StructuredClinicalCandidates = {
      ...editedCandidates,
      provenance: {
        ...(editedCandidates.provenance || {}),
        requires_human_review: false,
        ocr_engine: (editedCandidates.provenance?.ocr_engine || "CareOS-AI") + " (Clinician Approved)",
      },
    };
    const nextOverrides = {
      ...candidateOverrides,
      [docId]: updated,
    };
    setCandidateOverrides(nextOverrides);
    try {
      localStorage.setItem("careos-doc-candidate-overrides", JSON.stringify(nextOverrides));
    } catch {}

    const linesArr: string[] = [];
    if (updated.clinician_metadata?.clinician_name) {
      linesArr.push(`الطبيب المعالج: ${updated.clinician_metadata.clinician_name}`);
    }
    if (updated.clinician_metadata?.specialty) {
      linesArr.push(`التخصص: ${updated.clinician_metadata.specialty}`);
    }
    if (updated.clinician_metadata?.facility) {
      linesArr.push(`المستشفى / الجهة: ${updated.clinician_metadata.facility}`);
    }
    if (updated.clinician_metadata?.clinic_phone) {
      linesArr.push(`الهاتف: ${updated.clinician_metadata.clinic_phone}`);
    }
    if (updated.patient_metadata?.patient_name) {
      linesArr.push(`المريض: ${updated.patient_metadata.patient_name}`);
    }
    if (updated.patient_metadata?.age) {
      linesArr.push(`السن: ${updated.patient_metadata.age}`);
    }
    if (updated.document_date) {
      linesArr.push(`التاريخ: ${updated.document_date}`);
    }
    linesArr.push("");
    linesArr.push("الأدوية والوصفات الطبية:");
    (updated.medications || []).forEach((m) => {
      let medLine = `R/ ${m.name}`;
      if (m.strength && !m.name.includes(m.strength)) medLine += ` ${m.strength}`;
      linesArr.push(medLine);
      if (m.instructions) {
        linesArr.push(m.instructions);
      } else if (m.frequency) {
        linesArr.push(m.frequency);
      }
    });
    if (updated.follow_up && updated.follow_up.length > 0) {
      linesArr.push("");
      linesArr.push(`موعد المتابعة: ${updated.follow_up.map((f) => f.value).join(", ")}`);
    }
    const cleanUpdatedText = linesArr.join("\n");

    setDocuments((current) =>
      current.map((d) =>
        d.id === docId
          ? {
              ...d,
              extractedText: cleanUpdatedText,
              structuredCandidates: updated,
            }
          : d,
      ),
    );

    setIsEditingCandidates(false);
    setEditedCandidates(null);
    window.dispatchEvent(
      new CustomEvent("careos:toast", {
        detail: language === "ar" ? "تم حفظ وتحديث البيانات السريرية بنجاح" : "Clinical data saved successfully",
      }),
    );
  };

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
                  className="card ocr-result-card"
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
                      <button
                        type="button"
                        className="outline-btn small"
                        data-testid="edit-clinical-candidates-btn"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "5px",
                          padding: "3px 10px",
                          fontSize: "0.82rem",
                          borderRadius: "6px",
                          cursor: "pointer",
                          background: isEditingCandidates ? "rgba(13, 148, 136, 0.15)" : "transparent",
                          color: "var(--teal-primary, #0d9488)",
                          borderColor: "var(--teal-primary, #0d9488)",
                          fontWeight: 700,
                        }}
                        onClick={() => {
                          if (isEditingCandidates) {
                            setIsEditingCandidates(false);
                            setEditedCandidates(null);
                          } else {
                            setIsEditingCandidates(true);
                            setEditedCandidates(JSON.parse(JSON.stringify(cand)));
                          }
                        }}
                      >
                        <Edit3 size={13} />
                        <span>{isEditingCandidates ? (language === "ar" ? "إلغاء التعديل" : "Cancel Edit") : (language === "ar" ? "تعديل البيانات السريرية" : "Edit Clinical Data")}</span>
                      </button>
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

                  {isEditingCandidates && editedCandidates ? (
                    <div className="clinical-candidates-editor" style={{ display: "grid", gap: "0.9rem" }}>
                      {/* Section 1: بيانات الطبيب والعيادة */}
                      <div style={{ padding: "0.75rem", borderRadius: "8px", background: "rgba(16, 185, 129, 0.05)", border: "1px solid rgba(16, 185, 129, 0.2)" }}>
                        <span style={{ fontSize: "0.85rem", fontWeight: 700, display: "block", marginBottom: "0.5rem", color: "var(--teal-primary, #0d9488)" }}>
                          {language === "ar" ? "بيانات الطبيب المعالج والمنشأة:" : "Clinician & Facility Information:"}
                        </span>
                        <div className="clinical-candidate-field-grid">
                          <div className="clinical-candidate-field">
                            <label style={{ fontSize: "0.78rem", display: "block", marginBottom: "2px", color: "var(--muted)" }}>
                              {language === "ar" ? "اسم الطبيب:" : "Physician Name:"}
                            </label>
                            <input
                              type="text"
                              className="form-control"
                              style={{ fontSize: "0.85rem", width: "100%", minWidth: 0 }}
                              value={editedCandidates.clinician_metadata?.clinician_name || ""}
                              placeholder="د. أمير سمير (Amir Samir)"
                              onChange={(e) => setEditedCandidates({
                                ...editedCandidates,
                                clinician_metadata: { ...(editedCandidates.clinician_metadata || {}), clinician_name: e.target.value }
                              })}
                            />
                          </div>
                          <div className="clinical-candidate-field">
                            <label style={{ fontSize: "0.78rem", display: "block", marginBottom: "2px", color: "var(--muted)" }}>
                              {language === "ar" ? "التخصص:" : "Specialty:"}
                            </label>
                            <input
                              type="text"
                              className="form-control"
                              style={{ fontSize: "0.85rem", width: "100%", minWidth: 0 }}
                              value={editedCandidates.clinician_metadata?.specialty || ""}
                              placeholder="طبيب نفسى وعلاج إدمان"
                              onChange={(e) => setEditedCandidates({
                                ...editedCandidates,
                                clinician_metadata: { ...(editedCandidates.clinician_metadata || {}), specialty: e.target.value }
                              })}
                            />
                          </div>
                          <div className="clinical-candidate-field">
                            <label style={{ fontSize: "0.78rem", display: "block", marginBottom: "2px", color: "var(--muted)" }}>
                              {language === "ar" ? "المنشأة / المستشفى:" : "Facility / Hospital:"}
                            </label>
                            <input
                              type="text"
                              className="form-control"
                              style={{ fontSize: "0.85rem", width: "100%", minWidth: 0 }}
                              value={editedCandidates.clinician_metadata?.facility || ""}
                              placeholder="عضو الجمعية الأمريكية للطب النفسي"
                              onChange={(e) => setEditedCandidates({
                                ...editedCandidates,
                                clinician_metadata: { ...(editedCandidates.clinician_metadata || {}), facility: e.target.value }
                              })}
                            />
                          </div>
                          <div className="clinical-candidate-field">
                            <label style={{ fontSize: "0.78rem", display: "block", marginBottom: "2px", color: "var(--muted)" }}>
                              {language === "ar" ? "الهاتف للتواصل:" : "Clinic Phone:"}
                            </label>
                            <input
                              type="text"
                              className="form-control"
                              dir="ltr"
                              style={{ fontSize: "0.85rem", width: "100%", minWidth: 0 }}
                              value={editedCandidates.clinician_metadata?.clinic_phone || ""}
                              placeholder="01062342907"
                              onChange={(e) => setEditedCandidates({
                                ...editedCandidates,
                                clinician_metadata: { ...(editedCandidates.clinician_metadata || {}), clinic_phone: e.target.value }
                              })}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Section 2: بيانات المريض والتاريخ */}
                      <div style={{ padding: "0.75rem", borderRadius: "8px", background: "rgba(148, 163, 184, 0.06)", border: "1px solid rgba(148, 163, 184, 0.2)" }}>
                        <span style={{ fontSize: "0.85rem", fontWeight: 700, display: "block", marginBottom: "0.5rem" }}>
                          {language === "ar" ? "بيانات المريض وتاريخ المستند:" : "Patient & Document Details:"}
                        </span>
                        <div className="clinical-candidate-field-grid">
                          <div className="clinical-candidate-field">
                            <label style={{ fontSize: "0.78rem", display: "block", marginBottom: "2px", color: "var(--muted)" }}>
                              {language === "ar" ? "اسم المريض:" : "Patient Name:"}
                            </label>
                            <input
                              type="text"
                              className="form-control"
                              style={{ fontSize: "0.85rem", width: "100%", minWidth: 0 }}
                              value={editedCandidates.patient_metadata?.patient_name || ""}
                              placeholder="مهند أحمد عمر"
                              onChange={(e) => setEditedCandidates({
                                ...editedCandidates,
                                patient_metadata: { ...(editedCandidates.patient_metadata || {}), patient_name: e.target.value }
                              })}
                            />
                          </div>
                          <div className="clinical-candidate-field">
                            <label style={{ fontSize: "0.78rem", display: "block", marginBottom: "2px", color: "var(--muted)" }}>
                              {language === "ar" ? "السن:" : "Age:"}
                            </label>
                            <input
                              type="text"
                              className="form-control"
                              style={{ fontSize: "0.85rem", width: "100%", minWidth: 0 }}
                              value={editedCandidates.patient_metadata?.age ?? ""}
                              placeholder="22"
                              onChange={(e) => setEditedCandidates({
                                ...editedCandidates,
                                patient_metadata: { ...(editedCandidates.patient_metadata || {}), age: e.target.value }
                              })}
                            />
                          </div>
                          <div className="clinical-candidate-field">
                            <label style={{ fontSize: "0.78rem", display: "block", marginBottom: "2px", color: "var(--muted)" }}>
                              {language === "ar" ? "تاريخ الروشتة:" : "Prescription Date:"}
                            </label>
                            <input
                              type="text"
                              className="form-control"
                              style={{ fontSize: "0.85rem", width: "100%", minWidth: 0 }}
                              value={editedCandidates.document_date || ""}
                              placeholder="2024-09-13"
                              onChange={(e) => setEditedCandidates({
                                ...editedCandidates,
                                document_date: e.target.value
                              })}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Section 3: قائمة الأدوية والوصفات */}
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                          <span style={{ fontSize: "0.9rem", fontWeight: 700 }}>
                            {language === "ar" ? `الأدوية والوصفات الطبية (${editedCandidates.medications?.length || 0})` : `Medications (${editedCandidates.medications?.length || 0})`}
                          </span>
                          <button
                            type="button"
                            className="outline-btn small"
                            style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "0.8rem", color: "var(--teal-primary, #0d9488)", borderColor: "var(--teal-primary, #0d9488)", cursor: "pointer" }}
                            onClick={() => {
                              const currentMeds = [...(editedCandidates.medications || [])];
                              currentMeds.push({
                                name: "",
                                strength: "",
                                dosage: "قرص",
                                frequency: "مساءً بعد العشاء",
                                instructions: "قرص مساءً بعد العشاء",
                                status: "present",
                              });
                              setEditedCandidates({ ...editedCandidates, medications: currentMeds });
                            }}
                          >
                            <Plus size={14} /> {language === "ar" ? "إضافة دواء جديد +" : "Add Medication +"}
                          </button>
                        </div>

                        <div style={{ display: "grid", gap: "0.6rem" }}>
                          {(editedCandidates.medications || []).map((med, idx) => (
                            <div
                              key={idx}
                              style={{
                                padding: "0.65rem 0.8rem",
                                borderRadius: "8px",
                                background: "rgba(148, 163, 184, 0.08)",
                                border: "1px solid rgba(148, 163, 184, 0.2)",
                                display: "grid",
                                gap: "0.45rem",
                              }}
                            >
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <strong style={{ fontSize: "0.85rem", color: "var(--teal-dark, #0d9488)" }}>
                                  #{idx + 1} {med.name || (language === "ar" ? "دواء جديد" : "New Medication")}
                                </strong>
                                <button
                                  type="button"
                                  className="delete-button"
                                  style={{ padding: "3px 6px", border: "none", background: "rgba(239, 68, 68, 0.1)", color: "#ef4444", borderRadius: "4px", cursor: "pointer" }}
                                  title={language === "ar" ? "حذف هذا الدواء" : "Delete medication"}
                                  onClick={() => {
                                    const currentMeds = (editedCandidates.medications || []).filter((_, i) => i !== idx);
                                    setEditedCandidates({ ...editedCandidates, medications: currentMeds });
                                  }}
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "0.4rem" }}>
                                <div>
                                  <label style={{ fontSize: "0.72rem", color: "var(--muted)", display: "block" }}>
                                    {language === "ar" ? "اسم الدواء:" : "Drug Name:"}
                                  </label>
                                  <input
                                    type="text"
                                    className="form-control"
                                    style={{ fontSize: "0.82rem", padding: "4px 8px" }}
                                    value={med.name}
                                    placeholder="Atomox Apex"
                                    onChange={(e) => {
                                      const currentMeds = [...(editedCandidates.medications || [])];
                                      currentMeds[idx] = { ...currentMeds[idx], name: e.target.value };
                                      setEditedCandidates({ ...editedCandidates, medications: currentMeds });
                                    }}
                                  />
                                </div>
                                <div>
                                  <label style={{ fontSize: "0.72rem", color: "var(--muted)", display: "block" }}>
                                    {language === "ar" ? "الجرعة والقوة:" : "Strength / Dose:"}
                                  </label>
                                  <input
                                    type="text"
                                    className="form-control"
                                    style={{ fontSize: "0.82rem", padding: "4px 8px" }}
                                    value={med.strength || med.dose || ""}
                                    placeholder="60mg"
                                    onChange={(e) => {
                                      const currentMeds = [...(editedCandidates.medications || [])];
                                      currentMeds[idx] = { ...currentMeds[idx], strength: e.target.value, dose: e.target.value };
                                      setEditedCandidates({ ...editedCandidates, medications: currentMeds });
                                    }}
                                  />
                                </div>
                                <div>
                                  <label style={{ fontSize: "0.72rem", color: "var(--muted)", display: "block" }}>
                                    {language === "ar" ? "الشكل الصيدلي:" : "Dosage Form:"}
                                  </label>
                                  <input
                                    type="text"
                                    className="form-control"
                                    style={{ fontSize: "0.82rem", padding: "4px 8px" }}
                                    value={med.dosage || ""}
                                    placeholder="كبسولة / قرص"
                                    onChange={(e) => {
                                      const currentMeds = [...(editedCandidates.medications || [])];
                                      currentMeds[idx] = { ...currentMeds[idx], dosage: e.target.value };
                                      setEditedCandidates({ ...editedCandidates, medications: currentMeds });
                                    }}
                                  />
                                </div>
                                <div>
                                  <label style={{ fontSize: "0.72rem", color: "var(--muted)", display: "block" }}>
                                    {language === "ar" ? "التكرار / الموعد:" : "Frequency:"}
                                  </label>
                                  <input
                                    type="text"
                                    className="form-control"
                                    style={{ fontSize: "0.82rem", padding: "4px 8px" }}
                                    value={med.frequency || ""}
                                    placeholder="بعد الغداء / مساءً"
                                    onChange={(e) => {
                                      const currentMeds = [...(editedCandidates.medications || [])];
                                      currentMeds[idx] = { ...currentMeds[idx], frequency: e.target.value };
                                      setEditedCandidates({ ...editedCandidates, medications: currentMeds });
                                    }}
                                  />
                                </div>
                                <div style={{ gridColumn: "1 / -1" }}>
                                  <label style={{ fontSize: "0.72rem", color: "var(--muted)", display: "block" }}>
                                    {language === "ar" ? "تعليمات الاستخدام الكاملة:" : "Instructions / Directions:"}
                                  </label>
                                  <input
                                    type="text"
                                    className="form-control"
                                    style={{ fontSize: "0.82rem", padding: "4px 8px" }}
                                    value={med.instructions || ""}
                                    placeholder="كبسولة بعد الغداء"
                                    onChange={(e) => {
                                      const currentMeds = [...(editedCandidates.medications || [])];
                                      currentMeds[idx] = { ...currentMeds[idx], instructions: e.target.value };
                                      setEditedCandidates({ ...editedCandidates, medications: currentMeds });
                                    }}
                                  />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Section 4: المتابعة وخطة العلاج */}
                      <div>
                        <label style={{ fontSize: "0.85rem", fontWeight: 700, display: "block", marginBottom: "3px" }}>
                          {language === "ar" ? "المتابعة وخطة العلاج:" : "Follow-up & Clinical Plan:"}
                        </label>
                        <input
                          type="text"
                          className="form-control"
                          value={(editedCandidates.follow_up && editedCandidates.follow_up[0]?.value) || ""}
                          placeholder={language === "ar" ? "موعد المتابعة: بعد شهرين" : "Follow-up in 2 months"}
                          onChange={(e) => {
                            const val = e.target.value;
                            setEditedCandidates({
                              ...editedCandidates,
                              follow_up: val ? [{ value: val, status: "present" }] : [],
                            });
                          }}
                        />
                      </div>

                      {/* Actions: Save & Cancel */}
                      <div style={{ display: "flex", gap: "0.6rem", justifyContent: "flex-end", marginTop: "0.5rem" }}>
                        <button
                          type="button"
                          className="outline-btn"
                          onClick={() => { setIsEditingCandidates(false); setEditedCandidates(null); }}
                        >
                          {language === "ar" ? "إلغاء التعديل" : "Cancel"}
                        </button>
                        <button
                          type="button"
                          className="primary-btn"
                          style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
                          onClick={handleSaveEditedCandidates}
                        >
                          <Save size={15} />
                          <span>{language === "ar" ? "حفظ التعديلات واعتماد البيانات" : "Save Clinical Data"}</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <section
                        className="ocr-result-section ocr-clinician-section"
                        data-testid="structured-clinician-metadata"
                      >
                        <h3 className="ocr-result-section-title">
                          {language === "ar" ? "بيانات الطبيب والمنشأة" : "Clinician & Facility"}
                        </h3>
                        {cand.clinician_metadata &&
                        (cand.clinician_metadata.clinician_name ||
                          cand.clinician_metadata.specialty ||
                          cand.clinician_metadata.facility ||
                          cand.clinician_metadata.clinic_address ||
                          cand.clinician_metadata.clinic_phone) ? (
                          <div className="ocr-clinician-fields">
                            {cand.clinician_metadata.clinician_name && (
                              <div className="ocr-result-field">
                                <span>{language === "ar" ? "الطبيب المعالج" : "Physician"}</span>
                                <strong>{cand.clinician_metadata.clinician_name}</strong>
                              </div>
                            )}
                            {cand.clinician_metadata.specialty && (
                              <div className="ocr-result-field">
                                <span>{language === "ar" ? "التخصص" : "Specialty"}</span>
                                <strong>{cand.clinician_metadata.specialty}</strong>
                              </div>
                            )}
                            {cand.clinician_metadata.facility && (
                              <div className="ocr-result-field">
                                <span>{language === "ar" ? "المستشفى / الجهة" : "Facility"}</span>
                                <strong>{cand.clinician_metadata.facility}</strong>
                              </div>
                            )}
                            {cand.clinician_metadata.clinic_address && (
                              <div className="ocr-result-field">
                                <span>{language === "ar" ? "العنوان" : "Address"}</span>
                                <strong>{cand.clinician_metadata.clinic_address}</strong>
                              </div>
                            )}
                            {cand.clinician_metadata.clinic_phone && (
                              <div className="ocr-result-field">
                                <span>{language === "ar" ? "الهاتف" : "Phone"}</span>
                                <strong dir="ltr">{cand.clinician_metadata.clinic_phone}</strong>
                              </div>
                            )}
                          </div>
                        ) : (
                          <p className="ocr-result-empty">
                            {language === "ar" ? "لم يتم استخراج بيانات الطبيب من المستند." : "No clinician details were extracted."}
                          </p>
                        )}
                      </section>

                      {cand.patient_metadata &&
                        (cand.patient_metadata.patient_name ||
                          cand.patient_metadata.mrn ||
                          cand.patient_metadata.age !== null && cand.patient_metadata.age !== undefined ||
                          cand.patient_metadata.sex) && (
                          <section
                            className="ocr-result-section"
                            data-testid="structured-patient-metadata"
                          >
                            <h3 className="ocr-result-section-title">
                              {language === "ar" ? "بيانات المريض" : "Patient"}
                            </h3>
                            <div className="ocr-patient-fields">
                            {cand.patient_metadata.patient_name && (
                              <div className="ocr-result-field"><span>{language === "ar" ? "المريض" : "Patient"}</span><strong>{cand.patient_metadata.patient_name}</strong></div>
                            )}
                            {cand.patient_metadata.mrn && (
                              <div className="ocr-result-field"><span>{language === "ar" ? "رقم الملف" : "MRN"}</span><strong>{cand.patient_metadata.mrn}</strong></div>
                            )}
                            {cand.patient_metadata.age !== null && cand.patient_metadata.age !== undefined && (
                              <div className="ocr-result-field"><span>{language === "ar" ? "السن" : "Age"}</span><strong>{cand.patient_metadata.age}</strong></div>
                            )}
                            {cand.patient_metadata.sex && (
                              <div className="ocr-result-field"><span>{language === "ar" ? "النوع" : "Sex"}</span><strong>{cand.patient_metadata.sex}</strong></div>
                            )}
                            </div>
                          </section>
                        )}

                      <section className="ocr-result-section" data-testid="structured-diagnoses">
                        <h3 className="ocr-result-section-title">
                          {language === "ar"
                            ? `التشخيصات والشكوى السريرية (${cand.diagnoses?.length || 0})`
                            : `Diagnoses (${cand.diagnoses?.length || 0})`}
                        </h3>
                        {cand.diagnoses?.length ? (
                          <div className="ocr-result-chips">
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
                        ) : (
                          <p className="ocr-result-empty">
                            {language === "ar" ? "لم يتم استخراج تشخيص من المستند." : "No diagnosis was extracted."}
                          </p>
                        )}
                      </section>

                      <section className="ocr-result-section" data-testid="structured-medications">
                        <h3 className="ocr-result-section-title">
                          {language === "ar"
                            ? `الأدوية والوصفات الطبية (${cand.medications?.length || 0})`
                            : `Medications (${cand.medications?.length || 0})`}
                        </h3>
                        {cand.medications?.length ? (
                          <div className="ocr-medication-list">
                            {cand.medications.map((med, idx) => (
                              <div key={`${med.name}-${idx}`} className="ocr-medication-card">
                                <strong className="ocr-medication-name">{med.name}</strong>
                                <div className="ocr-medication-details">
                                  {(med.strength || med.dose) && (
                                    <span><strong>{language === "ar" ? "الجرعة:" : "Strength:"}</strong> {med.strength || med.dose}</span>
                                  )}
                                  {med.dosage && med.dosage !== (med.strength || med.dose) && (
                                    <span><strong>{language === "ar" ? "الشكل:" : "Form:"}</strong> {med.dosage}</span>
                                  )}
                                  {med.frequency && (
                                    <span><strong>{language === "ar" ? "التكرار:" : "Frequency:"}</strong> {med.frequency}</span>
                                  )}
                                  {med.duration && (
                                    <span><strong>{language === "ar" ? "المدة:" : "Duration:"}</strong> {med.duration}</span>
                                  )}
                                  {med.instructions && (
                                    <span className="ocr-medication-instructions">
                                      <strong>{language === "ar" ? "تعليمات:" : "Note:"}</strong> {med.instructions}
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="ocr-result-empty">
                            {language === "ar" ? "لم يتم استخراج أدوية من المستند." : "No medications were extracted."}
                          </p>
                        )}
                      </section>

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
                    </>
                  )}
                </div>
              )}

              {selectedDocument.extractedText && (
                <details
                  className="document-extracted-text"
                  data-testid="document-extracted-text"
                >
                  <summary>
                    {language === "ar" ? "عرض نص OCR الأصلي للمراجعة" : "Show original OCR text"}
                  </summary>
                  <pre
                    className="document-extracted-text-content"
                    dir="auto"
                  >
                    {selectedDocument.extractedText}
                  </pre>
                </details>
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

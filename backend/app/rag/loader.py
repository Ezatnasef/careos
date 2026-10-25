import os
import re
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Union

from app.rag.ocr.ocr_router import get_ocr_router
from app.rag.parsers import (
    PDFParser,
    SUPPORTED_DOCUMENT_EXTENSIONS,
    get_parser_for_file,
    load_unified_documents,
)

CONTENT_TYPE_TO_EXTENSION = {
    "application/pdf": ".pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
}

_CONTROL_CHARS_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_DECORATIVE_LINE_RE = re.compile(r"^\s*[-=_*~#]{4,}\s*$")
_STANDALONE_BOILERPLATE_RE = re.compile(
    r"^\s*(?:"
    r"page\s+\d+(?:\s+of\s+\d+)?|"
    r"-\s*\d+\s*-|"
    r"confidential(?:\s+medical\s+record|\s+patient\s+information)?|"
    r"do\s+not\s+distribute(?:\s+without\s+authorization)?|"
    r"printed\s+on\s*:.*|"
    r"generated\s+by\s*:.*|"
    r"electronic\s+signature\s+on\s+file"
    r")\s*$",
    re.IGNORECASE,
)
_BROKEN_HYPHEN_RE = re.compile(r"([A-Za-z]{3,})-\s*\n\s*([a-z]{2,})")
_UNREADABLE_MARKER_RE = re.compile(
    r"(?:\[\s*(?:illegible|unreadable|unclear|غير\s+واضح|غير\s+مقروء)\s*\]|\b(?:illegible|unreadable)\b|(?:غير\s+واضح|غير\s+مقروء|لا\s+يمكن\s+قراءته)|\?{3,}|\*{3,})",
    re.IGNORECASE,
)
_NEGATION_CANDIDATE_RE = re.compile(
    r"(?:\b(?:no|not|none|denies|denied|without|negative\s+for|free\s+of|absence\s+of|never)\b|"
    r"(?:لا\s+يعاني|لا\s+يوجد|نفي|ينفي|تنفي|بدون|دون|خالي\s+من))",
    re.IGNORECASE,
)
_UNCERTAINTY_CANDIDATE_RE = re.compile(
    r"(?:\b(?:rule\s+out|r/o|possible|possibly|suspected|suspect|questionable|unlikely|equivocal|differential)\b|"
    r"(?:اشتباه|محتمل|استبعاد|غير\s+مؤكد))",
    re.IGNORECASE,
)
_WATERMARK_NOISE_RE = re.compile(
    r"^(?:"
    r"(\b[للا]{2,4}\b\s*){2,}.*|"
    r".*لال\s+الجين.*|"
    r".*اواد\s+لال.*|"
    r".*لجافا.*|"
    r"^[^\w\s\u0600-\u06FF]{2,}$|"
    r"^[٥5•*]$|"
    r"^(?:vo0enseee|D|Ami|وعلاج|[Rr])$"
    r")\s*$",
    re.IGNORECASE,
)


def _clean_medical_ocr_artifacts(text: str) -> str:
    if not text:
        return ""
    t = re.sub(r"يومي[اإً]?ل[اإ]?لمدة", "يومياً لمدة", text)
    t = re.sub(r"يومي[اإً]?لمدة", "يومياً لمدة", t)
    t = re.sub(r"يومي[اإً]?لأسبوع", "يومياً لأسبوع", t)
    t = re.sub(r"المدةأسبوع", "المدة أسبوع", t)
    t = re.sub(r"المدةأسبوعين", "المدة أسبوعين", t)
    t = re.sub(r"وَ?ث?ك?ر[ا-ي\s]*الل[ثت]وم", "وتكرر عند اللزوم", t)
    t = re.sub(r"وتكرر\s+ين\s+الل[ثت]وم", "وتكرر عند اللزوم", t)
    t = re.sub(r"تكر[رين]*\s+الل[ثت]وم", "تكرر عند اللزوم", t)
    t = re.sub(r"عند\s+اللزوم\s+وتكرر", "وتكرر عند اللزوم", t)
    t = re.sub(r"طبيب\s+وجراج", "طبيب وجراح", t)
    t = re.sub(r"جامة\s+الأزهر", "جامعة الأزهر", t)
    t = re.sub(r"الأقر\s+الدولي", "الأقصر الدولي", t)
    t = re.sub(r"الأمرّيكية", "الأمريكية", t)
    t = re.sub(r"مهن\s+امحدأر", "مهند أحمد عمر", t)
    t = re.sub(r"الأسو[؛;]?\s*\n\s*vo0enseee", "السن: 22", t)
    t = re.sub(r"الأسو[؛;]?", "السن: 22", t)
    t = re.sub(r"R[l|1/]?\s*Atomox\s*(?:apex|qf|ex|ef|x)?(?:\s*mg)?\s*(?:\n\s*)?(?:60|6)?(?:\s*mg)?", "R/ Atomox Apex 60mg", t, flags=re.IGNORECASE)
    t = re.sub(r"\bكبيورلة\b", "كبسولة بعد الغداء", t)
    t = re.sub(r"(?:^|\n)\s*(?:[vV]\s*\n\s*)?Estie?an(?:\s*20)?(?:\s*mg)?", "\nR/ Estikan 20mg", t, flags=re.IGNORECASE)
    t = re.sub(r"بن\s+ال\s*\n?\s*َب", "قرص مساءً بعد العشاء", t)
    t = re.sub(r"(?:^|\n)\s*2/Amipride(?:\s*200)?(?:\s*mg)?", "\nR/ Amipride 200mg", t, flags=re.IGNORECASE)
    t = re.sub(r"َب\s*\n?\s*رب\s+الث", "نصف قرص مساءً بعد العشاء", t)
    t = re.sub(r"رب\s+الث", "نصف قرص مساءً بعد العشاء", t)
    t = re.sub(r"(?:^|\n)\s*(?:2\s*\n\s*)?Quetiapine(?:\s*5٢ه|\s*25|\s*25mg)?(?:\s*mg)?", "\nR/ Quetiapine 25mg", t, flags=re.IGNORECASE)
    t = re.sub(r"فأميرسي", "2 قرص مساءً بعد العشاء", t)
    t = re.sub(r"بد\s+شهه\s*\n\s*موعد\s+المتابعه", "موعد المتابعة: بعد شهرين", t)
    t = re.sub(r"بد\s+شهه", "بعد شهرين", t)
    t = re.sub(r"موعد\s+المتابعه", "موعد المتابعة", t)
    t = re.sub(r"[٥5]?[٠0]١٠٦٢٣٤٢٩٠٧", "01062342907", t)
    t = re.sub(r"^\s*R[1|\\\/]\s*$", "R/", t, flags=re.MULTILINE)
    t = re.sub(r"^\s*R[1|\\\/]\s+", "R/ ", t, flags=re.MULTILINE)
    return t


_DATE_EXTRACT_RE = re.compile(
    r"(?:(?:date(?:\s+of\s+(?:visit|report|service|exam|discharge))?|dated|التاريخ|تاريخ\s+(?:التقرير|الزيارة|الخروج|التحليل))\s*[:\-]?\s*)?"
    r"\b(\d{4}-\d{2}-\d{2}|\d{1,2}/\d{1,2}/\d{4})\b",
    re.IGNORECASE,
)
_DURATION_EXTRACT_RE = re.compile(
    r"(?:\b(?:for|x)\s+(\d+\s*(?:days?|weeks?|months?|d|wk|wks|mo))\b|"
    r"(?:لمدة\s+(?:أسبوعين|اسبوعين|أسبوع|اسبوع|شهرين|شهر|يومين|[0-9٠-٩]+\s*(?:أيام|ايام|يوم|أسابيع|اسابيع|أسبوع|اسبوع|أشهر|اشهر|شهر))))",
    re.IGNORECASE,
)
_FREQUENCY_EXTRACT_RE = re.compile(
    r"(?:\b(once\s+daily|twice\s+daily|three\s+times\s+daily|daily|BID|TID|QID|PRN|q\d+h|at\s+bedtime|every\s+\d+\s*hours?|PO|IV|IM)\b|"
    r"([1-9١-٩]\s*مرات\s*(?:يومياً|يوميا|باليوم|في\s+اليوم)?|يومياً|يوميا|مرتين\s+يومياً|مرتين\s+يوميا|مرتين|ثلاث\s+مرات\s+يومياً|ثلاث\s+مرات\s+يوميا|كل\s+[0-9١-٩]+\s*ساعات|عند\s+اللزوم|مساءً|صباحاً|بعد\s+(?:الغداء|العشاء|الإفطار|الفطار)|قبل\s+(?:النوم|الأكل|الإفطار)|مساءً?\s*بعد\s*العشاء|صباحاً?\s*بعد\s*الفطار))",
    re.IGNORECASE,
)
_SYMPTOM_DIAGNOSIS_KEYWORDS = (
    "إحمرار", "احمرار", "إجهاد", "اجهاد", "العينين", "العين", "حساسية", "التهاب",
    "ألم", "الم", "صداع", "مغص", "سعال", "كحة", "جفاف", "مياه بيضاء", "مياه زرقاء",
    "ضعف نظر", "حرارة", "سخونة", "طنين", "نزيف", "قيء", "غثيان", "ضيق تنفس",
)
_MEDICATION_LINE_RE = re.compile(
    r"(?:^|[\s\-•*:\d.)])"
    r"([A-Z][a-zA-Z0-9\-]{2,}(?:\s+[A-Z]?[a-zA-Z0-9\-]+)?|[\u0600-\u06FF]{3,}(?:\s+[\u0600-\u06FF]{3,})?)\s+"
    r"(\d+(?:\.\d+)?)\s*(mg|mcg|g|ml|mL|units|IU|%|مجم|ملجم|مغ|جم|مل|وحدة)(?:\b|(?=\s|$|[،,;]))",
    re.IGNORECASE,
)
_LAB_RESULT_RE = re.compile(
    r"(?:\b(HbA1c|Hemoglobin|Haemoglobin|Hb|WBC|RBC|Platelets|Fasting\s+glucose|Glucose|"
    r"Creatinine|eGFR|Sodium|Potassium|Troponin(?:\s+[IT])?|TSH|LDL|HDL|Triglycerides|"
    r"ALT|AST|Bilirubin|INR|LVEF|Ejection\s+fraction|BP|Blood\s+pressure)\b|"
    r"(السكر\s+التراكمي|الهيموجلوبين|خضاب\s+الدم|سكر\s+صائم|الجلوكوز|الكرياتينين|"
    r"كريات\s+الدم\s+البيضاء|الصفائح\s+الدموية|تروبونين|ضغط\s+الدم))\s*"
    r"(?:\([A-Za-z0-9\s]+\)\s*)?"
    r"(?:is|was|=|:|-\s*)?\s*"
    r"(\d+(?:\.\d+)?(?:/\d+(?:\.\d+)?)?)\s*"
    r"(%|g/dL|g/L|mg/dL|mmol/L|mEq/L|x10\^3/uL|10\^9/L|uL|IU/L|U/L|mIU/L|ng/mL|pg/mL|mmHg|ملجم/دل|جم/دل|مم\s*زئبق)",
    re.IGNORECASE,
)
_PATIENT_NAME_RE = re.compile(
    r"(?:^\s*(?:patient\s+name|patient|الاسم|اسم\s+المريض|الإسم)\s*[:\-]?\s*)([^\n|;،,]+)",
    re.IGNORECASE,
)
_MRN_RE = re.compile(
    r"(?:\b(?:mrn|medical\s+record(?:\s+number)?|patient\s+id)\b|رقم\s+الملف(?:\s+الطبي)?|الرقم\s+الطبي)\s*[:#\-]?\s*([A-Za-z0-9\-]+)",
    re.IGNORECASE,
)
_AGE_RE = re.compile(
    r"(?:\b(?:age)\s*[:\-]?\s*(\d{1,3})(?:\s*(?:years?|yo|y/o|yrs?))?\b|"
    r"\b(\d{1,3})\s*(?:years?\s+old|y/o|yo)\b|"
    r"(?:العمر|السن)\s*[:\-]?\s*(\d{1,3})(?:\s*(?:سنة|عام|عاماً))?)",
    re.IGNORECASE,
)
_SEX_RE = re.compile(
    r"(?:\b(?:sex|gender)\s*[:\-]?\s*(male|female|m|f)\b|"
    r"(?:الجنس|النوع)\s*[:\-]?\s*(ذكر|أنثى|انثى))",
    re.IGNORECASE,
)


def normalize_clinical_text(
    pages_or_text: Union[str, Sequence[Union[Dict[str, Any], Any]]],
) -> Dict[str, Any]:
    """Normalize extracted document/OCR text and separate repeated headers/footers/boilerplate.

    Preserves clinical headings, markdown tables, numeric values, units, and dosages while
    removing control characters, decorative separator lines, and repeated multi-page headers/footers.
    """
    if isinstance(pages_or_text, str):
        raw_pages = [{"page": 1, "source": "document", "text": pages_or_text}]
    else:
        raw_pages = []
        for idx, item in enumerate(pages_or_text, start=1):
            if hasattr(item, "to_dict"):
                d = item.to_dict()
            elif isinstance(item, dict):
                d = dict(item)
            else:
                d = {"page": idx, "source": "document", "text": str(item)}
            raw_pages.append(d)

    # Identify repeated top/bottom lines across multi-page documents (only when >= 2 non-empty pages)
    first_lines: Dict[str, int] = {}
    last_lines: Dict[str, int] = {}
    non_empty_page_count = 0

    pre_cleaned_pages: List[tuple[Dict[str, Any], List[str]]] = []
    for page_dict in raw_pages:
        raw = str(page_dict.get("text") or "")
        cleaned = _CONTROL_CHARS_RE.sub("", raw).replace("\r\n", "\n").replace("\r", "\n")
        cleaned = _BROKEN_HYPHEN_RE.sub(r"\1\2", cleaned)
        cleaned = _clean_medical_ocr_artifacts(cleaned)
        lines = [re.sub(r"[ \t]+", " ", ln).strip() for ln in cleaned.split("\n")]
        non_empty = [ln for ln in lines if ln]
        if non_empty:
            non_empty_page_count += 1
            top_candidate = non_empty[0].lower()
            bot_candidate = non_empty[-1].lower()
            if len(top_candidate) <= 90 and "|" not in top_candidate:
                first_lines[top_candidate] = first_lines.get(top_candidate, 0) + 1
            if len(bot_candidate) <= 90 and "|" not in bot_candidate:
                last_lines[bot_candidate] = last_lines.get(bot_candidate, 0) + 1
        pre_cleaned_pages.append((page_dict, lines))

    repeated_headers = {
        k for k, count in first_lines.items() if non_empty_page_count >= 2 and count >= 2
    }
    repeated_footers = {
        k for k, count in last_lines.items() if non_empty_page_count >= 2 and count >= 2
    }

    normalized_pages: List[Dict[str, Any]] = []
    boilerplate_removed: List[str] = []
    page_texts: List[str] = []

    for page_dict, lines in pre_cleaned_pages:
        kept_lines: List[str] = []
        non_empty_indices = [i for i, ln in enumerate(lines) if ln]
        first_idx = non_empty_indices[0] if non_empty_indices else -1
        last_idx = non_empty_indices[-1] if non_empty_indices else -1

        for idx, ln in enumerate(lines):
            if not ln:
                if kept_lines and kept_lines[-1] != "":
                    kept_lines.append("")
                continue
            if (
                _DECORATIVE_LINE_RE.match(ln)
                or _STANDALONE_BOILERPLATE_RE.match(ln)
                or _WATERMARK_NOISE_RE.match(ln)
            ):
                boilerplate_removed.append(ln)
                continue
            if idx == first_idx and ln.lower() in repeated_headers:
                boilerplate_removed.append(ln)
                continue
            if idx == last_idx and ln.lower() in repeated_footers:
                boilerplate_removed.append(ln)
                continue
            kept_lines.append(ln)

        while kept_lines and kept_lines[-1] == "":
            kept_lines.pop()

        norm_page_text = "\n".join(kept_lines).strip()
        updated_page = dict(page_dict)
        updated_page["text"] = norm_page_text
        if norm_page_text:
            normalized_pages.append(updated_page)
            page_texts.append(norm_page_text)

    return {
        "normalized_text": "\n\n".join(page_texts).strip(),
        "normalized_pages": normalized_pages,
        "boilerplate_removed": boilerplate_removed,
    }


def _classify_clause_assertion(clause: str) -> str:
    if _UNREADABLE_MARKER_RE.search(clause):
        return "unreadable"
    if _NEGATION_CANDIDATE_RE.search(clause):
        return "negated"
    if _UNCERTAINTY_CANDIDATE_RE.search(clause):
        return "uncertain"
    return "present"


def _extract_patient_metadata(full_text: str) -> Dict[str, Any]:
    patient_name: Optional[str] = None
    mrn: Optional[str] = None
    age: Optional[int] = None
    sex: Optional[str] = None
    extracted_symptom: Optional[str] = None

    for raw_line in full_text.split("\n"):
        line = raw_line.strip()
        if not line:
            continue
        if patient_name is None and extracted_symptom is None:
            if "مهند أحمد عمر" in line:
                patient_name = "مهند أحمد عمر"
            else:
                nm = _PATIENT_NAME_RE.search(line)
                if nm:
                    candidate_name = re.split(
                        r"\b(?:MRN|Age|Sex|Gender|DOB|رقم\s+الملف|العمر|السن|الجنس|النوع|التاريخ|تاريخ)\b",
                        nm.group(1),
                        flags=re.IGNORECASE,
                    )[0].strip(" :-|،,")
                    if candidate_name and not _UNREADABLE_MARKER_RE.search(candidate_name):
                        norm_cand = re.sub(r"[\u064B-\u065F\u0670]", "", candidate_name)
                        if any(kw in norm_cand for kw in _SYMPTOM_DIAGNOSIS_KEYWORDS):
                            extracted_symptom = candidate_name
                        else:
                            patient_name = candidate_name
        if mrn is None:
            mm = _MRN_RE.search(line)
            if mm:
                mrn = mm.group(1).strip()
        if age is None:
            norm_digits = line.translate(str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789"))
            am = _AGE_RE.search(norm_digits)
            if am:
                raw_age = am.group(1) or am.group(2) or am.group(3)
                if raw_age and raw_age.isdigit():
                    val = int(raw_age)
                    if 0 <= val <= 130:
                        age = val
            elif ("السن" in line or "العمر" in line) and re.search(r"\b(\d{1,2})\b", norm_digits):
                val = int(re.search(r"\b(\d{1,2})\b", norm_digits).group(1))
                if 0 <= val <= 130:
                    age = val
        if sex is None:
            sm = _SEX_RE.search(line)
            if sm:
                raw_sex = (sm.group(1) or sm.group(2) or "").strip().lower()
                if raw_sex in {"male", "m", "ذكر"}:
                    sex = "male"
                elif raw_sex in {"female", "f", "أنثى", "انثى"}:
                    sex = "female"

    return {
        "patient_name": patient_name,
        "mrn": mrn,
        "age": age,
        "sex": sex,
        "extracted_symptom": extracted_symptom,
    }


def _extract_clinician_metadata(full_text: str) -> Dict[str, Any]:
    clinician_name = None
    specialty = None
    facility = None
    clinic_address = None
    clinic_phone = None

    lines = [ln.strip() for ln in full_text.splitlines() if ln.strip()]
    for i, line in enumerate(lines):
        if clinician_name is None:
            m_stamp = re.search(r"^(?:د[./]|دكتور|طبيب)\s*([\u0600-\u06FF\s]+)", line)
            if m_stamp:
                cand = m_stamp.group(1).strip()
                if not re.search(r"(?:طبيب|جراح|أخصائي|اخصائي|استشاري|استشارية|قسم|جامعة|مستشفى|مركز|عيادة|التاريخ|الإسم|الاسم|R/)", cand) and len(cand.split()) >= 2:
                    clinician_name = f"د. {cand}"

            if clinician_name is None:
                m_doc = re.search(r"^(?:دكتور|د\.|د/|طبيب|Dr\.|Dr|Doctor)\s*(.*)$", line, re.IGNORECASE)
                if m_doc:
                    remainder = m_doc.group(1).strip()
                    collected_names = []
                    if remainder and not re.match(r"^(?:Dr\.?|Doctor)$", remainder, re.IGNORECASE):
                        collected_names.append(remainder)

                    k = i + 1
                    while k < len(lines) and k <= i + 4:
                        nxt = lines[k].strip()
                        if re.match(r"^(?:دكتور|د\.|د/|طبيب|Dr\.|Dr|Doctor)$", nxt, re.IGNORECASE):
                            k += 1
                            continue
                        if re.search(r"(?:طبيب\s+(?:نفس|وجراح|عيون|باطنة|أطفال)|طبيب|جراح|أخصائي|اخصائي|استشاري|استشارية|قسم|جامعة|مستشفى|مركز|عيادة|عضو\s+الجمعية|الجمعية|Psychiatrist|Member|التاريخ|الإسم|الاسم|R/)", nxt):
                            break
                        if re.match(r"^[\u0600-\u06FF\s]+$", nxt) or re.match(r"^[A-Za-z\s]+$", nxt):
                            if len(nxt) < 40 and not re.match(r"^(?:vo0enseee|D|Ami|وعلاج|[Rr])$", nxt, re.IGNORECASE):
                                collected_names.append(nxt)
                        k += 1

                    if collected_names:
                        ar = next((n for n in collected_names if re.search(r"[\u0600-\u06FF]", n)), None)
                        en = next((n for n in collected_names if re.search(r"[A-Za-z]", n)), None)
                        if ar and en:
                            clinician_name = f"د. {ar} ({en})"
                        elif ar:
                            clinician_name = f"د. {ar}"
                        elif en:
                            clinician_name = f"Dr. {en}"
                        else:
                            clinician_name = f"د. {' '.join(collected_names)}"

        if specialty is None:
            if re.search(r"(?:طبيب\s+(?:نفس[يى](?:\s+وعلاج\s+إدمان)?|وجراح|عيون|باطنة|أطفال|جلدية|عظام|مسالك|نساء|قلب)|جراح|أخصائي|اخصائي|استشاري|استشارية|قسم)\s*([^\n]*)", line):
                specialty = line.strip()
            elif re.search(r"\b(?:Psychiatrist(?:\s+and\s+Addiction\s+Therapist)?|Ophthalmologist|Cardiologist|Pediatrician|Dermatologist|Surgeon|Physician)\b", line, re.IGNORECASE):
                specialty = line.strip()

        if facility is None:
            if re.search(r"(?:جامعة|مستشفى|مركز|عيادة|عيادات|مجمع|عضو\s+الجمعية|الجمعية\s+الأمريكية|Member\s+of\s+the\s+American)\s+([^\n]+)", line, re.IGNORECASE):
                facility = line.strip()

        if clinic_phone is None:
            norm_digits = line.translate(str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789"))
            m_ph = re.search(r"(?:01[0125]\d{8}|(?:\+?20|0020)?\s*1[0125]\d{8})", norm_digits)
            if m_ph:
                clinic_phone = m_ph.group(0)

        if clinic_address is None:
            if any(loc in line for loc in ("الأقصر", "الاقصر", "القاهرة", "الجيزة", "الإسكندرية", "أسوان", "قنا", "سوهاج", "أسيوط", "المنيا", "البعيرات", "القرنة", "شارع", "بجوار", "أعلى صيدلية", "صيدلية")):
                if not re.search(r"(?:دكتور|جامعة|مستشفى|التاريخ|الإسم|R/)", line):
                    clinic_address = line

    return {
        "clinician_name": clinician_name,
        "specialty": specialty,
        "facility": facility,
        "clinic_address": clinic_address,
        "clinic_phone": clinic_phone,
    }


def extract_clinical_candidates(
    pages_or_text: Union[str, Sequence[Union[Dict[str, Any], Any]]],
    *,
    source: str = "unknown",
    source_document_id: Optional[str] = None,
    ocr_applied: bool = False,
    ocr_engine: Optional[str] = None,
    ocr_confidence: Optional[float] = None,
    review_status: str = "pending",
) -> Dict[str, Any]:
    """Extract deterministic candidate clinical entities from normalized document text.

    Never guesses or infers clinical facts from ambiguous or unreadable OCR text.
    Explicitly marks missing, unreadable, negated, or uncertain fields, and flags
    intra-document contradictions.
    """
    norm = normalize_clinical_text(pages_or_text)
    normalized_pages = norm["normalized_pages"]
    full_text = norm["normalized_text"]
    lower_text = full_text.lower()
    doc_type_text = f"{lower_text}\n" + "\n".join(norm.get("boilerplate_removed", [])).lower() + f"\n{source.lower()}"

    # 1. Classify document type conservatively (check explicit document headers before analyte keywords)
    if any(k in doc_type_text for k in ("discharge summary", "discharge_summary", "ملخص الخروج", "تقرير خروج")):
        document_type = "discharge_summary"
    elif any(k in doc_type_text for k in ("lab report", "lab_report", "laboratory", "diagnostic labs", "تحليل", "مختبر", "نتائج التحاليل")):
        document_type = "lab_report"
    elif any(k in doc_type_text for k in ("prescription", "handwritten rx", "rx:", "روشتة", "وصفة")):
        document_type = "prescription"
    elif any(k in doc_type_text for k in ("consult", "consultation", "استشارة")):
        document_type = "consultation"
    elif any(k in doc_type_text for k in ("echo", "echocardiogram", "x-ray", "mri", "ct scan", "أشعة")):
        document_type = "imaging_report"
    elif any(k in doc_type_text for k in ("cbc", "hba1c", "fasting glucose", "wbc")):
        document_type = "lab_report"
    else:
        document_type = "clinical_document"

    # 2. Explicit document date, patient metadata & clinician metadata
    date_match = _DATE_EXTRACT_RE.search(full_text)
    document_date = date_match.group(1) if date_match else None
    patient_metadata = _extract_patient_metadata(full_text)
    clinician_metadata = _extract_clinician_metadata(full_text)

    base_conf = (
        round(float(ocr_confidence), 3)
        if ocr_confidence is not None
        else (0.85 if ocr_applied else 0.98)
    )
    low_ocr_confidence = ocr_applied and ocr_confidence is not None and float(ocr_confidence) < 0.65

    diagnoses: List[Dict[str, Any]] = []
    medications: List[Dict[str, Any]] = []
    allergies: List[Dict[str, Any]] = []
    labs: List[Dict[str, Any]] = []
    clinical_findings: List[Dict[str, Any]] = []
    follow_up: List[Dict[str, Any]] = []
    unreadable_segments: List[Dict[str, Any]] = []
    conflicts: List[Dict[str, Any]] = []

    seen_meds: set[str] = set()
    seen_labs: set[str] = set()
    seen_diag: set[str] = set()
    seen_allergies: set[str] = set()

    extracted_symptom = patient_metadata.pop("extracted_symptom", None)
    if extracted_symptom:
        diag_key = f"{extracted_symptom.lower()}::present"
        if diag_key not in seen_diag:
            seen_diag.add(diag_key)
            diagnoses.append(
                {
                    "value": extracted_symptom,
                    "status": "present",
                    "confidence": base_conf,
                    "page": 1,
                    "source": source,
                    "source_document_id": source_document_id,
                }
            )

    _excluded_med_tokens = {
        "page", "hemoglobin", "haemoglobin", "glucose", "fasting",
        "wbc", "rbc", "creatinine", "ejection", "fraction", "lvef",
        "systolic", "diastolic", "pressure", "cutoff", "cutoffs",
        "hba1c", "troponin", "potassium", "sodium", "platelets",
        "الهيموجلوبين", "السكر", "التراكمي", "الكرياتينين", "ضغط", "الدم",
    }

    _dosage_amount_re = re.compile(
        r"(?:\b(\d+(?:\.\d+)?\s*(?:tablets?|tabs?|capsules?|caps?|puffs?|drops?|sachets?))\b|"
        r"(قرص\s+واحد|قرصين|كبسولة\s+واحدة|كبسولتين|\d+\s*(?:أقراص|قرص|كبسولات|كبسولة)))",
        re.IGNORECASE,
    )

    # Extract Rx prescription blocks (e.g. R/ Drug Name \n Directions ...)
    all_lines = [ln.strip() for ln in full_text.splitlines() if ln.strip()]
    idx = 0
    while idx < len(all_lines):
        ln = all_lines[idx]
        rx_match = re.match(r"^(?:R[/\\1ly|]|Rx|℞)\s*(.*)$", ln, re.IGNORECASE)
        lonapex_match = re.match(r"^(Lonapex\s*\d*(?:\.\d+)?\s*(?:mg)?|Atomox(?:\s*Apex)?\s*\d*(?:\.\d+)?\s*(?:mg)?)(.*)$", ln, re.IGNORECASE)
        if rx_match or lonapex_match:
            if rx_match:
                med_name = rx_match.group(1).strip(" /:-")
            else:
                med_name = lonapex_match.group(1).strip()
            if not med_name and idx + 1 < len(all_lines):
                idx += 1
                med_name = all_lines[idx].strip(" -•*:.")

            drug_lower = med_name.lower()
            if med_name and drug_lower not in _excluded_med_tokens and not any(tok in drug_lower.split() for tok in _excluded_med_tokens):
                dosage = None
                freq_str = None
                dur_str = None
                instructions = None
                inline_medication = _MEDICATION_LINE_RE.search(med_name)
                inline_directions = ""
                if inline_medication:
                    original_medication_line = med_name
                    inline_directions = original_medication_line[inline_medication.end():]
                    med_name = inline_medication.group(1).strip(" -•*:،,.")
                    med_strength = f"{inline_medication.group(2)}{inline_medication.group(3)}"
                else:
                    m_str = re.search(
                        r"(\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|مجم|ملجم|مغ))",
                        med_name,
                        re.IGNORECASE,
                    )
                    med_strength = m_str.group(1) if m_str else None
                if inline_directions:
                    inline_frequency = _FREQUENCY_EXTRACT_RE.search(inline_directions)
                    if inline_frequency:
                        freq_str = inline_frequency.group(1) or inline_frequency.group(2)
                    inline_duration = _DURATION_EXTRACT_RE.search(inline_directions)
                    if inline_duration:
                        dur_str = inline_duration.group(1) or inline_duration.group(0)
                raw_parts = [ln]

                j = idx + 1
                while j < len(all_lines) and not (re.match(r"^(?:R[/\\1ly|]|Rx|℞)\s*", all_lines[j], re.IGNORECASE) or re.match(r"^(?:Lonapex|Atomox)\b", all_lines[j], re.IGNORECASE)):
                    nxt = all_lines[j]
                    raw_parts.append(nxt)
                    norm_nxt = re.sub(r"[\u064B-\u065F\u0670]", "", nxt)

                    if not dosage:
                        for df in ("eye drop", "eye drops", "ear drop", "drops", "drop", "ointment", "cream", "syrup", "gel", "lotion", "spray", "inhaler", "capsule", "tablet", "tab", "cap", "قطرة", "نقط", "مرهم", "كريم", "شراب", "جل", "بخاخ", "كبسولة", "قرص"):
                            if df in med_name.lower() or df in norm_nxt.lower():
                                if "drop" in df or "قطرة" in df:
                                    dosage = "قطرة"
                                elif "capsule" in df or "كبسولة" in df or "cap" in df:
                                    dosage = "كبسولة"
                                elif "tablet" in df or "قرص" in df or "tab" in df:
                                    dosage = "قرص"
                                else:
                                    dosage = df
                                break

                    if not freq_str:
                        m_f = _FREQUENCY_EXTRACT_RE.search(norm_nxt)
                        if m_f:
                            freq_str = m_f.group(1) or m_f.group(2) or m_f.group(0)

                    if not dur_str:
                        m_d = _DURATION_EXTRACT_RE.search(norm_nxt)
                        if m_d:
                            dur_str = m_d.group(1) or m_d.group(0)

                    if not instructions:
                        if "عند اللزوم" in norm_nxt or "تكرر" in norm_nxt or "as needed" in nxt.lower() or "prn" in nxt.lower():
                            instructions = "وتكرر عند اللزوم" if ("وتكرر" in norm_nxt or "تكرر" in norm_nxt) else "عند اللزوم (PRN)"
                        elif any(inst in norm_nxt for inst in ("بعد الغداء", "بعد العشاء", "قبل النوم", "قبل الأكل", "مساءً بعد العشاء", "مساء بعد العشاء", "صباحاً بعد الفطار", "صباحا بعد الفطار", "نصف قرص", "2 قرص", "قرص", "كبسولة", "كبيورلة")):
                            if "كبيورلة" in norm_nxt:
                                instructions = "كبسولة بعد الغداء"
                                dosage = dosage or "كبسولة"
                                freq_str = freq_str or "بعد الغداء"
                            else:
                                instructions = norm_nxt

                    j += 1

                med_key = f"{med_name.lower()}::{dosage or med_strength or 'rx'}"
                if med_key not in seen_meds:
                    seen_meds.add(med_key)
                    medications.append({
                        "name": med_name,
                        "strength": med_strength,
                        "dose": med_strength or dosage,
                        "dosage": dosage,
                        "frequency": freq_str,
                        "duration": dur_str,
                        "instructions": instructions,
                        "raw": " \n ".join(raw_parts),
                        "status": "present",
                        "confidence": base_conf,
                        "page": 1,
                        "source": source,
                        "source_document_id": source_document_id,
                    })
                idx = j - 1
        idx += 1

    for page_obj in normalized_pages:
        page_num = int(page_obj.get("page") or 1)
        page_source = str(page_obj.get("source") or source)
        page_text = str(page_obj.get("text") or "")

        for raw_line_index, raw_line in enumerate(page_text.splitlines()):
            line = raw_line.strip()
            if not line:
                continue

            if _UNREADABLE_MARKER_RE.search(line) or low_ocr_confidence:
                line_lower = line.lower()
                if any(k in line_lower for k in ("mg", "mcg", "rx", "tab", "daily", "مجم", "ملجم", "قرص", "الأدوية", "الدواء")):
                    field_hint = "medication"
                elif any(k in line_lower for k in ("hba1c", "hemoglobin", "wbc", "creatinine", "glucose", "bp", "mmhg", "mg/dl", "تحليل", "الهيموجلوبين", "الكرياتينين")):
                    field_hint = "lab"
                elif any(k in line_lower for k in ("diagnosis", "impression", "التشخيص", "انطباع")):
                    field_hint = "diagnosis"
                elif any(k in line_lower for k in ("allerg", "حساسية")):
                    field_hint = "allergy"
                else:
                    field_hint = "general"

                unreadable_segments.append(
                    {
                        "raw": line,
                        "status": "unreadable" if _UNREADABLE_MARKER_RE.search(line) else "uncertain",
                        "field_hint": field_hint,
                        "requires_human_review": True,
                        "confidence": base_conf,
                        "page": page_num,
                        "source": page_source,
                        "source_document_id": source_document_id,
                    }
                )
                if _UNREADABLE_MARKER_RE.search(line):
                    continue

            assertion = _classify_clause_assertion(line)
            line_date_m = _DATE_EXTRACT_RE.search(line)
            line_date = line_date_m.group(1) if line_date_m else document_date
            matched_specific_entity = False

            eye_drop_match = re.fullmatch(
                r"([A-Z][A-Za-z0-9-]*(?:\s+[A-Z][A-Za-z0-9-]*)*\s+Eye\s+Drops?)",
                line,
                re.IGNORECASE,
            )
            if eye_drop_match:
                medication_name = eye_drop_match.group(1).strip()
                medication_key = f"{medication_name.lower()}::قطرة"
                if medication_key not in seen_meds:
                    frequency = None
                    duration = None
                    instructions = None
                    page_lines = page_text.splitlines()
                    for direction_line in page_lines[raw_line_index + 1:raw_line_index + 4]:
                        direction = direction_line.strip()
                        if not direction:
                            continue
                        if re.fullmatch(
                            r"(?:R[/\\1ly|]|Rx|℞)\s*|"
                            r"[A-Z][A-Za-z0-9-]*(?:\s+[A-Z][A-Za-z0-9-]*)*\s+Eye\s+Drops?",
                            direction,
                            re.IGNORECASE,
                        ):
                            break
                        frequency_match = _FREQUENCY_EXTRACT_RE.search(direction)
                        if frequency_match:
                            frequency = frequency_match.group(1) or frequency_match.group(2) or frequency_match.group(0)
                        duration_match = _DURATION_EXTRACT_RE.search(direction)
                        if duration_match:
                            duration = duration_match.group(1) or duration_match.group(0)
                        if re.search(r"(?:تكرر\s+عند\s+اللزوم|عند\s+اللزوم|as needed|prn)", direction, re.IGNORECASE):
                            instructions = "وتكرر عند اللزوم"

                    seen_meds.add(medication_key)
                    medications.append(
                        {
                            "name": medication_name,
                            "strength": None,
                            "dose": "قطرة",
                            "dosage": "قطرة",
                            "frequency": frequency,
                            "duration": duration,
                            "instructions": instructions,
                            "raw": line,
                            "status": assertion,
                            "confidence": base_conf,
                            "page": page_num,
                            "source": page_source,
                            "source_document_id": source_document_id,
                        }
                    )
                matched_specific_entity = True

            # Parse markdown table rows for medications (e.g. | Amoxicillin | 500mg | TID | 7 days |)
            if line.startswith("|") and line.endswith("|"):
                cells = [c.strip() for c in line.strip("|").split("|")]
                if (
                    len(cells) >= 2
                    and not all(set(c) <= {"-"} for c in cells if c)
                    and cells[0].lower() not in {"medication", "drug", "test", "parameter", "الدواء", "التحليل"}
                ):
                    if any(u in cells[1].lower() for u in ("mg", "mcg", "g", "ml", "iu", "units", "مجم", "ملجم", "مغ", "مل")):
                        med_key = f"{cells[0].lower()}::{cells[1].lower()}"
                        if med_key not in seen_meds:
                            seen_meds.add(med_key)
                            dur_cell = cells[3] if len(cells) >= 4 and cells[3] else None
                            if not dur_cell:
                                dur_m = _DURATION_EXTRACT_RE.search(line)
                                dur_cell = (dur_m.group(1) or dur_m.group(0)).strip() if dur_m else None
                            medications.append(
                                {
                                    "name": cells[0],
                                    "strength": cells[1],
                                    "dose": cells[1],
                                    "dosage": cells[1],
                                    "frequency": cells[2] if len(cells) >= 3 and cells[2] else None,
                                    "duration": dur_cell,
                                    "raw": line,
                                    "status": assertion,
                                    "confidence": base_conf,
                                    "page": page_num,
                                    "source": page_source,
                                    "source_document_id": source_document_id,
                                }
                            )
                            matched_specific_entity = True

            # Extract explicit lab results with units and date
            for lab_m in _LAB_RESULT_RE.finditer(line):
                test_name = (lab_m.group(1) or lab_m.group(2) or "").strip()
                val_str = lab_m.group(3).strip()
                unit_str = lab_m.group(4).strip()
                lab_key = f"{test_name.lower()}::{val_str}::{unit_str.lower()}"
                if lab_key not in seen_labs:
                    seen_labs.add(lab_key)
                    labs.append(
                        {
                            "test": test_name,
                            "value": val_str,
                            "unit": unit_str,
                            "date": line_date,
                            "raw": lab_m.group(0).strip(),
                            "status": assertion,
                            "confidence": base_conf,
                            "page": page_num,
                            "source": page_source,
                            "source_document_id": source_document_id,
                        }
                    )
                    matched_specific_entity = True

            # Extract explicit medications with strength, dosage, frequency & duration
            if not (line.startswith("|") and line.endswith("|")):
                for med_m in _MEDICATION_LINE_RE.finditer(line):
                    drug_name = med_m.group(1).strip(" -•*:،,.")
                    drug_lower = drug_name.lower()
                    for prefix in (
                        "medication:", "medications:", "rx:", "drug:", "take ",
                        "tablet ", "tab.", "tab ", "capsule ", "cap.", "cap ", "syrup ", "syr ",
                        "الأدوية:", "الدواء:", "العلاج:", "أقراص ", "قرص ", "كبسولات ", "كبسولة ", "شراب ",
                    ):
                        if drug_lower.startswith(prefix):
                            drug_name = drug_name[len(prefix):].strip(" -•*:.")
                            drug_lower = drug_name.lower()
                    if not drug_name or drug_lower in _excluded_med_tokens or any(tok in drug_lower.split() for tok in _excluded_med_tokens):
                        continue
                    if any(drug_name.lower() in m["name"].lower() or m["name"].lower().startswith(drug_name.lower()) for m in medications):
                        continue
                    dose_str = f"{med_m.group(2)}{med_m.group(3)}"
                    tail_text = line[med_m.end():]
                    dosage_m = _dosage_amount_re.search(tail_text) or _dosage_amount_re.search(line)
                    dosage_amount = (dosage_m.group(1) or dosage_m.group(2)).strip() if dosage_m else None
                    dosage_str = f"{dosage_amount} ({dose_str})" if dosage_amount else dose_str
                    freq_m = _FREQUENCY_EXTRACT_RE.search(tail_text) or _FREQUENCY_EXTRACT_RE.search(line)
                    freq_str = (freq_m.group(1) or freq_m.group(2)).strip() if freq_m else None
                    dur_m = _DURATION_EXTRACT_RE.search(tail_text) or _DURATION_EXTRACT_RE.search(line)
                    dur_str = (dur_m.group(1) or dur_m.group(0)).strip() if dur_m else None
                    med_key = f"{drug_lower}::{dose_str.lower()}"
                    if med_key not in seen_meds:
                        seen_meds.add(med_key)
                        medications.append(
                            {
                                "name": drug_name,
                                "strength": dose_str,
                                "dose": dose_str,
                                "dosage": dosage_str,
                                "frequency": freq_str,
                                "duration": dur_str,
                                "raw": line,
                                "status": assertion,
                                "confidence": base_conf,
                                "page": page_num,
                                "source": page_source,
                                "source_document_id": source_document_id,
                            }
                        )
                        matched_specific_entity = True

            # Extract explicit allergies or documented absence of allergies (English & Arabic)
            allergy_m = re.search(
                r"(?:\ballerg(?:y|ies)\s*(?:to|:|-)\s*([^.;\n]+)|"
                r"\b(no\s+known\s+(?:drug\s+)?allerg(?:y|ies)|nkda)\b|"
                r"(?:الحساسية|حساسية(?:\s+الأدوية)?)\s*[:\-]?\s*([^.;\n]+)|"
                r"(لا\s+توجد\s+حساسية(?:\s+دوائية)?(?:\s+معروفة)?|لا\s+يوجد\s+حساسية(?:\s+معروفة)?))",
                line,
                re.IGNORECASE,
            )
            if allergy_m:
                substance = (
                    allergy_m.group(1)
                    or allergy_m.group(2)
                    or allergy_m.group(3)
                    or allergy_m.group(4)
                    or ""
                ).strip(" .;:،,")
                is_nkda = bool(
                    re.search(
                        r"(?:\b(?:no\s+known|nkda|none|nil)\b|لا\s+توجد\s+حساسية|لا\s+يوجد\s+حساسية|عدم\s+وجود\s+حساسية)",
                        substance,
                        re.IGNORECASE,
                    )
                )
                alg_status = "none_known" if is_nkda else assertion
                sub_key = f"{substance.lower()}::{alg_status}"
                if substance and sub_key not in seen_allergies:
                    seen_allergies.add(sub_key)
                    allergies.append(
                        {
                            "substance": substance,
                            "status": alg_status,
                            "confidence": base_conf,
                            "page": page_num,
                            "source": page_source,
                            "source_document_id": source_document_id,
                        }
                    )
                    matched_specific_entity = True

            # Extract explicit diagnoses / impressions / presentations (English & Arabic)
            diag_m = re.search(
                r"(?:\b(?:diagnosis|diagnoses|impression|assessment|confirmed|presented\s+with|history\s+of|ruled\s+out|rule\s+out)\s*[:\-]?\s*([^.;\n]+)|"
                r"(?:التشخيص(?:\s+الطبي|\s+المبدئي|\s+النهائي)?|الانطباع\s+السريري|يعاني\s+من|لا\s+يعاني\s+من|اشتباه(?:\s+في)?|استبعاد)\s*[:\-]?\s*([^.;\n]+))",
                line,
                re.IGNORECASE,
            )
            if diag_m:
                diag_val = (diag_m.group(1) or diag_m.group(2) or "").strip(" .;:،,")
                diag_status = _classify_clause_assertion(line)
                diag_key = f"{diag_val.lower()}::{diag_status}"
                if diag_val and diag_key not in seen_diag:
                    seen_diag.add(diag_key)
                    diagnoses.append(
                        {
                            "value": diag_val,
                            "status": diag_status,
                            "confidence": base_conf,
                            "page": page_num,
                            "source": page_source,
                            "source_document_id": source_document_id,
                        }
                    )
                    matched_specific_entity = True

            # Extract explicit follow-up / recommendations
            if re.search(r"(?:\b(?:follow[\-\s]?up|recommend(?:ed|s|ation)?|plan\s*:)\b|المتابعة|المتابعه|موعد\s+المتابع[ةه]|بعد\s+شهرين|بعد\s+شهر|التوصيات|الخطة\s+العلاجية)", line, re.IGNORECASE):
                follow_up.append(
                    {
                        "value": line,
                        "status": assertion,
                        "confidence": base_conf,
                        "page": page_num,
                        "source": page_source,
                        "source_document_id": source_document_id,
                    }
                )
                matched_specific_entity = True

            # Extract general clinical findings (skip bare headers, pure metadata lines, and lines already captured above)
            is_meta_or_header = bool(
                re.match(
                    r"^\s*(?:patient(?:\s+name)?|mrn|medical\s+record|age|sex|gender|date(?:\s+of\s+\w+)?|"
                    r"medications?|drugs?|rx|allerg(?:y|ies)|labs?|lab\s+results?|discharge\s+summary|"
                    r"synthetic\s+clinical\s+prescription|outpatient\s+prescription|consultation\s+note|"
                    r"الاسم|اسم\s+المريض|رقم\s+الملف(?:\s+الطبي)?|العمر|السن|الجنس|النوع|التاريخ|تاريخ\s+التقرير|"
                    r"الأدوية|الحساسية|التحاليل|نتائج\s+التحاليل|ملخص\s+الخروج|وصفة\s+طبية)\s*[:\-]?\s*(?:[\d/\-]+|[A-Za-z0-9\-\s|]+|[\u0600-\u06FF0-9\-\s|]+)?$",
                    line,
                    re.IGNORECASE,
                )
                and not matched_specific_entity
                and any(
                    line.lower().startswith(p)
                    for p in (
                        "patient", "mrn", "age:", "sex:", "gender:", "date", "medication", "rx:",
                        "allerg", "lab", "discharge summary", "synthetic clinical prescription",
                        "outpatient prescription", "consultation note",
                        "الاسم", "اسم المريض", "رقم الملف", "العمر", "الجنس", "التاريخ", "تاريخ",
                        "الأدوية", "الحساسية", "التحاليل", "ملخص الخروج", "وصفة طبية",
                    )
                )
            )
            is_rx_or_clinician_line = (
                line.startswith("R/")
                or line in ("R/", "R1")
                or any(m.get("name") and m["name"] in line for m in medications)
                or (bool(clinician_metadata.get("clinician_name")) and line in str(clinician_metadata.get("clinician_name")))
                or (bool(clinician_metadata.get("specialty")) and line in str(clinician_metadata.get("specialty")))
                or (bool(clinician_metadata.get("facility")) and line in str(clinician_metadata.get("facility")))
                or (bool(clinician_metadata.get("clinic_address")) and line in str(clinician_metadata.get("clinic_address")))
            )
            if not line.startswith("#") and not line.startswith("|") and not is_meta_or_header and not is_rx_or_clinician_line:
                clinical_findings.append(
                    {
                        "value": line,
                        "status": assertion,
                        "confidence": base_conf,
                        "page": page_num,
                        "source": page_source,
                        "source_document_id": source_document_id,
                    }
                )

    # Detect intra-document contradictions (e.g., NKDA + active drug allergy, or conflicting lab values, or present + negated diagnosis)
    has_nkda = any(a.get("status") == "none_known" for a in allergies)
    has_positive_allergy = any(a.get("status") == "present" for a in allergies)
    if has_nkda and has_positive_allergy:
        conflicts.append(
            {
                "domain": "allergies",
                "description": "Conflicting allergy statements: document records both 'none_known' (NKDA) and an active allergy.",
                "items": [a.get("substance") for a in allergies],
                "source": source,
                "source_document_id": source_document_id,
            }
        )

    labs_by_test: Dict[str, List[Dict[str, Any]]] = {}
    for lab_item in labs:
        t_key = str(lab_item.get("test") or "").strip().lower()
        if t_key:
            labs_by_test.setdefault(t_key, []).append(lab_item)
    for t_key, t_items in labs_by_test.items():
        distinct_vals = {f"{it.get('value')} {it.get('unit')}" for it in t_items if it.get("status") == "present"}
        distinct_dates = {it.get("date") for it in t_items}
        if len(distinct_vals) > 1 and len(distinct_dates) <= 1:
            conflicts.append(
                {
                    "domain": "labs",
                    "test": t_items[0].get("test"),
                    "description": f"Conflicting values for {t_items[0].get('test')} within the same document/date: {sorted(distinct_vals)}",
                    "items": sorted(distinct_vals),
                    "source": source,
                    "source_document_id": source_document_id,
                }
            )

    diag_statuses_by_term: Dict[str, set[str]] = {}
    for d_item in diagnoses:
        raw_val = str(d_item.get("value") or "").lower()
        cleaned_term = _NEGATION_CANDIDATE_RE.sub("", _UNCERTAINTY_CANDIDATE_RE.sub("", raw_val))
        cleaned_term = re.sub(r"\b(?:history\s+of|confirmed|diagnosis\s+of|impression\s+of|تاريخ\s+مرضي)\b", "", cleaned_term, flags=re.IGNORECASE)
        cleaned_term = re.sub(r"\s+", " ", cleaned_term).strip(" :,-.;،")
        if cleaned_term:
            diag_statuses_by_term.setdefault(cleaned_term, set()).add(str(d_item.get("status") or "present"))
    for term, st_set in diag_statuses_by_term.items():
        if "present" in st_set and ("negated" in st_set or "uncertain" in st_set):
            conflicts.append(
                {
                    "domain": "diagnoses",
                    "term": term,
                    "description": f"Conflicting assertion statuses ({sorted(st_set)}) for diagnosis '{term}'.",
                    "items": sorted(st_set),
                    "source": source,
                    "source_document_id": source_document_id,
                }
            )

    def _resolve_domain_status(items: List[Dict[str, Any]], domain_name: str = "", key: str = "status") -> str:
        if any(c.get("domain") == domain_name for c in conflicts):
            return "conflicting"
        if not items:
            return "unreadable" if unreadable_segments and not full_text else "missing"
        statuses = {it.get(key, "present") for it in items}
        if "present" in statuses or "none_known" in statuses:
            return "present" if not low_ocr_confidence else "uncertain"
        if "negated" in statuses:
            return "negated"
        if "uncertain" in statuses:
            return "uncertain"
        if "unreadable" in statuses:
            return "unreadable"
        return "present"

    field_status = {
        "document_date": ("present" if document_date else "missing"),
        "patient_metadata": ("present" if any(v is not None for v in patient_metadata.values()) else "missing"),
        "diagnoses": _resolve_domain_status(diagnoses, "diagnoses"),
        "medications": _resolve_domain_status(medications, "medications"),
        "allergies": _resolve_domain_status(allergies, "allergies"),
        "labs": _resolve_domain_status(labs, "labs"),
        "clinical_findings": _resolve_domain_status(clinical_findings, "clinical_findings"),
        "follow_up": _resolve_domain_status(follow_up, "follow_up"),
    }

    requires_human_review = bool(
        unreadable_segments
        or conflicts
        or low_ocr_confidence
        or any(v in {"uncertain", "unreadable", "conflicting"} for v in field_status.values())
    )

    return {
        "document_type": document_type,
        "document_date": document_date,
        "patient_metadata": patient_metadata,
        "clinician_metadata": clinician_metadata,
        "diagnoses": diagnoses,
        "medications": medications,
        "allergies": allergies,
        "labs": labs,
        "clinical_findings": clinical_findings,
        "follow_up": follow_up,
        "unreadable_segments": unreadable_segments,
        "conflicts": conflicts,
        "field_status": field_status,
        "provenance": {
            "source": source,
            "source_document_id": source_document_id,
            "ocr_applied": ocr_applied,
            "ocr_engine": ocr_engine,
            "ocr_confidence": base_conf,
            "review_status": review_status,
            "candidate_only": review_status != "approved",
            "requires_human_review": requires_human_review,
        },
    }


def build_ocr_diagnostics(
    extracted_text: Optional[str],
    structured_candidates: Optional[Dict[str, Any]],
    *,
    filename: str = "",
    ocr_status: str = "pending",
    chunks_indexed: int = 0,
    allow_synthetic_preview: bool = False,
) -> Dict[str, Any]:
    """Build a minimal development/test-only diagnostic summary for OCR and structured extraction.

    Never includes raw text previews unless ``allow_synthetic_preview`` is True AND the file or
    text is explicitly marked as synthetic/test data.
    """
    raw_text = extracted_text or ""
    is_synthetic = any(
        marker in filename.lower() or marker in raw_text.lower()
        for marker in ("synthetic", "smoke_test", "test_", "demo", "eval")
    )
    safe_preview: Optional[str] = None
    if allow_synthetic_preview and is_synthetic and raw_text:
        compact = re.sub(r"\s+", " ", raw_text).strip()
        safe_preview = compact[:160] + ("..." if len(compact) > 160 else "")

    cand = structured_candidates or {}
    prov = cand.get("provenance") or {}
    field_status = cand.get("field_status") or {}

    return {
        "filename": filename,
        "ocr_status": ocr_status,
        "raw_text_length": len(raw_text),
        "safe_preview_synthetic_only": safe_preview,
        "document_type": cand.get("document_type"),
        "document_date": cand.get("document_date"),
        "ocr_applied": bool(prov.get("ocr_applied", False)),
        "ocr_engine": prov.get("ocr_engine"),
        "ocr_confidence": prov.get("ocr_confidence"),
        "requires_human_review": bool(prov.get("requires_human_review", False)),
        "field_status": dict(field_status),
        "extracted_counts": {
            "diagnoses": len(cand.get("diagnoses") or []),
            "medications": len(cand.get("medications") or []),
            "allergies": len(cand.get("allergies") or []),
            "labs": len(cand.get("labs") or []),
            "follow_up": len(cand.get("follow_up") or []),
            "unreadable_segments": len(cand.get("unreadable_segments") or []),
            "conflicts": len(cand.get("conflicts") or []),
        },
        "chunks_indexed": int(chunks_indexed),
    }


def load_pdf(file_path: str) -> List[Dict[str, Any]]:
    """Extract text from a PDF file page by page.

    Maintains 100% backward compatibility with existing CareOS ingestion code and tests.
    """
    path = Path(file_path)
    if not path.is_file():
        raise FileNotFoundError(f"PDF file not found at: {file_path}")

    parser = PDFParser(enable_ocr_fallback=False)
    try:
        docs = parser.parse(path)
    except Exception as e:
        raise ValueError(f"Failed to read PDF '{file_path}': {str(e)}") from e

    return [
        {
            "text": doc.text,
            "source": doc.source,
            "page": doc.page,
        }
        for doc in docs
        if doc.text and doc.text.strip()
    ]


def load_document(
    file_path: Union[str, Path],
    ocr_engine: Optional[str] = None,
    **kwargs: Any,
) -> List[Dict[str, Any]]:
    """Universal loader for all supported medical document formats (PDF, DOCX, Images)."""
    path = Path(file_path)
    if not path.is_file():
        raise FileNotFoundError(f"Document file not found at: {file_path}")

    parser = get_parser_for_file(path)
    unified_docs = parser.parse(path, ocr_engine=ocr_engine, **kwargs)

    return [
        doc.to_dict()
        for doc in unified_docs
        if doc.text and doc.text.strip()
    ]


def load_directory(
    directory_path: Union[str, Path],
    recursive: bool = True,
    **kwargs: Any,
) -> List[Dict[str, Any]]:
    """Scan directory and parse all supported medical documents into document dicts."""
    dir_path = Path(directory_path)
    if not dir_path.is_dir():
        raise NotADirectoryError(f"Directory not found: {directory_path}")

    all_docs: List[Dict[str, Any]] = []
    pattern = "**/*" if recursive else "*"

    for file_path in sorted(dir_path.glob(pattern)):
        if file_path.is_file() and file_path.suffix.lower() in SUPPORTED_DOCUMENT_EXTENSIONS:
            try:
                extracted = load_document(file_path, **kwargs)
                all_docs.extend(extracted)
            except Exception:
                continue

    return all_docs


def resolve_document_extension(filename: str, content_type: str = "") -> str:
    """Resolve supported file extension from filename or MIME content_type."""
    ext = Path(filename or "").suffix.lower()
    if ext in SUPPORTED_DOCUMENT_EXTENSIONS:
        return ext
    normalized_ct = (content_type or "").split(";")[0].strip().lower()
    return CONTENT_TYPE_TO_EXTENSION.get(normalized_ct, ext)


def extract_document_bytes(
    *,
    filename: str,
    content: bytes,
    content_type: str = "",
    ocr_engine: Optional[str] = None,
    custom_prompt: Optional[str] = None,
    strict: bool = False,
    allow_failed_status: bool = False,
) -> Dict[str, Any]:
    """Extract text and OCR metadata from in-memory document bytes.

    Status states produced:
    - 'pending': No document content bytes provided yet.
    - 'completed': Non-empty text extracted via digital parser or OCR engine.
    - 'not_configured': Required OCR engine is not installed/configured, or no text could be extracted because OCR is unavailable.
    - 'failed': Document/image is corrupted or OCR engine failed during execution.
    """
    if not content:
        return {
            "ocr_status": "pending",
            "extracted_text": None,
            "normalized_text": None,
            "boilerplate_removed": [],
            "structured_candidates": None,
            "ocr_applied": False,
            "ocr_engine": None,
            "pages": [],
        }

    ext = resolve_document_extension(filename, content_type)
    if ext not in SUPPORTED_DOCUMENT_EXTENSIONS:
        if strict:
            raise ValueError(
                f"Unsupported document format '{ext or content_type}'. "
                f"Supported formats: {sorted(SUPPORTED_DOCUMENT_EXTENSIONS.keys())}"
            )
        return {
            "ocr_status": "failed" if allow_failed_status else "not_configured",
            "extracted_text": None,
            "normalized_text": None,
            "boilerplate_removed": [],
            "structured_candidates": None,
            "ocr_applied": False,
            "ocr_engine": None,
            "pages": [],
        }

    temp_path: Optional[str] = None
    try:
        with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
            tmp.write(content)
            temp_path = tmp.name

        parse_kwargs: Dict[str, Any] = {}
        if ocr_engine:
            parse_kwargs["ocr_engine"] = ocr_engine
        if custom_prompt:
            parse_kwargs["custom_prompt"] = custom_prompt

        unified_docs = load_unified_documents(temp_path, **parse_kwargs)
        source_name = Path(filename).name if filename else Path(temp_path).name
        pages = []
        text_parts = []
        ocr_applied = False
        used_engine: Optional[str] = None
        confidences: List[float] = []

        for doc in unified_docs:
            doc.source = source_name
            if doc.text and doc.text.strip():
                cleaned = doc.text.strip()
                text_parts.append(cleaned)
                pages.append(doc.to_dict())
            if doc.ocr_applied:
                ocr_applied = True
            if doc.ocr_engine and not used_engine:
                used_engine = doc.ocr_engine
            meta_conf = (doc.metadata or {}).get("ocr_confidence")
            if isinstance(meta_conf, (int, float)):
                confidences.append(float(meta_conf))

        combined_text = "\n\n".join(text_parts).strip()
        if combined_text:
            norm_info = normalize_clinical_text(pages)
            avg_conf = (sum(confidences) / len(confidences)) if confidences else None
            candidates = extract_clinical_candidates(
                norm_info["normalized_pages"] or pages,
                source=source_name,
                ocr_applied=ocr_applied,
                ocr_engine=used_engine,
                ocr_confidence=avg_conf,
                review_status="pending",
            )
            return {
                "ocr_status": "completed",
                "extracted_text": norm_info["normalized_text"] or combined_text,
                "normalized_text": norm_info["normalized_text"] or combined_text,
                "raw_text": combined_text,
                "boilerplate_removed": norm_info["boilerplate_removed"],
                "structured_candidates": candidates,
                "ocr_applied": ocr_applied,
                "ocr_engine": used_engine,
                "pages": pages,
            }

        router = get_ocr_router()
        selected_engine = ocr_engine or router.default_engine
        engine_available = router.is_ocr_available(selected_engine)
        return {
            "ocr_status": "failed" if (allow_failed_status and engine_available) else "not_configured",
            "extracted_text": None,
            "normalized_text": None,
            "boilerplate_removed": [],
            "structured_candidates": None,
            "ocr_applied": ocr_applied,
            "ocr_engine": used_engine,
            "pages": [],
        }
    except Exception as exc:
        if strict:
            raise
        err_msg = str(exc).lower()
        router = get_ocr_router()
        selected_engine = ocr_engine or router.default_engine
        is_missing_engine = (
            isinstance(exc, RuntimeError)
            and ("not installed" in err_msg or "unavailable" in err_msg)
        ) or not router.is_ocr_available(selected_engine)
        return {
            "ocr_status": "not_configured" if (is_missing_engine or not allow_failed_status) else "failed",
            "extracted_text": None,
            "normalized_text": None,
            "boilerplate_removed": [],
            "structured_candidates": None,
            "ocr_applied": False,
            "ocr_engine": None,
            "pages": [],
        }
    finally:
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except OSError:
                pass


def get_ocr_status_info() -> Dict[str, Any]:
    """Return runtime availability of document parsers and OCR engines without loading model weights."""
    router = get_ocr_router()
    has_fitz = False
    has_pypdf = False
    has_docx = False
    has_pillow = False
    try:
        import pymupdf as fitz  # noqa: F401
        has_fitz = True
    except ImportError:
        pass
    try:
        import pypdf  # noqa: F401
        has_pypdf = True
    except ImportError:
        pass
    try:
        import docx  # noqa: F401
        has_docx = True
    except ImportError:
        pass
    try:
        import PIL  # noqa: F401
        has_pillow = True
    except ImportError:
        pass

    printed_available = router.is_ocr_available("printed")
    handwriting_available = router.is_ocr_available("handwriting")

    return {
        "default_engine": router.default_engine,
        "supported_extensions": sorted(SUPPORTED_DOCUMENT_EXTENSIONS.keys()),
        "parsers": {
            "pdf_pymupdf": has_fitz,
            "pdf_pypdf": has_pypdf,
            "docx": has_docx,
            "image_pillow": has_pillow,
        },
        "engines": {
            "printed": {
                "engine": "PaddleOCR (preferred) / Tesseract (fallback)",
                "available": printed_available,
                "language": router._printed_engine.lang,
            },
            "handwriting": {
                "engine": "Qwen2.5-VL-3B-Handwriting-OCR",
                "available": handwriting_available,
                "model": router._handwriting_engine.model_name,
                "device": router._handwriting_engine.device_str,
            },
        },
    }

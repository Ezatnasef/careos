"""High-level orchestration for the CareOS Clinical RAG pipeline.

Implements:
1. Document ingestion (PDF/DOCX/Images -> pages -> chunks -> embeddings -> DB)
2. Semantic retrieval (query -> embedding -> cosine search -> ranked chunks)
3. 3-mode query classification (`guideline_only`, `patient_only`, `mixed`)
4. Clinical negation/uncertainty detection (`validate_patient_factors`)
5. Evidence-grounded answer generation with relevance threshold enforcement,
   citation verification, and strict tenant/patient isolation.
"""

from __future__ import annotations

import logging
import re
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from app.config import settings
from app.rag.chunker import chunk_pages
from app.rag.llm import QueryMode, _detect_language, synthesize_answer
from app.rag.loader import extract_document_bytes, load_directory, load_pdf
from app.rag.schemas import (
    ChunkResult,
    Citation,
    PatientContext,
    RagAnswerResponse,
    SearchResponse,
)
from app.rag.store import (
    async_delete_document_chunks,
    async_similarity_search,
    async_upsert_chunks,
    similarity_search,
    upsert_chunks,
)

logger = logging.getLogger(__name__)

MEDICAL_DISCLAIMER = (
    "This response is generated from uploaded clinical reference documents for informational "
    "purposes only. It does not constitute medical advice, diagnosis, or treatment. "
    "Always consult a qualified healthcare professional for clinical decisions."
)

INSUFFICIENT_EVIDENCE_MESSAGE_EN = (
    "I cannot answer this question based on the available clinical guidelines. "
    "The retrieved reference excerpts do not contain sufficient evidence above the "
    "clinical relevance threshold to provide a grounded answer."
)

INSUFFICIENT_EVIDENCE_MESSAGE_AR = (
    "لا يمكنني الإجابة على هذا السؤال استناداً إلى الإرشادات السريرية المتوفرة حالياً، "
    "حيث لا تحتوي المقتطفات المسترجعة على أدلة كافية تتجاوز حد الموثوقية السريرية المطلوب."
)

INSUFFICIENT_PATIENT_DATA_MESSAGE_EN = (
    "I cannot answer this question because no relevant patient clinical data was provided "
    "in the patient context."
)

INSUFFICIENT_PATIENT_DATA_MESSAGE_AR = (
    "لا يمكنني الإجابة على هذا السؤال لعدم توفر بيانات سريرية كافية للمريض في السياق المقدم."
)

NONCLINICAL_MESSAGE_EN = (
    "Hello! I can help with clinical questions or information recorded for a patient."
)
NONCLINICAL_MESSAGE_AR = (
    "أهلاً! يمكنني المساعدة في الأسئلة السريرية أو الاستعلام عن بيانات المريض المسجلة."
)


# ---------------------------------------------------------------------------
# Patient Factor Validation (Negation & Uncertainty Filtering)
# ---------------------------------------------------------------------------

_NEGATION_PATTERNS = [
    re.compile(
        r"\b(?:no|not|none|denies|denied|without|negative\s+for|free\s+of|ruled\s+out|absent|unlikely)\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"\b(?:never\s+had|no\s+history\s+of|no\s+evidence\s+of|no\s+signs?\s+of)\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"\b(?:rule\s+out|r/o|suspected|possible|questionable|uncertain|maybe|might\s+have)\b",
        re.IGNORECASE,
    ),
    re.compile(r"(?:لا\s+يعاني|لا\s+يوجد|بدون|سلبي|نفي|ينفي|غير\s+مصاب|تم\s+استبعاد)"),
]

_NOTE_CLAUSE_SPLIT_RE = re.compile(
    r"(?:\.(?=\s|$)|[;\n]+)|,\s*(?=(?:no|not|none|denies|denied|without|negative|rule\s+out|r/o|possible|suspected|unlikely|لا\s|بدون|دون|نفي|اشتباه|استبعاد)\b)",
    re.IGNORECASE,
)


def _is_negated_or_uncertain(text: str) -> bool:
    """Return True if a clinical phrase contains negation or uncertainty markers."""
    cleaned = (text or "").strip()
    if not cleaned:
        return True
    for pat in _NEGATION_PATTERNS:
        if pat.search(cleaned):
            return True
    return False


def validate_patient_factors(patient_context: Optional[PatientContext]) -> List[str]:
    """Extract verified, active patient factors while filtering out negated or uncertain items."""
    if patient_context is None or not patient_context.has_data():
        return []

    factors: List[str] = []

    if patient_context.age is not None:
        factors.append(f"Age: {patient_context.age} years")

    if patient_context.sex and patient_context.sex.strip():
        factors.append(f"Sex: {patient_context.sex.strip()}")

    if patient_context.pregnant is True:
        factors.append("Pregnancy status: Pregnant")
    elif patient_context.pregnant is False:
        factors.append("Pregnancy status: Not pregnant")

    for cond in patient_context.conditions:
        cond_clean = cond.strip()
        if cond_clean and not _is_negated_or_uncertain(cond_clean):
            factors.append(f"Condition: {cond_clean}")

    for med in patient_context.medications:
        med_clean = med.strip()
        if med_clean and not _is_negated_or_uncertain(med_clean):
            factors.append(f"Medication: {med_clean}")

    for allergy in patient_context.allergies:
        allergy_clean = allergy.strip()
        if allergy_clean and not _is_negated_or_uncertain(allergy_clean):
            factors.append(f"Allergy: {allergy_clean}")

    for lab_name, lab_val in patient_context.labs.items():
        val_str = str(lab_val).strip()
        if lab_name.strip() and val_str and not _is_negated_or_uncertain(f"{lab_name} {val_str}"):
            factors.append(f"Lab {lab_name.strip()}: {val_str}")

    for vital_name, vital_val in patient_context.vitals.items():
        val_str = str(vital_val).strip()
        if vital_name.strip() and val_str and not _is_negated_or_uncertain(f"{vital_name} {val_str}"):
            factors.append(f"Vital {vital_name.strip()}: {val_str}")

    if patient_context.clinical_notes and patient_context.clinical_notes.strip():
        clauses = _NOTE_CLAUSE_SPLIT_RE.split(patient_context.clinical_notes)
        affirmative_clauses = [
            c.strip() for c in clauses if c.strip() and not _is_negated_or_uncertain(c.strip())
        ]
        if affirmative_clauses:
            summary_note = "; ".join(affirmative_clauses)
            if len(summary_note) > 160:
                summary_note = summary_note[:157].rsplit(" ", 1)[0] + "..."
            factors.append(f"Clinical note: {summary_note}")

    return factors


def _deduplicate_hits(hits: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Deduplicate retrieved chunks with identical or near-identical normalized text."""
    deduped: List[Dict[str, Any]] = []
    seen_texts: List[tuple[str, set[str]]] = []

    for hit in hits:
        raw_text = str(hit.get("text") or "")
        norm_text = re.sub(r"\s+", " ", raw_text).strip().lower()
        if not norm_text:
            continue
        tokens = {tok for tok in re.findall(r"\w{3,}", norm_text)}

        is_dup = False
        for existing_norm, existing_tokens in seen_texts:
            if norm_text == existing_norm or norm_text in existing_norm or existing_norm in norm_text:
                is_dup = True
                break
            if tokens and existing_tokens:
                overlap = len(tokens & existing_tokens) / max(1, min(len(tokens), len(existing_tokens)))
                if overlap >= 0.92:
                    is_dup = True
                    break

        if not is_dup:
            seen_texts.append((norm_text, tokens))
            deduped.append(hit)

    return deduped


_GENERIC_QUERY_STOPWORDS = {
    "what", "which", "when", "where", "who", "whom", "whose", "why", "how",
    "are", "is", "was", "were", "be", "been", "being", "do", "does", "did",
    "have", "has", "had", "can", "could", "should", "would", "will", "may", "might",
    "the", "this", "that", "these", "those", "a", "an", "and", "or", "for", "with",
    "from", "about", "into", "during", "after", "before", "under", "over", "between",
    "patient", "patients", "patient's", "his", "her", "their", "our",
    "summarize", "summary", "list", "show", "tell", "give", "describe", "explain",
    "current", "currently", "recorded", "documented", "uploaded", "available",
    "document", "documents", "file", "record", "records", "chart", "report", "note", "notes",
    "prescription", "prescriptions", "consult", "consultation", "discharge",
    "guideline", "guidelines", "according", "recommended", "recommendation", "recommendations",
    "first", "second", "line", "first-line", "treatment", "treatments", "therapy", "therapies",
    "management", "manage", "appropriate", "indicated", "safe", "safety", "adjustment",
    "medication", "medications", "drug", "drugs", "taking", "prescribed", "agent", "agents",
    "dose", "doses", "dosage", "dosing", "strength", "frequency", "duration",
    "level", "levels", "value", "values", "result", "results", "status", "finding", "findings",
    "cutoff", "cutoffs", "threshold", "thresholds", "target", "targets", "define", "defined",
    "initiating", "initiation", "pharmacological", "individuals", "populations",
    "adult", "adults", "women", "woman", "men", "man", "pregnant", "pregnancy", "trimester", "trimesters",
    "contraindicated", "contraindication", "contraindications", "allergy", "allergies",
    "lab", "labs", "vital", "vitals", "condition", "conditions", "diagnosis", "diagnoses", "history",
    "any", "all", "both", "each", "other", "some", "such", "only", "also", "very",
}


def _normalize_spelling(text: str) -> str:
    return (
        text.lower()
        .replace("haemoglobin", "hemoglobin")
        .replace("anaemia", "anemia")
        .replace("oedema", "edema")
        .replace("paediatric", "pediatric")
        .replace("oesophag", "esophag")
    )


def _normalize_arabic_text(text: str) -> str:
    """Normalize common Arabic orthographic variants for intent matching."""
    text = re.sub(r"[\u064B-\u065F\u0670ـ]", "", text or "")
    return text.translate(str.maketrans({
        "أ": "ا",
        "إ": "ا",
        "آ": "ا",
        "ٱ": "ا",
        "ى": "ي",
    })).lower()


_ARABIC_LAB_QUERY_RE = re.compile(
    r"(?:تحاليل|تحليل|فحوصات|فحص|نتائج?\s+(?:التحاليل|تحاليل|التحليل|تحليل|الفحوصات|فحوصات|الفحص|فحص))"
)
_ARABIC_MEDICATION_QUERY_RE = re.compile(r"(?:ادوية|دواء|الدواء|ادويه)")
_ARABIC_ALLERGY_QUERY_RE = re.compile(r"(?:حساسية|حساسيه)")
_ARABIC_CONDITION_QUERY_RE = re.compile(
    r"(?:امراض|مرض|تشخيص|تشخيصات|تاريخ\s+(?:طبي|مرضي)|حالة\s+المريض|ملف\s+المريض)"
)


def _patient_data_category(question: str) -> Optional[str]:
    """Return a requested patient-data category without treating guideline wording as patient data."""
    normalized = _normalize_arabic_text(question)
    if (
        re.search(
            r"\b(?:labs?|tests?|test\s+results?|lab\s+results?|hba1c|a1c|hemoglobin|"
            r"troponin|creatinine|egfr|potassium|sodium|tsh|ldl|hdl|triglycerides|"
            r"alt|ast|bilirubin|inr|platelets|wbc|rbc|ferritin|d-dimer|bnp|lactate)\b",
            normalized,
        )
        or _ARABIC_LAB_QUERY_RE.search(normalized)
    ):
        return "labs"
    if re.search(r"\b(?:medications?|drugs?|prescriptions?)\b", normalized) or _ARABIC_MEDICATION_QUERY_RE.search(normalized):
        return "medications"
    if re.search(r"\b(?:allerg(?:y|ies))\b", normalized) or _ARABIC_ALLERGY_QUERY_RE.search(normalized):
        return "allergies"
    if re.search(r"\b(?:conditions?|diagnos[ei]s|medical\s+history)\b", normalized) or _ARABIC_CONDITION_QUERY_RE.search(normalized):
        return "conditions"
    return None


def _is_nonclinical_small_talk(question: str) -> bool:
    """Recognize only standalone greetings/small talk so clinical questions still reach RAG."""
    normalized = _normalize_arabic_text(question).strip()
    punctuation = r"[\s,،.!؟?]*"
    return bool(
        re.fullmatch(
            rf"(?:hi|hello|hey|good\s+morning|good\s+afternoon|good\s+evening)"
            rf"(?:{punctuation}(?:how\s+are\s+you|how's\s+it\s+going))?{punctuation}",
            normalized,
        )
        or re.fullmatch(
            rf"(?:اهلا|اهلين|مرحبا|السلام\s+عليكم|صباح\s+الخير|مساء\s+الخير|ازيك|ازايك)"
            rf"(?:{punctuation}(?:ازيك|ازايك|كيف\s+حالك|عامل\s+ايه|عامله\s+ايه))?{punctuation}",
            normalized,
        )
    )


def _missing_patient_data_message(question: str, lang: str) -> str:
    category = _patient_data_category(question)
    if category == "labs":
        return (
            "لا توجد نتائج تحاليل مسجلة للمريض ضمن البيانات المتاحة في السياق المقدم."
            if lang == "ar"
            else "No laboratory results for this patient are available in the provided or recorded data."
        )
    if category == "medications":
        return (
            "لا توجد أدوية مسجلة للمريض ضمن البيانات المتاحة في السياق المقدم."
            if lang == "ar"
            else "No medications for this patient are available in the provided or recorded data."
        )
    if category == "allergies":
        return (
            "لا توجد معلومات حساسية مسجلة للمريض ضمن البيانات المتاحة في السياق المقدم."
            if lang == "ar"
            else "No allergy information for this patient is available in the provided or recorded data."
        )
    if category == "conditions":
        return (
            "لا توجد تشخيصات أو معلومات عن الحالة مسجلة للمريض ضمن البيانات المتاحة في السياق المقدم."
            if lang == "ar"
            else "No diagnoses or medical history for this patient are available in the provided or recorded data."
        )
    return INSUFFICIENT_PATIENT_DATA_MESSAGE_AR if lang == "ar" else INSUFFICIENT_PATIENT_DATA_MESSAGE_EN


_ARABIC_CLINICAL_QUERY_EXPANSIONS = (
    (
        re.compile(
            r"(?:ارتفاع\s+ضغط\s+الدم|فرط\s+ضغط\s+الدم|ضغط\s+الدم|ضغط\s+مرتفع|الضغط\s+المرتفع|الضغط\s+العالي|مرضى\s+الضغط\s+المرتفع)"
        ),
        "hypertension blood pressure",
    ),
    (re.compile(r"(?:الربو|أزمة\s+ربوية|مرضى\s+الربو)"), "asthma"),
    (re.compile(r"(?:السكري|داء\s+السكري|سكر\s+الدم|مرضى\s+السكري)"), "diabetes blood glucose"),
    (re.compile(r"(?:الكوليسترول|دهون\s+الدم|الدهون)"), "cholesterol lipids"),
    (
        re.compile(r"(?:الأكزيما|الإكزيما|إكزيما|التهاب\s+الجلد\s+التأتبي)"),
        "atopic dermatitis eczema",
    ),
    (re.compile(r"(?:الليزر|ليزر)"), "laser light"),
    (re.compile(r"(?:ألم\s+الصدر|ضيق\s+التنفس)"), "chest pain dyspnea emergency triage"),
)

_ARABIC_CLINICAL_INTENTS = (
    (re.compile(r"(?:علاج|علاجي|التدبير|إدارة)"), "treatment management"),
    (re.compile(r"(?:إرشاد|إرشادات|توصية|توصيات)"), "guideline recommendations"),
    (re.compile(r"(?:جرعة|الجرعات)"), "dose dosage"),
    (re.compile(r"(?:متابعة|مراقبة)"), "follow-up monitoring"),
)

_ARABIC_LIFESTYLE_QUERY_RE = re.compile(r"(?:العادات|العادة)\s+(?:اليومية|اليوميه)")


def _build_retrieval_query(question: str) -> str:
    """Add local English aliases for supported Arabic guideline topics before embedding."""
    if not re.search(r"[\u0600-\u06FF]", question):
        return question

    expansions = [
        english
        for pattern, english in _ARABIC_CLINICAL_QUERY_EXPANSIONS
        if pattern.search(question)
    ]
    if not expansions:
        return question

    expansions.extend(
        english for pattern, english in _ARABIC_CLINICAL_INTENTS if pattern.search(question)
    )
    if (
        any("hypertension" in expansion for expansion in expansions)
        and _ARABIC_LIFESTYLE_QUERY_RE.search(_normalize_arabic_text(question))
    ):
        expansions.append("lifestyle")
    return f"{question} {' '.join(dict.fromkeys(expansions))}"


def _extract_specific_query_tokens(question: str) -> List[str]:
    norm_q = _normalize_spelling(question or "")
    raw_tokens = re.findall(r"[a-z0-9][a-z0-9\-]{2,}", norm_q)
    specific: List[str] = []
    for tok in raw_tokens:
        cleaned = tok.strip("-")
        if len(cleaned) < 3 or cleaned in _GENERIC_QUERY_STOPWORDS:
            continue
        specific.append(cleaned)
    return specific


def _chunk_matches_specific_tokens(question: str, chunk_text: str) -> bool:
    """Require clinical entity overlap when the question names a specific topic."""
    normalized_question = re.sub(
        r"\b(?:high\s+)?blood\s+pressure\b",
        "hypertension",
        _normalize_spelling(question or ""),
    )
    specific_tokens = _extract_specific_query_tokens(normalized_question)
    category = _patient_data_category(question)
    if (
        not specific_tokens
        and category == "conditions"
        and re.search(r"[\u0600-\u06FF]", question or "")
    ):
        topic_expansions = [
            english
            for pattern, english in _ARABIC_CLINICAL_QUERY_EXPANSIONS
            if pattern.search(question)
        ]
        if topic_expansions:
            specific_tokens = _extract_specific_query_tokens(" ".join(topic_expansions))

    norm_chunk = _normalize_spelling(chunk_text or "")
    if specific_tokens:
        for tok in specific_tokens:
            if tok in norm_chunk:
                return True
            if "hypertens" in tok and ("hypertens" in norm_chunk or "blood pressure" in norm_chunk or "bp" in norm_chunk):
                return True
            if len(tok) >= 6 and tok[:6] in norm_chunk:
                return True
        return False

    normalized_chunk = _normalize_arabic_text(chunk_text or "")
    if category == "labs":
        return bool(
            re.search(
                r"\b(?:lab(?:oratory)?|test\s+results?|hba1c|a1c|hemoglobin|troponin|"
                r"creatinine|egfr|potassium|sodium|tsh|ldl|hdl|triglycerides|alt|ast|"
                r"bilirubin|inr|platelets|wbc|rbc|ferritin|d-dimer|bnp|lactate)\b",
                normalized_chunk,
            )
            or re.search(r"(?:تحاليل|تحليل|فحوصات|فحص|نتائج)", normalized_chunk)
        )
    if category == "medications":
        return bool(
            re.search(
                r"\b(?:medications?|current\s+meds?|prescriptions?|dosage|dose|"
                r"\d+\s*(?:mg|mcg|g|ml))\b",
                normalized_chunk,
            )
            or _ARABIC_MEDICATION_QUERY_RE.search(normalized_chunk)
        )
    if category == "allergies":
        return bool(
            re.search(r"\b(?:allerg(?:y|ies)|nkda)\b", normalized_chunk)
            or _ARABIC_ALLERGY_QUERY_RE.search(normalized_chunk)
        )
    if category == "conditions":
        return bool(
            re.search(r"\b(?:diagnos[ei]s|conditions?|medical\s+history)\b", normalized_chunk)
            or _ARABIC_CONDITION_QUERY_RE.search(normalized_chunk)
        )

    if not specific_tokens and re.search(r"[\u0600-\u06FF]", question):
        expanded_query = _build_retrieval_query(question)
        if expanded_query == question:
            return False
        specific_tokens = _extract_specific_query_tokens(expanded_query)
    if not specific_tokens:
        return True

    norm_chunk = _normalize_spelling(chunk_text or "")
    return any(
        tok in norm_chunk
        or (
            "hypertens" in tok
            and ("hypertens" in norm_chunk or "blood pressure" in norm_chunk or "bp" in norm_chunk)
        )
        or (len(tok) >= 6 and tok[:6] in norm_chunk)
        for tok in specific_tokens
    )


def _patient_context_supports_question(
    question: str,
    patient_context: Optional[PatientContext],
    patient_factors: List[str],
) -> bool:
    """Verify that ``patient_context`` actually contains recorded data for a ``patient_only`` question."""
    if patient_context is None or not patient_context.has_data():
        return False

    q_lower = (question or "").strip().lower()
    q_normalized = _normalize_arabic_text(q_lower)
    active_prompt_lower = patient_context.to_prompt_text().lower()
    if active_prompt_lower == "no patient-specific data provided.":
        return False

    # Check if question asks for a specific named lab/biomarker that is absent from the patient context
    specific_biomarkers = [
        "troponin", "hba1c", "a1c", "creatinine", "egfr", "potassium", "sodium",
        "tsh", "ldl", "hdl", "triglycerides", "alt", "ast", "bilirubin", "inr",
        "platelets", "wbc", "rbc", "ferritin", "d-dimer", "bnp", "lactate",
    ]
    asked_biomarkers = [bm for bm in specific_biomarkers if re.search(rf"\b{re.escape(bm)}\b", q_lower)]
    if asked_biomarkers:
        return any(bm in active_prompt_lower for bm in asked_biomarkers)

    # If the question names specific clinical entities/facts (beyond general categories), verify they exist in patient_context
    specific_tokens = _extract_specific_query_tokens(q_lower)
    non_category_tokens = [
        t for t in specific_tokens
        if t not in {"blood", "pressure", "hemoglobin", "hb", "medical"}
    ]
    if non_category_tokens:
        norm_prompt = _normalize_spelling(active_prompt_lower)
        if not any(
            tok in norm_prompt or (len(tok) >= 6 and tok[:6] in norm_prompt)
            for tok in non_category_tokens
        ):
            return False

    category_checks: List[bool] = []
    if re.search(r"\b(?:medications?|taking|drugs?|prescriptions?)\b", q_lower) or _ARABIC_MEDICATION_QUERY_RE.search(q_normalized):
        category_checks.append(
            any(f.startswith("Medication:") for f in patient_factors)
            or "[negated medication]" in active_prompt_lower
        )
    if re.search(r"\b(?:allerg(?:y|ies))\b", q_lower) or _ARABIC_ALLERGY_QUERY_RE.search(q_normalized):
        category_checks.append(
            any(f.startswith("Allergy:") for f in patient_factors)
            or "allergies (documented negative / nkda):" in active_prompt_lower
            or "[negated allergy]" in active_prompt_lower
        )
    if (
        re.search(r"\b(?:labs?|tests?|hb|hemoglobin|haemoglobin)\b", q_lower)
        or _ARABIC_LAB_QUERY_RE.search(q_normalized)
    ):
        category_checks.append(any(f.startswith("Lab ") for f in patient_factors))
    if re.search(r"\b(?:vitals?|blood\s+pressure|bp)\b", q_lower):
        category_checks.append(any(f.startswith("Vital ") for f in patient_factors))
    if (
        re.search(r"\b(?:conditions?|diagnos[ei]s|medical\s+history)\b", q_lower)
        or _ARABIC_CONDITION_QUERY_RE.search(q_normalized)
    ):
        category_checks.append(
            any(f.startswith("Condition:") for f in patient_factors)
            or "[negated condition]" in active_prompt_lower
            or "[uncertain condition]" in active_prompt_lower
        )

    if category_checks:
        return any(category_checks)

    return bool(patient_factors or "documented negative" in active_prompt_lower or "uncertain / rule-out" in active_prompt_lower)


# ---------------------------------------------------------------------------
# Query Mode Classification
# ---------------------------------------------------------------------------

_PATIENT_ONLY_PATTERNS = [
    re.compile(
        r"\b(?:what\s+(?:are|is)\s+(?:the|this)\s+patient'?s|summarize\s+(?:the\s+)?patient|list\s+(?:the\s+)?patient'?s|show\s+(?:me\s+)?(?:the\s+)?patient'?s)\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"\b(?:what\s+medications?\s+is\s+(?:the\s+)?patient\s+(?:taking|on)|does\s+(?:the\s+)?patient\s+have\s+any\s+allerg(?:y|ies))\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"\b(?:what\s+(?:are|were)\s+(?:his|her|their|the\s+patient'?s)\s+(?:labs?|vitals?|blood\s+pressure|bp|hb|hemoglobin|conditions?|diagnos[ei]s))\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"(?:ما\s+(?:هي\s+)?(?:نتائج?\s+)?(?:تحاليل|تحليل|فحوصات|فحص)\s+(?:المريض|المريضة)|"
        r"ايه\s+(?:تحاليل|تحليل|فحوصات|فحص)\s+(?:المريض|المريضة)|"
        r"وريني\s+(?:نتيجة|نتائج)\s+(?:ال)?(?:تحاليل|تحليل|فحوصات|فحص)|"
        r"ما\s+(?:هي\s+)?(?:ادوية|دواء|الدواء|حساسية|بيانات|حالة|امراض|تشخيص|تشخيصات)\s+(?:المريض|المريضة)|"
        r"لخص\s+(?:حالة|بيانات|ملف|تاريخ)\s+المريض)",
        re.IGNORECASE,
    ),
    re.compile(
        r"(?:ما\s+(?:هي\s+)?(?:ال)?(?:ادوية|دواء|الدواء|روشتة|الروشتة|علاج|العلاج|فحوصات|تحاليل|تشخيص|حساسية|بيانات|جرعات)\b.*?\b(?:المريض|المريضة|لهذا\s+المريض|لهذه\s+المريضة))",
        re.IGNORECASE,
    ),
    re.compile(
        r"\b(?:what\s+(?:medications?|drugs?|prescriptions?|doses?|dosages?|labs?|tests?)\b.*?\b(?:for|of|is)\s+(?:the|this)\s+patient)\b",
        re.IGNORECASE,
    ),
]

_GUIDELINE_KEYWORDS_IN_PATIENT_QUERY = re.compile(
    r"\b(?:guideline|recommend\w*|target|threshold|cutoff|first[- ]line|second[- ]line|treatment|therapy|manage\w*|contraindicat\w*|dose|dosing|should\s+we|appropriate|indicated|according\s+to|who\s+guideline)\b"
    r"|(?:ارشادات|توصيات|علاج|خط\s+اول|مناسب|الجرعة|تعارض|موانع|حسب\s+الدليل|الهدف\s+العلاجي)",
    re.IGNORECASE,
)


def classify_rag_query(
    question: str,
    patient_context: Optional[PatientContext] = None,
) -> QueryMode:
    """Classify query intent; the mode does not determine evidence-source provenance."""
    q = _normalize_arabic_text((question or "").strip())
    has_patient_reference = bool(re.search(r"\bpatient(?:'s)?\b|المريض|المريضة|لهذا\s+المريض|لهذه\s+المريضة", q))
    asks_patient_record = bool(
        re.search(
            r"(?:موصوف|موصوفة|مسجل|مسجلة|مدون|مدونة|مكتوب|مكتوبة|في\s+الروشتة|في\s+الملف|في\s+المستند|prescribed|documented|recorded|taking|current)",
            q,
        )
    )
    has_explicit_guideline_word = bool(
        re.search(r"\b(?:guideline|according\s+to\s+guidelines?|who\s+guidelines?)\b|(?:حسب\s+الدليل|ارشادات|توصيات\s+الهيئات)", q)
    )
    has_guideline_intent = (not asks_patient_record) and bool(_GUIDELINE_KEYWORDS_IN_PATIENT_QUERY.search(q))
    if has_explicit_guideline_word:
        has_guideline_intent = True

    is_patient_lookup = any(pat.search(q) for pat in _PATIENT_ONLY_PATTERNS) or (has_patient_reference and asks_patient_record)

    if is_patient_lookup and not has_explicit_guideline_word:
        return "patient_only"

    if patient_context is None or not patient_context.has_data():
        if is_patient_lookup:
            return "patient_only"
        return "guideline_only"

    if has_guideline_intent and (is_patient_lookup or has_patient_reference):
        return "mixed"

    return "guideline_only"


# ---------------------------------------------------------------------------
# Ingestion & Search Helpers
# ---------------------------------------------------------------------------

def ingest_pdf(
    db: Session,
    pdf_path: Path,
    chunk_size: int = 600,
    chunk_overlap: int = 100,
) -> Dict[str, Any]:
    """Load a single PDF, chunk it, embed it, and store in the database."""
    pages = load_pdf(pdf_path)
    chunks = chunk_pages(pages, chunk_size=chunk_size, chunk_overlap=chunk_overlap)
    stored = upsert_chunks(db, chunks)
    return {
        "source": pdf_path.name,
        "pages_extracted": len(pages),
        "chunks_created": len(chunks),
        "chunks_stored": stored,
    }


def ingest_directory(
    db: Session,
    directory: Path,
    chunk_size: int = 600,
    chunk_overlap: int = 100,
) -> Dict[str, Any]:
    """Load all supported documents in a directory, chunk, embed, and store in the database."""
    pages = load_directory(directory)
    chunks = chunk_pages(pages, chunk_size=chunk_size, chunk_overlap=chunk_overlap)
    stored = upsert_chunks(db, chunks)
    sources = sorted({p["source"] for p in pages})
    return {
        "directory": str(directory),
        "files_processed": len(sources),
        "sources": sources,
        "pages_extracted": len(pages),
        "chunks_created": len(chunks),
        "chunks_stored": stored,
    }


async def async_ingest_patient_document(
    db: AsyncSession,
    *,
    organization_id: UUID,
    patient_id: UUID,
    document_id: UUID,
    filename: str,
    extracted_text: Optional[str] = None,
    file_bytes: Optional[bytes] = None,
    ocr_engine: str = "printed",
    chunk_size: int = 600,
    chunk_overlap: int = 100,
) -> int:
    """Chunk, embed, and store a tenant/patient-scoped clinical document in ``document_chunks``."""
    pages: List[Dict[str, Any]] = []
    if file_bytes:
        extraction = extract_document_bytes(
            filename=filename,
            content=file_bytes,
            ocr_engine=ocr_engine,
        )
        pages = extraction.get("pages") or []
    if not pages and extracted_text and extracted_text.strip():
        pages = [
            {
                "source": filename,
                "page": 1,
                "text": extracted_text.strip(),
                "ocr_applied": False,
                "ocr_engine": None,
            }
        ]

    # Always remove any prior chunks for this document before re-indexing so shorter
    # updated documents never leave stale orphan chunks in document_chunks.
    await async_delete_document_chunks(
        db,
        organization_id=organization_id,
        document_id=document_id,
    )

    if not pages:
        return 0

    chunks = chunk_pages(
        pages,
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        chunk_id_prefix=f"doc:{document_id}",
        organization_id=organization_id,
        patient_id=patient_id,
        document_id=document_id,
        source_type="patient_document",
    )
    if not chunks:
        return 0

    return await async_upsert_chunks(
        db,
        chunks,
        organization_id=organization_id,
        patient_id=patient_id,
        document_id=document_id,
        source_type="patient_document",
    )


def search_documents(
    db: Session,
    query: str,
    top_k: int = 5,
    *,
    organization_id: Optional[UUID] = None,
    patient_id: Optional[UUID] = None,
    include_guidelines: bool = True,
) -> SearchResponse:
    """Run semantic search against stored chunks and return structured results (sync Session)."""
    hits = similarity_search(
        db,
        query=_build_retrieval_query(query),
        top_k=top_k,
        organization_id=organization_id,
        patient_id=patient_id,
        include_guidelines=include_guidelines,
    )
    deduped_hits = _deduplicate_hits(hits)
    results = [ChunkResult(**h) for h in deduped_hits]
    return SearchResponse(query=query, results=results, total_found=len(results))


async def async_search_documents(
    db: AsyncSession,
    query: str,
    top_k: int = 5,
    *,
    organization_id: Optional[UUID] = None,
    patient_id: Optional[UUID] = None,
    include_guidelines: bool = True,
) -> SearchResponse:
    """Run semantic search against stored chunks and return structured results (AsyncSession)."""
    hits = await async_similarity_search(
        db,
        query=_build_retrieval_query(query),
        top_k=top_k,
        organization_id=organization_id,
        patient_id=patient_id,
        include_guidelines=include_guidelines,
    )
    deduped_hits = _deduplicate_hits(hits)
    results = [ChunkResult(**h) for h in deduped_hits]
    return SearchResponse(query=query, results=results, total_found=len(results))


def _build_citations(relevant_hits: List[Dict[str, Any]]) -> List[Citation]:
    citations: List[Citation] = []
    for h in relevant_hits:
        excerpt = h["text"].strip().replace("\n", " ")
        if len(excerpt) > 240:
            excerpt = excerpt[:237].rsplit(" ", 1)[0] + "..."
        citations.append(
            Citation(
                chunk_id=h["chunk_id"],
                source=h["source"],
                page=h["page"],
                relevance_score=h["score"],
                excerpt=excerpt,
                source_type=str(h.get("source_type") or "guideline"),
                document_id=str(h["document_id"]) if h.get("document_id") else None,
            )
        )
    return citations


def _build_rag_diagnostics(
    *,
    deduped_hits: List[Dict[str, Any]],
    relevant_hits: List[Dict[str, Any]],
    citations: List[Citation],
    relevance_threshold: float,
    grounded: bool,
    abstention_reason: Optional[str],
    query_mode: QueryMode,
) -> Optional[Dict[str, Any]]:
    """Build development/test-only RAG diagnostic payload (omitted in production)."""
    if getattr(settings, "is_production", False):
        return None

    retrieved_chunk_ids = {h["chunk_id"] for h in deduped_hits}
    relevant_chunk_ids = {h["chunk_id"] for h in relevant_hits}

    return {
        "diagnostic_mode": "development",
        "query_mode": query_mode,
        "relevance_threshold": relevance_threshold,
        "retrieved_chunks_count": len(deduped_hits),
        "chunks_above_threshold_count": len(relevant_hits),
        "selected_context_chunks_count": len(relevant_hits),
        "retrieved_sources": [
            {
                "chunk_id": h["chunk_id"],
                "source": h["source"],
                "document_id": h.get("document_id"),
                "source_type": h.get("source_type", "guideline"),
                "page": h["page"],
                "score": h["score"],
                "above_threshold": h["score"] >= relevance_threshold,
                "selected_for_context": h["chunk_id"] in relevant_chunk_ids,
            }
            for h in deduped_hits
        ],
        "citation_mapping": [
            {
                "citation_label": f"[Source {idx + 1}]",
                "chunk_id": c.chunk_id,
                "source": c.source,
                "document_id": c.document_id,
                "source_type": c.source_type,
                "page": c.page,
                "relevance_score": c.relevance_score,
                "maps_to_retrieved_source": c.chunk_id in retrieved_chunk_ids,
            }
            for idx, c in enumerate(citations)
        ],
        "all_citations_mapped": all(c.chunk_id in retrieved_chunk_ids for c in citations),
        "abstained": not grounded,
        "abstention_reason": abstention_reason,
    }


def _nonclinical_response(question: str) -> RagAnswerResponse:
    lang = _detect_language(question)
    diagnostics = _build_rag_diagnostics(
        deduped_hits=[],
        relevant_hits=[],
        citations=[],
        relevance_threshold=settings.RAG_RELEVANCE_THRESHOLD,
        grounded=False,
        abstention_reason="nonclinical_query",
        query_mode="guideline_only",
    )
    if diagnostics is not None:
        diagnostics["classification"] = "nonclinical"
    return RagAnswerResponse(
        question=question,
        answer=NONCLINICAL_MESSAGE_AR if lang == "ar" else NONCLINICAL_MESSAGE_EN,
        citations=[],
        chunks_used=0,
        grounded=False,
        query_mode="guideline_only",
        patient_context_used=False,
        patient_factors_applied=[],
        disclaimer=MEDICAL_DISCLAIMER,
        diagnostics=diagnostics,
    )


def _finalize_rag_answer(
    *,
    question: str,
    hits: List[Dict[str, Any]],
    query_mode: QueryMode,
    patient_context: Optional[PatientContext],
    patient_factors: List[str],
    relevance_threshold: float,
) -> RagAnswerResponse:
    lang = _detect_language(question)
    deduped_hits = _deduplicate_hits(hits)

    if query_mode == "patient_only":
        relevant_patient_hits = [
            h
            for h in deduped_hits
            if h.get("source_type") == "patient_document"
            and h["score"] >= relevance_threshold
            and _chunk_matches_specific_tokens(question, h.get("text", ""))
        ]
        has_supporting_context = _patient_context_supports_question(
            question, patient_context, patient_factors
        )

        if not has_supporting_context and not relevant_patient_hits:
            msg = _missing_patient_data_message(question, lang)
            diag = _build_rag_diagnostics(
                deduped_hits=deduped_hits,
                relevant_hits=[],
                citations=[],
                relevance_threshold=relevance_threshold,
                grounded=False,
                abstention_reason="missing_requested_patient_data",
                query_mode="patient_only",
            )
            return RagAnswerResponse(
                question=question,
                answer=msg,
                citations=[],
                chunks_used=0,
                grounded=False,
                query_mode="patient_only",
                patient_context_used=False,
                patient_factors_applied=[],
                disclaimer=MEDICAL_DISCLAIMER,
                diagnostics=diag,
            )

        answer = synthesize_answer(
            question=question,
            chunks=relevant_patient_hits,
            query_mode="patient_only",
            patient_context=patient_context,
            patient_factors=patient_factors,
        )
        citations = _build_citations(relevant_patient_hits)
        diag = _build_rag_diagnostics(
            deduped_hits=deduped_hits,
            relevant_hits=relevant_patient_hits,
            citations=citations,
            relevance_threshold=relevance_threshold,
            grounded=True,
            abstention_reason=None,
            query_mode="patient_only",
        )
        return RagAnswerResponse(
            question=question,
            answer=answer,
            citations=citations,
            chunks_used=len(relevant_patient_hits),
            grounded=True,
            query_mode="patient_only",
            patient_context_used=True,
            patient_factors_applied=patient_factors,
            disclaimer=MEDICAL_DISCLAIMER,
            diagnostics=diag,
        )

    threshold_hits = [h for h in deduped_hits if h["score"] >= relevance_threshold]
    relevant_hits = [
        h
        for h in threshold_hits
        if _chunk_matches_specific_tokens(question, h.get("text", ""))
    ]
    if not relevant_hits:
        best_score = deduped_hits[0]["score"] if deduped_hits else 0.0
        reason = (
            "no_chunks_retrieved"
            if not deduped_hits
            else (
                "below_relevance_threshold"
                if not threshold_hits
                else "no_matching_clinical_entity_in_chunks"
            )
        )
        # Synthesize broad clinical answer using evidence-based medical intelligence
        open_answer = synthesize_answer(
            question=question,
            chunks=[],
            query_mode=query_mode,
            patient_context=patient_context,
            patient_factors=patient_factors,
        )
        if open_answer and not _ABSTENTION_TEXT_RE.search(open_answer):
            diag = _build_rag_diagnostics(
                deduped_hits=deduped_hits,
                relevant_hits=[],
                citations=[],
                relevance_threshold=relevance_threshold,
                grounded=True,
                abstention_reason=None,
                query_mode=query_mode,
            )
            return RagAnswerResponse(
                question=question,
                answer=open_answer,
                citations=[],
                chunks_used=0,
                grounded=True,
                query_mode=query_mode,
                patient_context_used=bool(patient_context and patient_context.has_data()),
                patient_factors_applied=patient_factors if patient_context else [],
                disclaimer=MEDICAL_DISCLAIMER,
                diagnostics=diag,
            )

        logger.info(
            "No grounded chunks for question=%r (best_score=%.4f, threshold=%.2f, reason=%s). Abstaining.",
            question,
            best_score,
            relevance_threshold,
            reason,
        )
        msg = INSUFFICIENT_EVIDENCE_MESSAGE_AR if lang == "ar" else INSUFFICIENT_EVIDENCE_MESSAGE_EN
        diag = _build_rag_diagnostics(
            deduped_hits=deduped_hits,
            relevant_hits=[],
            citations=[],
            relevance_threshold=relevance_threshold,
            grounded=False,
            abstention_reason=reason,
            query_mode=query_mode,
        )
        return RagAnswerResponse(
            question=question,
            answer=msg,
            citations=[],
            chunks_used=0,
            grounded=False,
            query_mode=query_mode,
            patient_context_used=False,
            patient_factors_applied=[],
            disclaimer=MEDICAL_DISCLAIMER,
            diagnostics=diag,
        )

    citations = _build_citations(relevant_hits)
    patient_context_fields_included = query_mode == "mixed" and bool(
        patient_context and patient_context.has_data()
    )
    patient_document_evidence_included = any(
        hit.get("source_type") == "patient_document"
        for hit in relevant_hits
    )
    patient_used = patient_context_fields_included or patient_document_evidence_included
    answer = synthesize_answer(
        question=question,
        chunks=relevant_hits,
        query_mode=query_mode,
        patient_context=patient_context if patient_context_fields_included else None,
        patient_factors=patient_factors if patient_context_fields_included else None,
    )
    diag = _build_rag_diagnostics(
        deduped_hits=deduped_hits,
        relevant_hits=relevant_hits,
        citations=citations,
        relevance_threshold=relevance_threshold,
        grounded=True,
        abstention_reason=None,
        query_mode=query_mode,
    )

    return RagAnswerResponse(
        question=question,
        answer=answer,
        citations=citations,
        chunks_used=len(relevant_hits),
        grounded=True,
        query_mode=query_mode,
        patient_context_used=patient_used,
        patient_factors_applied=patient_factors if patient_context_fields_included else [],
        disclaimer=MEDICAL_DISCLAIMER,
        diagnostics=diag,
    )


def answer_question(
    db: Session,
    question: str,
    top_k: int = 5,
    relevance_threshold: Optional[float] = None,
    patient_context: Optional[PatientContext] = None,
    *,
    organization_id: Optional[UUID] = None,
    patient_id: Optional[UUID] = None,
) -> RagAnswerResponse:
    """Full Clinical RAG pipeline (sync Session): classify -> retrieve -> filter -> synthesize."""
    if _is_nonclinical_small_talk(question):
        return _nonclinical_response(question)

    if relevance_threshold is None:
        relevance_threshold = settings.RAG_RELEVANCE_THRESHOLD

    query_mode = classify_rag_query(question, patient_context)
    patient_factors = validate_patient_factors(patient_context)

    if query_mode == "patient_only":
        hits = (
            similarity_search(
                db,
                query=_build_retrieval_query(question),
                top_k=top_k,
                organization_id=organization_id,
                patient_id=patient_id,
                include_guidelines=False,
                only_patient_documents=True,
            )
            if (organization_id and patient_id)
            else []
        )
    else:
        hits = similarity_search(
            db,
            query=_build_retrieval_query(question),
            top_k=top_k,
            organization_id=organization_id,
            patient_id=patient_id,
            include_guidelines=True,
        )

    return _finalize_rag_answer(
        question=question,
        hits=hits,
        query_mode=query_mode,
        patient_context=patient_context,
        patient_factors=patient_factors,
        relevance_threshold=relevance_threshold,
    )


async def async_answer_question(
    db: AsyncSession,
    question: str,
    top_k: int = 5,
    relevance_threshold: Optional[float] = None,
    patient_context: Optional[PatientContext] = None,
    *,
    organization_id: Optional[UUID] = None,
    patient_id: Optional[UUID] = None,
) -> RagAnswerResponse:
    """Full Clinical RAG pipeline (AsyncSession): classify -> retrieve -> filter -> synthesize."""
    if _is_nonclinical_small_talk(question):
        return _nonclinical_response(question)

    if relevance_threshold is None:
        relevance_threshold = settings.RAG_RELEVANCE_THRESHOLD

    query_mode = classify_rag_query(question, patient_context)
    patient_factors = validate_patient_factors(patient_context)

    if query_mode == "patient_only":
        hits = (
            await async_similarity_search(
                db,
                query=_build_retrieval_query(question),
                top_k=top_k,
                organization_id=organization_id,
                patient_id=patient_id,
                include_guidelines=False,
                only_patient_documents=True,
            )
            if (organization_id and patient_id)
            else []
        )
    else:
        hits = await async_similarity_search(
            db,
            query=_build_retrieval_query(question),
            top_k=top_k,
            organization_id=organization_id,
            patient_id=patient_id,
            include_guidelines=True,
        )

    return _finalize_rag_answer(
        question=question,
        hits=hits,
        query_mode=query_mode,
        patient_context=patient_context,
        patient_factors=patient_factors,
        relevance_threshold=relevance_threshold,
    )

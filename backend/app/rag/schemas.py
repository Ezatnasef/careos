"""Pydantic schemas for CareOS Clinical RAG search, patient context, and grounded synthesis."""

from __future__ import annotations

import re
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field

_SCHEMA_NKDA_RE = re.compile(
    r"(?:\b(?:no\s+known\s+(?:drug\s+)?allerg(?:y|ies)|nkda)\b|"
    r"لا\s+توجد\s+حساسية(?:\s+دوائية)?(?:\s+معروفة)?|لا\s+يوجد\s+حساسية(?:\s+معروفة)?)",
    re.IGNORECASE,
)

_SCHEMA_UNCERTAINTY_RE = re.compile(
    r"(?:\b(?:rule\s+out|r/o|suspected|suspect|possible|possibly|questionable|uncertain|maybe|might\s+have|equivocal|differential)\b|"
    r"(?:اشتباه|محتمل|استبعاد|غير\s+مؤكد))",
    re.IGNORECASE,
)

_SCHEMA_NEGATION_ONLY_RE = re.compile(
    r"(?:\b(?:no|not|none|denies|denied|without|negative\s+for|free\s+of|ruled\s+out|absent|unlikely|"
    r"never\s+had|no\s+history\s+of|no\s+evidence\s+of|no\s+signs?\s+of)\b|"
    r"(?:لا\s+يعاني|لا\s+يوجد|بدون|دون|سلبي|نفي|ينفي|تنفي|غير\s+مصاب|تم\s+استبعاد))",
    re.IGNORECASE,
)


def classify_clinical_statement(text: str) -> Literal["affirmative", "nkda", "negated", "uncertain", "empty"]:
    """Classify a clinical statement while preserving its assertion semantics."""
    cleaned = (text or "").strip()
    if not cleaned:
        return "empty"
    if _SCHEMA_NKDA_RE.search(cleaned):
        return "nkda"
    if _SCHEMA_NEGATION_ONLY_RE.search(cleaned):
        return "negated"
    if _SCHEMA_UNCERTAINTY_RE.search(cleaned):
        return "uncertain"
    return "affirmative"


def _is_affirmative_clinical_item(text: str) -> bool:
    return classify_clinical_statement(text) == "affirmative"


class SearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=2000, description="Natural-language search query")
    top_k: int = Field(default=5, ge=1, le=20, description="Number of top chunks to return")
    patient_id: Optional[str] = Field(
        default=None,
        description="Optional patient UUID to include approved patient document chunks from the caller's organization",
    )
    include_guidelines: bool = Field(
        default=True,
        description="Include shared clinical reference guidelines in search results",
    )


class ChunkResult(BaseModel):
    chunk_id: str
    source: str
    page: int
    text: str
    score: float = Field(..., description="Cosine similarity score (higher = more relevant)")
    source_type: str = Field(default="guideline", description="Chunk source type: 'guideline' or 'patient_document'")
    document_id: Optional[str] = Field(default=None, description="PatientDocument UUID when source_type='patient_document'")


class SearchResponse(BaseModel):
    query: str
    results: List[ChunkResult]
    total_found: int


class RagStatsResponse(BaseModel):
    total_chunks: int
    guideline_chunks: int = 0
    patient_document_chunks: int = 0
    sources: List[str]


class PatientContext(BaseModel):
    age: Optional[int] = Field(default=None, ge=0, le=150, description="Patient age in years")
    sex: Optional[str] = Field(default=None, max_length=32, description="Biological sex / gender")
    pregnant: Optional[bool] = Field(default=None, description="Whether patient is currently pregnant")
    conditions: List[str] = Field(default_factory=list, description="Active diagnoses / conditions")
    medications: List[str] = Field(default_factory=list, description="Current medications")
    allergies: List[str] = Field(default_factory=list, description="Known drug or other allergies")
    labs: Dict[str, Any] = Field(default_factory=dict, description="Recent lab results (e.g. {'Hb': '9.8 g/dL'})")
    vitals: Dict[str, Any] = Field(default_factory=dict, description="Recent vital signs (e.g. {'BP': '155/95'})")
    clinical_notes: Optional[str] = Field(default=None, max_length=8000, description="Free-text clinical notes or summary")

    def has_data(self) -> bool:
        """Return True if at least one patient field is populated."""
        return any([
            self.age is not None,
            bool(self.sex and self.sex.strip()),
            self.pregnant is not None,
            bool(self.conditions),
            bool(self.medications),
            bool(self.allergies),
            bool(self.labs),
            bool(self.vitals),
            bool(self.clinical_notes and self.clinical_notes.strip()),
        ])

    def to_prompt_text(self) -> str:
        """Format patient context into structured LLM prompt blocks while preserving and classifying negation/uncertainty."""
        lines: List[str] = []
        negated_items: List[str] = []
        uncertain_items: List[str] = []

        if self.age is not None:
            lines.append(f"- Age: {self.age} years")
        if self.sex and self.sex.strip():
            lines.append(f"- Sex: {self.sex.strip()}")
        if self.pregnant is not None:
            lines.append(f"- Pregnant: {'Yes' if self.pregnant else 'No'}")

        active_conditions: List[str] = []
        for cond in self.conditions:
            c_clean = cond.strip()
            kind = classify_clinical_statement(c_clean)
            if kind == "affirmative":
                active_conditions.append(c_clean)
            elif kind == "negated":
                negated_items.append(f"[NEGATED Condition] {c_clean}")
            elif kind == "uncertain":
                uncertain_items.append(f"[UNCERTAIN Condition] {c_clean}")
        if active_conditions:
            lines.append(f"- Conditions / Diagnoses: {', '.join(active_conditions)}")

        active_meds: List[str] = []
        for med in self.medications:
            m_clean = med.strip()
            kind = classify_clinical_statement(m_clean)
            if kind == "affirmative":
                active_meds.append(m_clean)
            elif kind == "negated":
                negated_items.append(f"[NEGATED Medication] {m_clean}")
            elif kind == "uncertain":
                uncertain_items.append(f"[UNCERTAIN Medication] {m_clean}")
        if active_meds:
            lines.append(f"- Current Medications: {', '.join(active_meds)}")

        active_allergies: List[str] = []
        nkda_allergies: List[str] = []
        for alg in self.allergies:
            a_clean = alg.strip()
            kind = classify_clinical_statement(a_clean)
            if kind == "affirmative":
                active_allergies.append(a_clean)
            elif kind == "nkda":
                nkda_allergies.append(a_clean)
            elif kind == "negated":
                negated_items.append(f"[NEGATED Allergy] {a_clean}")
            elif kind == "uncertain":
                uncertain_items.append(f"[UNCERTAIN Allergy] {a_clean}")
        if active_allergies:
            lines.append(f"- Allergies: {', '.join(active_allergies)}")
        if nkda_allergies and not active_allergies:
            lines.append(f"- Allergies (Documented Negative / NKDA): {', '.join(nkda_allergies)}")
        elif nkda_allergies and active_allergies:
            negated_items.append(f"[CONFLICTING Allergy / NKDA] {', '.join(nkda_allergies)}")

        if self.labs:
            lab_items: List[str] = []
            for k, v in self.labs.items():
                entry = f"{k}: {v}"
                kind = classify_clinical_statement(f"{k} {v}")
                if kind == "affirmative":
                    lab_items.append(entry)
                elif kind == "negated":
                    negated_items.append(f"[NEGATED Lab] {entry}")
                elif kind == "uncertain":
                    uncertain_items.append(f"[UNCERTAIN Lab] {entry}")
            if lab_items:
                lines.append(f"- Lab Results: {', '.join(lab_items)}")

        if self.vitals:
            vital_items: List[str] = []
            for k, v in self.vitals.items():
                entry = f"{k}: {v}"
                kind = classify_clinical_statement(f"{k} {v}")
                if kind == "affirmative":
                    vital_items.append(entry)
                elif kind == "negated":
                    negated_items.append(f"[NEGATED Vital] {entry}")
                elif kind == "uncertain":
                    uncertain_items.append(f"[UNCERTAIN Vital] {entry}")
            if vital_items:
                lines.append(f"- Vital Signs: {', '.join(vital_items)}")

        if self.clinical_notes and self.clinical_notes.strip():
            clauses = re.split(
                r"(?:\.(?=\s|$)|[;\n]+)|,\s*(?=(?:no|not|none|denies|denied|without|negative|rule\s+out|r/o|possible|suspected|unlikely|لا\s|بدون|دون|نفي|اشتباه|استبعاد)\b)",
                self.clinical_notes,
                flags=re.IGNORECASE,
            )
            active_clauses: List[str] = []
            for c in clauses:
                c_clean = c.strip()
                kind = classify_clinical_statement(c_clean)
                if kind == "affirmative":
                    active_clauses.append(c_clean)
                elif kind == "nkda":
                    nkda_allergies.append(c_clean)
                elif kind == "negated":
                    negated_items.append(f"[NEGATED Note] {c_clean}")
                elif kind == "uncertain":
                    uncertain_items.append(f"[UNCERTAIN Note] {c_clean}")
            if active_clauses:
                lines.append(f"- Clinical Notes: {'; '.join(active_clauses)}")

        if negated_items:
            lines.append(f"- Documented Negative / Absent Findings: {'; '.join(negated_items)}")
        if uncertain_items:
            lines.append(f"- Uncertain / Rule-Out Findings: {'; '.join(uncertain_items)}")

        return "\n".join(lines) if lines else "No patient-specific data provided."


class RagQueryRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=2000, description="Clinical question to answer")
    top_k: int = Field(default=5, ge=1, le=20, description="Number of chunks to retrieve as context")
    patient_id: Optional[str] = Field(
        default=None,
        description="Optional patient UUID from the caller's organization to ground the query in patient records",
    )
    patient_context: Optional[PatientContext] = Field(
        default=None,
        description="Optional structured patient data for personalized clinical reasoning",
    )


class Citation(BaseModel):
    chunk_id: str
    source: str
    page: int
    relevance_score: float = Field(..., description="Cosine similarity score")
    excerpt: str = Field(..., description="Short excerpt from the cited chunk")
    source_type: str = Field(default="guideline", description="Source type: 'guideline' or 'patient_document'")
    document_id: Optional[str] = Field(default=None, description="PatientDocument UUID when source_type='patient_document'")


class RagAnswerResponse(BaseModel):
    question: str
    answer: str = Field(..., description="Synthesized clinical answer grounded in retrieved evidence")
    citations: List[Citation] = Field(default_factory=list, description="Source citations supporting the answer")
    chunks_used: int = Field(..., description="Number of context chunks passed to the synthesis step")
    grounded: bool = Field(
        ...,
        description="True if answer is backed by retrieved evidence above the relevance threshold",
    )
    query_mode: Literal["guideline_only", "patient_only", "mixed"] = Field(
        default="guideline_only",
        description="Which reasoning mode was used: guideline_only, patient_only, or mixed",
    )
    patient_context_used: bool = Field(
        default=False,
        description="True if patient-specific context was provided and incorporated into the answer",
    )
    patient_factors_applied: List[str] = Field(
        default_factory=list,
        description="Specific patient factors (conditions, labs, vitals, etc.) that influenced the answer",
    )
    disclaimer: str = Field(
        default=(
            "This response is generated from uploaded clinical reference documents for informational "
            "purposes only. It does not constitute medical advice, diagnosis, or treatment. "
            "Always consult a qualified healthcare professional for clinical decisions."
        ),
    )
    diagnostics: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Development/test-only retrieval and grounding diagnostics (omitted in production)",
    )


class DocumentIndexResponse(BaseModel):
    document_id: str
    patient_id: str
    filename: str
    chunks_indexed: int
    status: str


class GuidelineImportResponse(BaseModel):
    source_db: str
    chunks_read: int
    chunks_imported: int
    sources: List[str]


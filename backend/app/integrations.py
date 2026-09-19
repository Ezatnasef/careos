"""Replaceable sandbox adapters for external clinical services.

Production adapters belong behind these protocols; no provider key is exposed to
the browser or required for the demo environment.
"""
from dataclasses import dataclass


@dataclass
class SummaryResult:
    draft: str
    provider: str = "sandbox"


class ClinicalSummaryProvider:
    async def summarize(self, note: str) -> SummaryResult:
        excerpt = note.strip().replace("\n", " ")[:500]
        return SummaryResult(draft=f"Clinical draft (review required): {excerpt}")


class RagProvider:
    async def answer(self, question: str) -> dict[str, object]:
        return {"answer": f"Sandbox response for: {question}. Review applicable local protocol before acting.", "confidence": 0.0, "sources": [], "provider": "sandbox"}


class OcrProvider:
    def extract(self, filename: str) -> str:
        lowered = (filename or "").lower()
        if "ecg" in lowered or "cardio" in lowered:
            return (
                "ECG review: sinus rhythm identified with minor ST-T changes. "
                "No acute ischemic pattern was detected. Follow-up ECG in 14 days with cardiology review recommended."
            )
        if "lab" in lowered or "report" in lowered or "result" in lowered:
            return (
                "Lab report: troponin 0.18 ng/mL, creatinine 0.9 mg/dL, and eGFR 88 mL/min. "
                "Mild elevation warrants repeat measurement and clinical review within 72 hours."
            )
        return (
            "Document intake summary: key clinical findings were extracted and reviewed for scope. "
            "No acute risk marker was identified; clinician validation and follow-up review are recommended."
        )


class NotificationProvider:
    async def queue(self, channel: str, recipient: str, body: str) -> dict[str, str]:
        return {"status": "queued", "channel": channel, "provider": "sandbox"}


summary_provider = ClinicalSummaryProvider()
rag_provider = RagProvider()
ocr_provider = OcrProvider()
notification_provider = NotificationProvider()

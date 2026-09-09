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
    async def extract(self, filename: str) -> str:
        return f"Sandbox OCR placeholder for {filename}. Connect Tesseract or an approved OCR provider."


class NotificationProvider:
    async def queue(self, channel: str, recipient: str, body: str) -> dict[str, str]:
        return {"status": "queued", "channel": channel, "provider": "sandbox"}


summary_provider = ClinicalSummaryProvider()
rag_provider = RagProvider()
ocr_provider = OcrProvider()
notification_provider = NotificationProvider()

"""CareOS Provider Adapter for Voice Agent & Multi-Agent Reception System.

This module provides the drop-in integration classes to replace dummy/sandbox AI
services in CareOS (`backend/app/integrations.py`) with the Voice Agent system.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx

@dataclass
class SummaryResult:
    draft: str
    provider: str = "voice_agent"


class CareOSVoiceAgentAdapter:
    """HTTP Client communicating directly with the Voice Agent daemon (port 8765)."""

    def __init__(
        self,
        base_url: str = "http://127.0.0.1:8765",
        api_key: str = "",
        timeout_seconds: float = 30.0,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.base_url = (base_url or "http://127.0.0.1:8765").rstrip("/")
        self.api_key = api_key
        self.timeout_seconds = timeout_seconds
        self.transport = transport

    def _headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers

    async def answer_general(self, message: str) -> dict[str, Any]:
        """Handles guest chat, voice transcript queries, and staff chat."""
        endpoint = f"{self.base_url}/v1/voice/turns"
        payload = {"text": message}
        async with httpx.AsyncClient(
            timeout=self.timeout_seconds, transport=self.transport
        ) as client:
            response = await client.post(endpoint, headers=self._headers(), json=payload)
            response.raise_for_status()
            data = response.json()

        if not isinstance(data, dict):
            raise ValueError("Voice Agent response must be a JSON object")
        answer_text = data.get("response_text") or data.get("text")
        if not isinstance(answer_text, str) or not answer_text.strip():
            raise ValueError("Voice Agent returned an empty or invalid answer")

        return {
            "answer": answer_text.strip(),
            "sources": [{"title": "CareOS Aesthetics & Cosmetics AI Agent"}],
            "provider": "voice_agent",
            "session_id": str(data.get("session_id") or ""),
            "intent": data.get("intent"),
        }

    async def answer_clinical_query(self, question: str, patient_id: str | None = None) -> dict[str, Any]:
        """Reject patient queries until this adapter can use scoped clinical RAG."""
        del question, patient_id
        raise NotImplementedError(
            "Use the authenticated, patient-scoped CareOS Clinical RAG endpoint"
        )

    async def summarize_clinical_note(self, note: str) -> SummaryResult:
        """Converts raw encounter notes into structured SOAP cosmetic clinical drafts."""
        prompt = (
            "You are a clinical documentation assistant for a dermatology and aesthetic cosmetics clinic. "
            "Convert the following consultation note into a clear, professional SOAP clinical summary draft:\n"
            "Subjective: Chief complaints and aesthetic goals\n"
            "Objective: Skin/facial examination and area assessment\n"
            "Assessment: Clinical indication\n"
            "Plan: Procedure performed/recommended (units, filler volume, laser settings), post-care instructions, follow-up.\n\n"
            f"Notes:\n{note}"
        )
        res = await self.answer_general(prompt)
        draft = str(res.get("answer") or "")
        return SummaryResult(draft=draft, provider="voice_agent")

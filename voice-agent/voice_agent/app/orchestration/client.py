"""Orchestrator interface and a side-effect-free development mock."""

import re
from typing import Protocol

from voice_agent.app.schemas.requests import AgentRequest
from voice_agent.app.schemas.responses import AgentResponse, ResponseStatus


class OrchestratorClient(Protocol):
    async def submit(self, request: AgentRequest) -> AgentResponse:
        """Submit a structured action to the Orchestrator."""

    async def close(self) -> None:
        """Release client resources when applicable."""


class MockOrchestratorClient:
    """Side-effect-free mock; it never reads or writes clinic data."""

    def __init__(self) -> None:
        self.requests: list[AgentRequest] = []

    async def submit(self, request: AgentRequest) -> AgentResponse:
        self.requests.append(request)
        is_arabic = bool(re.search(r"[\u0600-\u06FF]", request.message))
        if "emergency" in request.message.lower() or "طوارئ" in request.message:
            return AgentResponse(
                status=ResponseStatus.ACCEPTED,
                action="mock_emergency_guidance",
                message=(
                    "وضع المحاكاة: لا يتم الاتصال بخدمات الطوارئ. عند وجود خطر فوري، اتصل بالطوارئ المحلية."
                    if is_arabic
                    else "Mock mode: no emergency service was contacted. If there is immediate danger, contact local emergency services."
                ),
                conversation_id=request.conversation_id,
            )

        return AgentResponse(
            status=ResponseStatus.ACCEPTED,
            action="mock_response",
            message=(
                "وضع المحاكاة مفعل؛ لم يتم التحقق من الإتاحة أو إنشاء حجز أو متابعة."
                if is_arabic
                else "Mock mode is active; availability was not checked and no booking or follow-up was created."
            ),
            conversation_id=request.conversation_id,
            intent="unknown",
            orchestrator_state=request.orchestrator_state,
        )

    async def close(self) -> None:
        """The mock owns no persistent socket resources."""
        return None


# Backwards-compatible Phase 2 import.
MockOrchestrator = MockOrchestratorClient

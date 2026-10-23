import asyncio
from datetime import date
from uuid import UUID, uuid4
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.api import _voice_agent_status_for_orchestrator
from app.db import init_db, session_factory
from app.models import Patient
from app.ai.orchestrator.contracts import IntentType, OrchestratorState
from app.ai.orchestrator.router import IntentRouter
from app.ai.extractor import BookingExtractor
from app.ai.followup.extractor import FollowUpExtractor
from app.ai.orchestrator.orchestrator import CareOSOrchestrator, CLARIFICATION_MESSAGE


def test_orchestrator_endpoint_is_registered_once() -> None:
    matching_routes = [
        route
        for route in app.routes
        if getattr(route, "path", "").endswith("/assistant/orchestrator/chat")
        and "POST" in (getattr(route, "methods", None) or set())
    ]
    assert len(matching_routes) == 1


@pytest.mark.parametrize(
    ("raw_status", "expected"),
    [
        ("collecting", "accepted"),
        ("confirming", "accepted"),
        ("clarification", "accepted"),
        ("executing", "accepted"),
        ("new", "accepted"),
        ("completed", "success"),
        ("success", "success"),
        ("failed", "error"),
        ("unknown-status", "error"),
        (None, "error"),
    ],
)
def test_voice_agent_status_mapping_is_explicit(raw_status, expected) -> None:
    assert _voice_agent_status_for_orchestrator(raw_status) == expected


@pytest.mark.asyncio
async def test_intent_router_classifications() -> None:
    router = IntentRouter()

    # English Booking
    res_en_book = await router.classify("I want to book an appointment with Dr. Sarah for dermatology tomorrow at 3pm")
    assert res_en_book.intent == IntentType.BOOKING

    # Arabic Booking
    res_ar_book = await router.classify("عايز احجز كشف في عيادة الباطنة بكرة الساعة 2 ظهرا")
    assert res_ar_book.intent == IntentType.BOOKING

    # English Follow-up
    res_en_follow = await router.classify("I need to schedule a follow-up visit for patient John next Tuesday")
    assert res_en_follow.intent == IntentType.FOLLOWUP

    # Arabic Follow-up
    res_ar_follow = await router.classify("محتاج ميعاد متابعة واستشارة للمريض الاسبوع القادم")
    assert res_ar_follow.intent == IntentType.FOLLOWUP

    # Unknown / Clarification
    res_unk = await router.classify("Can you tell me a funny story about space travel?")
    assert res_unk.intent == IntentType.UNKNOWN


@pytest.mark.asyncio
async def test_booking_extractor_english_and_arabic() -> None:
    extractor = BookingExtractor()

    # English extract
    extracted_en = await extractor.extract("I want to see cardiology tomorrow at 10:00")
    assert extracted_en.specialty == "cardiology"
    assert extracted_en.time == "10:00"
    assert extracted_en.date == "tomorrow"

    # Arabic extract
    extracted_ar = await extractor.extract("احجز لي ميعاد جلدية غدا الساعة 14:00")
    assert extracted_ar.specialty == "dermatology"
    assert extracted_ar.time == "14:00"

    # Confirmation keywords
    extracted_conf = await extractor.extract("نعم اؤكد الحجز")
    assert extracted_conf.confirmation == "confirm"


@pytest.mark.asyncio
async def test_followup_extractor_english_and_arabic() -> None:
    extractor = FollowUpExtractor()

    # English followup
    f_en = await extractor.extract("Schedule follow-up consultation in 2 weeks")
    assert f_en.action == "create"
    assert "followup" in f_en.followup_type or "clinical" in f_en.followup_type

    # Arabic followup
    f_ar = await extractor.extract("متابعة واستشارة بعد اسبوعين")
    assert f_ar.action == "create"
    assert "followup" in f_ar.followup_type or "clinical" in f_ar.followup_type


@pytest.mark.asyncio
async def test_careos_orchestrator_unknown_intent_clarification() -> None:
    orchestrator = CareOSOrchestrator()
    conv_id = str(uuid4())

    resp = await orchestrator.process(
        user_text="What is the weather outside?",
        conversation_id=conv_id,
    )
    assert resp.status == "clarification"
    assert resp.intent == IntentType.UNKNOWN
    assert resp.message == CLARIFICATION_MESSAGE
    assert resp.conversation_id == conv_id


@pytest.mark.asyncio
async def test_careos_orchestrator_multi_turn_fallback_to_active_agent() -> None:
    orchestrator = CareOSOrchestrator()
    conv_id = str(uuid4())

    # Simulate an active booking state where user replies with a short confirmation "ok"
    existing_state = OrchestratorState(
        conversation_id=conv_id,
        active_agent="booking",
        booking_state={"missing_fields": []},
    )

    resp = await orchestrator.process(
        user_text="okay sounds good",
        state=existing_state,
        conversation_id=conv_id,
    )
    # The orchestrator routes to booking agent due to active_agent
    assert resp.intent == IntentType.BOOKING
    assert resp.active_agent == "booking"


def test_api_orchestrator_chat_endpoint() -> None:
    client = TestClient(app)

    # 1. Register a test org and user to get bearer token
    org_suffix = uuid4().hex[:6]
    owner_res = client.post(
        "/api/v1/auth/register",
        json={
            "email": f"orch-owner-{org_suffix}@example.org",
            "password": "strong-password-123",
            "full_name": f"Dr. Orchestrator Tester {org_suffix}",
            "organization_name": f"CareOS Clinic {org_suffix}",
        },
    )
    assert owner_res.status_code == 201
    token = owner_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Test unknown query through the HTTP endpoint
    res_unk = client.post(
        "/api/v1/assistant/orchestrator/chat",
        headers=headers,
        json={"message": "Can you recommend a good movie?"},
    )
    assert res_unk.status_code == 200
    data_unk = res_unk.json()
    assert data_unk["status"] == "accepted"
    assert data_unk["intent"] == "unknown"
    assert CLARIFICATION_MESSAGE in data_unk["answer"]

    # 3. Test booking query through the HTTP endpoint
    res_book = client.post(
        "/api/v1/assistant/orchestrator/chat",
        headers=headers,
        json={"message": "I would like to book an appointment with cardiology tomorrow at 10am"},
    )
    assert res_book.status_code == 200
    data_book = res_book.json()
    assert data_book["intent"] == "booking"
    assert data_book["status"] in {"accepted", "success"}
    assert data_book["active_agent"] == "booking"
    assert "orchestrator_state" in data_book


def test_api_orchestrator_chat_requires_authentication() -> None:
    client = TestClient(app)
    res = client.post(
        "/api/v1/assistant/orchestrator/chat",
        json={"message": "I need a booking"},
    )
    assert res.status_code == 401


def test_api_orchestrator_chat_rejects_unauthorized_patient_access() -> None:
    client = TestClient(app)
    org_one = uuid4().hex[:6]
    org_two = uuid4().hex[:6]

    owner_one = client.post(
        "/api/v1/auth/register",
        json={
            "email": f"owner-one-{org_one}@example.org",
            "password": "strong-password-123",
            "full_name": "Org One Owner",
            "organization_name": f"Org One {org_one}",
        },
    )
    assert owner_one.status_code == 201
    async def create_patient_in_first_tenant() -> UUID:
        await init_db()
        async with session_factory() as session:
            patient = Patient(
                organization_id=UUID(owner_one.json()["user"]["organization_id"]),
                medical_record_number=f"MRN-{uuid4().hex[:8].upper()}",
                given_name="Alice",
                family_name="Patient",
                date_of_birth=date(1980, 1, 1),
                gender="female",
            )
            session.add(patient)
            await session.commit()
            return patient.id

    patient_id = asyncio.run(create_patient_in_first_tenant())

    owner_two = client.post(
        "/api/v1/auth/register",
        json={
            "email": f"owner-two-{org_two}@example.org",
            "password": "strong-password-123",
            "full_name": "Org Two Owner",
            "organization_name": f"Org Two {org_two}",
        },
    )
    assert owner_two.status_code == 201
    token_two = owner_two.json()["access_token"]

    res = client.post(
        "/api/v1/assistant/orchestrator/chat",
        headers={"Authorization": f"Bearer {token_two}"},
        json={"message": "Book an appointment", "patient_id": str(patient_id)},
    )
    assert res.status_code == 404


def test_api_orchestrator_chat_rejects_invalid_patient_in_state() -> None:
    client = TestClient(app)
    org_suffix = uuid4().hex[:6]
    owner_res = client.post(
        "/api/v1/auth/register",
        json={
            "email": f"contract-owner-{org_suffix}@example.org",
            "password": "strong-password-123",
            "full_name": "Contract Owner",
            "organization_name": f"Contract Org {org_suffix}",
        },
    )
    assert owner_res.status_code == 201
    headers = {"Authorization": f"Bearer {owner_res.json()['access_token']}"}

    res = client.post(
        "/api/v1/assistant/orchestrator/chat",
        headers=headers,
        json={
            "message": "I want to book an appointment",
            "conversation_id": "abc-123",
            "orchestrator_state": {"patient_id": "not-a-uuid"},
        },
    )
    assert res.status_code == 422

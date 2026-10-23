from datetime import date, datetime, timedelta, timezone
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from app.ai.followup.contracts import FollowUpExtraction
from app.ai.followup.tools import FollowUpTools
from app.ai.orchestrator.contracts import IntentType
from app.ai.orchestrator.orchestrator import CareOSOrchestrator
from app.auth import provision_role_assignments
from app.db import init_db, session_factory
from app.models import Organization, Patient, Task, User


async def _seed() -> dict[str, UUID]:
    await init_db()
    async with session_factory() as session:
        organization = Organization(name=f"Follow-up test {uuid4()}")
        session.add(organization)
        await session.flush()
        clinician = User(
            organization_id=organization.id,
            email=f"doctor-{uuid4()}@example.org",
            full_name="Test Clinician",
            role="doctor",
            department="Cardiology",
            project="",
            password_hash="not-used-in-test",
        )
        receptionist = User(
            organization_id=organization.id,
            email=f"reception-{uuid4()}@example.org",
            full_name="Test Receptionist",
            role="receptionist",
            department="Cardiology",
            project="",
            password_hash="not-used-in-test",
        )
        other_organization = Organization(name=f"Other follow-up test {uuid4()}")
        session.add_all([clinician, receptionist, other_organization])
        await session.flush()
        await provision_role_assignments(session, clinician)
        await provision_role_assignments(session, receptionist)
        patients = [
            Patient(
                organization_id=organization.id,
                medical_record_number=f"MRN-{uuid4().hex[:10]}",
                given_name="Allowed",
                family_name="Patient",
                date_of_birth=date(1980, 1, 1),
                department="Cardiology",
            ),
            Patient(
                organization_id=organization.id,
                medical_record_number=f"MRN-{uuid4().hex[:10]}",
                given_name="Restricted",
                family_name="Patient",
                date_of_birth=date(1980, 1, 1),
                department="Oncology",
            ),
            Patient(
                organization_id=other_organization.id,
                medical_record_number=f"MRN-{uuid4().hex[:10]}",
                given_name="Other",
                family_name="Tenant",
                date_of_birth=date(1980, 1, 1),
                department="Cardiology",
            ),
        ]
        session.add_all(patients)
        await session.flush()
        other_patient_task = Task(
            organization_id=organization.id,
            patient_id=patients[1].id,
            title="Follow-up: lab_review",
            description="Restricted follow-up",
            assignee="Test Clinician",
            due_at=datetime.now(timezone.utc) + timedelta(days=2),
        )
        other_tenant_task = Task(
            organization_id=other_organization.id,
            patient_id=patients[2].id,
            title="Follow-up: lab_review",
            description="Other tenant follow-up",
            assignee="Other Clinician",
            due_at=datetime.now(timezone.utc) + timedelta(days=2),
        )
        session.add_all([other_patient_task, other_tenant_task])
        await session.commit()
        return {
            "organization_id": organization.id,
            "user_id": clinician.id,
            "receptionist_id": receptionist.id,
            "patient_id": patients[0].id,
            "restricted_patient_id": patients[1].id,
            "other_tenant_patient_id": patients[2].id,
            "other_tenant_task_id": other_tenant_task.id,
            "restricted_task_id": other_patient_task.id,
        }


async def _load_user(user_id: UUID) -> User:
    async with session_factory() as session:
        user = await session.get(User, user_id)
        assert user is not None
        return user


@pytest.mark.asyncio
async def test_followup_task_persists_and_supports_lifecycle_updates() -> None:
    seeded = await _seed()
    user = await _load_user(seeded["user_id"])
    due_at = datetime.now(timezone.utc) + timedelta(days=5)

    async with session_factory() as session:
        tools = FollowUpTools(session, user)
        created = await tools.create_followup(
            patient_id=seeded["patient_id"],
            followup_type="lab_review",
            reason="Review blood test results",
            due_at=due_at,
        )
        followup_id = UUID(str(created["id"]))
        row = await session.scalar(select(Task).where(Task.id == followup_id))
        assert row is not None
        assert row.organization_id == seeded["organization_id"]
        assert row.patient_id == seeded["patient_id"]
        assert row.status == "pending"

        retrieved = await tools.get_followup(followup_id=followup_id)
        assert retrieved["description"] == "Review blood test results"
        modified = await tools.update_followup(
            followup_id=followup_id, reason="Review updated results"
        )
        assert modified["description"] == "Review updated results"
        in_progress = await tools.update_followup_status(
            followup_id=followup_id, status="in_progress"
        )
        assert in_progress["status"] == "in_progress"
        completed = await tools.update_followup_status(
            followup_id=followup_id, status="completed"
        )
        assert completed["status"] == "completed"
        with pytest.raises(HTTPException) as invalid_transition:
            await tools.update_followup_status(
                followup_id=followup_id, status="cancelled"
            )
        assert invalid_transition.value.status_code == 409


@pytest.mark.asyncio
async def test_followup_rejects_duplicates_and_invalid_inputs() -> None:
    seeded = await _seed()
    user = await _load_user(seeded["user_id"])
    due_at = datetime.now(timezone.utc) + timedelta(days=3)
    async with session_factory() as session:
        tools = FollowUpTools(session, user)
        kwargs = {
            "patient_id": seeded["patient_id"],
            "followup_type": "routine",
            "reason": "Check symptoms",
            "due_at": due_at,
        }
        await tools.create_followup(**kwargs)
        with pytest.raises(HTTPException) as duplicate:
            await tools.create_followup(**kwargs)
        assert duplicate.value.status_code == 409
        with pytest.raises(HTTPException) as missing_fields:
            await tools.create_followup(
                patient_id=seeded["patient_id"],
                followup_type="",
                reason=" ",
                due_at=None,
            )
        assert missing_fields.value.status_code == 422


@pytest.mark.asyncio
async def test_followup_enforces_permission_patient_and_tenant_scope() -> None:
    seeded = await _seed()
    user = await _load_user(seeded["user_id"])
    receptionist = await _load_user(seeded["receptionist_id"])
    async with session_factory() as session:
        tools = FollowUpTools(session, user)
        create_args = {
            "followup_type": "routine",
            "reason": "Check symptoms",
            "due_at": datetime.now(timezone.utc) + timedelta(days=1),
        }
        with pytest.raises(HTTPException) as create_cross_patient:
            await tools.create_followup(
                patient_id=seeded["restricted_patient_id"], **create_args
            )
        assert create_cross_patient.value.status_code == 403
        with pytest.raises(HTTPException) as create_cross_tenant:
            await tools.create_followup(
                patient_id=seeded["other_tenant_patient_id"], **create_args
            )
        assert create_cross_tenant.value.status_code == 404
        with pytest.raises(HTTPException) as cross_patient:
            await tools.get_followup(followup_id=seeded["restricted_task_id"])
        assert cross_patient.value.status_code == 403
        with pytest.raises(HTTPException) as update_cross_patient:
            await tools.update_followup_status(
                followup_id=seeded["restricted_task_id"], status="completed"
            )
        assert update_cross_patient.value.status_code == 403
        with pytest.raises(HTTPException) as cross_tenant:
            await tools.get_followup(followup_id=seeded["other_tenant_task_id"])
        assert cross_tenant.value.status_code == 404
        with pytest.raises(HTTPException) as missing:
            await tools.get_followup(followup_id=uuid4())
        assert missing.value.status_code == 404

    async with session_factory() as session:
        tools_without_permission = FollowUpTools(session, receptionist)
        with pytest.raises(HTTPException) as forbidden:
            await tools_without_permission.create_followup(
                patient_id=seeded["patient_id"],
                followup_type="routine",
                reason="Check symptoms",
                due_at=datetime.now(timezone.utc) + timedelta(days=1),
            )
        assert forbidden.value.status_code == 403


class _FollowUpRouter:
    async def classify(self, _text: str):
        return type("IntentResult", (), {"intent": IntentType.FOLLOWUP})()


class _FollowUpExtractor:
    async def extract(self, text: str) -> FollowUpExtraction:
        return FollowUpExtraction(
            action="create",
            confirmation="confirm" if text == "confirm" else "unknown",
            followup_type="routine",
            date=(datetime.now(timezone.utc) + timedelta(days=4)).date().isoformat(),
            time="10:00",
            reason="Orchestrator integration follow-up",
        )


class _FollowUpDateThenTimeExtractor:
    async def extract(self, text: str) -> FollowUpExtraction:
        if text == "create":
            return FollowUpExtraction(
                action="create",
                followup_type="routine",
                date=(datetime.now(timezone.utc) + timedelta(days=6)).date().isoformat(),
                reason="Multi-turn follow-up",
            )
        return FollowUpExtraction(action="unknown", time="11:30")


@pytest.mark.asyncio
async def test_orchestrator_executes_persisted_followup_with_real_adapter() -> None:
    seeded = await _seed()
    user = await _load_user(seeded["user_id"])
    orchestrator = CareOSOrchestrator(
        router=_FollowUpRouter(),
        followup_extractor=_FollowUpExtractor(),
    )
    async with session_factory() as session:
        tools = FollowUpTools(session, user)
        first = await orchestrator.process(
            "create follow-up",
            patient_id=str(seeded["patient_id"]),
            followup_tools=tools,
        )
        assert first.status == "confirming"
        confirmed = await orchestrator.process(
            "confirm",
            patient_id=str(seeded["patient_id"]),
            conversation_id=first.conversation_id,
            state=first.orchestrator_state,
            followup_tools=tools,
        )
        assert confirmed.status == "completed"
        assert confirmed.followup_agent_called
        assert confirmed.result is not None
        assert confirmed.result["status"] == "pending"
        task = await session.get(Task, UUID(str(confirmed.result["id"])))
        assert task is not None
        assert task.patient_id == seeded["patient_id"]


@pytest.mark.asyncio
async def test_orchestrator_completes_followup_time_from_a_later_turn() -> None:
    seeded = await _seed()
    orchestrator = CareOSOrchestrator(
        router=_FollowUpRouter(),
        followup_extractor=_FollowUpDateThenTimeExtractor(),
    )
    first = await orchestrator.process(
        "create",
        patient_id=str(seeded["patient_id"]),
    )
    assert first.status == "collecting"
    followup_state = first.orchestrator_state.followup_state
    assert followup_state is not None
    assert followup_state.due_at is None

    second = await orchestrator.process(
        "11:30",
        patient_id=str(seeded["patient_id"]),
        conversation_id=first.conversation_id,
        state=first.orchestrator_state,
    )
    assert second.status == "confirming"
    assert second.orchestrator_state.followup_state.due_at is not None

import asyncio
from datetime import date, datetime, timedelta, timezone
from uuid import uuid4
from sqlalchemy import select
from app.db import session_factory
from app.models import (
    Organization, User, Patient, PatientProfile,
    Encounter, Appointment, ClinicalNote
)

PATIENTS_DATA = [
    {
        "mrn": "DEMO-001",
        "first": "Mariam", "last": "Hassan",
        "dob": date(1987, 4, 12), "gender": "female",
        "condition": "Hypertension follow-up", "status": "stable",
        "dept": "General Medicine", "phone": "+20 100 234 5678", "email": "mariam.hassan@example.com"
    },
    {
        "mrn": "DEMO-002",
        "first": "Ahmed", "last": "Mansour",
        "dob": date(1975, 8, 24), "gender": "male",
        "condition": "Type 2 Diabetes & Neuropathy", "status": "requires review",
        "dept": "Internal Medicine", "phone": "+20 101 456 7890", "email": "ahmed.mansour@example.com"
    },
    {
        "mrn": "DEMO-003",
        "first": "Sara", "last": "Ibrahim",
        "dob": date(1992, 11, 5), "gender": "female",
        "condition": "Aesthetic Dermatology & Laser Care", "status": "stable",
        "dept": "Dermatology", "phone": "+20 102 345 6789", "email": "sara.ibrahim@example.com"
    },
    {
        "mrn": "DEMO-004",
        "first": "Tarek", "last": "Mahmoud",
        "dob": date(1982, 3, 17), "gender": "male",
        "condition": "Severe Asthma & Bronchospasm", "status": "requires review",
        "dept": "Pulmonology", "phone": "+20 109 876 5432", "email": "tarek.mahmoud@example.com"
    },
    {
        "mrn": "DEMO-005",
        "first": "Layla", "last": "Nour",
        "dob": date(1995, 7, 29), "gender": "female",
        "condition": "Facial Rejuvenation & Fillers", "status": "stable",
        "dept": "Cosmetics", "phone": "+20 111 222 3344", "email": "layla.nour@example.com"
    },
    {
        "mrn": "DEMO-006",
        "first": "Omar", "last": "Farouk",
        "dob": date(1968, 12, 10), "gender": "male",
        "condition": "Post-Op Knee Replacement Recovery", "status": "stable",
        "dept": "Orthopedics", "phone": "+20 114 555 6677", "email": "omar.farouk@example.com"
    },
    {
        "mrn": "DEMO-007",
        "first": "Fatima", "last": "Al-Zahra",
        "dob": date(1989, 9, 14), "gender": "female",
        "condition": "Chronic Migraine with Visual Aura", "status": "requires review",
        "dept": "Neurology", "phone": "+20 120 777 8899", "email": "fatima.alzahra@example.com"
    },
    {
        "mrn": "DEMO-008",
        "first": "Karim", "last": "Adel",
        "dob": date(1990, 1, 22), "gender": "male",
        "condition": "Executive Annual Health Check", "status": "stable",
        "dept": "General Medicine", "phone": "+20 122 333 4455", "email": "karim.adel@example.com"
    },
    {
        "mrn": "DEMO-009",
        "first": "Youssef", "last": "Nabil",
        "dob": date(1960, 5, 30), "gender": "male",
        "condition": "Ischemic Heart Disease & Angina", "status": "requires review",
        "dept": "Cardiology", "phone": "+20 100 888 9900", "email": "youssef.nabil@example.com"
    },
    {
        "mrn": "DEMO-010",
        "first": "Mona", "last": "Khalil",
        "dob": date(1998, 6, 18), "gender": "female",
        "condition": "Atopic Dermatitis & Skin Allergy", "status": "stable",
        "dept": "Dermatology", "phone": "+20 115 666 7788", "email": "mona.khalil@example.com"
    },
    {
        "mrn": "DEMO-011",
        "first": "Hisham", "last": "Mostafa",
        "dob": date(1978, 10, 8), "gender": "male",
        "condition": "Essential Hypertension Stage 1", "status": "stable",
        "dept": "General Medicine", "phone": "+20 106 111 2233", "email": "hisham.mostafa@example.com"
    },
    {
        "mrn": "DEMO-012",
        "first": "Nourhan", "last": "Sherif",
        "dob": date(1994, 2, 14), "gender": "female",
        "condition": "Acne Scarring Laser Treatment", "status": "stable",
        "dept": "Cosmetics", "phone": "+20 109 444 5566", "email": "nourhan.sherif@example.com"
    }
]

async def seed_data():
    async with session_factory() as session:
        org = await session.scalar(select(Organization).where(Organization.name == "CareOS Demo Hospital"))
        if not org:
            org = await session.scalar(select(Organization).limit(1))
        if not org:
            print("No organization found!")
            return

        doctor = await session.scalar(select(User).where(User.organization_id == org.id, User.role == "doctor"))
        if not doctor:
            doctor = await session.scalar(select(User).where(User.organization_id == org.id).limit(1))

        now = datetime.now(timezone.utc)
        print(f"Seeding demo data for org: {org.name} ({org.id})")

        created_patients = []
        for pdata in PATIENTS_DATA:
            existing = await session.scalar(
                select(Patient).where(
                    Patient.organization_id == org.id,
                    Patient.medical_record_number == pdata["mrn"]
                )
            )
            if not existing:
                p = Patient(
                    organization_id=org.id,
                    department=pdata["dept"],
                    project="Demo workspace",
                    medical_record_number=pdata["mrn"],
                    given_name=pdata["first"],
                    family_name=pdata["last"],
                    date_of_birth=pdata["dob"],
                    gender=pdata["gender"],
                    condition=pdata["condition"],
                    care_status=pdata["status"]
                )
                session.add(p)
                await session.flush()
                
                profile = PatientProfile(
                    organization_id=org.id,
                    patient_id=p.id,
                    preferred_name=f"{pdata['first']}",
                    phone=pdata["phone"],
                    email=pdata["email"],
                    address="Cairo, Egypt",
                    emergency_contact="+20 100 000 0000 (Family)",
                    preferred_language="ar"
                )
                session.add(profile)
                created_patients.append(p)
            else:
                created_patients.append(existing)

        await session.flush()
        print(f"Total active patients in org: {len(created_patients)}")

        # Seed Encounters
        for p in created_patients:
            enc = await session.scalar(select(Encounter).where(Encounter.patient_id == p.id))
            if not enc:
                enc = Encounter(
                    organization_id=org.id,
                    patient_id=p.id,
                    clinician_id=doctor.id,
                    encounter_type="consultation",
                    status="active",
                    started_at=now - timedelta(hours=2)
                )
                session.add(enc)
                await session.flush()

                # Seed sample Clinical Note
                note = ClinicalNote(
                    organization_id=org.id,
                    patient_id=p.id,
                    encounter_id=enc.id,
                    author_id=doctor.id,
                    body=f"S: Patient presents for {p.condition}. Reports symptoms are generally managed.\nO: Vital signs stable. BP 125/82, HR 72, RR 16, SpO2 99% on room air.\nA: {p.condition} - clinically stable.\nP: Continue current treatment regimen. Follow-up scheduled in 4 weeks.",
                    ai_draft=f"AI Summary: Encounter for {p.condition}. Patient is in stable clinical status. Follow-up recommended in 4 weeks.",
                    status="approved",
                    version=1
                )
                session.add(note)

        # Seed Appointments for today and next days
        times_offsets = [
            (timedelta(hours=1), "Routine Follow-up & Vitals Check", "confirmed"),
            (timedelta(hours=2, minutes=30), "Dermatology & Skin Consult", "confirmed"),
            (timedelta(hours=4), "Lab Results Review", "arrived"),
            (timedelta(days=1, hours=2), "Comprehensive Clinical Check", "pending"),
            (timedelta(days=1, hours=5), "Medication Adjustment Review", "confirmed"),
            (timedelta(days=2, hours=1), "Post-treatment Assessment", "pending"),
            (timedelta(days=3, hours=3), "Cardiovascular Monitoring", "confirmed"),
            (timedelta(days=4, hours=2), "Allergy Skin Prick Test", "pending"),
        ]

        for i, (offset, reason, status) in enumerate(times_offsets):
            patient_target = created_patients[i % len(created_patients)]
            existing_appt = await session.scalar(
                select(Appointment).where(
                    Appointment.patient_id == patient_target.id,
                    Appointment.reason == reason
                )
            )
            if not existing_appt:
                appt = Appointment(
                    organization_id=org.id,
                    patient_id=patient_target.id,
                    clinician_id=doctor.id,
                    starts_at=now + offset,
                    duration_minutes=30,
                    status=status,
                    reason=reason,
                    reminder_status="sent" if status == "confirmed" else "not_scheduled"
                )
                session.add(appt)

        await session.commit()
        print("Data seeding completed successfully!")

if __name__ == "__main__":
    asyncio.run(seed_data())

import sqlite3
import uuid
from datetime import datetime, date, timedelta, timezone

con = sqlite3.connect(r'c:\Users\el mostafa\Downloads\newcareos-main\backend\careos.db')
cur = con.cursor()

# Find org
row = cur.execute("SELECT id FROM organizations WHERE name = 'CareOS Demo Hospital' LIMIT 1").fetchone()
if not row:
    row = cur.execute("SELECT id FROM organizations LIMIT 1").fetchone()
org_id = row[0]

# Find doctor user
doc_row = cur.execute("SELECT id FROM users WHERE role = 'doctor' LIMIT 1").fetchone()
if not doc_row:
    doc_row = cur.execute("SELECT id FROM users LIMIT 1").fetchone()
doc_id = doc_row[0]

now = datetime.now(timezone.utc)
now_str = now.strftime('%Y-%m-%d %H:%M:%S')

PATIENTS = [
    ("DEMO-001", "Mariam", "Hassan", "1987-04-12", "female", "Hypertension follow-up", "stable", "General Medicine", "+20 100 234 5678", "mariam.hassan@example.com"),
    ("DEMO-002", "Ahmed", "Mansour", "1975-08-24", "male", "Type 2 Diabetes & Neuropathy", "requires review", "Internal Medicine", "+20 101 456 7890", "ahmed.mansour@example.com"),
    ("DEMO-003", "Sara", "Ibrahim", "1992-11-05", "female", "Aesthetic Dermatology & Laser Care", "stable", "Dermatology", "+20 102 345 6789", "sara.ibrahim@example.com"),
    ("DEMO-004", "Tarek", "Mahmoud", "1982-03-17", "male", "Severe Asthma & Bronchospasm", "requires review", "Pulmonology", "+20 109 876 5432", "tarek.mahmoud@example.com"),
    ("DEMO-005", "Layla", "Nour", "1995-07-29", "female", "Facial Rejuvenation & Fillers", "stable", "Cosmetics", "+20 111 222 3344", "layla.nour@example.com"),
    ("DEMO-006", "Omar", "Farouk", "1968-12-10", "male", "Post-Op Knee Replacement Recovery", "stable", "Orthopedics", "+20 114 555 6677", "omar.farouk@example.com"),
    ("DEMO-007", "Fatima", "Al-Zahra", "1989-09-14", "female", "Chronic Migraine with Visual Aura", "requires review", "Neurology", "+20 120 777 8899", "fatima.alzahra@example.com"),
    ("DEMO-008", "Karim", "Adel", "1990-01-22", "male", "Executive Annual Health Check", "stable", "General Medicine", "+20 122 333 4455", "karim.adel@example.com"),
    ("DEMO-009", "Youssef", "Nabil", "1960-05-30", "male", "Ischemic Heart Disease & Angina", "requires review", "Cardiology", "+20 100 888 9900", "youssef.nabil@example.com"),
    ("DEMO-010", "Mona", "Khalil", "1998-06-18", "female", "Atopic Dermatitis & Skin Allergy", "stable", "Dermatology", "+20 115 666 7788", "mona.khalil@example.com"),
    ("DEMO-011", "Hisham", "Mostafa", "1978-10-08", "male", "Essential Hypertension Stage 1", "stable", "General Medicine", "+20 106 111 2233", "hisham.mostafa@example.com"),
    ("DEMO-012", "Nourhan", "Sherif", "1994-02-14", "female", "Acne Scarring Laser Treatment", "stable", "Cosmetics", "+20 109 444 5566", "nourhan.sherif@example.com")
]

patient_ids = []

for mrn, given, family, dob, gender, condition, care_status, dept, phone, email in PATIENTS:
    existing = cur.execute("SELECT id FROM patients WHERE medical_record_number = ? AND organization_id = ?", (mrn, org_id)).fetchone()
    if existing:
        p_id = existing[0]
    else:
        p_id = uuid.uuid4().hex
        patient_code = f"CARE-{mrn.replace('-', '')[:4]}-{uuid.uuid4().hex[:4].upper()}"
        cur.execute(
            """INSERT INTO patients (id, organization_id, department, project, patient_code, medical_record_number, given_name, family_name, date_of_birth, gender, condition, care_status, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (p_id, org_id, dept, "Demo workspace", patient_code, mrn, given, family, dob, gender, condition, care_status, now_str, now_str)
        )
        # Profile
        prof_id = uuid.uuid4().hex
        cur.execute(
            """INSERT OR IGNORE INTO patient_profiles (id, organization_id, patient_id, phone, email, address, emergency_contact, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (prof_id, org_id, p_id, phone, email, "Cairo, Egypt", "+20 100 000 0000 (Family)", now_str, now_str)
        )
    patient_ids.append((p_id, given, family, condition))

# Create Encounters for each patient
for p_id, given, family, condition in patient_ids:
    enc_existing = cur.execute("SELECT id FROM encounters WHERE patient_id = ?", (p_id,)).fetchone()
    if not enc_existing:
        enc_id = uuid.uuid4().hex
        cur.execute(
            """INSERT INTO encounters (id, organization_id, patient_id, clinician_id, encounter_type, status, started_at, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (enc_id, org_id, p_id, doc_id, "consultation", "active", now_str, now_str)
        )
        # Create a clinical note for this encounter
        note_id = uuid.uuid4().hex
        body = f"S: Patient {given} {family} presents for evaluation of {condition}. Reports symptoms are moderately controlled.\nO: Vital signs: BP 122/80 mmHg, HR 74 bpm, Temp 36.8 C, O2 Sat 99%.\nA: {condition} - stable under current management plan.\nP: Continue current prescription. Advised lifestyle modifications and scheduled for review."
        ai_draft = f"AI Clinical Summary: Follow-up visit for {condition}. Vitals within normal limits. Patient advised to maintain current therapy and return for next scheduled checkup."
        cur.execute(
            """INSERT INTO clinical_notes (id, organization_id, patient_id, encounter_id, author_id, body, ai_draft, status, version, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (note_id, org_id, p_id, enc_id, doc_id, body, ai_draft, "approved", 1, now_str)
        )

# Create 8 appointments spanning today and upcoming dates
APPOINTMENTS = [
    (0, timedelta(hours=1), "Routine Follow-up & Vitals Check", "confirmed"),
    (1, timedelta(hours=2, minutes=30), "Dermatology & Skin Consult", "confirmed"),
    (2, timedelta(hours=3, minutes=45), "Laser Treatment Session", "arrived"),
    (3, timedelta(hours=5), "Lab Results Review", "pending"),
    (4, timedelta(days=1, hours=2), "Comprehensive Clinical Check", "confirmed"),
    (5, timedelta(days=1, hours=4), "Medication Adjustment Review", "pending"),
    (6, timedelta(days=2, hours=1), "Post-treatment Assessment", "confirmed"),
    (7, timedelta(days=3, hours=3), "Cardiovascular Monitoring", "confirmed")
]

for p_idx, offset, reason, status in APPOINTMENTS:
    p_id = patient_ids[p_idx % len(patient_ids)][0]
    app_existing = cur.execute("SELECT id FROM appointments WHERE patient_id = ? AND reason = ?", (p_id, reason)).fetchone()
    if not app_existing:
        app_id = uuid.uuid4().hex
        start_time = (now + offset).strftime('%Y-%m-%d %H:%M:%S')
        cur.execute(
            """INSERT INTO appointments (id, organization_id, patient_id, starts_at, status, reason, reminder_status, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (app_id, org_id, p_id, start_time, status, reason, "sent" if status == "confirmed" else "not_scheduled", now_str)
        )

con.commit()
con.close()
print(f"Successfully seeded {len(patient_ids)} patients with encounters, notes, and appointments!")

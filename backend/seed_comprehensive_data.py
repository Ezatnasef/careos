"""Comprehensive database seed script for CareOS.
Populates notifications, patient messages, clinician schedules, care plans,
tasks, patient portal documents, and clinical RAG document chunks.
"""

from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import datetime, timedelta, timezone
import numpy as np

DB_PATH = r"c:\Users\el mostafa\Downloads\newcareos-main\backend\careos.db"

ORG_ID = "8ce0a94d4b3e4e1f9d73eed8fa8ab239"

USER_ADMIN_1 = "91a9d41be7c24919828ba9f72c685cf9"      # demo-admin@careos.local
USER_ADMIN_2 = "33a967d2b1984935bdfccedd997bbd86"      # admin.demo@careos.example.com
USER_DOCTOR = "294f331a68fd402faa5afbaa1e65aa5b"       # doctor.demo@careos.example.com
USER_STAFF = "5f6388ac7e794e438779933c975d043d"        # staff.demo@careos.example.com
USER_DIRECTOR = "7bacafeb5629421fa4d9a31273a80b1f"     # director.demo@careos.example.com
USER_ITADMIN = "a1d5583fa460474cb3905c156ce70ee2"      # itadmin.demo@careos.example.com
USER_RECEPTION = "5c57f09e474546d5bcb77b6b3cc2353e"    # reception.demo@careos.example.com

PORTAL_ACCOUNT_MARIAM = "e9d418c0aa4845b4806361c6d5383ff4"

PATIENTS = {
    "DEMO-001": ("cba3352a8d0a42a1935270dece152305", "Mariam Hassan"),
    "DEMO-002": ("27ba443bd9e340dd8bdaa30460bacbc0", "Ahmed Mansour"),
    "DEMO-003": ("ca782738fa144baa858e55607d26184f", "Sara Ibrahim"),
    "DEMO-004": ("4705d1cd12b248ad9768b4c16ebb9d68", "Tarek Mahmoud"),
    "DEMO-005": ("9934afc91a8e46b886115913d720d2b3", "Layla Nour"),
    "DEMO-006": ("07a36dd041404dad9de991a20c32e512", "Omar Farouk"),
    "DEMO-007": ("303e3bcfe922436eaaf86cef5ceba06a", "Fatima Al-Zahra"),
    "DEMO-008": ("e9bc144b98d34649a27cc57e3664b145", "Karim Adel"),
    "DEMO-009": ("744490c25b2b481a87b1cc5a3af71823", "Youssef Nabil"),
    "DEMO-010": ("2b67539f899e4a1b8f060f03593b3dd5", "Mona Khalil"),
    "DEMO-011": ("7dc46273e0d3435f87c27b4d973deb6c", "Hisham Mostafa"),
    "DEMO-012": ("ad43c3ca6051469b89e6de3731aa6b4f", "Nourhan Sherif"),
}

def make_uuid() -> str:
    return uuid.uuid4().hex

def make_vector(seed_val: int) -> list[float]:
    rng = np.random.RandomState(seed_val)
    vec = rng.randn(384).astype(np.float32)
    norm = np.linalg.norm(vec)
    if norm > 0:
        vec = vec / norm
    return [round(float(x), 6) for x in vec]

def run_seed():
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    now = datetime.now(timezone.utc)

    print("--- 1. Seeding Notifications ---")
    cur.execute("DELETE FROM notifications")
    notifications = [
        # Doctor notifications
        (make_uuid(), USER_DOCTOR, "clinical_alert", "Lab Results Ready - Mariam Hassan (DEMO-001)", "Lipid panel and HbA1c results have arrived. Fasting blood glucose is 108 mg/dL.", 0, (now - timedelta(minutes=15)).strftime("%Y-%m-%d %H:%M:%S")),
        (make_uuid(), USER_DOCTOR, "appointment_alert", "Upcoming Consultation - Ahmed Mansour (DEMO-002)", "Cardiology consultation scheduled for today at 11:30 AM in Room 2.", 0, (now - timedelta(hours=1)).strftime("%Y-%m-%d %H:%M:%S")),
        (make_uuid(), USER_DOCTOR, "clinical_note", "Clinical Note Pending Signature", "Note for encounter with Sara Ibrahim (DEMO-003) is drafted and awaiting final sign-off.", 0, (now - timedelta(hours=2)).strftime("%Y-%m-%d %H:%M:%S")),
        (make_uuid(), USER_DOCTOR, "patient_message", "New Patient Message - Layla Nour (DEMO-005)", "Patient inquiring about post-procedure skincare routine.", 1, (now - timedelta(hours=5)).strftime("%Y-%m-%d %H:%M:%S")),
        (make_uuid(), USER_DOCTOR, "telehealth", "Telehealth Visit Request", "Tarek Mahmoud (DEMO-004) requested a remote follow-up review.", 1, (now - timedelta(days=1)).strftime("%Y-%m-%d %H:%M:%S")),

        # Admin notifications
        (make_uuid(), USER_ADMIN_1, "system_audit", "Daily Security & Audit Sync Complete", "86 access events logged across all tenant endpoints. Zero anomalies detected.", 0, (now - timedelta(minutes=30)).strftime("%Y-%m-%d %H:%M:%S")),
        (make_uuid(), USER_ADMIN_1, "voice_agent", "AI Voice Receptionist Online", "Gemini 3.8 Live bidirectional bridge initialized on port 8765. Ready for voice calls.", 0, (now - timedelta(hours=1)).strftime("%Y-%m-%d %H:%M:%S")),
        (make_uuid(), USER_ADMIN_1, "compliance", "HIPAA Access Control Verification Passed", "All clinician roles and RBAC permission matrices verified.", 1, (now - timedelta(days=1)).strftime("%Y-%m-%d %H:%M:%S")),
        (make_uuid(), USER_ADMIN_2, "system_audit", "Daily Security & Audit Sync Complete", "86 access events logged across all tenant endpoints. Zero anomalies detected.", 0, (now - timedelta(minutes=30)).strftime("%Y-%m-%d %H:%M:%S")),
        (make_uuid(), USER_ADMIN_2, "voice_agent", "AI Voice Receptionist Online", "Gemini 3.8 Live bidirectional bridge initialized on port 8765. Ready for voice calls.", 0, (now - timedelta(hours=1)).strftime("%Y-%m-%d %H:%M:%S")),
        (make_uuid(), USER_ADMIN_2, "onboarding", "New Clinical Staff Onboarded", "Dr. Concurrency added to Department of Internal Medicine.", 1, (now - timedelta(days=2)).strftime("%Y-%m-%d %H:%M:%S")),

        # Director notifications
        (make_uuid(), USER_DIRECTOR, "operations", "Hospital Occupancy & Throughput Report", "Overall clinical room utilization at 74%. Average wait time is 17 minutes.", 0, (now - timedelta(hours=2)).strftime("%Y-%m-%d %H:%M:%S")),
        (make_uuid(), USER_DIRECTOR, "executive", "Monthly Quality & Care Metric Summary", "AI note review adoption rate reached 96% with average documentation time reduced by 40%.", 0, (now - timedelta(hours=6)).strftime("%Y-%m-%d %H:%M:%S")),

        # Reception / Staff notifications
        (make_uuid(), USER_RECEPTION, "reception", "Patient Check-in Alert", "Mariam Hassan (DEMO-001) checked in at the kiosk for 10:00 AM consultation.", 0, (now - timedelta(minutes=10)).strftime("%Y-%m-%d %H:%M:%S")),
        (make_uuid(), USER_RECEPTION, "voice_booking", "Voice Receptionist Booking Created", "AI receptionist booked laser session for Fatima Al-Zahra via Egyptian Arabic voice turn.", 0, (now - timedelta(hours=3)).strftime("%Y-%m-%d %H:%M:%S")),
        (make_uuid(), USER_STAFF, "queue", "Triage Queue Update", "4 patients currently waiting in triage queue. Room 1 & 2 are ready for consults.", 0, (now - timedelta(minutes=20)).strftime("%Y-%m-%d %H:%M:%S")),
    ]
    cur.executemany("INSERT INTO notifications (id, user_id, kind, title, body, read, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", notifications)
    print(f"  Inserted {len(notifications)} notifications.")

    print("--- 2. Seeding Patient Messages ---")
    cur.execute("DELETE FROM patient_messages")
    messages = [
        # Mariam Hassan (DEMO-001)
        (make_uuid(), ORG_ID, PATIENTS["DEMO-001"][0], "patient", "inbound", "Fasting Instructions Inquiry", "Hello care team, do I need to fast before my morning lab blood draw tomorrow?", 1, (now - timedelta(days=2, hours=3)).strftime("%Y-%m-%d %H:%M:%S")),
        (make_uuid(), ORG_ID, PATIENTS["DEMO-001"][0], "care_team", "outbound", "Re: Fasting Instructions Inquiry", "Dear Mariam, yes please maintain an 8-hour overnight water-only fast prior to your 10:00 AM metabolic panel.", 1, (now - timedelta(days=2, hours=1)).strftime("%Y-%m-%d %H:%M:%S")),
        (make_uuid(), ORG_ID, PATIENTS["DEMO-001"][0], "patient", "inbound", "Blood pressure log update", "My home readings over the last 3 days averaged 124/82 mmHg. Feeling much better with the updated dose.", 0, (now - timedelta(hours=4)).strftime("%Y-%m-%d %H:%M:%S")),
        (make_uuid(), ORG_ID, PATIENTS["DEMO-001"][0], "care_team", "outbound", "Re: Blood pressure log update", "Excellent progress Mariam! We will review this together in your consult today.", 0, (now - timedelta(hours=2)).strftime("%Y-%m-%d %H:%M:%S")),

        # Ahmed Mansour (DEMO-002) - Arabic
        (make_uuid(), ORG_ID, PATIENTS["DEMO-002"][0], "patient", "inbound", "تجديد وصفة علاج الضغط", "مساء الخير، محتاج تجديد لوصفة دواء الضغط كونكور ٥ مجم قبل موعد السفر القادم.", 1, (now - timedelta(days=1, hours=8)).strftime("%Y-%m-%d %H:%M:%S")),
        (make_uuid(), ORG_ID, PATIENTS["DEMO-002"][0], "care_team", "outbound", "Re: تجديد وصفة علاج الضغط", "أهلاً أستاذ أحمد، تم إرسال الوصفة الطبية المجددة إلكترونياً إلى صيدلية المستشفى المركزية ويمكنك استلامها في أي وقت.", 1, (now - timedelta(days=1, hours=4)).strftime("%Y-%m-%d %H:%M:%S")),

        # Sara Ibrahim (DEMO-003) - Aesthetic
        (make_uuid(), ORG_ID, PATIENTS["DEMO-003"][0], "patient", "inbound", "Rescheduling laser session", "Hi, can I move my fractional laser session to this Friday afternoon around 2:30 PM?", 1, (now - timedelta(days=1, hours=12)).strftime("%Y-%m-%d %H:%M:%S")),
        (make_uuid(), ORG_ID, PATIENTS["DEMO-003"][0], "care_team", "outbound", "Re: Rescheduling laser session", "Confirmed Sara! Your laser therapy session is scheduled for Friday at 2:30 PM in the Aesthetics Suite.", 1, (now - timedelta(days=1, hours=10)).strftime("%Y-%m-%d %H:%M:%S")),

        # Tarek Mahmoud (DEMO-004)
        (make_uuid(), ORG_ID, PATIENTS["DEMO-004"][0], "patient", "inbound", "ECG results timeline", "Good afternoon, will my Holter monitor report be ready by my next appointment?", 1, (now - timedelta(days=3)).strftime("%Y-%m-%d %H:%M:%S")),
        (make_uuid(), ORG_ID, PATIENTS["DEMO-004"][0], "care_team", "outbound", "Re: ECG results timeline", "Hello Tarek, the telemetry scan is currently being reviewed by cardiology and will be fully ready for your visit.", 1, (now - timedelta(days=2, hours=18)).strftime("%Y-%m-%d %H:%M:%S")),

        # Layla Nour (DEMO-005) - Arabic
        (make_uuid(), ORG_ID, PATIENTS["DEMO-005"][0], "patient", "inbound", "استفسار عن كريم الحماية بعد جلسة التقشير", "هل ممكن استخدام واقي شمس فيزيائي خالي من العطور بعد جلسة التقشير البارد مباشرة؟", 0, (now - timedelta(hours=6)).strftime("%Y-%m-%d %H:%M:%S")),
        (make_uuid(), ORG_ID, PATIENTS["DEMO-005"][0], "care_team", "outbound", "Re: استفسار عن كريم الحماية بعد جلسة التقشير", "نعم بالتأكيد ليلى، يُفضل استخدام واقي شمس معدني مع تجديده كل ساعتين أثناء التعرض للضوء.", 0, (now - timedelta(hours=3)).strftime("%Y-%m-%d %H:%M:%S")),

        # Omar Farouk (DEMO-006)
        (make_uuid(), ORG_ID, PATIENTS["DEMO-006"][0], "patient", "inbound", "Exercise treadmill test preparation", "Could you please remind me of any caffeine restrictions before the stress test?", 0, (now - timedelta(hours=8)).strftime("%Y-%m-%d %H:%M:%S")),
        (make_uuid(), ORG_ID, PATIENTS["DEMO-006"][0], "care_team", "outbound", "Re: Exercise treadmill test preparation", "Please abstain from all caffeinated drinks, tea, coffee, and energy beverages for 24 hours prior to the test.", 0, (now - timedelta(hours=7)).strftime("%Y-%m-%d %H:%M:%S")),
    ]
    cur.executemany("INSERT INTO patient_messages (id, organization_id, patient_id, sender_type, direction, subject, body, read, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", messages)
    print(f"  Inserted {len(messages)} patient messages.")

    print("--- 3. Seeding Clinician Schedules ---")
    cur.execute("DELETE FROM clinician_schedules")
    schedules = []
    # Monday to Friday (0 to 4) 09:00 to 17:00 in 30-minute slots
    for day in range(5):
        schedules.append((
            make_uuid(),
            ORG_ID,
            USER_DOCTOR,
            day,
            "09:00:00",
            "17:00:00",
            30,
            now.strftime("%Y-%m-%d %H:%M:%S")
        ))
    cur.executemany("INSERT INTO clinician_schedules (id, organization_id, clinician_id, day_of_week, start_time, end_time, slot_duration_minutes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", schedules)
    print(f"  Inserted {len(schedules)} clinician schedule blocks.")

    print("--- 4. Seeding Care Plans ---")
    cur.execute("DELETE FROM care_plans")
    care_plans = [
        (make_uuid(), ORG_ID, PATIENTS["DEMO-001"][0], "Cardiovascular Risk & Hypertension Management", "Comprehensive secondary prevention plan focused on blood pressure normalization, lipid target attainment, and lifestyle counseling.", "active", "1. Target systolic BP < 130 mmHg\n2. LDL-C < 70 mg/dL with statin optimization\n3. Mediterranean diet and 150 min/week moderate aerobic activity", now.strftime("%Y-%m-%d %H:%M:%S"), now.strftime("%Y-%m-%d %H:%M:%S")),
        (make_uuid(), ORG_ID, PATIENTS["DEMO-002"][0], "Type 2 Diabetes Glycemic & Metabolic Protocol", "Multidisciplinary glycemic control plan combining oral hypoglycemic therapy with dietary education and continuous glucose monitoring.", "active", "1. Target HbA1c < 7.0%\n2. Annual diabetic retinal screening\n3. Regular podiatric evaluation and microalbuminuria surveillance", now.strftime("%Y-%m-%d %H:%M:%S"), now.strftime("%Y-%m-%d %H:%M:%S")),
        (make_uuid(), ORG_ID, PATIENTS["DEMO-003"][0], "Aesthetic Laser Therapy & Post-Procedure Recovery", "Standardized cosmetic dermatology protocol for facial skin resurfacing and barrier recovery.", "active", "1. Complete 4 scheduled fractional CO2 laser sessions\n2. Strict photoprotection with broad-spectrum SPF 50+\n3. Post-procedure ceramide recovery hydration", now.strftime("%Y-%m-%d %H:%M:%S"), now.strftime("%Y-%m-%d %H:%M:%S")),
        (make_uuid(), ORG_ID, PATIENTS["DEMO-004"][0], "Cardiology Post-Stent Telemetry Surveillance", "Post-PCI clinical pathway monitoring antiplatelet compliance, exercise tolerance, and angina recurrence.", "active", "1. Dual antiplatelet therapy adherence for 12 months\n2. Outpatient cardiac rehabilitation enrollment\n3. Quarterly echocardiographic reassessment", now.strftime("%Y-%m-%d %H:%M:%S"), now.strftime("%Y-%m-%d %H:%M:%S")),
        (make_uuid(), ORG_ID, PATIENTS["DEMO-005"][0], "Chronic Eczema & Dermatitis Barrier Restoration", "Stepwise therapeutic plan for atopic flare prevention and topical barrier repair.", "active", "1. Emollient application twice daily immediately after bathing\n2. Short-course low-potency topical corticosteroid for acute flares\n3. Trigger avoidance (fragrances, harsh detergents)", now.strftime("%Y-%m-%d %H:%M:%S"), now.strftime("%Y-%m-%d %H:%M:%S")),
        (make_uuid(), ORG_ID, PATIENTS["DEMO-006"][0], "Ischemic Heart Disease Follow-up & Stress Monitoring", "Conservative outpatient monitoring of stable coronary artery disease.", "active", "1. Verify exercise stress test completion\n2. Titrate beta-blocker to resting heart rate 55-65 bpm\n3. Patient education on sublingual nitroglycerin use", now.strftime("%Y-%m-%d %H:%M:%S"), now.strftime("%Y-%m-%d %H:%M:%S")),
    ]
    cur.executemany("INSERT INTO care_plans (id, organization_id, patient_id, title, summary, status, goals, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", care_plans)
    print(f"  Inserted {len(care_plans)} care plans.")

    print("--- 5. Seeding Tasks ---")
    cur.execute("DELETE FROM tasks")
    tasks = [
        (make_uuid(), ORG_ID, PATIENTS["DEMO-001"][0], "Review Lipid Panel & Adjust Statin", "Fasting blood panel arrived this morning. Evaluate LDL-C and confirm tolerability.", "Dr. Demo Clinician", "high", "pending", (now + timedelta(days=1)).strftime("%Y-%m-%d %H:%M:%S"), now.strftime("%Y-%m-%d %H:%M:%S"), now.strftime("%Y-%m-%d %H:%M:%S")),
        (make_uuid(), ORG_ID, PATIENTS["DEMO-002"][0], "Order HbA1c Lab Requisition", "Generate laboratory order for next 3-month glycemic follow-up check.", "Dr. Demo Clinician", "medium", "pending", (now + timedelta(days=3)).strftime("%Y-%m-%d %H:%M:%S"), now.strftime("%Y-%m-%d %H:%M:%S"), now.strftime("%Y-%m-%d %H:%M:%S")),
        (make_uuid(), ORG_ID, PATIENTS["DEMO-003"][0], "Prepare Laser Procedure Suite", "Ensure fractional handpiece calibration and topical numbing cream preparation for Sara Ibrahim.", "Nursing team", "high", "pending", (now + timedelta(hours=4)).strftime("%Y-%m-%d %H:%M:%S"), now.strftime("%Y-%m-%d %H:%M:%S"), now.strftime("%Y-%m-%d %H:%M:%S")),
        (make_uuid(), ORG_ID, PATIENTS["DEMO-004"][0], "Confirm Cardiac Telemetry Booking", "Coordinate appointment slot with cardiac imaging department for stress echo.", "Demo Reception", "medium", "in_progress", (now + timedelta(days=2)).strftime("%Y-%m-%d %H:%M:%S"), now.strftime("%Y-%m-%d %H:%M:%S"), now.strftime("%Y-%m-%d %H:%M:%S")),
        (make_uuid(), ORG_ID, PATIENTS["DEMO-005"][0], "Verify Prior Authorization for Biologic", "Submit clinical justification notes to insurance portal for dupilumab.", "Demo Operations Staff", "high", "pending", (now + timedelta(days=4)).strftime("%Y-%m-%d %H:%M:%S"), now.strftime("%Y-%m-%d %H:%M:%S"), now.strftime("%Y-%m-%d %H:%M:%S")),
        (make_uuid(), ORG_ID, PATIENTS["DEMO-006"][0], "Follow-up Phone Call Post-Discharge", "Routine telephone check-in 48 hours post-discharge to verify medication access.", "Nursing team", "low", "completed", (now - timedelta(hours=12)).strftime("%Y-%m-%d %H:%M:%S"), now.strftime("%Y-%m-%d %H:%M:%S"), now.strftime("%Y-%m-%d %H:%M:%S")),
        (make_uuid(), ORG_ID, PATIENTS["DEMO-007"][0], "Review Arabic Voice Booking Details", "Verify cosmetic consultation request captured by the AI voice receptionist.", "Demo Reception", "medium", "completed", (now - timedelta(hours=2)).strftime("%Y-%m-%d %H:%M:%S"), now.strftime("%Y-%m-%d %H:%M:%S"), now.strftime("%Y-%m-%d %H:%M:%S")),
        (make_uuid(), ORG_ID, PATIENTS["DEMO-008"][0], "Archive Scanned Referral Document", "OCR indexing completed for intake paperwork. Confirm validation.", "Demo Operations Staff", "low", "pending", (now + timedelta(days=5)).strftime("%Y-%m-%d %H:%M:%S"), now.strftime("%Y-%m-%d %H:%M:%S"), now.strftime("%Y-%m-%d %H:%M:%S")),
    ]
    cur.executemany("INSERT INTO tasks (id, organization_id, patient_id, title, description, assignee, priority, status, due_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", tasks)
    print(f"  Inserted {len(tasks)} clinical & operational tasks.")

    print("--- 6. Seeding Patient Portal Documents ---")
    cur.execute("DELETE FROM patient_portal_documents")
    portal_docs = [
        (make_uuid(), ORG_ID, PATIENTS["DEMO-001"][0], PORTAL_ACCOUNT_MARIAM, "Discharge_Summary_Cardiology.pdf", "careos/portal/DEMO-001/discharge_summary.pdf", "http://localhost:5173/api/v1/patient-portal/documents/discharge_summary.pdf", "application/pdf", 128450, "Clinical discharge summary outlining medication adjustments, diet protocol, and follow-up consultation dates.", (now - timedelta(days=5)).strftime("%Y-%m-%d %H:%M:%S")),
        (make_uuid(), ORG_ID, PATIENTS["DEMO-001"][0], PORTAL_ACCOUNT_MARIAM, "Metabolic_Panel_Lab_Report.pdf", "careos/portal/DEMO-001/lab_report.pdf", "http://localhost:5173/api/v1/patient-portal/documents/lab_report.pdf", "application/pdf", 84210, "Comprehensive lab findings including HbA1c, fasting glucose, electrolyte balance, and lipid breakdown.", (now - timedelta(days=1)).strftime("%Y-%m-%d %H:%M:%S")),
        (make_uuid(), ORG_ID, PATIENTS["DEMO-001"][0], PORTAL_ACCOUNT_MARIAM, "Patient_Care_Plan_Overview.pdf", "careos/portal/DEMO-001/care_plan.pdf", "http://localhost:5173/api/v1/patient-portal/documents/care_plan.pdf", "application/pdf", 65300, "Patient educational pamphlet on managing blood pressure targets and sodium reduction recommendations.", (now - timedelta(days=3)).strftime("%Y-%m-%d %H:%M:%S")),
        (make_uuid(), ORG_ID, PATIENTS["DEMO-002"][0], None, "Diabetes_Management_Guide.pdf", "careos/portal/DEMO-002/diabetes_guide.pdf", "http://localhost:5173/api/v1/patient-portal/documents/diabetes_guide.pdf", "application/pdf", 195400, "Dietary counseling guidelines and blood glucose logging worksheets.", (now - timedelta(days=7)).strftime("%Y-%m-%d %H:%M:%S")),
    ]
    cur.executemany("INSERT INTO patient_portal_documents (id, organization_id, patient_id, portal_account_id, filename, storage_key, download_url, content_type, size_bytes, content, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", portal_docs)
    print(f"  Inserted {len(portal_docs)} patient portal documents.")

    print("--- 7. Seeding Clinical RAG Document Chunks ---")
    cur.execute("DELETE FROM document_chunks")
    chunks = []

    # 1. Shared Clinical Practice Guidelines (organization_id=None, patient_id=None, source_type="guideline")
    guidelines_data = [
        ("guideline_aha_htn_001", "AHA_ACC_2026_Hypertension_Guidelines.pdf", 1,
         "Arterial Hypertension Classification: Normal blood pressure is defined as < 120/80 mmHg. Elevated blood pressure is systolic between 120-129 mmHg and diastolic < 80 mmHg. Stage 1 Hypertension is systolic 130-139 mmHg or diastolic 80-89 mmHg. Stage 2 Hypertension is systolic >= 140 mmHg or diastolic >= 90 mmHg. For stage 1 hypertension with estimated 10-year ASCVD risk >= 10%, prompt initiation of first-line pharmacotherapy is recommended alongside lifestyle modifications.", 101),
        ("guideline_aha_htn_002", "AHA_ACC_2026_Hypertension_Guidelines.pdf", 2,
         "First-line Pharmacotherapy for Hypertension: Initial monotherapy or combination therapy includes thiazide-type diuretics, calcium channel blockers (CCBs), and angiotensin-converting enzyme (ACE) inhibitors or angiotensin receptor blockers (ARBs). In patients with stage 2 hypertension and an average blood pressure > 20/10 mmHg above goal, initiation of therapy with two first-line agents of different classes is strongly advised.", 102),
        ("guideline_ada_dm_001", "ADA_2026_Standards_of_Care_Diabetes.pdf", 1,
         "Glycemic Targets in Type 2 Diabetes: An A1C target of < 7.0% (53 mmol/mol) without significant hypoglycemia is appropriate for many nonpregnant adults. More stringent targets such as < 6.5% may be suggested for select individual patients if achievable without clinically significant hypoglycemia or adverse treatment effects. Less stringent goals (< 8.0%) are appropriate for patients with severe comorbidities or limited life expectancy.", 103),
        ("guideline_ada_dm_002", "ADA_2026_Standards_of_Care_Diabetes.pdf", 2,
         "Cardiorenal Risk Reduction in Diabetes: In adults with type 2 diabetes and established atherosclerotic cardiovascular disease, heart failure, or chronic kidney disease (CKD), the recommended regimen should include an SGLT2 inhibitor and/or a GLP-1 receptor agonist with demonstrated cardiovascular benefit, independent of baseline A1C or metformin use.", 104),
        ("guideline_aad_laser_001", "AAD_Aesthetic_Laser_and_Light_Protocols.pdf", 1,
         "Fractional Ablative and Non-Ablative Laser Protocols: Pre-procedure evaluation requires Fitzpatrick phototype assessment. In phototypes III to VI, pretreatment with topical tyrosinase inhibitors (such as azelaic acid or tranexamic acid) reduces the incidence of post-inflammatory hyperpigmentation (PIH). Minimum recovery spacing between successive ablative fractional sessions should be 4 to 6 weeks.", 105),
        ("guideline_aad_laser_002", "AAD_Aesthetic_Laser_and_Light_Protocols.pdf", 2,
         "Laser Post-Treatment Care: Patients must avoid direct ultraviolet radiation exposure and apply broad-spectrum physical sunscreen (zinc oxide or titanium dioxide SPF >= 50) daily. Application of fragrance-free barrier restorative creams containing ceramides and hyaluronic acid is indicated during re-epithelialization. Avoid exfoliating alpha- or beta-hydroxy acids for at least 14 days post-procedure.", 106),
        ("guideline_gina_asthma_001", "GINA_2026_Asthma_Management_Strategy.pdf", 1,
         "Stepwise Asthma Management in Adults: Track 1 (preferred) uses low-dose inhaled corticosteroid (ICS)-formoterol as the patient's reliever across all steps. This approach significantly reduces the risk of severe exacerbations compared with using a short-acting beta2-agonist (SABA) alone. Maintenance and reliever therapy (MART) is recommended for patients in Steps 3 through 5.", 107),
        ("guideline_triage_emer_001", "CareOS_Clinical_Triage_and_Escalation.pdf", 1,
         "Acute Clinical Triage Red Flags: Immediate emergency department escalation or rapid response activation is mandatory if the patient exhibits acute ischemic chest pain radiating to the jaw/left arm, sudden neurological deficit (FAST criteria: face drooping, arm weakness, slurred speech), respiratory rate > 28/min or oxygen saturation < 90% on room air, or signs of anaphylaxis (stridor, wheezing, hypotension).", 108),
        ("guideline_lipid_acc_001", "ACC_2026_Cholesterol_Clinical_Guidelines.pdf", 1,
         "Lipid Management & Statin Titration: In patients aged 40 to 75 years with diabetes mellitus, moderate-intensity statin therapy is indicated regardless of estimated 10-year ASCVD risk. High-intensity statin therapy (atorvastatin 40-80 mg or rosuvastatin 20-40 mg) is recommended for individuals with clinical ASCVD or multiple high-risk factors to achieve >= 50% LDL-C reduction.", 109),
        ("guideline_derm_eczema_001", "Dermatology_Atopic_Dermatitis_Consensus.pdf", 1,
         "Atopic Dermatitis & Eczema Management: The cornerstone of maintenance therapy is generous, regular application of emollient moisturizers to restore epidermal barrier function. Acute inflammatory exacerbations should be managed with topical corticosteroids or topical calcineurin inhibitors (tacrolimus or pimecrolimus) applied twice daily until lesion resolution.", 110),
    ]

    for chunk_id, source, page, text, seed in guidelines_data:
        vec = make_vector(seed)
        chunks.append((
            make_uuid(),
            None,
            None,
            None,
            chunk_id,
            source,
            page,
            text,
            json.dumps(vec),
            "guideline",
            0,
            None,
            now.strftime("%Y-%m-%d %H:%M:%S")
        ))

    # 2. Patient-scoped Clinical Document Chunks (attached to Mariam Hassan DEMO-001 and Ahmed Mansour DEMO-002)
    patient_chunks_data = [
        (PATIENTS["DEMO-001"][0], "DEMO-001_Mariam_Hassan_Cardiology_Summary.pdf", 1,
         "Mariam Hassan (DOB: 1988-04-12, MRN: DEMO-001). Clinical assessment confirms well-controlled essential hypertension on lisinopril 10 mg daily. Recent resting blood pressure 124/82 mmHg, heart rate 72 bpm regular. Fasting lipid panel demonstrates total cholesterol 195 mg/dL, LDL-C 102 mg/dL, HDL-C 54 mg/dL, triglycerides 145 mg/dL. Renal function intact with eGFR > 90 mL/min/1.73m2. No peripheral edema.", 201),
        (PATIENTS["DEMO-001"][0], "DEMO-001_Mariam_Hassan_Cardiology_Summary.pdf", 2,
         "Assessment & Plan for Mariam Hassan: Continue lisinopril 10 mg once daily. Emphasize dietary sodium restriction (< 2,000 mg/day). Follow-up lipid monitoring scheduled in 6 months. Instructed to log blood pressure twice weekly in CareOS portal.", 202),
        (PATIENTS["DEMO-002"][0], "DEMO-002_Ahmed_Mansour_Endocrinology_Intake.pdf", 1,
         "Ahmed Mansour (DOB: 1975-08-23, MRN: DEMO-002). 51-year-old male presenting for routine type 2 diabetes mellitus management. Current medications include metformin 1000 mg twice daily and empagliflozin 10 mg once daily. Latest laboratory findings: HbA1c 6.9%, fasting blood glucose 118 mg/dL, serum creatinine 0.95 mg/dL, urine albumin-to-creatinine ratio (uACR) 18 mg/g (normal).", 203),
        (PATIENTS["DEMO-003"][0], "DEMO-003_Sara_Ibrahim_Aesthetics_Consult.pdf", 1,
         "Sara Ibrahim (DOB: 1993-11-05, MRN: DEMO-003). Aesthetic dermatology consult for post-acne scarring. Evaluated for fractional non-ablative laser treatment. Fitzpatrick skin type III. Pretreatment test patch completed with no PIH or adverse thermal response. Scheduled for series of 4 sessions.", 204),
    ]

    for pat_id, source, page, text, seed in patient_chunks_data:
        vec = make_vector(seed)
        chunk_id = f"patient_{pat_id[:8]}_{seed}"
        chunks.append((
            make_uuid(),
            ORG_ID,
            pat_id,
            None,
            chunk_id,
            source,
            page,
            text,
            json.dumps(vec),
            "patient_document",
            0,
            None,
            now.strftime("%Y-%m-%d %H:%M:%S")
        ))

    cur.executemany("INSERT INTO document_chunks (id, organization_id, patient_id, document_id, chunk_id, source, page, text, embedding, source_type, ocr_applied, ocr_engine, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", chunks)
    print(f"  Inserted {len(chunks)} clinical RAG document chunks ({len(guidelines_data)} guidelines + {len(patient_chunks_data)} patient docs).")

    con.commit()
    con.close()
    print("\n[SUCCESS] Comprehensive CareOS database seed completed successfully!")

if __name__ == "__main__":
    run_seed()

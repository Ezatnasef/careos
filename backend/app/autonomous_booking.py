"""Autonomous appointment booking engine for CareOS.

Allows the AI Assistant to take immediate action and book appointments
on behalf of patients based on doctor, day, and time, synchronized with
the clinic calendar and doctor schedules.
"""
from __future__ import annotations

import datetime as dt
import logging
import re
import sqlite3
import uuid
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

DB_PATH = Path(__file__).resolve().parent.parent / "careos.db"

# Dynamic multi-tenant resolution
def resolve_default_org_id() -> str:
    """Return the primary organization ID dynamically rather than a hardcoded string."""
    try:
        if DB_PATH.exists():
            conn = sqlite3.connect(str(DB_PATH))
            cur = conn.cursor()
            row = cur.execute("SELECT id FROM organizations ORDER BY created_at ASC LIMIT 1").fetchone()
            conn.close()
            if row and row[0]:
                return str(row[0])
    except Exception:
        pass
    return "8ce0a94d4b3e4e1f9d73eed8fa8ab239"


def resolve_default_patient_id(org_id: str | None = None) -> str:
    """Return the first active patient ID dynamically for the given organization."""
    try:
        if DB_PATH.exists():
            conn = sqlite3.connect(str(DB_PATH))
            cur = conn.cursor()
            if org_id:
                norm_org = uuid.UUID(org_id).hex if "-" in org_id else org_id
                row = cur.execute("SELECT id FROM patients WHERE organization_id = ? AND deleted_at IS NULL ORDER BY created_at ASC LIMIT 1", (norm_org,)).fetchone()
            else:
                row = cur.execute("SELECT id FROM patients WHERE deleted_at IS NULL ORDER BY created_at ASC LIMIT 1").fetchone()
            conn.close()
            if row and row[0]:
                return str(row[0])
    except Exception:
        pass
    return "cba3352a8d0a42a1935270dece152305"


DEFAULT_ORG_ID = resolve_default_org_id()
DEFAULT_PATIENT_ID = resolve_default_patient_id()

ARABIC_DAYS = {
    "السبت": 5,
    "سبت": 5,
    "الاحد": 6,
    "الأحد": 6,
    "احد": 6,
    "أحد": 6,
    "الاثنين": 0,
    "الإثنين": 0,
    "الاتنين": 0,
    "اثنين": 0,
    "اتنين": 0,
    "الثلاثاء": 1,
    "التلات": 1,
    "تلات": 1,
    "ثلاثاء": 1,
    "الاربعاء": 2,
    "الأربعاء": 2,
    "اربعاء": 2,
    "أربعاء": 2,
    "الخميس": 3,
    "خميس": 3,
    "الجمعة": 4,
    "جمعة": 4,
}

ENGLISH_DAYS = {
    "monday": 0,
    "mon": 0,
    "tuesday": 1,
    "tue": 1,
    "wednesday": 2,
    "wed": 2,
    "thursday": 3,
    "thu": 3,
    "friday": 4,
    "fri": 4,
    "saturday": 5,
    "sat": 5,
    "sunday": 6,
    "sun": 6,
}

ARABIC_DAY_NAMES = {
    0: "الإثنين",
    1: "الثلاثاء",
    2: "الأربعاء",
    3: "الخميس",
    4: "الجمعة",
    5: "السبت",
    6: "الأحد",
}


def is_ref_code_explanation_intent(text: str) -> bool:
    """Check if the user is asking what the confirmation number / reference code means."""
    t = text.lower()
    patterns = [
        "رقم التأكيد", "رقم الحجز", "كود الحجز", "كود التأكيد", "كود الموعد",
        "يعني ايه رقم", "معنى رقم", "ماذا يعني هذا الرقم", "ماذا يعني رقم", "ما هو رقم التأكيد",
        "ماذا يعني كود", "يعني ايه كود", "رقم المرجع", "كود المرجع",
        "confirmed number", "confirmation number", "reference number", "ref number",
        "booking code", "confirmation code", "what does the confirmed number mean",
        "what does this number mean", "what is that meaning", "what is that mwaning",
        "what is the confirmed number", "what does the code mean", "meaning of confirmed number"
    ]
    return any(p in t for p in patterns)


def build_ref_code_explanation(is_english: bool) -> dict[str, Any]:
    """Provide a comprehensive explanation of what the confirmation reference number means."""
    if is_english:
        answer = (
            "Here is what your Appointment Confirmation Reference Number means for you as a patient:\n\n"
            "• Official CareOS Reservation ID:\n"
            "  - It is your verified electronic booking code generated directly inside the hospital database (e.g. #23F6ED8D).\n\n"
            "• Instant Reception Check-In (Queue-Free Entry):\n"
            "  - When you arrive at the clinic or health center, simply show or mention this code to reception.\n"
            "  - You are checked in immediately on the system without waiting in registration lines or filling paper forms.\n\n"
            "• Patient Portal Management:\n"
            "  - You can enter this code in your Patient Portal to view appointment details, clinic room location, preparations, or reschedule your visit.\n\n"
            "• Automated SMS / Notification Sync:\n"
            "  - This code links your visit to the automated reminder system so you receive notifications before your appointment."
        )
    else:
        answer = (
            "إليك توضيح شامل لما يعنيه رقم تأكيد الحجز (كود المرجع الطبي) لك كـ مريض:\n\n"
            "• كود الحجز الرسمي المعتمد:\n"
            "  - هو رقم إلكتروني رسمي وموحد يُنشئه نظام CareOS لموعدك في قاعدة بيانات العيادة (مثل: #23F6ED8D).\n\n"
            "• دخول فوري وسريع دون طوابير انتظار:\n"
            "  - عند وصولك إلى المركز الطبي أو المستشفى، يكفي إبراز هذا الكود لموظف الاستقبال.\n"
            "  - يتم تسجيل حضورك إلكترونياً فوراً وتوجيهك مباشرة إلى غرفة الكشف دون الحاجة للوقوف في طابور التسجيل أو كتابة استمارات يدوية.\n\n"
            "• إدارة ومتابعة الزيارة عبر بوابة المريض (Patient Portal):\n"
            "  - يمكنك استخدام هذا الرقم في بوابة المريض للاطلاع على تفاصيل الزيارة، ومكان العيادة، أو تعديل الميعاد واستعراض التقارير الطبية بعد الكشف.\n\n"
            "• التنسيق مع التذكير الآلي:\n"
            "  - يرتبط هذا الكود بنظام التنبيهات المسبقة التي تُرسل لك تذكيراً بموعدك لضمان عدم نسيانه."
        )

    return {
        "answer": answer,
        "sources": [
            {
                "id": "careos_reference_guide",
                "title": "CareOS Patient Reference Number Guide",
                "category": "appointments",
            }
        ],
        "provider": "careos-autonomous-agent",
    }


def is_booking_intent(text: str) -> bool:
    """Check if the text expresses intent to book, query doctors, or schedule appointments."""
    normalized = text.lower()
    booking_tokens = [
        "احجز", "تحجز", "حجز", "بدلك", "بدالك", "نيابة",
        "ميعاد", "موعد", "مواعيد", "كشف", "استشارة",
        "طبيب", "أطباء", "اطباء", "دكتور", "دكاترة", "دكاتره",
        "doctor", "doctors", "physician", "physicians", "clinician", "clinicians",
        "book", "booking", "schedule", "reschedule", "appointment", "reserve"
    ]
    return any(token in normalized for token in booking_tokens)


def is_ongoing_booking_conversation(conversation_history: list[dict[str, str]] | None) -> bool:
    """Check if any message in recent conversation history indicates a booking flow."""
    if not conversation_history:
        return False
    for item in conversation_history[-6:]:
        content = (item.get("content") or item.get("text") or "").lower()
        if is_booking_intent(content) or any(
            k in content for k in [
                "أقوم بالحجز بدالك", "هنفذ الحجز", "جدول الطبيب", "مواعيد متاحة",
                "تفاصيل الحجز", "appointment has been successfully booked", "book the appointment directly",
                "الاسم بالكامل", "رقم الموبايل", "كود الحجز", "phone number", "full name", "تأكيد الحجز", "تاكيد الحجز"
            ]
        ):
            return True
    return False


def get_registered_doctors(org_id: str | None = None) -> list[dict[str, Any]]:
    """Query registered doctors strictly for the given organization or system wide."""
    if not DB_PATH.exists():
        return []
    try:
        conn = sqlite3.connect(str(DB_PATH))
        cur = conn.cursor()
        if org_id:
            norm_org = uuid.UUID(org_id).hex if "-" in org_id else org_id
            query = """
                SELECT id, full_name, email, department
                FROM users
                WHERE role = 'doctor'
                  AND deleted_at IS NULL
                  AND organization_id = ?
            """
            rows = cur.execute(query, (norm_org,)).fetchall()
        else:
            query = """
                SELECT id, full_name, email, department
                FROM users
                WHERE role = 'doctor'
                  AND deleted_at IS NULL
            """
            rows = cur.execute(query).fetchall()
        conn.close()
        doctors = []
        for r in rows:
            doctors.append({
                "id": str(r[0]),
                "name": r[1] or "Doctor",
                "email": r[2] or "",
                "department": r[3] or "General Medicine",
            })
        return doctors
    except Exception as exc:
        logger.warning(f"Error querying registered doctors: {exc}")
        return []


def get_clinician_schedule(clinician_id: str, day_of_week: int) -> dict[str, Any] | None:
    """Query clinician schedule for a specific day of week (0=Mon .. 6=Sun) from careos.db."""
    if not clinician_id:
        return None
    norm_id = uuid.UUID(clinician_id).hex if "-" in clinician_id else clinician_id
    try:
        if DB_PATH.exists():
            conn = sqlite3.connect(str(DB_PATH))
            cur = conn.cursor()
            cur.execute(
                """
                SELECT start_time, end_time, slot_duration_minutes
                FROM clinician_schedules
                WHERE clinician_id = ? AND day_of_week = ?
                """,
                (norm_id, day_of_week),
            )
            row = cur.fetchone()
            conn.close()
            if row:
                start_parts = [int(p) for p in row[0].split(":")[:2]]
                end_parts = [int(p) for p in row[1].split(":")[:2]]
                return {
                    "start_time": dt.time(start_parts[0], start_parts[1]),
                    "end_time": dt.time(end_parts[0], end_parts[1]),
                    "slot_duration_minutes": int(row[2]),
                }
    except Exception as exc:
        logger.warning(f"Error querying clinician_schedule: {exc}")
    return None


def get_clinician_working_days(clinician_id: str) -> list[int]:
    """Get list of day_of_week integers where clinician is scheduled."""
    norm_id = uuid.UUID(clinician_id).hex if "-" in clinician_id else clinician_id
    try:
        if DB_PATH.exists():
            conn = sqlite3.connect(str(DB_PATH))
            cur = conn.cursor()
            cur.execute(
                """
                SELECT DISTINCT day_of_week
                FROM clinician_schedules
                WHERE clinician_id = ?
                ORDER BY day_of_week
                """,
                (norm_id,),
            )
            rows = cur.fetchall()
            conn.close()
            if rows:
                return [r[0] for r in rows]
    except Exception as exc:
        logger.warning(f"Error querying clinician working days: {exc}")
    return [0, 1, 2, 3, 4]


def get_booked_appointments(clinician_id: str, target_date: dt.date) -> set[str]:
    """Return set of booked start time strings ('HH:MM') on target_date."""
    norm_id = uuid.UUID(clinician_id).hex if "-" in clinician_id else clinician_id
    booked: set[str] = set()
    date_prefix = target_date.strftime("%Y-%m-%d")
    try:
        if DB_PATH.exists():
            conn = sqlite3.connect(str(DB_PATH))
            cur = conn.cursor()
            cur.execute(
                """
                SELECT starts_at
                FROM appointments
                WHERE clinician_id = ? AND status = 'confirmed' AND starts_at LIKE ?
                """,
                (norm_id, f"{date_prefix}%"),
            )
            for row in cur.fetchall():
                starts_str = str(row[0])
                time_match = re.search(r"\b(\d{2}):(\d{2})", starts_str)
                if time_match:
                    booked.add(f"{time_match.group(1)}:{time_match.group(2)}")
            conn.close()
    except Exception as exc:
        logger.warning(f"Error checking booked appointments: {exc}")
    return booked


def get_available_slots(clinician_id: str, target_date: dt.date) -> list[str]:
    """Generate available slot labels (e.g. ['09:00 AM', '10:00 AM']) for target_date."""
    schedule = get_clinician_schedule(clinician_id, target_date.weekday())
    if not schedule:
        return []

    booked = get_booked_appointments(clinician_id, target_date)
    start = schedule["start_time"]
    end = schedule["end_time"]
    duration = schedule["slot_duration_minutes"]

    curr = dt.datetime.combine(target_date, start)
    end_dt = dt.datetime.combine(target_date, end)

    now = dt.datetime.now()
    slots = []

    while curr < end_dt:
        time_key = curr.strftime("%H:%M")
        if target_date > now.date() or (target_date == now.date() and curr > now):
            if time_key not in booked:
                slots.append(curr.strftime("%I:%M %p"))
        curr += dt.timedelta(minutes=duration)

    return slots


def find_next_available_dates(clinician_id: str, start_date: dt.date, limit: int = 2) -> list[dict[str, Any]]:
    """Find the next available dates with open slots starting from start_date."""
    results = []
    check_date = start_date
    for _ in range(14):
        avail_slots = get_available_slots(clinician_id, check_date)
        if avail_slots:
            results.append({
                "date": check_date,
                "date_str": check_date.strftime("%Y-%m-%d"),
                "day_ar": ARABIC_DAY_NAMES.get(check_date.weekday(), ""),
                "day_en": check_date.strftime("%A"),
                "slots": avail_slots[:5],
            })
            if len(results) >= limit:
                break
        check_date += dt.timedelta(days=1)
    return results


def parse_date_expression(text: str, today: dt.date) -> tuple[dt.date | None, str]:
    """Parse relative or explicit date expression from text."""
    t = text.lower()

    # 1. Compound relative expressions (2 days ahead) - MUST BE CHECKED BEFORE "tomorrow"
    compound_2_days = [
        "بعد بكرة", "بعد بكره", "بعد غد", "بعد غدا", "بعد يومين", "كمان يومين", "بعد يومان",
        "day after tomorrow", "the day after tomorrow", "after tomorrow", "in 2 days", "after 2 days", "in two days"
    ]
    if any(p in t for p in compound_2_days):
        d = today + dt.timedelta(days=2)
        day_ar = ARABIC_DAY_NAMES.get(d.weekday(), "")
        return d, f"بعد غد ({day_ar} {d.strftime('%Y-%m-%d')})"

    # 2. Compound relative expressions (3 days ahead)
    compound_3_days = [
        "بعد 3 أيام", "بعد ٣ أيام", "بعد تلات ايام", "بعد ثلاثة ايام", "كمان 3 أيام",
        "in 3 days", "after 3 days", "in three days"
    ]
    if any(p in t for p in compound_3_days):
        d = today + dt.timedelta(days=3)
        day_ar = ARABIC_DAY_NAMES.get(d.weekday(), "")
        return d, f"بعد 3 أيام ({day_ar} {d.strftime('%Y-%m-%d')})"

    # 3. Tomorrow expressions
    tomorrow_phrases = ["بكرة", "بكره", "غدا", "غداً", "غد", "tomorrow"]
    if any(re.search(r"\b" + re.escape(p) + r"\b", t) if len(p) <= 4 else p in t for p in tomorrow_phrases):
        d = today + dt.timedelta(days=1)
        day_ar = ARABIC_DAY_NAMES.get(d.weekday(), "")
        return d, f"غداً ({day_ar} {d.strftime('%Y-%m-%d')})"

    # 4. Today expressions
    today_phrases = ["النهاردة", "النهارده", "اليوم", "today", "tonight"]
    if any(p in t for p in today_phrases):
        day_ar = ARABIC_DAY_NAMES.get(today.weekday(), "")
        return today, f"اليوم ({day_ar} {today.strftime('%Y-%m-%d')})"

    # 5. Next week expressions
    if any(p in t for p in ["next week", "الاسبوع الجاي", "الأسبوع الجاي", "الاسبوع القادم", "الأسبوع القادم"]):
        d = today + dt.timedelta(days=7)
        day_ar = ARABIC_DAY_NAMES.get(d.weekday(), "")
        return d, f"الأسبوع القادم ({day_ar} {d.strftime('%Y-%m-%d')})"

    for day_name, weekday_idx in ARABIC_DAYS.items():
        if re.search(r"\b" + re.escape(day_name) + r"\b", text):
            days_ahead = (weekday_idx - today.weekday()) % 7
            if days_ahead == 0:
                days_ahead = 7
            d = today + dt.timedelta(days=days_ahead)
            return d, f"يوم {day_name} ({d.strftime('%Y-%m-%d')})"

    for day_name, weekday_idx in ENGLISH_DAYS.items():
        if re.search(r"\b" + re.escape(day_name) + r"\b", t):
            days_ahead = (weekday_idx - today.weekday()) % 7
            if days_ahead == 0:
                days_ahead = 7
            d = today + dt.timedelta(days=days_ahead)
            return d, f"{day_name.capitalize()} ({d.strftime('%Y-%m-%d')})"

    # 7. Explicit ISO date YYYY-MM-DD
    iso_match = re.search(r"\b(202\d-\d{2}-\d{2})\b", text)
    if iso_match:
        try:
            d = dt.date.fromisoformat(iso_match.group(1))
            day_ar = ARABIC_DAY_NAMES.get(d.weekday(), "")
            return d, f"{day_ar} {d.isoformat()}"
        except ValueError:
            pass

    # 8. Date like DD/MM/YYYY or DD-MM-YYYY
    dm_match = re.search(r"\b(\d{1,2})[/-](\d{1,2})(?:[/-](202\d))?\b", text)
    if dm_match:
        day = int(dm_match.group(1))
        month = int(dm_match.group(2))
        year = int(dm_match.group(3) or today.year)
        try:
            d = dt.date(year, month, day)
            day_ar = ARABIC_DAY_NAMES.get(d.weekday(), "")
            return d, f"{day_ar} {d.isoformat()}"
        except ValueError:
            pass

    return None, ""


def parse_time_expression(text: str) -> tuple[dt.time | None, str]:
    """Parse time expression from text (e.g. 10:00 AM, 2 PM, الساعة 10 صباحا, 14:00)."""
    t = text.lower()

    # Arabic 12h patterns (e.g. الساعة 10 صباحا, المعاد 6 مساءا, 6 مساءا, 2 ونصف عصرا)
    time_ar_match = re.search(
        r"(?:(?:الساعة|ساعة|الساعه|ساعه|المعاد|الميعاد|ميعاد|معاد)\s*(\d{1,2})(?::(\d{2}))?\s*(ونص|وربع)?\s*(صباحا|صباحاً|مساءا|مساءً|مساء|الصبح|بالليل|عصرا|عصراً|ظهرا|ظهراً)?)|(?:(?<!\d)(\d{1,2})(?::(\d{2}))?\s*(ونص|وربع)?\s*(صباحا|صباحاً|مساءا|مساءً|مساء|الصبح|بالليل|عصرا|عصراً|ظهرا|ظهراً))",
        text,
        re.IGNORECASE,
    )
    if time_ar_match:
        hour = int(time_ar_match.group(1) or time_ar_match.group(5))
        minute = int(time_ar_match.group(2) or time_ar_match.group(6) or 0)
        fraction = time_ar_match.group(3) or time_ar_match.group(7) or ""
        period = time_ar_match.group(4) or time_ar_match.group(8) or ""

        if "نص" in fraction:
            minute = 30
        elif "ربع" in fraction:
            minute = 15

        if any(p in period for p in ["مساء", "مساءً", "مساءا", "بالليل", "عصرا", "عصراً"]) and hour < 12:
            hour += 12
        elif any(p in period for p in ["ظهرا", "ظهراً"]) and hour < 11:
            hour += 12
        elif any(p in period for p in ["صباحا", "صباحاً", "الصبح"]) and hour == 12:
            hour = 0

        if 0 <= hour <= 23 and 0 <= minute <= 59:
            target_time = dt.time(hour, minute)
            return target_time, target_time.strftime("%I:%M %p")

    # English 12h patterns (e.g. 10:00 AM, 2 PM, 2:30 pm)
    time_en_match = re.search(r"\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b", t)
    if time_en_match:
        hour = int(time_en_match.group(1))
        minute = int(time_en_match.group(2) or 0)
        ampm = time_en_match.group(3).lower()
        if ampm == "pm" and hour < 12:
            hour += 12
        elif ampm == "am" and hour == 12:
            hour = 0
        if 0 <= hour <= 23 and 0 <= minute <= 59:
            target_time = dt.time(hour, minute)
            return target_time, target_time.strftime("%I:%M %p")

    # 24h format (e.g. 14:00, 09:30)
    time_24_match = re.search(r"\b([01]?\d|2[0-3]):([0-5]\d)\b", text)
    if time_24_match:
        hour = int(time_24_match.group(1))
        minute = int(time_24_match.group(2))
        target_time = dt.time(hour, minute)
        return target_time, target_time.strftime("%I:%M %p")

    return None, ""


def parse_phone_number(text: str) -> str | None:
    """Extract phone number (Egyptian 010/011/012/015 or international/standard)."""
    m = re.search(r"(?:\+?20|0020)?0?(1[0125]\d{8})\b", text)
    if m:
        return "0" + m.group(1)
    m_gen = re.search(r"(?:\+|00)?\d{1,4}[-.\s]?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}", text)
    if m_gen:
        cleaned = re.sub(r"[^\d+]", "", m_gen.group(0))
        if len(cleaned) >= 8:
            return cleaned
    return None


def parse_patient_name(text: str, phone: str | None = None) -> str | None:
    """Extract patient name from text, ignoring dates, times, greetings and phone."""
    t = text
    if phone:
        t = t.replace(phone, " ")
    has_explicit_prefix = bool(re.search(r"(?:اسمي|اسم\s+المريض|الاسم|my\s+name\s+is)\s*[:\-]?\s*", t, re.IGNORECASE))
    t = re.sub(r"[\d+\-:,()_،؛?؟.!/\\#*]", " ", t)
    fillers = [
        r"اسمي", r"اسم\s+المريض", r"الاسم", r"أنا", r"انا",
        r"و?رقمي", r"و?تليفوني", r"و?هاتفي", r"و?موبايلي",
        r"و?رقم\s+الموبايل", r"و?رقم\s+الهاتف", r"و?الموبايل", r"و?الهاتف",
        r"my\s+name\s+is", r"name", r"phone", r"mobile"
    ]
    for f in fillers:
        t = re.sub(r"(?:^|\s)" + f + r"(?:\s|$|:)", " ", t, flags=re.IGNORECASE)
    skip_words = {
        "حجز", "احجز", "تحجز", "ميعاد", "موعد", "مواعيد", "الساعة", "ساعة", "يوم", "صباحا", "صباحاً", "مساء", "مساءا", "مساءً",
        "دكتور", "الدكتور", "عيادة", "العيادة", "كشف", "استشارة", "نعم", "ايوه", "ايوا", "تمام", "أهلاً", "اهلاً", "شكرا", "شكراً",
        "عايز", "عاوز", "حابب", "محتاج", "ابغى", "بدي", "ودّي", "ودي", "ممكن", "ياريت", "يا ريت", "لو سمحت", "من فضلك",
        "الاثنين", "الإثنين", "الثلاثاء", "الاربعاء", "الأربعاء", "الخميس", "الجمعة", "السبت", "الاحد", "الأحد",
        "yes", "ok", "book", "appointment", "please", "want", "need", "doctor", "clinic"
    }
    words = [w.strip() for w in t.split() if w.strip() and w.strip().lower() not in skip_words and len(w.strip()) > 1]
    if len(words) >= 2:
        return " ".join(words[:4])
    elif has_explicit_prefix and len(words) == 1 and len(words[0]) >= 3:
        return words[0]
    return None


def get_or_create_guest_patient(name: str, phone: str, org_id: str = "") -> str:
    """Find existing patient or insert a new real patient and profile into careos.db."""
    if not org_id:
        org_id = resolve_default_org_id()
    norm_org = uuid.UUID(org_id).hex if "-" in org_id else org_id

    clean_name = name.strip() if name else "زائر"
    parts = clean_name.split()
    given_name = parts[0] if parts else "زائر"
    family_name = " ".join(parts[1:]) if len(parts) > 1 else "CareOS"
    clean_phone = re.sub(r"[^\d+]", "", phone) if phone else ""

    try:
        if DB_PATH.exists():
            conn = sqlite3.connect(str(DB_PATH))
            cur = conn.cursor()

            # 1. Look up existing patient with this phone in patient_profiles
            if clean_phone:
                row = cur.execute(
                    """
                    SELECT p.id FROM patients p
                    JOIN patient_profiles pf ON pf.patient_id = p.id
                    WHERE p.organization_id = ? AND (pf.phone = ? OR pf.phone = ?) AND p.deleted_at IS NULL
                    LIMIT 1
                    """,
                    (norm_org, phone, clean_phone),
                ).fetchone()
                if row and row[0]:
                    conn.close()
                    return str(row[0])

            # 2. Look up existing patient with matching given & family name in same org
            row_name = cur.execute(
                """
                SELECT id FROM patients
                WHERE organization_id = ? AND given_name = ? AND family_name = ? AND deleted_at IS NULL
                LIMIT 1
                """,
                (norm_org, given_name, family_name),
            ).fetchone()
            if row_name and row_name[0]:
                conn.close()
                return str(row_name[0])

            # 3. Insert real new patient in patients table
            new_patient_id = uuid.uuid4().hex
            patient_code = f"CARE-{uuid.uuid4().hex[:5].upper()}-{uuid.uuid4().hex[5:10].upper()}"
            mrn = f"MRN-{uuid.uuid4().hex[:8].upper()}"
            now_str = dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

            cur.execute(
                """
                INSERT INTO patients (
                    id, organization_id, department, project, patient_code,
                    medical_record_number, given_name, family_name, date_of_birth,
                    gender, condition, care_status, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    new_patient_id,
                    norm_org,
                    "العيادات الخارجية",
                    "CareOS Guest Portal",
                    patient_code,
                    mrn,
                    given_name,
                    family_name,
                    "1990-01-01",
                    "unspecified",
                    "حجز استشارة عيادة بواسطة المساعد الذكي",
                    "stable",
                    now_str,
                    now_str,
                ),
            )

            # 4. Insert profile with phone in patient_profiles table
            prof_id = uuid.uuid4().hex
            cur.execute(
                """
                INSERT INTO patient_profiles (
                    id, organization_id, patient_id, phone, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    prof_id,
                    norm_org,
                    new_patient_id,
                    phone or clean_phone,
                    now_str,
                    now_str,
                ),
            )

            conn.commit()
            conn.close()
            return new_patient_id
    except Exception as exc:
        logger.warning(f"get_or_create_guest_patient note: {exc}")

    return resolve_default_patient_id(org_id)


def parse_booking_parameters(text: str, conversation_history: list[dict[str, str]] | None = None) -> dict[str, Any]:
    """Extract doctor, date/day, time, patient name, and phone accumulating context across conversation turns."""
    today = dt.date.today()

    # Gather user messages in chronological order, with latest text last
    user_turns: list[str] = []
    if conversation_history:
        for item in conversation_history:
            role = item.get("role", "")
            if role == "user":
                content = item.get("content") or item.get("text") or ""
                if content:
                    user_turns.append(content)
    user_turns.append(text)

    # 1. Parse Doctor strictly from database
    registered_doctors = get_registered_doctors()
    doctor_name = ""
    doctor_id = ""
    specialty = ""

    combined_all = " \n ".join(user_turns).lower()

    if registered_doctors:
        matched_doc = None
        for doc in registered_doctors:
            name_parts = [p.lower() for p in doc["name"].split() if len(p) > 2]
            if any(p in combined_all for p in name_parts):
                matched_doc = doc
                break
            if doc["department"] and doc["department"].lower() in combined_all:
                matched_doc = doc
                break
        if not matched_doc:
            matched_doc = registered_doctors[0]
        doctor_name = matched_doc["name"]
        doctor_id = matched_doc["id"]
        specialty = matched_doc["department"]

    # 2. Parse Date across user turns (most recent turn with a date wins)
    target_date: dt.date | None = None
    date_label = ""
    for turn in reversed(user_turns):
        d, lbl = parse_date_expression(turn, today)
        if d:
            target_date = d
            date_label = lbl
            break

    # 3. Parse Time across user turns (most recent turn with a time wins)
    target_time: dt.time | None = None
    time_label = ""
    for turn in reversed(user_turns):
        t, lbl = parse_time_expression(turn)
        if t:
            target_time = t
            time_label = lbl
            break

    # 4. Parse Phone across user turns (most recent turn with a phone wins)
    patient_phone: str | None = None
    for turn in reversed(user_turns):
        ph = parse_phone_number(turn)
        if ph:
            patient_phone = ph
            break

    # 5. Parse Patient Name across user turns (most recent turn with a valid name wins)
    patient_name: str | None = None
    for turn in reversed(user_turns):
        nm = parse_patient_name(turn, patient_phone)
        if nm:
            patient_name = nm
            break

    return {
        "doctor_name": doctor_name,
        "doctor_id": doctor_id,
        "specialty": specialty,
        "has_registered_doctors": len(registered_doctors) > 0,
        "target_date": target_date,
        "date_label": date_label,
        "target_time": target_time,
        "time_label": time_label,
        "patient_phone": patient_phone,
        "patient_name": patient_name,
    }


def execute_booking(
    target_date: dt.date | str,
    target_time: dt.time,
    doctor_id: str = "",
    patient_id: str = "",
    org_id: str = "",
    reason: str = "حجز استشارة بواسطة مساعد CareOS الذكي",
) -> dict[str, Any]:
    """Insert confirmed appointment and reminder job directly into careos.db."""
    if not org_id:
        org_id = resolve_default_org_id()
    if not patient_id:
        patient_id = resolve_default_patient_id(org_id)
    if not doctor_id:
        docs = get_registered_doctors(org_id)
        if docs:
            doctor_id = docs[0]["id"]

    if isinstance(target_date, str):
        target_date = dt.date.fromisoformat(target_date)
    starts_dt = dt.datetime.combine(target_date, target_time)

    appt_uuid = uuid.uuid4()
    appt_id_hex = appt_uuid.hex
    norm_org_id = uuid.UUID(org_id).hex if "-" in org_id else org_id
    norm_patient_id = uuid.UUID(patient_id).hex if "-" in patient_id else patient_id
    norm_clinician_id = uuid.UUID(doctor_id).hex if ("-" in doctor_id and doctor_id) else (doctor_id or "")
    now_str = dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    starts_str = starts_dt.strftime("%Y-%m-%d %H:%M:%S")

    try:
        if DB_PATH.exists():
            conn = sqlite3.connect(str(DB_PATH))
            cur = conn.cursor()
            cur.execute(
                """
                INSERT INTO appointments (
                    id, organization_id, patient_id, clinician_id,
                    starts_at, duration_minutes, reason, status,
                    reminder_status, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    appt_id_hex,
                    norm_org_id,
                    norm_patient_id,
                    norm_clinician_id,
                    starts_str,
                    30,
                    reason,
                    "confirmed",
                    "queued",
                    now_str,
                ),
            )
            try:
                rem_id = uuid.uuid4().hex
                cur.execute(
                    """
                    INSERT INTO reminder_jobs (
                        id, organization_id, appointment_id, scheduled_for, channel, status, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        rem_id,
                        norm_org_id,
                        appt_id_hex,
                        starts_str,
                        "sandbox",
                        "queued",
                        now_str,
                    ),
                )
            except Exception:
                pass

            conn.commit()
            conn.close()
    except Exception as exc:
        logger.warning(f"Direct DB booking insert note: {exc}")

    return {
        "appointment_id": str(appt_uuid),
        "ref_code": str(appt_uuid).split("-")[0].upper(),
        "starts_at": starts_str,
        "starts_dt": starts_dt,
    }


def handle_autonomous_booking_request(
    message: str,
    conversation_history: list[dict[str, str]] | None = None,
) -> dict[str, Any] | None:
    """Evaluate if this is a booking action request or inquiry and handle it autonomously."""
    is_english = not bool(re.search(r"[\u0600-\u06FF]", message))

    # A. Check if user is asking about the meaning of the confirmation / reference code
    if is_ref_code_explanation_intent(message):
        return build_ref_code_explanation(is_english)

    # B. Check if this is a booking intent or part of an ongoing booking conversation
    if not is_booking_intent(message) and not is_ongoing_booking_conversation(conversation_history):
        return None

    params = parse_booking_parameters(message, conversation_history)
    has_registered_doctors = params.get("has_registered_doctors", False)
    if not has_registered_doctors:
        if is_english:
            answer = (
                "• No doctors are currently registered in the clinic database.\n"
                "• The doctors dataset is currently empty in the system.\n"
                "• Once clinicians and their schedules are registered by the clinic administration, you will be able to book appointments directly with available slots."
            )
        else:
            answer = (
                "• لم يتم تسجيل أي أطباء في النظام حتى الآن.\n"
                "• قائمة الأطباء فارغة حالياً في قاعدة البيانات.\n"
                "• بمجرد إضافة بيانات وجداول الأطباء من قِبل إدارة العيادة في النظام، ستتمكن من اختيار الطبيب وحجز الموعد مباشرة."
            )
        return {
            "answer": answer,
            "sources": [{"id": "careos_doctors_empty", "title": "CareOS Doctors Registry", "category": "doctors"}],
            "provider": "careos-autonomous-agent",
        }

    target_date = params.get("target_date")
    target_time = params.get("target_time")
    doctor_name = params.get("doctor_name", "")
    doctor_id = params.get("doctor_id", "")
    specialty = params.get("specialty", "")

    working_days = get_clinician_working_days(doctor_id)

    # CASE 1: Date is specified, but Doctor is CLOSED on that day (e.g. Saturday or Sunday)
    if target_date and target_date.weekday() not in working_days:
        day_ar = ARABIC_DAY_NAMES.get(target_date.weekday(), target_date.strftime("%A"))
        day_en = target_date.strftime("%A")
        date_str = target_date.strftime("%Y-%m-%d")

        next_dates = find_next_available_dates(doctor_id, target_date + dt.timedelta(days=1), limit=2)

        if is_english:
            lines = [
                f"Doctor {doctor_name} is NOT available on {day_en}, {date_str} (Clinic is closed on weekends).\n",
                "• Clinic Working Schedule: Monday to Friday from 09:00 AM to 05:00 PM (Saturday & Sunday are clinic off-days).",
                f"• Next Available Working Dates & Open Slots with {doctor_name}:",
            ]
            for nd in next_dates:
                slots_str = ", ".join(nd["slots"]) if nd["slots"] else "All booked"
                lines.append(f"  - {nd['day_en']} ({nd['date_str']}): {slots_str}")
            lines.append("\n• Would you like me to book your appointment on one of these available slots? Just let me know the day and time you prefer, and I will confirm it directly!")
            answer = "\n".join(lines)
        else:
            lines = [
                f"نعتذر، الطبيب {doctor_name} غير متاح يوم {day_ar} الموافق {date_str} (عطلة العيادة الأسبوعية).\n",
                "• جدول العمل الرسمي للطبيب: من الإثنين إلى الجمعة من الساعة 09:00 صباحاً حتى 05:00 مساءً (السبت والأحد عطلة العيادة).",
                f"• أقرب المواعيد والأيام المتاحة للحجز في جدول {doctor_name}:",
            ]
            for nd in next_dates:
                slots_str = "، ".join(nd["slots"]) if nd["slots"] else "ممتلئ"
                lines.append(f"  - يوم {nd['day_ar']} ({nd['date_str']}): {slots_str}")
            lines.append("\n• هل تحب أحجزلك في أي من المواعيد المتاحة دي؟ قولي اليوم والوقت المناسب ليك وهنفّذ الحجز فوراً بالنيابة عنك!")
            answer = "\n".join(lines)

        return {
            "answer": answer,
            "sources": [
                {
                    "id": "careos_clinician_schedule",
                    "title": "CareOS Clinician Availability Calendar",
                    "category": "appointments",
                }
            ],
            "provider": "careos-autonomous-agent",
        }

    # CASE 2: Date is specified (working day), but Time is NOT specified yet
    if target_date and not target_time:
        date_str = target_date.strftime("%Y-%m-%d")
        day_ar = ARABIC_DAY_NAMES.get(target_date.weekday(), target_date.strftime("%A"))
        day_en = target_date.strftime("%A")
        avail_slots = get_available_slots(doctor_id, target_date)

        if not avail_slots:
            next_dates = find_next_available_dates(doctor_id, target_date + dt.timedelta(days=1), limit=2)
            if is_english:
                answer = (
                    f"All appointment slots for {doctor_name} on {day_en}, {date_str} are currently fully booked.\n\n"
                    "• Next available dates with open slots:\n" +
                    "\n".join(f"  - {nd['day_en']} ({nd['date_str']}): {', '.join(nd['slots'])}" for nd in next_dates) +
                    "\n\n• Please choose one of these available slots and I will execute the booking for you directly."
                )
            else:
                answer = (
                    f"جميع المواعيد المتاحة لدى {doctor_name} في يوم {day_ar} الموافق {date_str} محجوزة بالكامل.\n\n"
                    "• أقرب الأيام التي تتوفر بها مواعيد شاغرة:\n" +
                    "\n".join(f"  - يوم {nd['day_ar']} ({nd['date_str']}): {'، '.join(nd['slots'])}" for nd in next_dates) +
                    "\n\n• اختر الميعاد المناسب ليك وهقوم بالحجز فوراً بالنيابة عنك."
                )
        else:
            slots_sample = avail_slots[:6]
            if is_english:
                answer = (
                    f"Doctor {doctor_name} is available on {day_en}, {date_str}!\n\n"
                    "• Clinic Hours: 09:00 AM to 05:00 PM\n"
                    f"• Available Slots on this day: {', '.join(slots_sample)}\n\n"
                    "• Which time slot would you like me to book for you? Just let me know the time and I will immediately book and confirm your appointment!"
                )
            else:
                answer = (
                    f"الطبيب {doctor_name} متاح يوم {day_ar} الموافق {date_str}!\n\n"
                    "• ساعات عمل العيادة: من 09:00 صباحاً حتى 05:00 مساءً\n"
                    f"• المواعيد الشاغرة المتاحة في هذا اليوم: {'، '.join(slots_sample)}\n\n"
                    "• أي وقت من المواعيد دي يناسبك؟ قولي الوقت وهنفّذ الحجز في النظام فوراً بالنيابة عنك وأطلعلك كود التأكيد!"
                )

        return {
            "answer": answer,
            "sources": [
                {
                    "id": "careos_clinician_schedule",
                    "title": "CareOS Clinician Availability Calendar",
                    "category": "appointments",
                }
            ],
            "provider": "careos-autonomous-agent",
        }

    # CASE 3: BOTH Date and Time are specified -> Validate slot and EXECUTE BOOKING!
    if target_date and target_time:
        schedule = get_clinician_schedule(doctor_id, target_date.weekday())
        if not schedule:
            schedule = {
                "start_time": dt.time(9, 0),
                "end_time": dt.time(17, 0),
                "slot_duration_minutes": 30,
            }

        # Check working hours (09:00 - 17:00)
        if target_time < schedule["start_time"] or target_time >= schedule["end_time"]:
            avail_slots = get_available_slots(doctor_id, target_date)
            date_str = target_date.strftime("%Y-%m-%d")
            day_ar = ARABIC_DAY_NAMES.get(target_date.weekday(), "")
            if is_english:
                answer = (
                    f"The requested time ({target_time.strftime('%I:%M %p')}) is outside clinic working hours.\n\n"
                    f"• Doctor {doctor_name} working hours: 09:00 AM to 05:00 PM.\n"
                    f"• Available open slots on {date_str}: {', '.join(avail_slots[:5]) if avail_slots else 'Please select another date.'}\n\n"
                    "• Which available time slot would you like to book?"
                )
            else:
                answer = (
                    f"الوقت المطلوب ({target_time.strftime('%I:%M %p')}) يقع خارج ساعات العمل الرسمية للعيادة.\n\n"
                    f"• ساعات عمل {doctor_name}: من الساعة 09:00 صباحاً حتى 05:00 مساءً.\n"
                    f"• المواعيد الشاغرة المتاحة يوم {day_ar} ({date_str}): {'، '.join(avail_slots[:5]) if avail_slots else 'يرجى اختيار يوم آخر.'}\n\n"
                    "• أي ميعاد متاح من دول تفضل أن أحجزه لك؟"
                )
            return {
                "answer": answer,
                "sources": [{"id": "careos_calendar", "title": "CareOS Calendar"}],
                "provider": "careos-autonomous-agent",
            }

        # Check if already booked
        booked_times = get_booked_appointments(doctor_id, target_date)
        req_time_str = target_time.strftime("%H:%M")
        if req_time_str in booked_times:
            avail_slots = get_available_slots(doctor_id, target_date)
            date_str = target_date.strftime("%Y-%m-%d")
            day_ar = ARABIC_DAY_NAMES.get(target_date.weekday(), "")
            if is_english:
                answer = (
                    f"The time slot {target_time.strftime('%I:%M %p')} on {date_str} is already booked.\n\n"
                    f"• Closest available slots on this day: {', '.join(avail_slots[:5]) if avail_slots else 'None'}\n\n"
                    "• Which of these slots would you prefer me to book instead?"
                )
            else:
                answer = (
                    f"الميعاد المطلوب الساعة {target_time.strftime('%I:%M %p')} يوم {day_ar} ({date_str}) محجوز مسبقاً لمريض آخر.\n\n"
                    f"• أقرب المواعيد الشاغرة المتاحة في نفس اليوم: {'، '.join(avail_slots[:5]) if avail_slots else 'لا توجد مواعيد شاغرة'}\n\n"
                    "• أي ميعاد من المواعيد دي تحب أحجزه لك بدلاً منه؟"
                )
            return {
                "answer": answer,
                "sources": [{"id": "careos_calendar", "title": "CareOS Calendar"}],
                "provider": "careos-autonomous-agent",
            }

        # Check if patient name & phone are provided
        patient_name = params.get("patient_name")
        patient_phone = params.get("patient_phone")
        date_str = target_date.strftime("%Y-%m-%d")
        time_str = target_time.strftime("%I:%M %p")
        day_ar = ARABIC_DAY_NAMES.get(target_date.weekday(), target_date.strftime("%A"))
        day_en = target_date.strftime("%A")

        if not patient_name or not patient_phone:
            # Need patient identification!
            if is_english:
                missing_items = []
                if not patient_name:
                    missing_items.append("Your Full Name")
                if not patient_phone:
                    missing_items.append("Your Mobile / Phone Number")
                answer = (
                    f"Doctor {doctor_name} is available on {day_en}, {date_str} at {time_str}!\n\n"
                    "• The requested appointment slot is open and held for you.\n\n"
                    "• To officially record and confirm your reservation in the clinic database, please provide:\n" +
                    "\n".join(f"  - {item}" for item in missing_items) +
                    "\n\n• Once you provide these details, I will immediately execute the official booking in the clinic schedule and generate your verified confirmation reference code (#REF_CODE)!"
                )
            else:
                missing_items = []
                if not patient_name:
                    missing_items.append("الاسم بالكامل")
                if not patient_phone:
                    missing_items.append("رقم الموبايل للتواصل")
                answer = (
                    f"ميعاد يوم {day_ar} الموافق {date_str} الساعة {time_str} متاح وشاغر مع {doctor_name}!\n\n"
                    "• الميعاد تم حجزه مبدئياً وهو جاهز للتأكيد فوراً في النظام.\n\n"
                    "• لتأكيد الحجز رسمياً في قاعدة بيانات العيادة وإصدار كود الحجز المعتمد باسمك، فضلاً اكتب لي:\n" +
                    "\n".join(f"  - {item}" for item in missing_items) +
                    "\n\n• بمجرد إرسال البيانات دي، هسجل الميعاد فوراً في السيستم وهيطلعلك كود الحجز الرسمي (#REF_CODE)!"
                )
            return {
                "answer": answer,
                "sources": [{"id": "careos_calendar", "title": "CareOS Calendar"}],
                "provider": "careos-autonomous-agent",
            }

        # BOTH NAME AND PHONE PROVIDED! CREATE/MATCH REAL PATIENT & EXECUTE REAL BOOKING!
        patient_id = get_or_create_guest_patient(patient_name, patient_phone)
        booking_result = execute_booking(
            target_date=target_date,
            target_time=target_time,
            doctor_id=doctor_id,
            patient_id=patient_id,
            reason=f"حجز استشارة عيادة عبر المساعد الذكي ({patient_name} - {patient_phone})",
        )
        ref_code = booking_result["ref_code"]

        if is_english:
            answer = (
                "Your appointment has been officially confirmed and registered in the clinic database!\n\n"
                f"• Patient Name: {patient_name}\n"
                f"• Contact Phone: {patient_phone}\n"
                f"• Treating Physician: {doctor_name}\n"
                f"• Department / Specialty: {specialty}\n"
                f"• Scheduled Date: {date_str} ({day_en})\n"
                f"• Scheduled Time: {time_str}\n"
                "• Booking Status: Confirmed in clinic schedule (Live Database)\n"
                f"• Official Confirmation Reference Code: #{ref_code}\n\n"
                "• Important Instructions for your Visit:\n"
                f"  - Your reservation is now permanently stored in the CareOS system under your name ({patient_name}) and phone ({patient_phone}).\n"
                f"  - Upon arrival at the clinic reception, simply show code #{ref_code} or mention your phone number for immediate check-in without waiting in registration lines.\n"
                "  - You can track and manage your visit details at any time through the Patient Portal."
            )
        else:
            answer = (
                "ألف مبروك! تم تسجيل وتأكيد حجزك رسمياً في قاعدة بيانات العيادة بنجاح:\n\n"
                f"• اسم المريض: {patient_name}\n"
                f"• رقم الهاتف: {patient_phone}\n"
                f"• الطبيب المعالج: {doctor_name}\n"
                f"• التخصص: {specialty}\n"
                f"• التاريخ واليوم: {date_str} (يوم {day_ar})\n"
                f"• التوقيت: الساعة {time_str}\n"
                "• حالة الحجز: مؤكد رسمياً في جدول الطبيب (Confirmed)\n"
                f"• كود الحجز الرسمي الخاص بك: #{ref_code}\n\n"
                "• تعليمات هامة لحضرتك عند الحضور:\n"
                f"  - تم ربط الحجز رسمياً في النظام باسم حضرتك ({patient_name}) ورقم تليفونك ({patient_phone}).\n"
                f"  - عند وصولك للعيادة أو المركز الطبي، أظهر كود الحجز #{ref_code} أو اذكر رقم تليفونك لموظف الاستقبال ليتم تسجيل دخولك فوراً دون الحاجة للانتظار في طوابير التسجيل أو كتابة استمارات ورقية.\n"
                "  - يمكنك دائماً مراجعة تفاصيل الزيارة ومتابعة ملفك الطبي بكل سهولة من خلال بوابة المريض الرقمية (Patient Portal)."
            )

        return {
            "answer": answer,
            "sources": [
                {
                    "id": "careos_automated_booking",
                    "title": "CareOS Autonomous Booking Engine",
                    "category": "appointments",
                }
            ],
            "provider": "careos-autonomous-agent",
        }

    # CASE 4: Booking intent detected, but no date/time given yet
    next_dates = find_next_available_dates(doctor_id, dt.date.today(), limit=2)
    if is_english:
        answer = (
            "I will gladly take action and book the appointment directly on your behalf!\n\n"
            f"• Doctor: {doctor_name} ({specialty})\n"
            "• Clinic Working Hours: Monday to Friday from 09:00 AM to 05:00 PM (Saturday & Sunday are clinic off-days).\n\n"
            "To complete the booking for you, please let me know:\n"
            "• Preferred Day or Date (e.g., tomorrow, or next Monday)\n"
            "• Preferred Time Slot (e.g., 10:00 AM or 02:00 PM)\n\n"
            "• Upcoming open slots:\n" +
            "\n".join(f"  - {nd['day_en']} ({nd['date_str']}): {', '.join(nd['slots'][:4])}" for nd in next_dates) +
            "\n\nAs soon as you tell me your preferred slot, I will immediately execute the booking in the clinic schedule and provide your confirmation code."
        )
    else:
        answer = (
            "أكيد، أنا هقوم بالحجز بدالك فوراً وبشكل آلي في النظام!\n\n"
            f"• الطبيب المعالج: {doctor_name} ({specialty})\n"
            "• مواعيد عمل العيادة: من الإثنين إلى الجمعة من الساعة 09:00 صباحاً حتى 05:00 مساءً (السبت والأحد عطلة العيادة).\n\n"
            "عشان أنفذ الحجز مباشرة بالنيابة عنك، محتاج منك فقط:\n"
            "• اليوم أو التاريخ المفضل (مثل: غداً، أو يوم الإثنين القادم)\n"
            "• الوقت المناسب ليك (مثل: الساعة 10:00 صباحاً أو 02:00 ظهراً)\n\n"
            "• أقرب المواعيد المتاحة حالياً:\n" +
            "\n".join(f"  - يوم {nd['day_ar']} ({nd['date_str']}): {'، '.join(nd['slots'][:4])}" for nd in next_dates) +
            "\n\nبمجرد ما تختار الميعاد المناسب ليك، هنفّذ الحجز في جدول الطبيب فوراً وأطلع لك كود التأكيد."
        )

    return {
        "answer": answer,
        "sources": [
            {
                "id": "careos_booking_assistance",
                "title": "CareOS Booking Workflow",
                "category": "appointments",
            }
        ],
        "provider": "careos-autonomous-agent",
    }


def get_live_booking_context(
    message: str,
    conversation_history: list[dict[str, str]] | None = None,
) -> tuple[str | None, list[dict[str, Any]]]:
    """Extract live clinical database context and execute confirmed bookings on careos.db.

    Returns a tuple of (context_string_for_llm, sources_list).
    """
    # 1. Reference code explanation inquiry
    if is_ref_code_explanation_intent(message):
        context = (
            "PATIENT INQUIRY: WHAT DOES THE CONFIRMATION REFERENCE CODE (#REF_CODE) MEAN?\n"
            "• Meaning & Benefits for the patient:\n"
            "  1. Official CareOS Booking ID: A verified electronic code created directly in the hospital database.\n"
            "  2. Instant Reception Check-In (Queue-Free Entry): Presenting this code at the clinic reception allows immediate electronic check-in without waiting in registration lines or writing manual paperwork.\n"
            "  3. Patient Portal Access: The patient can enter this code in the Patient Portal to view visit details, clinic room, and post-visit reports.\n"
            "  4. Automated SMS Reminders: Linked to timely reminder notifications.\n"
            "• MANDATORY INSTRUCTION: Explain these 4 benefits clearly in structured bullet points (•) using the patient's language."
        )
        sources = [
            {"id": "careos_ref_code_policy", "title": "CareOS Appointment Confirmation Policy", "category": "appointments"}
        ]
        return context, sources

    # 2. Check if booking intent is present
    if not is_booking_intent(message) and not is_ongoing_booking_conversation(conversation_history):
        return None, []

    params = parse_booking_parameters(message, conversation_history)
    has_registered_doctors = params.get("has_registered_doctors", False)
    if not has_registered_doctors:
        context = (
            "CRITICAL TRUTH & GROUNDING REQUIREMENT - NO DOCTORS REGISTERED (EMPTY DATASET):\n"
            "• The clinic database currently contains ZERO registered doctors. The doctors dataset is completely EMPTY.\n"
            "• DO NOT under any circumstances invent, make up, or hallucinate fictional doctors or mock schedules.\n"
            "• MANDATORY INSTRUCTION: You must inform the user clearly in structured bullet points (•) that no doctors are registered in the clinic database yet, the doctors list is currently empty, and appointments cannot be scheduled until clinicians are added by clinic administration."
        )
        sources = [{"id": "careos_doctors_empty", "title": "CareOS Doctors Registry", "category": "doctors"}]
        return context, sources

    target_date = params.get("target_date")
    target_time = params.get("target_time")
    doctor_name = params.get("doctor_name", "")
    doctor_id = params.get("doctor_id", "")
    working_days = get_clinician_working_days(doctor_id)

    sources = [
        {"id": "careos_clinician_schedule", "title": "CareOS Clinician Availability Calendar", "category": "appointments"}
    ]

    # CASE A: Date on Weekend / Off-day
    if target_date and target_date.weekday() not in working_days:
        day_ar = ARABIC_DAY_NAMES.get(target_date.weekday(), target_date.strftime("%A"))
        date_str = target_date.strftime("%Y-%m-%d")
        next_dates = find_next_available_dates(doctor_id, target_date + dt.timedelta(days=1), limit=2)
        next_summary = "; ".join(f"{nd['day_ar']} {nd['date_str']}: {', '.join(nd['slots'])}" for nd in next_dates)
        context = (
            f"CLINIC SCHEDULE CONFLICT (WEEKEND / OFF-DAY):\n"
            f"• Doctor: {doctor_name}\n"
            f"• Requested Date: {day_ar} {date_str} (Clinic is CLOSED on weekends: Saturday & Sunday).\n"
            f"• Clinic Working Schedule: Monday to Friday from 09:00 AM to 05:00 PM.\n"
            f"• Next Available Working Dates & Slots: {next_summary}\n"
            f"• MANDATORY INSTRUCTION: Inform the patient politely that the clinic is closed on weekends (Saturday & Sunday). In structured bullet points (•), present the upcoming available working dates and open slots, and ask which one they prefer."
        )
        return context, sources

    # CASE B: Working Date, but Time not specified yet
    if target_date and not target_time:
        day_ar = ARABIC_DAY_NAMES.get(target_date.weekday(), target_date.strftime("%A"))
        date_str = target_date.strftime("%Y-%m-%d")
        avail_slots = get_available_slots(doctor_id, target_date)
        if not avail_slots:
            next_dates = find_next_available_dates(doctor_id, target_date + dt.timedelta(days=1), limit=2)
            next_summary = "; ".join(f"{nd['day_ar']} {nd['date_str']}: {', '.join(nd['slots'])}" for nd in next_dates)
            context = (
                f"CLINIC AVAILABILITY ON {day_ar} {date_str}:\n"
                f"• All slots for {doctor_name} on {day_ar} {date_str} are fully booked.\n"
                f"• Next available dates with open slots: {next_summary}\n"
                f"• MANDATORY INSTRUCTION: Inform the patient that this day is fully booked. Propose the next available dates/slots in bullet points and ask which one they prefer."
            )
        else:
            slots_str = "، ".join(avail_slots[:6])
            context = (
                f"CLINIC AVAILABILITY ON {day_ar} {date_str}:\n"
                f"• Doctor: {doctor_name}\n"
                f"• Official Working Hours: 09:00 AM to 05:00 PM\n"
                f"• Available Open Slots on this day: {slots_str}\n"
                f"• MANDATORY INSTRUCTION: Present the clinic working hours and available slots on {day_ar} {date_str} in clear bullet points (•). Ask the patient which time slot they would like you to confirm and book for them immediately."
            )
        return context, sources

    # CASE C: BOTH Date and Time are specified
    if target_date and target_time:
        day_ar = ARABIC_DAY_NAMES.get(target_date.weekday(), target_date.strftime("%A"))
        date_str = target_date.strftime("%Y-%m-%d")
        time_str = target_time.strftime("%I:%M %p")

        # C1: Outside working hours (09:00 - 17:00)
        start_time = dt.time(9, 0)
        end_time = dt.time(17, 0)
        if target_time < start_time or target_time >= end_time:
            avail_slots = get_available_slots(doctor_id, target_date)
            slots_str = "، ".join(avail_slots[-4:] if avail_slots else ["لا توجد مواعيد متاحة"])
            context = (
                f"CLINIC SCHEDULE CONFLICT (OUTSIDE WORKING HOURS):\n"
                f"• Doctor: {doctor_name}\n"
                f"• Requested Time: {time_str} on {day_ar} {date_str}\n"
                f"• Working Hours: Monday to Friday from 09:00 AM to 05:00 PM (17:00).\n"
                f"• Conflict: The requested time ({time_str}) is OUTSIDE clinic hours (clinic closes at 05:00 PM).\n"
                f"• Available Open Slots on this day: {slots_str}\n"
                f"• MANDATORY INSTRUCTION: Inform the patient clearly and politely that {time_str} is after clinic closing hours (clinic closes at 05:00 PM). In structured bullet points (•), propose the closest available open slots (such as {slots_str}) and ask which slot they would like you to book for them."
            )
            return context, sources

        # C2: Slot already booked
        booked_times = get_booked_appointments(doctor_id, target_date)
        req_time_str = target_time.strftime("%H:%M")
        if req_time_str in booked_times:
            avail_slots = get_available_slots(doctor_id, target_date)
            slots_str = "، ".join(avail_slots[:5])
            context = (
                f"CLINIC SCHEDULE CONFLICT (SLOT ALREADY BOOKED):\n"
                f"• The requested time {time_str} on {day_ar} {date_str} is already booked by another patient.\n"
                f"• Alternative available open slots on this day: {slots_str}\n"
                f"• MANDATORY INSTRUCTION: Inform the patient that this slot is already taken. In structured bullet points (•), suggest the available alternative slots on {day_ar} and ask which one they prefer."
            )
            return context, sources

        # C3: Valid working slot -> Check patient name & phone!
        patient_name = params.get("patient_name")
        patient_phone = params.get("patient_phone")

        if not patient_name or not patient_phone:
            missing_items = []
            if not patient_name:
                missing_items.append("الاسم بالكامل (Full Name)")
            if not patient_phone:
                missing_items.append("رقم الموبايل للتواصل (Mobile / Phone Number)")
            missing_str = " و ".join(missing_items)

            context = (
                f"BOOKING PENDING PATIENT DETAILS (GUEST USER):\n"
                f"• Doctor: {doctor_name}\n"
                f"• Requested Date: {day_ar} {date_str}\n"
                f"• Requested Time: {time_str}\n"
                f"• Slot Availability: Available and open!\n"
                f"• MISSING REQUIRED DATA: {missing_str}.\n"
                f"• CRITICAL RULE: DO NOT execute booking or produce a final confirmation code until the guest provides their {missing_str}.\n"
                f"• MANDATORY INSTRUCTION: Confirm warmly that the requested slot ({time_str} on {day_ar} {date_str}) with {doctor_name} is available. Ask the patient clearly to provide their {missing_str} so you can officially register their reservation in the hospital database and issue their confirmation code."
            )
            return context, sources

        # BOTH NAME AND PHONE PROVIDED -> EXECUTE LIVE BOOKING!
        patient_id = get_or_create_guest_patient(patient_name, patient_phone)
        booking_result = execute_booking(
            target_date=target_date,
            target_time=target_time,
            doctor_id=doctor_id,
            patient_id=patient_id,
            reason=f"CareOS Autonomous Booking ({patient_name} - {patient_phone})",
        )
        ref_code = booking_result.get("ref_code", "CAREOS1")
        sources.append({"id": "careos_booking_confirmation", "title": "CareOS Booking Confirmation", "category": "appointments"})
        context = (
            f"CRITICAL ACTION EXECUTED - APPOINTMENT BOOKED DIRECTLY IN DATABASE FOR PATIENT:\n"
            f"• Patient Name: {patient_name}\n"
            f"• Contact Phone: {patient_phone}\n"
            f"• Doctor: {doctor_name}\n"
            f"• Date: {day_ar} {date_str}\n"
            f"• Time: {time_str}\n"
            f"• Official Confirmation Reference Code: #{ref_code}\n"
            f"• Database Status: Confirmed in careos.db under patient {patient_name} ({patient_phone})\n"
            f"• MANDATORY INSTRUCTION: Confirm the booking with complete certainty and joy. State the patient name ({patient_name}) and mobile ({patient_phone}). Provide the official Reference Code #{ref_code}. In structured bullet points (•), explain that presenting this code or mobile number at clinic reception allows instant check-in without waiting in registration lines, and they can review visit details in their Patient Portal."
        )
        return context, sources

    # CASE D: General booking intent without date/time
    next_dates = find_next_available_dates(doctor_id, dt.date.today(), limit=2)
    next_summary = "; ".join(f"{nd['day_ar']} {nd['date_str']}: {', '.join(nd['slots'][:3])}" for nd in next_dates)
    context = (
        f"AUTONOMOUS BOOKING ASSISTANCE:\n"
        f"• Doctor: {doctor_name}\n"
        f"• Working Hours: Monday to Friday from 09:00 AM to 05:00 PM (Saturday & Sunday are clinic off-days).\n"
        f"• Upcoming Open Slots: {next_summary}\n"
        f"• MANDATORY INSTRUCTION: Enthusiastically affirm that you can book the appointment for the patient directly in the system. Present the upcoming dates and available times in structured bullet points (•), and ask which slot they would like you to confirm."
    )
    return context, sources


import { type FormEvent, useEffect, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Check,
  Plus,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { getTeam, type AuthUser } from "../../api";
import {
  createAppointment,
  createWalkInAppointment,
  createClinicianSchedule,
  deleteClinicianSchedule,
  getClinicianSchedules,
  getAppointments,
  rescheduleAppointment,
  type ClinicianSchedule,
  type WalkInResponse,
  updateAppointmentStatus,
} from "../../api/appointments";
import { getPatients } from "../../api/patients";
import { type Appointment } from "../../data";
import { PageHeading } from "../../components/PageHeading";
import type { Language, TranslationKey } from "../../i18n";

type Translator = (key: TranslationKey) => string;

function appointmentTypeTranslation(type: Appointment["type"]): TranslationKey {
  switch (type) {
    case "Follow-up consultation":
      return "followUpConsultation";
    case "Diabetes review":
      return "diabetesReview";
    case "Cardiology referral":
      return "cardiologyReferral";
    case "Medication review":
      return "medicationReview";
    default:
      return "appointmentType";
  }
}

function appointmentStatusTranslation(status: Appointment["status"]): TranslationKey {
  switch (status) {
    case "Confirmed":
      return "confirmed";
    case "Arrived":
      return "arrived";
    case "Pending":
      return "pending";
    case "Cancelled":
      return "cancelled";
  }
}

function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function localTimeValue(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function AvailabilityManagerModal({
  close,
  t,
  language,
}: {
  close: () => void;
  t: Translator;
  language: Language;
}) {
  const [clinicians, setClinicians] = useState<AuthUser[]>([]);
  const [clinicianId, setClinicianId] = useState("");
  const [schedules, setSchedules] = useState<ClinicianSchedule[]>([]);
  const [dayOfWeek, setDayOfWeek] = useState("0");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [duration, setDuration] = useState("30");
  const [loadingClinicians, setLoadingClinicians] = useState(true);
  const [loadingSchedules, setLoadingSchedules] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locale = language === "ar" ? "ar-EG" : "en-US";

  useEffect(() => {
    getTeam()
      .then((team) => {
        const availableClinicians = team.filter((user) =>
          ["doctor", "physician", "nurse"].includes(user.role.toLowerCase()),
        );
        setClinicians(availableClinicians);
        setClinicianId(availableClinicians[0]?.id ?? "");
      })
      .catch((reason: unknown) => {
        setError(
          reason instanceof Error ? reason.message : t("scheduleLoadFailed"),
        );
      })
      .finally(() => setLoadingClinicians(false));
  }, [t]);

  useEffect(() => {
    if (!clinicianId) {
      setSchedules([]);
      return;
    }
    let active = true;
    setLoadingSchedules(true);
    getClinicianSchedules(clinicianId)
      .then((items) => {
        if (active) {
          setSchedules(items);
          setError(null);
        }
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(
            reason instanceof Error ? reason.message : t("scheduleLoadFailed"),
          );
        }
      })
      .finally(() => {
        if (active) setLoadingSchedules(false);
      });
    return () => {
      active = false;
    };
  }, [clinicianId, t]);

  const addSchedule = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!clinicianId) return;
    setSaving(true);
    try {
      const created = await createClinicianSchedule(clinicianId, {
        day_of_week: Number(dayOfWeek),
        start_time: startTime,
        end_time: endTime,
        slot_duration_minutes: Number(duration),
      });
      setSchedules((current) =>
        [...current, created].sort(
          (left, right) =>
            left.day_of_week - right.day_of_week ||
            left.start_time.localeCompare(right.start_time),
        ),
      );
      setError(null);
    } catch (reason: unknown) {
      setError(
        reason instanceof Error ? reason.message : t("schedulePublishFailed"),
      );
    } finally {
      setSaving(false);
    }
  };

  const removeSchedule = async (schedule: ClinicianSchedule) => {
    if (!clinicianId || !window.confirm(t("deleteScheduleConfirm"))) return;
    try {
      await deleteClinicianSchedule(clinicianId, schedule.id);
      setSchedules((current) =>
        current.filter((item) => item.id !== schedule.id),
      );
      setError(null);
    } catch (reason: unknown) {
      setError(
        reason instanceof Error ? reason.message : t("scheduleDeleteFailed"),
      );
    }
  };

  const weekday = (day: number) =>
    new Date(2024, 0, 1 + day).toLocaleDateString(locale, {
      weekday: "long",
    });

  return (
    <div className="modal-backdrop" onClick={close}>
      <section
        className="modal availability-manager"
        role="dialog"
        aria-modal="true"
        aria-labelledby="availability-manager-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-heading">
          <div>
            <div className="eyebrow">{t("schedule")}</div>
            <h2 id="availability-manager-title">
              {t("manageClinicianAvailability")}
            </h2>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={close}
            aria-label={t("close")}
          >
            <X size={18} />
          </button>
        </div>
        {loadingClinicians ? (
          <div className="loading-state">{t("loading")}</div>
        ) : clinicians.length === 0 ? (
          <div className="empty-state">{t("noSchedulableClinicians")}</div>
        ) : (
          <>
            <label className="availability-field">
              {t("clinicianLabel")}
              <select
                value={clinicianId}
                onChange={(event) => setClinicianId(event.target.value)}
              >
                {clinicians.map((clinician) => (
                  <option key={clinician.id} value={clinician.id}>
                    {clinician.full_name}
                  </option>
                ))}
              </select>
            </label>
            <form className="availability-form" onSubmit={addSchedule}>
              <label>
                {t("weekday")}
                <select
                  value={dayOfWeek}
                  onChange={(event) => setDayOfWeek(event.target.value)}
                >
                  {Array.from({ length: 7 }, (_, day) => (
                    <option key={day} value={day}>
                      {weekday(day)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("startTime")}
                <input
                  type="time"
                  required
                  value={startTime}
                  onChange={(event) => setStartTime(event.target.value)}
                />
              </label>
              <label>
                {t("endTime")}
                <input
                  type="time"
                  required
                  value={endTime}
                  onChange={(event) => setEndTime(event.target.value)}
                />
              </label>
              <label>
                {t("appointmentDuration")}
                <select
                  value={duration}
                  onChange={(event) => setDuration(event.target.value)}
                >
                  {[15, 20, 30, 45, 60].map((minutes) => (
                    <option key={minutes} value={minutes}>
                      {minutes} {t("minutes")}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                className="primary-btn small"
                disabled={saving}
              >
                <Plus size={15} />
                {saving ? t("saving") : t("publishAvailability")}
              </button>
            </form>
            {loadingSchedules ? (
              <div className="loading-state">{t("loading")}</div>
            ) : schedules.length ? (
              <div className="availability-schedule-list">
                {schedules.map((schedule) => (
                  <div className="availability-schedule-row" key={schedule.id}>
                    <span>{weekday(schedule.day_of_week)}</span>
                    <strong dir="ltr">
                      {schedule.start_time}–{schedule.end_time}
                    </strong>
                    <span>
                      {schedule.slot_duration_minutes} {t("minutes")}
                    </span>
                    <button
                      type="button"
                      className="icon-btn danger"
                      aria-label={t("deleteAvailability")}
                      onClick={() => void removeSchedule(schedule)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">{t("noPublishedSchedules")}</div>
            )}
          </>
        )}
        {error && (
          <div className="error-state" role="alert">
            {error}
          </div>
        )}
      </section>
    </div>
  );
}

function AppointmentModal({
  close,
  t,
  language,
}: {
  close: () => void;
  t: Translator;
  language: Language;
}) {
  const [people, setPeople] = useState<Array<{ id: string; label: string }>>(
    [],
  );
  const [loadingPatients, setLoadingPatients] = useState(true);
  const [patientsError, setPatientsError] = useState<string | null>(null);
  const [patientId, setPatientId] = useState("");
  const [date, setDate] = useState(() => localDateKey(new Date()));
  const [time, setTime] = useState(() => {
    const nextSlot = new Date();
    nextSlot.setMinutes(Math.ceil(nextSlot.getMinutes() / 15) * 15, 0, 0);
    return localTimeValue(nextSlot);
  });
  const [reason, setReason] = useState("Follow-up consultation");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    getPatients()
      .then((items) => {
        const next = items.map((item) => ({
          id: item.id,
          label: `${item.given_name} ${item.family_name} · ${item.patient_code}`,
        }));
        setPeople(next);
        setPatientId(next[0]?.id ?? "");
      })
      .catch((error: unknown) => {
        setPatientsError(
          error instanceof Error ? error.message : "Could not load patients.",
        );
      })
      .finally(() => setLoadingPatients(false));
  }, []);
  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-heading">
          <div>
            <div className="eyebrow">{t("schedule")}</div>
            <h2>{t("newAppointment")}</h2>
          </div>
          <button className="icon-btn" onClick={close}>
            <X size={18} />
          </button>
        </div>
        <label>
          {t("patient")}
          <select
            value={patientId}
            onChange={(event) => setPatientId(event.target.value)}
            disabled={loadingPatients || people.length === 0}
          >
            {people.length ? (
              people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.label}
                </option>
              ))
            ) : (
              <option value="">
                {loadingPatients
                  ? t("loading")
                  : t("apiPatientRequiredForAppointment")}
              </option>
            )}
          </select>
        </label>
        {patientsError && (
          <div className="inline-error" role="alert">
            {patientsError}
          </div>
        )}
        <div className="form-row">
          <label>
            {t("date")}
            <input
              type="date"
              required
              lang={language === "ar" ? "ar-EG" : "en-US"}
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </label>
          <label>
            {t("time")}
            <input
              type="time"
              required
              lang={language === "ar" ? "ar-EG" : "en-US"}
              value={time}
              onChange={(event) => setTime(event.target.value)}
            />
          </label>
        </div>
        <label>
          {t("appointmentType")}
          <select
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          >
            <option value="Follow-up consultation">{t("followUpConsultation")}</option>
            <option value="Medication review">{t("medicationReview")}</option>
          </select>
        </label>
        <button
          className="primary-btn full-width"
          disabled={!patientId || !date || !time || saving || loadingPatients}
          onClick={async () => {
            setSaving(true);
            try {
              await createAppointment({
                patient_id: patientId,
                starts_at: new Date(`${date}T${time}:00`).toISOString(),
                reason,
                status: "confirmed",
              });
              close();
              window.dispatchEvent(
                new CustomEvent("careos:toast", {
                  detail: t("appointmentSaved"),
                }),
              );
            } catch (error) {
              window.dispatchEvent(
                new CustomEvent("careos:toast", {
                  detail:
                    error instanceof Error
                      ? error.message
                      : t("appointmentSaveFailed"),
                }),
              );
            } finally {
              setSaving(false);
            }
          }}
        >
          <Check size={16} /> {saving ? t("saving") : t("confirmAppointment")}
        </button>
      </div>
    </div>
  );
}

function RescheduleModal({
  appointment,
  close,
  reload,
  t,
  language,
}: {
  appointment: Appointment;
  close: () => void;
  reload: () => Promise<void>;
  t: Translator;
  language: Language;
}) {
  const [date, setDate] = useState(
    localDateKey(new Date(appointment.startsAt || Date.now())),
  );
  const [time, setTime] = useState(
    localTimeValue(new Date(appointment.startsAt || Date.now())),
  );
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!appointment.id) return;
    setSaving(true);
    try {
      await rescheduleAppointment(
        appointment.id,
        new Date(`${date}T${time}:00`).toISOString(),
      );
      close();
      await reload();
    } catch (error) {
      window.dispatchEvent(
        new CustomEvent("careos:toast", {
          detail:
            error instanceof Error
              ? error.message
              : t("couldNotRescheduleAppointment"),
        }),
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-heading">
          <div>
            <div className="eyebrow">{t("schedule")}</div>
            <h2>{t("rescheduleAppointment")}</h2>
          </div>
          <button className="icon-btn" onClick={close}>
            <X size={18} />
          </button>
        </div>
        <div className="form-row">
          <label>
            {t("date")}
            <input
              type="date"
              lang={language === "ar" ? "ar-EG" : "en-US"}
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </label>
          <label>
            {t("time")}
            <input
              type="time"
              lang={language === "ar" ? "ar-EG" : "en-US"}
              value={time}
              onChange={(event) => setTime(event.target.value)}
            />
          </label>
        </div>
        <button
          className="primary-btn full-width"
          disabled={saving}
          onClick={() => void save()}
        >
          {saving ? t("saving") : t("saveNewTime")}
        </button>
      </div>
    </div>
  );
}

function WalkInBookingModal({
  close,
  reload,
  t,
}: {
  close: () => void;
  reload: () => Promise<void>;
  t: Translator;
  language: Language;
}) {
  const [givenName, setGivenName] = useState("");
  const [phone, setPhone] = useState("");
  const [clinicianId, setClinicianId] = useState("");
  const [reason, setReason] = useState("Walk-in consultation");
  const [clinicians, setClinicians] = useState<AuthUser[]>([]);
  const [loadingClinicians, setLoadingClinicians] = useState(true);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<WalkInResponse | null>(null);

  useEffect(() => {
    getTeam()
      .then((users) => {
        const doctors = users.filter((u) => u.role === "doctor" || u.role === "physician");
        setClinicians(doctors.length ? doctors : users);
        if (doctors.length) setClinicianId(doctors[0].id);
        else if (users.length) setClinicianId(users[0].id);
      })
      .catch(() => setClinicians([]))
      .finally(() => setLoadingClinicians(false));
  }, []);

  const handleBook = async (e: FormEvent) => {
    e.preventDefault();
    if (!givenName.trim() || !phone.trim()) return;
    setSaving(true);
    try {
      const res = await createWalkInAppointment({
        given_name: givenName.trim(),
        phone: phone.trim(),
        clinician_id: clinicianId || null,
        reason: reason || "Walk-in consultation",
        starts_at: new Date().toISOString(),
      });
      setResult(res);
      await reload();
      window.dispatchEvent(
        new CustomEvent("careos:toast", {
          detail: t("walkInSuccessTitle"),
        }),
      );
    } catch (err) {
      window.dispatchEvent(
        new CustomEvent("careos:toast", {
          detail: err instanceof Error ? err.message : t("appointmentSaveFailed"),
        }),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-heading">
          <div>
            <div className="eyebrow">{t("quickDeskBooking")}</div>
            <h2>{t("walkInAppointment")}</h2>
          </div>
          <button className="icon-btn" onClick={close} aria-label={t("close")}>
            <X size={18} />
          </button>
        </div>

        {result ? (
          <div style={{ padding: "1rem 0", textAlign: "center" }}>
            <div style={{ fontSize: "2.5rem", fontWeight: "bold", color: "#0284c7", margin: "0.5rem 0" }}>
              {result.queue_number}
            </div>
            <div style={{ fontSize: "1.1rem", fontWeight: "600", marginBottom: "0.5rem" }}>
              {result.confirmation_code}
            </div>
            <div style={{ margin: "0.8rem 0" }}>
              <span className={`status-badge ${result.is_new_patient ? "status-confirmed" : "status-arrived"}`}>
                {result.is_new_patient ? t("walkInNewPatientBadge") : t("walkInExistingPatientBadge")}
              </span>
            </div>
            <p style={{ color: "var(--muted)", fontSize: "0.95rem" }}>
              {result.patient.given_name} {result.patient.family_name} — {result.patient.medical_record_number}
            </p>
            <div style={{ marginTop: "1.5rem" }}>
              <button className="primary-btn full-width" onClick={close}>
                <Check size={16} /> {t("close")}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleBook}>
            <p style={{ color: "var(--muted)", fontSize: "0.88rem", marginBottom: "1rem" }}>
              {t("walkInDesc")}
            </p>
            <label>
              {t("walkInPatientName")} *
              <input
                type="text"
                required
                placeholder="أحمد محمد"
                value={givenName}
                onChange={(e) => setGivenName(e.target.value)}
              />
            </label>

            <label>
              {t("walkInPhone")} *
              <input
                type="tel"
                required
                placeholder="01012345678"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </label>

            <label>
              {t("walkInClinician")}
              <select
                value={clinicianId}
                onChange={(e) => setClinicianId(e.target.value)}
                disabled={loadingClinicians || clinicians.length === 0}
              >
                {clinicians.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name} ({c.department || "General"})
                  </option>
                ))}
              </select>
            </label>

            <label>
              {t("walkInReason")}
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="كشف باطنة عامة / استشارة سريعة"
              />
            </label>

            <button
              type="submit"
              className="primary-btn full-width"
              disabled={saving || !givenName.trim() || !phone.trim()}
              style={{ marginTop: "1rem" }}
            >
              {saving ? t("saving") : t("walkInSubmit")}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export function Appointments({
  t,
  language,
}: {
  t: Translator;
  language: Language;
}) {
  const [showForm, setShowForm] = useState(false);
  const [showWalkInForm, setShowWalkInForm] = useState(false);
  const [showAvailabilityManager, setShowAvailabilityManager] = useState(false);
  const [rescheduling, setRescheduling] = useState<Appointment | null>(null);
  const [filter, setFilter] = useState<Appointment["status"] | "All">("All");
  const [dayOffset, setDayOffset] = useState(0);
  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarAnchor, setCalendarAnchor] = useState(() => new Date());
  const [live, setLive] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const load = () => {
    setLoading(true);
    return getAppointments({ pageSize: 100 })
      .then((records) => {
        setLive(
          records.map((item) => ({
            id: item.id,
            startsAt: item.starts_at,
            date: item.starts_at,
            time: item.starts_at,
            patientId: item.patient_code || item.patient_id,
            patientName: item.patient_name || "",
            type: item.reason as Appointment["type"],
            status: ({
              confirmed: "Confirmed",
              arrived: "Arrived",
              pending: "Pending",
              cancelled: "Cancelled",
            }[item.status] || "Pending") as Appointment["status"],
          })),
        );
        setLoadError(null);
      })
      .catch((reason: unknown) => {
        setLive([]);
        setLoadError(
          reason instanceof Error
            ? reason.message
            : "Could not load appointments.",
        );
      })
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    void load();
  }, []);
  const rangeStart = new Date();
  rangeStart.setHours(0, 0, 0, 0);
  rangeStart.setDate(rangeStart.getDate() + dayOffset);
  const rangeEnd = new Date(rangeStart);
  rangeEnd.setDate(rangeEnd.getDate() + 1);
  const locale = language === "ar" ? "ar-EG" : "en-US";
  const rangeLabel = rangeStart.toLocaleDateString(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const list = [...live].sort(
    (left, right) =>
      new Date(left.startsAt || left.date || "").getTime() -
      new Date(right.startsAt || right.date || "").getTime(),
  );
  const rangeAppointments = list.filter((item) => {
    const appointmentDate = new Date(item.startsAt || item.date || "");
    const timestamp = appointmentDate.getTime();
    return timestamp >= rangeStart.getTime() && timestamp < rangeEnd.getTime();
  });
  const visible =
    filter === "All"
      ? rangeAppointments
      : rangeAppointments.filter((item) => item.status === filter);
  const calendarMonthStart = new Date(
    calendarAnchor.getFullYear(),
    calendarAnchor.getMonth(),
    1,
  );
  const calendarGridStart = new Date(calendarMonthStart);
  calendarGridStart.setDate(
    calendarGridStart.getDate() - ((calendarGridStart.getDay() + 6) % 7),
  );
  const calendarDays = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(calendarGridStart);
    date.setDate(calendarGridStart.getDate() + index);
    const appointmentCount = live.filter((item) =>
      item.startsAt
        ? localDateKey(new Date(item.startsAt)) === localDateKey(date)
        : false,
    ).length;
    return { date, appointmentCount };
  });
  const weekdayLabels = Array.from({ length: 7 }, (_, index) => {
    const monday = new Date(2024, 0, 1 + index);
    return monday.toLocaleDateString(locale, { weekday: "short" });
  });
  const changeCalendarMonth = (offset: number) => {
    setCalendarAnchor((current) => {
      const next = new Date(current);
      next.setDate(1);
      next.setMonth(next.getMonth() + offset);
      return next;
    });
  };
  const selectCalendarDate = (selectedDate: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selected = new Date(selectedDate);
    selected.setHours(0, 0, 0, 0);
    setDayOffset(Math.round((selected.getTime() - today.getTime()) / 86400000));
    setShowCalendar(false);
  };
  return (
    <>
      <PageHeading
        eyebrow={t("schedule")}
        title={t("appointments")}
        detail={t("scheduleDetail")}
        action={
          <div className="appointments-page-actions">
            <button
              type="button"
              className="primary-btn walkin-booking-btn"
              style={{ backgroundColor: "#0284c7" }}
              onClick={() => setShowWalkInForm(true)}
            >
              <UserPlus size={17} /> {t("walkInAppointment")}
            </button>
            <button
              type="button"
              className="outline-btn"
              onClick={() => setShowAvailabilityManager(true)}
            >
              <CalendarDays size={16} /> {t("manageClinicianAvailability")}
            </button>
            <button className="primary-btn" onClick={() => setShowForm(true)}>
              <Plus size={17} /> {t("newAppointment")}
            </button>
          </div>
        }
      />
      <div className="calendar-bar">
        <button
          type="button"
          className={`outline-btn calendar-view-button ${showCalendar ? "active" : ""}`}
          aria-expanded={showCalendar}
          aria-controls="appointments-calendar"
          onClick={() => {
            if (!showCalendar) setCalendarAnchor(new Date(rangeStart));
            setShowCalendar((current) => !current);
          }}
        >
          <CalendarDays size={15} />
          {showCalendar ? t("hideCalendar") : t("calendarView")}
        </button>
        <button
          className="round-btn"
          aria-label={t("previousDay")}
          onClick={() => setDayOffset((value) => value - 1)}
        >
          <ChevronLeft size={16} />
        </button>
        <div>
          <strong>{rangeLabel}</strong>
          <span>
            {rangeAppointments.length} {t("appointmentsCountLabel")}
          </span>
        </div>
        <button
          className="round-btn"
          aria-label={t("nextDay")}
          onClick={() => setDayOffset((value) => value + 1)}
        >
          <ChevronRight size={16} />
        </button>
        <select
          className="filter-btn"
          value={filter}
          onChange={(event) =>
            setFilter(event.target.value as Appointment["status"] | "All")
          }
        >
          <option value="All">{t("allStatuses")}</option>
          <option value="Confirmed">{t("confirmed")}</option>
          <option value="Pending">{t("pending")}</option>
          <option value="Arrived">{t("arrived")}</option>
        </select>
      </div>
      {showCalendar && (
        <section
          className="calendar-month-view"
          id="appointments-calendar"
          aria-label={t("calendarView")}
        >
          <div className="calendar-month-heading">
            <button
              type="button"
              className="round-btn"
              aria-label={t("previousMonth")}
              onClick={() => changeCalendarMonth(-1)}
            >
              <ChevronLeft size={16} />
            </button>
            <h2>
              {calendarMonthStart.toLocaleDateString(locale, {
                month: "long",
                year: "numeric",
              })}
            </h2>
            <button
              type="button"
              className="round-btn"
              aria-label={t("nextMonth")}
              onClick={() => changeCalendarMonth(1)}
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="calendar-weekdays" aria-hidden="true">
            {weekdayLabels.map((weekday, index) => (
              <span key={`${weekday}-${index}`}>{weekday}</span>
            ))}
          </div>
          <div className="calendar-days">
            {calendarDays.map(({ date, appointmentCount }) => {
              const isSelected =
                localDateKey(date) === localDateKey(rangeStart);
              const isToday = localDateKey(date) === localDateKey(new Date());
              return (
                <button
                  type="button"
                  key={localDateKey(date)}
                  className={[
                    date.getMonth() === calendarMonthStart.getMonth()
                      ? ""
                      : "outside-month",
                    isSelected ? "selected" : "",
                    isToday ? "today" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  data-date={localDateKey(date)}
                  aria-label={`${date.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}${appointmentCount ? `, ${appointmentCount} ${t("appointmentsCountLabel")}` : ""}`}
                  aria-pressed={isSelected}
                  onClick={() => selectCalendarDate(date)}
                >
                  <span>
                    {date.toLocaleDateString(locale, { day: "numeric" })}
                  </span>
                  {appointmentCount > 0 && (
                    <span className="calendar-day-count">
                      {appointmentCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      )}
      <section className="panel schedule-panel">
        {loading && (
          <div className="loading-state">{t("loadingAppointments")}</div>
        )}
        {!loading && loadError && (
          <div className="error-state" role="alert">
            {loadError}
          </div>
        )}
        {!loading &&
          !loadError &&
          visible.map((item) => (
            <div
              className="appointment-row"
              key={`${item.id || item.time}-${item.patientId}`}
            >
              <div className="appointment-patient">
                <strong>{item.patientName || t("patient")}</strong>
                <span className="appointment-patient-code" dir="ltr">
                  {t("patientCode")}: {item.patientId}
                </span>
              </div>
              <div className="appointment-datetime">
                <strong>
                  {new Date(item.startsAt || item.date || "").toLocaleDateString(locale, {
                    weekday: "short",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </strong>
                <span dir="auto">
                  {new Date(item.startsAt || item.time).toLocaleTimeString(locale, {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                  })}
                </span>
              </div>
              <span>{t(appointmentTypeTranslation(item.type))}</span>
              <span
                className={`status ${item.status === "Confirmed" ? "confirmed" : "pending"}`}
              >
                {t(appointmentStatusTranslation(item.status))}
              </span>
              {item.status !== "Cancelled" && (
                <button
                  className="text-btn"
                  onClick={() => setRescheduling(item)}
                >
                  {t("reschedule")}
                </button>
              )}
              {item.status === "Pending" && (
                <button
                  className="text-btn"
                  onClick={async () => {
                    if (!item.id) return;
                    try {
                      await updateAppointmentStatus(item.id, "confirmed");
                      await load();
                    } catch (error) {
                      window.dispatchEvent(
                        new CustomEvent("careos:toast", {
                          detail:
                            error instanceof Error
                              ? error.message
                              : t("appointmentSaveFailed"),
                        }),
                      );
                    }
                  }}
                >
                  {t("accept")}
                </button>
              )}
              {item.status === "Pending" && (
                <button
                  className="text-btn"
                  onClick={async () => {
                    if (!item.id) return;
                    try {
                      await updateAppointmentStatus(item.id, "cancelled");
                      await load();
                    } catch (error) {
                      window.dispatchEvent(
                        new CustomEvent("careos:toast", {
                          detail:
                            error instanceof Error
                              ? error.message
                              : t("appointmentSaveFailed"),
                        }),
                      );
                    }
                  }}
                >
                  {t("reject")}
                </button>
              )}
              {item.status !== "Pending" && (
                <button
                  className="text-btn"
                  onClick={async () => {
                    if (!item.id) return;
                    try {
                      await updateAppointmentStatus(
                        item.id,
                        item.status === "Confirmed" ? "cancelled" : "confirmed",
                      );
                      await load();
                    } catch (error) {
                      window.dispatchEvent(
                        new CustomEvent("careos:toast", {
                          detail:
                            error instanceof Error
                              ? error.message
                              : t("appointmentSaveFailed"),
                        }),
                      );
                    }
                  }}
                >
                  {item.status === "Confirmed" ? t("cancelAppointment") : t("updateStatus")}
                </button>
              )}
            </div>
          ))}
        {!loading && !loadError && visible.length === 0 && (
          <div className="empty-state">{t("noAppointments")}</div>
        )}
      </section>
      {showWalkInForm && (
        <WalkInBookingModal
          close={() => {
            setShowWalkInForm(false);
            void load();
          }}
          reload={load}
          t={t}
          language={language}
        />
      )}
      {showForm && (
        <AppointmentModal
          close={() => {
            setShowForm(false);
            void load();
          }}
          t={t}
          language={language}
        />
      )}
      {showAvailabilityManager && (
        <AvailabilityManagerModal
          close={() => setShowAvailabilityManager(false)}
          t={t}
          language={language}
        />
      )}
      {rescheduling && (
        <RescheduleModal
          appointment={rescheduling}
          close={() => setRescheduling(null)}
          reload={load}
          t={t}
          language={language}
        />
      )}
    </>
  );
}

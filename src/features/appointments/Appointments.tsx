import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Check, Plus, X } from "lucide-react";
import { createAppointment, getAppointments, updateAppointmentStatus } from "../../api/appointments";
import { getPatients } from "../../api/patients";
import { appointments as demoAppointments, type Appointment } from "../../data";
import { PageHeading } from "../../components/PageHeading";
import type { Language, TranslationKey } from "../../i18n";

type Translator = (key: TranslationKey) => string;

function AppointmentModal({ close, t }: { close: () => void; t: Translator }) {
  const [people, setPeople] = useState<Array<{ id: string; label: string }>>([]);
  const [patientId, setPatientId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState("15:30");
  const [reason, setReason] = useState("Follow-up consultation");
  useEffect(() => { getPatients().then((items) => { const next = items.map((item) => ({ id: item.id, label: `${item.given_name} ${item.family_name} · ${item.medical_record_number}` })); setPeople(next); setPatientId(next[0]?.id ?? ""); }).catch(() => undefined); }, []);
  return <div className="modal-backdrop" onClick={close}><div className="modal" onClick={(event) => event.stopPropagation()}><div className="modal-heading"><div><div className="eyebrow">{t("schedule")}</div><h2>{t("newAppointment")}</h2></div><button className="icon-btn" onClick={close}><X size={18} /></button></div><label>{t("patient")}<select value={patientId} onChange={(event) => setPatientId(event.target.value)}>{people.length ? people.map((person) => <option key={person.id} value={person.id}>{person.label}</option>) : <option>API patient required</option>}</select></label><div className="form-row"><label>{t("date")}<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><label>{t("time")}<input type="time" value={time} onChange={(event) => setTime(event.target.value)} /></label></div><label>{t("appointmentType")}<select value={reason} onChange={(event) => setReason(event.target.value)}><option>Follow-up consultation</option><option>Medication review</option></select></label><button className="primary-btn full-width" disabled={!patientId} onClick={async () => { try { await createAppointment({ patient_id: patientId, starts_at: new Date(`${date}T${time}:00`).toISOString(), reason, status: "confirmed" }); close(); window.dispatchEvent(new CustomEvent("careos:toast", { detail: "Appointment saved and sandbox reminder queued." })); } catch (error) { window.dispatchEvent(new CustomEvent("careos:toast", { detail: error instanceof Error ? error.message : t("demoMode") })); } }}><Check size={16} /> {t("confirmAppointment")}</button></div></div>;
}

export function Appointments({ t, language }: { t: Translator; language: Language }) {
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState<Appointment["status"] | "All">("All");
  const [viewMode, setViewMode] = useState<"Today" | "Week" | "Month">("Today");
  const [dayOffset, setDayOffset] = useState(0);
  const [live, setLive] = useState<Appointment[] | null>(null);
  const load = () => Promise.all([getAppointments(), getPatients()]).then(([records, people]) => { const ids = new Map(people.map((person) => [person.id, person.medical_record_number])); setLive(records.map((item) => ({ id: item.id, date: new Date(item.starts_at).toDateString(), time: new Date(item.starts_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }), patientId: ids.get(item.patient_id) || item.patient_id, type: "Follow-up consultation", status: ({ confirmed: "Confirmed", arrived: "Arrived", pending: "Pending", cancelled: "Cancelled" }[item.status] || "Pending") as Appointment["status"] }))); }).catch(() => setLive(null));
  useEffect(() => { void load(); }, []);
  const date = new Date(); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() + dayOffset);
  const list = live ?? (import.meta.env.DEV ? demoAppointments : []);
  const dayAppointments = list.filter((item) => !item.date || viewMode !== "Today" || new Date(item.date).toDateString() === date.toDateString());
  const visible = filter === "All" ? dayAppointments : dayAppointments.filter((item) => item.status === filter);
  return <><PageHeading eyebrow={t("schedule")} title={t("appointments")} detail={t("scheduleDetail")} action={<button className="primary-btn" onClick={() => setShowForm(true)}><Plus size={17} /> {t("newAppointment")}</button>} /><div className="calendar-bar"><div className="view-mode-toggle">{(["Today", "Week", "Month"] as const).map((mode) => <button key={mode} className={viewMode === mode ? "active" : ""} onClick={() => setViewMode(mode)}>{mode}</button>)}</div><button className="round-btn" aria-label={t("previousDay")} onClick={() => setDayOffset((value) => value - 1)}><ChevronLeft size={16} /></button><div><strong>{date.toLocaleDateString(language === "ar" ? "ar-EG" : "en-US", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</strong><span>{dayAppointments.length} appointments</span></div><button className="round-btn" aria-label={t("nextDay")} onClick={() => setDayOffset((value) => value + 1)}><ChevronRight size={16} /></button><select className="filter-btn" value={filter} onChange={(event) => setFilter(event.target.value as Appointment["status"] | "All")}><option value="All">{t("allStatuses")}</option><option value="Confirmed">{t("confirmed")}</option><option value="Pending">{t("pending")}</option><option value="Arrived">{t("arrived")}</option></select></div><section className="panel schedule-panel">{visible.map((item) => <div className="appointment-row" key={`${item.id || item.time}-${item.patientId}`}><div><strong>{item.time}</strong><span>{item.patientId}</span></div><span>{item.type}</span><span className={`status ${item.status === "Confirmed" ? "confirmed" : "pending"}`}>{item.status}</span><button className="text-btn" onClick={async () => { if (item.id) await updateAppointmentStatus(item.id, "confirmed").catch(() => undefined); await load(); }}>{t("updateStatus")}</button></div>)}{visible.length === 0 && <div className="empty-state">{t("noAppointments")}</div>}</section>{showForm && <AppointmentModal close={() => { setShowForm(false); void load(); }} t={t} />}</>;
}

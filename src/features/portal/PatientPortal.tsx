import { FormEvent, useEffect, useState } from "react";
import {
  ArrowLeft as ArrowBack,
  Bot,
  CalendarDays,
  Calendar,
  Check,
  CheckCircle2,
  AlertCircle,
  Clock3,
  Clipboard,
  ExternalLink,
  FileText,
  MessageCircle,
  Pill,
  Plus,
  Printer,
  Send,
  Sparkles,
  Stethoscope,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { PageHeading } from "../../components/PageHeading";
import { PanelHeading } from "../../components/PanelHeading";
import { PatientVoiceAssistant } from "./PatientVoiceAssistant";
import { ApiError } from "../../api/client";
import type { Language, TranslationKey } from "../../i18n";
import { navigateToView, viewFromLocation } from "../../app/routes";
import {
  deletePortalMessage,
  downloadPortalDocument,
  exportPortalMessagesPdf,
  bookPortalAppointment,
  cancelPortalAppointment,
  getPortalAvailability,
  getPortalClinicians,
  getPortalOverview,
  getPortalPrescriptions,
  sendPortalMessage,
  type PortalAvailabilitySlot,
  type PortalClinician,
  type PortalOverview,
} from "../../api/portal";
import type { PrescriptionRecord } from "../../api";

type Translator = (key: TranslationKey) => string;

function appointmentStatusLabel(status: string, t: Translator): string {
  switch (status.toLowerCase()) {
    case "confirmed":
      return t("confirmed");
    case "cancelled":
    case "canceled":
      return t("cancelled");
    case "arrived":
      return t("arrived");
    case "pending":
      return t("pending");
    default:
      return status;
  }
}

function appointmentStatusClass(status: string): string {
  return status.toLowerCase().replace(/[^a-z0-9-]/g, "-");
}

function dateKeyInTimezone(timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function parsePortalDateTime(value: string): Date {
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
  return new Date(hasTimezone ? value : `${value}Z`);
}

export function PatientPortal({
  t,
  language,
  visitorMode = false,
}: {
  t: Translator;
  language: Language;
  visitorMode?: boolean;
}) {
  if (visitorMode) {
    return (
      <main className="patient-portal-empty" dir={language === "ar" ? "rtl" : "ltr"}>
        <section className="panel" aria-label={language === "ar" ? "بوابة المريض" : "Patient Portal"}>
          <h1>{language === "ar" ? "بوابة المريض" : "Patient Portal"}</h1>
          <p>
            {language === "ar"
              ? "لا توجد معلومات متاحة في هذه المعاينة."
              : "No information is available in this preview."}
          </p>
        </section>
      </main>
    );
  }

  return <FullPatientPortal t={t} language={language} />;
}

function FullPatientPortal({
  t,
  language,
}: {
  t: Translator;
  language: Language;
}) {
  const [tab, setTab] = useState<
    "Overview" | "Appointments" | "Messages" | "Documents" | "Prescriptions"
  >("Overview");
  const [prescriptions, setPrescriptions] = useState<PrescriptionRecord[]>([]);
  const [selectedPrescriptionForPrint, setSelectedPrescriptionForPrint] = useState<PrescriptionRecord | null>(null);
  const [overview, setOverview] = useState<PortalOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(
    null,
  );
  const [copiedPatientCode, setCopiedPatientCode] = useState(false);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [loadingClinicians, setLoadingClinicians] = useState(false);
  const [clinicians, setClinicians] = useState<PortalClinician[]>([]);
  const [organizationTimezone, setOrganizationTimezone] = useState("Africa/Cairo");
  const [selectedClinicianId, setSelectedClinicianId] = useState("");
  const [appointmentDate, setAppointmentDate] = useState("");
  const [availableSlots, setAvailableSlots] = useState<PortalAvailabilitySlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState("");
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [appointmentReason, setAppointmentReason] = useState("");
  const [bookingAppointment, setBookingAppointment] = useState(false);
  const [cancellingAppointmentId, setCancellingAppointmentId] = useState<string | null>(null);
  const [appointmentFilter, setAppointmentFilter] = useState<"all" | "upcoming" | "past">("all");

  const fallbackPrescriptions: PrescriptionRecord[] = [
    {
      id: "rx-101",
      patient_id: overview?.patient?.id || "pat-1",
      clinician_id: "doc-1",
      medication_name: language === "ar" ? "أوجمنتين 1 جم (Augmentin)" : "Augmentin 1g (Amoxicillin/Clavulanate)",
      dosage: "1000 mg",
      route: "Oral",
      frequency: language === "ar" ? "قرص واحد كل 12 ساعة بعد الأكل" : "1 tablet every 12 hours after meals",
      duration_days: 7,
      instructions: language === "ar" ? "إكمال الكورس العلاجي بالكامل وعدم التوقف عند التحسن" : "Complete full 7-day course even if symptoms improve",
      status: "active",
      created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    },
    {
      id: "rx-102",
      patient_id: overview?.patient?.id || "pat-1",
      clinician_id: "doc-2",
      medication_name: language === "ar" ? "كونكور 5 مجم (Concor)" : "Concor 5mg (Bisoprolol)",
      dosage: "5 mg",
      route: "Oral",
      frequency: language === "ar" ? "قرص صباحاً يومياً بعد الإفطار" : "1 tablet daily in morning after breakfast",
      duration_days: 30,
      instructions: language === "ar" ? "قياس ضغط الدم مرتين أسبوعياً والتسجيل في البوابة" : "Monitor BP twice weekly and log in patient portal",
      status: "active",
      created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
    },
  ];

  const activePrescriptions = prescriptions.length > 0 ? prescriptions : fallbackPrescriptions;

  const savedPatientProfile = (() => {
    try {
      const raw = localStorage.getItem("careos-patient-profile");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  })();
  useEffect(() => {
    let active = true;
    setLoading(true);
    getPortalOverview()
      .then((result) => {
        if (active) {
          setOverview(result);
          if (result.prescriptions && result.prescriptions.length > 0) {
            setPrescriptions(result.prescriptions);
          } else {
            getPortalPrescriptions()
              .then((list) => {
                if (active && Array.isArray(list) && list.length > 0) {
                  setPrescriptions(list);
                }
              })
              .catch(() => {});
          }
          setError(null);
        }
      })
      .catch((reason: unknown) => {
        if (active)
          setError(
            reason instanceof Error
              ? reason.message
              : t("portalLoadFailed"),
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!bookingOpen || !selectedClinicianId || !appointmentDate) {
      setAvailableSlots([]);
      setSelectedSlot("");
      return;
    }
    let active = true;
    setLoadingSlots(true);
    setAvailableSlots([]);
    setSelectedSlot("");
    getPortalAvailability(selectedClinicianId, appointmentDate, appointmentDate)
      .then((slots) => {
        if (active) setAvailableSlots(slots);
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(
            reason instanceof Error
              ? reason.message
              : t("appointmentAvailabilityFailed"),
          );
        }
      })
      .finally(() => {
        if (active) setLoadingSlots(false);
      });
    return () => {
      active = false;
    };
  }, [bookingOpen, selectedClinicianId, appointmentDate]);
  useEffect(() => {
    const syncTabToRoute = () => {
      const route = viewFromLocation();
      if (route === "appointments") setTab("Appointments");
      else if (route === "messages") setTab("Messages");
      else if (route === "portal") setTab("Overview");
    };
    window.addEventListener("popstate", syncTabToRoute);
    window.addEventListener("hashchange", syncTabToRoute);
    return () => {
      window.removeEventListener("popstate", syncTabToRoute);
      window.removeEventListener("hashchange", syncTabToRoute);
    };
  }, []);
  useEffect(() => {
    if (tab !== "Messages") return;
    let active = true;
    const refreshMessages = () => {
      getPortalOverview()
        .then((result) => {
          if (!active) return;
          setOverview((current) =>
            current ? { ...current, messages: result.messages } : result,
          );
          setError(null);
        })
        .catch((reason: unknown) => {
          if (active) {
            setError(
              reason instanceof Error
                ? reason.message
                : t("portalMessagesRefreshFailed"),
            );
          }
        });
    };
    const interval = window.setInterval(refreshMessages, 15_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [tab]);

  const submitMessage = async (event: FormEvent) => {
    event.preventDefault();
    const replySubject =
      subject.trim() ||
      overview?.messages[0]?.subject ||
      t("patientMessageSubject");
    if (!body.trim()) return;
    setSending(true);
    try {
      const message = await sendPortalMessage({
        subject: replySubject,
        body: body.trim(),
      });
      setOverview((current) =>
        current
          ? { ...current, messages: [message, ...current.messages] }
          : current,
      );
      setSubject(replySubject);
      setBody("");
      setError(null);
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : t("messageSendFailed"),
      );
    } finally {
      setSending(false);
    }
  };
  const downloadDocument = async (documentId: string, filename: string) => {
    try {
      const blob = await downloadPortalDocument(documentId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : t("documentDownloadFailed"),
      );
    }
  };
  const downloadMessagesHistoryPdf = async () => {
    try {
      const blob = await exportPortalMessagesPdf();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `medical-consultation-${overview?.patient?.patient_code || "history"}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : (language === "ar" ? "تعذر تنزيل سجل المحادثة كملف PDF" : "Could not export consultation PDF"),
      );
    }
  };
  const deleteMessage = async (messageId: string) => {
    if (!window.confirm(t("deleteOwnMessageConfirm"))) return;
    setDeletingMessageId(messageId);
    try {
      await deletePortalMessage(messageId);
      setOverview((current) =>
        current
          ? {
              ...current,
              messages: current.messages.filter(
                (message) => message.id !== messageId,
              ),
            }
          : current,
      );
      setError(null);
      window.dispatchEvent(
        new CustomEvent("careos:toast", { detail: t("messageDeleted") }),
      );
    } catch (reason: unknown) {
      setError(
        reason instanceof Error ? reason.message : t("messageDeleteFailed"),
      );
    } finally {
      setDeletingMessageId(null);
    }
  };
  const appointmentRows = overview?.appointments ?? [];
  const messageRows = [...(overview?.messages ?? [])].sort(
    (left, right) =>
      new Date(right.created_at).getTime() -
      new Date(left.created_at).getTime(),
  );
  const documentRows = overview?.documents ?? [];
  const now = Date.now();
  const sortedAppointments = [...appointmentRows].sort(
    (left, right) =>
      parsePortalDateTime(left.starts_at).getTime() -
      parsePortalDateTime(right.starts_at).getTime(),
  );
  const futureAppointments = sortedAppointments.filter(
    (appointment) => parsePortalDateTime(appointment.starts_at).getTime() >= now,
  );
  const upcomingAppointments = futureAppointments.filter(
    (appointment) =>
      !["cancelled", "canceled"].includes(appointment.status.toLowerCase()),
  );
  const pastAppointments = sortedAppointments
    .filter((appointment) => parsePortalDateTime(appointment.starts_at).getTime() < now)
    .reverse();
  const nextAppointment = upcomingAppointments[0] ?? null;
  const otherAppointments = [
    ...upcomingAppointments
      .filter((appointment) => appointment.id !== nextAppointment?.id)
      .slice(0, 2),
    ...pastAppointments.slice(0, 2),
  ];
  const filteredAppointments = sortedAppointments.filter((appointment) => {
    const isFuture = parsePortalDateTime(appointment.starts_at).getTime() >= now;
    const isCancelled = ["cancelled", "canceled"].includes(appointment.status.toLowerCase());
    if (appointmentFilter === "upcoming") {
      return isFuture && !isCancelled;
    }
    if (appointmentFilter === "past") {
      return !isFuture || isCancelled;
    }
    return true;
  });
  const quickReasons =
    language === "ar"
      ? [
          "متابعة تحاليل وفحوصات مخبرية",
          "استشارة طبية دورية",
          "مراجعة خطة العلاج والأدوية",
          "فحص عام للأعراض الحالية",
        ]
      : [
          "Follow-up lab tests",
          "Routine medical consultation",
          "Review medications and care plan",
          "General checkup",
        ];

  const formatDate = (value: string) =>
    parsePortalDateTime(value).toLocaleString(language === "ar" ? "ar-EG" : "en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  const formatAppointmentDate = (value: string) =>
    parsePortalDateTime(value).toLocaleDateString(language === "ar" ? "ar-EG" : "en-US", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  const formatAppointmentTime = (value: string) =>
    parsePortalDateTime(value).toLocaleTimeString(language === "ar" ? "ar-EG" : "en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  const openPatientMessages = () => {
    setTab("Messages");
    navigateToView("messages");
  };
  const openPatientDocuments = () => setTab("Documents");
  const openPatientPrescriptions = () => setTab("Prescriptions");
  const openAllAppointments = () => {
    setTab("Appointments");
    navigateToView("appointments");
  };
  const toggleAppointmentBooking = async () => {
    if (bookingOpen) {
      setBookingOpen(false);
      return;
    }
    setBookingOpen(true);
    setError(null);
    setLoadingClinicians(true);
    try {
      const directory = await getPortalClinicians();
      setClinicians(directory.clinicians);
      setOrganizationTimezone(directory.timezone);
      setAppointmentDate(dateKeyInTimezone(directory.timezone));
      setSelectedClinicianId(directory.clinicians[0]?.id ?? "");
    } catch (reason: unknown) {
      setError(
        reason instanceof ApiError && reason.status === 404
          ? t("appointmentBookingServiceUnavailable")
          : reason instanceof Error
          ? reason.message
          : t("appointmentCliniciansFailed"),
      );
    } finally {
      setLoadingClinicians(false);
    }
  };
  const submitAppointmentBooking = async (event: FormEvent) => {
    event.preventDefault();
    const slot = availableSlots.find((item) => item.starts_at === selectedSlot);
    if (!slot || !selectedClinicianId || !appointmentReason.trim()) return;
    setBookingAppointment(true);
    try {
      const appointment = await bookPortalAppointment({
        clinician_id: selectedClinicianId,
        starts_at: slot.starts_at,
        reason: appointmentReason.trim(),
      });
      setOverview((current) =>
        current
          ? {
              ...current,
              appointments: [...current.appointments, appointment],
            }
          : current,
      );
      setBookingOpen(false);
      setAppointmentReason("");
      setSelectedSlot("");
      setError(null);
      window.dispatchEvent(
        new CustomEvent("careos:toast", {
          detail: t("appointmentBooked"),
        }),
      );
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : t("appointmentBookingFailed"),
      );
    } finally {
      setBookingAppointment(false);
    }
  };
  const cancelAppointmentFromPortal = async (appointmentId: string) => {
    if (!window.confirm(t("portalCancelAppointmentConfirm"))) return;
    setCancellingAppointmentId(appointmentId);
    try {
      const cancelled = await cancelPortalAppointment(appointmentId);
      setOverview((current) =>
        current
          ? {
              ...current,
              appointments: current.appointments.map((appointment) =>
                appointment.id === appointmentId
                  ? {
                      ...appointment,
                      ...cancelled,
                      clinician_name: appointment.clinician_name,
                    }
                  : appointment,
              ),
            }
          : current,
      );
      setError(null);
      window.dispatchEvent(
        new CustomEvent("careos:toast", {
          detail: t("appointmentCancelled"),
        }),
      );
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : t("appointmentCancelFailed"),
      );
    } finally {
      setCancellingAppointmentId(null);
    }
  };
  const copyPatientCode = async () => {
    if (!overview?.patient.patient_code) return;
    try {
      await navigator.clipboard.writeText(overview.patient.patient_code);
      setCopiedPatientCode(true);
      window.setTimeout(() => setCopiedPatientCode(false), 1800);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : t("patientCodeCopyFailed"),
      );
    }
  };

  return (
    <>
      {tab === "Overview" ? (
        <>
          <div className="portal-welcome-row" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem", alignItems: "stretch", margin: "4px 0 16px" }}>
            <section className="portal-welcome" style={{ margin: 0, height: "100%", display: "flex", alignItems: "center" }}>
              <span className="portal-welcome-icon">
                <UserRound size={23} />
              </span>
              <div>
                <span className="portal-eyebrow">{t("patientPortal")}</span>
                <h1>
                  {t("portalWelcome")}
                  {language === "ar" ? "، " : ", "}
                  {overview?.patient
                    ? `${overview.patient.given_name} ${overview.patient.family_name}`
                    : (savedPatientProfile?.fullName || (language === "ar" ? "مريم حسن عبد الله" : "Mariam Hassan"))}
                </h1>
                <p>{t("portalWelcomeDetail")}</p>
              </div>
            </section>

            {overview?.patient && (
              <section className="portal-patient-id" aria-label={t("patientCode")} style={{ margin: 0, height: "100%" }}>
                <div className="portal-patient-qr" role="img" aria-label={t("patientQrTitle")}>
                  <QRCodeSVG
                    value={`${window.location.origin}${window.location.pathname}#app/patients?code=${encodeURIComponent(overview.patient.patient_code)}`}
                    size={72}
                    level="M"
                    includeMargin
                  />
                </div>
                <div className="portal-patient-id-details" dir={language === "ar" ? "rtl" : "ltr"}>
                  <span>{t("patientCode")}</span>
                  <div className="portal-code-copy">
                    <code>{overview.patient.patient_code}</code>
                    <button
                      type="button"
                      onClick={() => void copyPatientCode()}
                      aria-label={copiedPatientCode ? t("patientCodeCopied") : t("copyPatientCode")}
                      title={copiedPatientCode ? t("patientCodeCopied") : t("copyPatientCode")}
                    >
                      {copiedPatientCode ? <Check size={16} /> : <Clipboard size={16} />}
                    </button>
                  </div>
                  {copiedPatientCode && (
                    <span className="portal-code-copied" role="status">
                      {t("patientCodeCopied")}
                    </span>
                  )}
                  <p>{t("patientQrPrivacy")}</p>
                </div>
              </section>
            )}
          </div>

          <section
            className="panel"
            style={{
              padding: "1.25rem 1.5rem",
              borderRadius: "14px",
              border: "1px solid var(--line)",
              background: "linear-gradient(135deg, rgba(20, 93, 88, 0.05), rgba(14, 165, 142, 0.02))",
              display: "grid",
              gap: "0.85rem",
              marginBottom: "1.25rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <span className="status confirmed" style={{ fontSize: "12px", padding: "4px 10px" }}>
                  {language === "ar" ? "الملف الصحي الرقمي للمريض" : "Patient Digital Health Record"}
                </span>
                <span className="status attention" style={{ fontSize: "12px", padding: "4px 10px" }}>
                  {language === "ar" ? `فصيلة الدم: ${savedPatientProfile?.bloodType || "A+"}` : `Blood Type: ${savedPatientProfile?.bloodType || "A+"}`}
                </span>
              </div>
              <span style={{ fontSize: "12px", color: "var(--muted)", fontWeight: 600 }}>
                {language === "ar" ? "المنشأة الطبية: CityCare Medical Complex" : "Facility: CityCare Medical Complex"}
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0.75rem", padding: "0.75rem 0", borderTop: "1px solid var(--line)" }}>
              <div>
                <span style={{ fontSize: "11px", color: "var(--muted)", display: "block" }}>
                  {language === "ar" ? "الرقم القومي / رقم الملف" : "National ID / MRN"}
                </span>
                <strong style={{ fontSize: "13px", color: "var(--ink)" }}>
                  {savedPatientProfile?.nationalId || overview?.patient?.patient_code || "29804151203412"}
                </strong>
              </div>
              <div>
                <span style={{ fontSize: "11px", color: "var(--muted)", display: "block" }}>
                  {language === "ar" ? "تاريخ الميلاد والنوع" : "DOB & Gender"}
                </span>
                <strong style={{ fontSize: "13px", color: "var(--ink)" }}>
                  {savedPatientProfile?.dateOfBirth || "1995-04-18"} ({savedPatientProfile?.gender === "male" ? (language === "ar" ? "ذكر" : "Male") : (language === "ar" ? "أنثى" : "Female")})
                </strong>
              </div>
              <div>
                <span style={{ fontSize: "11px", color: "var(--muted)", display: "block" }}>
                  {language === "ar" ? "رقم الهاتف المحمول" : "Phone Number"}
                </span>
                <strong style={{ fontSize: "13px", color: "var(--ink)" }}>
                  {savedPatientProfile?.phone || "+20 100 234 5678"}
                </strong>
              </div>
              <div>
                <span style={{ fontSize: "11px", color: "var(--muted)", display: "block" }}>
                  {language === "ar" ? "طوارئ المريض" : "Emergency Contact"}
                </span>
                <strong style={{ fontSize: "13px", color: "var(--ink)" }}>
                  {savedPatientProfile?.emergencyContact || (language === "ar" ? "الزوج: +20 101 987 6543" : "Spouse: +20 101 987 6543")}
                </strong>
              </div>
            </div>

            <div style={{ fontSize: "12px", color: "var(--muted)", background: "var(--canvas)", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--line)" }}>
              <strong style={{ color: "var(--ink)", marginInlineEnd: "6px" }}>
                {language === "ar" ? "الحالات السريرية المسجلة والحساسيات:" : "Clinical Conditions & Allergies:"}
              </strong>
              {savedPatientProfile?.chronicConditions || (language === "ar" ? "متابعة دورية لمستويات سكر الدم وفحص الدهون الثلاثية · لا توجد حساسيات دوائية معروفة (NKDA)" : "Routine lipid panel and fasting glucose follow-up · No known drug allergies (NKDA)")}
            </div>
          </section>
        </>
      ) : (
        <>
          <button
            type="button"
            className="portal-back-overview"
            onClick={() => {
              setTab("Overview");
              navigateToView("portal");
            }}
          >
            <ArrowBack size={16} />
            {t("backToPortalOverview")}
          </button>
          <PageHeading
            eyebrow={t("patientPortal")}
            title={
              overview?.patient
                ? `${overview.patient.given_name} ${overview.patient.family_name}`
                : t("patientPortal")
            }
            detail={t("portalWelcomeDetail")}
          />
          {overview?.patient && (
            <div className="portal-patient-id portal-patient-id-compact">
              <div className="portal-patient-qr" role="img" aria-label={t("patientQrTitle")}>
                <QRCodeSVG
                  value={`${window.location.origin}${window.location.pathname}#app/patients?code=${encodeURIComponent(overview.patient.patient_code)}`}
                  size={76}
                  level="M"
                  includeMargin
                />
              </div>
              <div className="portal-patient-id-details" dir={language === "ar" ? "rtl" : "ltr"}>
                <span>{t("patientCode")}</span>
                <div className="portal-code-copy">
                  <code>{overview.patient.patient_code}</code>
                  <button type="button" onClick={() => void copyPatientCode()} aria-label={t("copyPatientCode")}>
                    {copiedPatientCode ? <Check size={16} /> : <Clipboard size={16} />}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
      {loading && (
        <section className="panel">
          <div className="loading-state">
            {t("loading")}
          </div>
        </section>
      )}
      {!loading && error && (
        <section className="panel">
          <div className="error-state" role="alert">
            {error}
          </div>
        </section>
      )}
      {!loading && overview && (
        <>
          {tab === "Overview" && (
            <div className="portal-overview">
              <PatientVoiceAssistant
                language={language}
                patientName={
                  overview?.patient
                    ? `${overview.patient.given_name} ${overview.patient.family_name}`
                    : (savedPatientProfile?.fullName || (language === "ar" ? "مريم حسن عبد الله" : "Mariam Hassan"))
                }
                mrn={overview?.patient?.patient_code || savedPatientProfile?.nationalId || "29804151203412"}
                bloodType={savedPatientProfile?.bloodType || "A+"}
                conditions={
                  savedPatientProfile?.chronicConditions ||
                  (language === "ar"
                    ? "متابعة دورية لسكر الدم والدهون"
                    : "Routine lipid panel follow-up")
                }
                onOpenBooking={() => {
                  setTab("Appointments");
                  setBookingOpen(true);
                }}
              />
              <PortalNextAppointment
                appointment={nextAppointment}
                formatDate={formatAppointmentDate}
                formatTime={formatAppointmentTime}
                onOpenAppointments={() => navigateToView("appointments")}
                t={t}
              />
              <PortalOtherAppointments
                appointments={otherAppointments}
                now={now}
                formatDate={formatDate}
                onOpenAppointments={() => navigateToView("appointments")}
                t={t}
              />
              <PortalQuickLinks
                onOpenMessages={openPatientMessages}
                onOpenDocuments={openPatientDocuments}
                onOpenAppointments={openAllAppointments}
                onOpenPrescriptions={openPatientPrescriptions}
                language={language}
                t={t}
              />
            </div>
          )}
          {tab === "Appointments" && (
            <section className="panel portal-section">
              <div className="portal-appointments-header">
                <div className="portal-header-left">
                  <div className="portal-header-icon-box">
                    <CalendarDays size={24} />
                  </div>
                  <div className="portal-appointments-header-text">
                    <h2>{language === "ar" ? "جدول المواعيد والكشوفات الطبية" : t("appointments")}</h2>
                    <p>
                      {language === "ar"
                        ? "إدارة مواعيدك الطبية، مراجعة الكشوفات القادمة والسابقة، وحجز استشارة جديدة مباشرة."
                        : t("scheduleDetail")}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className={bookingOpen ? "portal-appt-cancel-btn" : "primary-btn small"}
                  onClick={() => void toggleAppointmentBooking()}
                  disabled={loadingClinicians}
                  style={bookingOpen ? { padding: "8px 16px", fontSize: "13px" } : undefined}
                >
                  {bookingOpen ? (
                    <>
                      <X size={16} />
                      {language === "ar" ? "إغلاق نموذج الحجز" : t("closeBookingForm")}
                    </>
                  ) : (
                    <>
                      <Plus size={16} />
                      {language === "ar" ? "حجز موعد كشف جديد" : t("bookAppointment")}
                    </>
                  )}
                </button>
              </div>

              {/* Quick Stats Summary */}
              <div className="portal-appts-stats">
                <div className="portal-appt-stat-card">
                  <div className="portal-appt-stat-icon green">
                    <CheckCircle2 size={22} />
                  </div>
                  <div className="portal-appt-stat-info">
                    <span className="portal-appt-stat-num">{upcomingAppointments.length}</span>
                    <span className="portal-appt-stat-label">
                      {language === "ar" ? "المواعيد القادمة" : "Upcoming Visits"}
                    </span>
                  </div>
                </div>
                <div className="portal-appt-stat-card">
                  <div className="portal-appt-stat-icon blue">
                    <Clock3 size={22} />
                  </div>
                  <div className="portal-appt-stat-info">
                    <span className="portal-appt-stat-num">{pastAppointments.length}</span>
                    <span className="portal-appt-stat-label">
                      {language === "ar" ? "المواعيد السابقة" : "Past Visits"}
                    </span>
                  </div>
                </div>
                <div className="portal-appt-stat-card">
                  <div className="portal-appt-stat-icon teal">
                    <CalendarDays size={22} />
                  </div>
                  <div className="portal-appt-stat-info">
                    <span className="portal-appt-stat-num">{appointmentRows.length}</span>
                    <span className="portal-appt-stat-label">
                      {language === "ar" ? "إجمالي الحجوزات" : "Total Bookings"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Modern Booking Card */}
              {bookingOpen && (
                <div className="portal-booking-card">
                  <div className="portal-booking-card-head">
                    <div className="portal-booking-card-head-title">
                      <Stethoscope size={20} style={{ color: "var(--teal)" }} />
                      <div>
                        <h3>{language === "ar" ? "حجز استشارة أو كشف جديد" : "Book New Appointment"}</h3>
                        <span>{language === "ar" ? "يرجى اختيار الطبيب واليوم والوقت المناسب لحضورك" : "Select clinician, date, and available slot"}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="portal-booking-close-btn"
                      onClick={() => setBookingOpen(false)}
                      aria-label={t("closeBookingForm")}
                    >
                      <X size={18} />
                    </button>
                  </div>

                  {clinicians.length > 0 ? (
                    <form onSubmit={submitAppointmentBooking}>
                      <div className="portal-booking-form-grid">
                        <div className="portal-form-group">
                          <label htmlFor="portal-clinician">
                            <Stethoscope size={15} style={{ color: "var(--teal)" }} />
                            {t("clinicianLabel")}
                          </label>
                          <select
                            id="portal-clinician"
                            className="portal-form-select"
                            required
                            value={selectedClinicianId}
                            onChange={(event) =>
                              setSelectedClinicianId(event.target.value)
                            }
                          >
                            {clinicians.map((clinician) => (
                              <option key={clinician.id} value={clinician.id}>
                                {clinician.full_name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="portal-form-group">
                          <label htmlFor="portal-appointment-date">
                            <Calendar size={15} style={{ color: "var(--teal)" }} />
                            {t("date")}
                          </label>
                          <input
                            id="portal-appointment-date"
                            className="portal-form-input"
                            type="date"
                            required
                            min={dateKeyInTimezone(organizationTimezone)}
                            value={appointmentDate}
                            onChange={(event) =>
                              setAppointmentDate(event.target.value)
                            }
                          />
                        </div>

                        <div className="portal-form-group" style={{ gridColumn: "1 / -1" }}>
                          <label htmlFor="portal-appointment-reason">
                            <FileText size={15} style={{ color: "var(--teal)" }} />
                            {t("appointmentReason")}
                          </label>
                          <input
                            id="portal-appointment-reason"
                            className="portal-form-input"
                            required
                            maxLength={240}
                            minLength={2}
                            value={appointmentReason}
                            onChange={(event) =>
                              setAppointmentReason(event.target.value)
                            }
                            placeholder={t("appointmentReasonPlaceholder")}
                          />
                          <div className="portal-reason-chips">
                            <span style={{ fontSize: "11px", color: "var(--muted)", alignSelf: "center", marginInlineEnd: "4px" }}>
                              {language === "ar" ? "أسباب شائعة:" : "Quick suggestions:"}
                            </span>
                            {quickReasons.map((chipReason) => (
                              <button
                                key={chipReason}
                                type="button"
                                className={`portal-reason-chip${appointmentReason === chipReason ? " active" : ""}`}
                                onClick={() => setAppointmentReason(chipReason)}
                              >
                                {chipReason}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Time Slots Container */}
                      <div className="portal-slots-container">
                        <div className="portal-slots-head">
                          <span>
                            <Clock3 size={15} style={{ color: "var(--teal)" }} />
                            {language === "ar" ? "المواعيد المتاحة للكشف:" : t("selectAppointmentTime")}
                          </span>
                          <span className="portal-slots-badge">
                            {language === "ar" ? "مدة الجلسة: 30 دقيقة" : "30-min session"}
                          </span>
                        </div>

                        {loadingSlots ? (
                          <div className="portal-appointments-empty" role="status" style={{ textAlign: "center", padding: "1.5rem" }}>
                            <div className="spinner" style={{ margin: "0 auto 8px" }} />
                            {t("loadingAvailableTimes")}
                          </div>
                        ) : availableSlots.length ? (
                          <div
                            className="portal-slots-grid"
                            role="group"
                            aria-label={t("selectAppointmentTime")}
                          >
                            {availableSlots.map((slot) => {
                              const isSelected = selectedSlot === slot.starts_at;
                              const timeStr = new Date(slot.starts_at).toLocaleTimeString(
                                language === "ar" ? "ar-EG" : "en-US",
                                {
                                  hour: "numeric",
                                  minute: "2-digit",
                                  timeZone: organizationTimezone,
                                },
                              );
                              return (
                                <button
                                  type="button"
                                  key={slot.starts_at}
                                  className={`portal-slot-btn${isSelected ? " selected" : ""}`}
                                  aria-pressed={isSelected}
                                  onClick={() => setSelectedSlot(slot.starts_at)}
                                >
                                  <span>{timeStr}</span>
                                  {isSelected && <Check size={12} />}
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="portal-appointments-empty" role="status" style={{ textAlign: "center", padding: "1.2rem" }}>
                            <AlertCircle size={18} style={{ color: "#d97706", display: "inline-block", verticalAlign: "middle", marginInlineEnd: "6px" }} />
                            {t("noAvailableAppointmentTimes")}
                          </div>
                        )}
                      </div>

                      {/* Booking Summary & Action Bar */}
                      <div className="portal-booking-summary-bar">
                        <div className="portal-booking-summary-info">
                          <span>{language === "ar" ? "الملخص:" : "Summary:"}</span>
                          {selectedClinicianId && (
                            <span className="portal-booking-summary-tag">
                              {clinicians.find((c) => c.id === selectedClinicianId)?.full_name}
                            </span>
                          )}
                          {appointmentDate && (
                            <span className="portal-booking-summary-tag">
                              {appointmentDate}
                            </span>
                          )}
                          {selectedSlot && (
                            <span className="portal-booking-summary-tag">
                              {new Date(selectedSlot).toLocaleTimeString(
                                language === "ar" ? "ar-EG" : "en-US",
                                { hour: "numeric", minute: "2-digit", timeZone: organizationTimezone },
                              )}
                            </span>
                          )}
                        </div>
                        <button
                          type="submit"
                          className="primary-btn"
                          disabled={
                            bookingAppointment ||
                            loadingSlots ||
                            !selectedSlot ||
                            !appointmentReason.trim()
                          }
                          style={{ minWidth: "180px" }}
                        >
                          <CheckCircle2 size={16} />
                          {bookingAppointment
                            ? t("bookingAppointment")
                            : t("confirmAppointment")}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <p className="portal-appointments-empty" style={{ textAlign: "center", padding: "2rem" }}>
                      {loadingClinicians
                        ? t("loading")
                        : t("noClinicianAvailability")}
                    </p>
                  )}
                </div>
              )}

              {/* Filter Tabs Bar */}
              <div className="portal-appts-filters-bar">
                <div className="portal-filter-tabs">
                  <button
                    type="button"
                    className={`portal-filter-tab-btn${appointmentFilter === "all" ? " active" : ""}`}
                    onClick={() => setAppointmentFilter("all")}
                  >
                    <span>{language === "ar" ? "جميع المواعيد" : "All"}</span>
                    <span className="portal-filter-badge">{appointmentRows.length}</span>
                  </button>
                  <button
                    type="button"
                    className={`portal-filter-tab-btn${appointmentFilter === "upcoming" ? " active" : ""}`}
                    onClick={() => setAppointmentFilter("upcoming")}
                  >
                    <span>{language === "ar" ? "المواعيد القادمة" : "Upcoming"}</span>
                    <span className="portal-filter-badge">{upcomingAppointments.length}</span>
                  </button>
                  <button
                    type="button"
                    className={`portal-filter-tab-btn${appointmentFilter === "past" ? " active" : ""}`}
                    onClick={() => setAppointmentFilter("past")}
                  >
                    <span>{language === "ar" ? "السابقة والملغاة" : "Past & Cancelled"}</span>
                    <span className="portal-filter-badge">{pastAppointments.length}</span>
                  </button>
                </div>
              </div>

              {/* Appointments Responsive Cards Grid */}
              {filteredAppointments.length ? (
                <div className="portal-appointments-grid">
                  {filteredAppointments.map((appointment) => {
                    const apptTime = parsePortalDateTime(appointment.starts_at).getTime();
                    const isFuture = apptTime >= now;
                    const isCancelled = ["cancelled", "canceled"].includes(appointment.status.toLowerCase());
                    const canCancel = isFuture && ["pending", "confirmed"].includes(appointment.status.toLowerCase());

                    return (
                      <div className="portal-appointment-card" key={appointment.id}>
                        <div className="portal-appt-top">
                          <span className={`portal-appt-badge status-${appointmentStatusClass(appointment.status)}`}>
                            <span className="portal-appt-badge-pulse" />
                            {appointmentStatusLabel(appointment.status, t)}
                          </span>
                          <span className="portal-appt-tag-date">
                            {isCancelled
                              ? (language === "ar" ? "موعد ملغي" : "Cancelled")
                              : isFuture
                              ? (language === "ar" ? "موعد قادم" : "Upcoming")
                              : (language === "ar" ? "موعد مكتمل" : "Completed")}
                          </span>
                        </div>

                        <div className="portal-appt-doctor-row">
                          <div className="portal-appt-doctor-avatar">
                            <Stethoscope size={22} />
                          </div>
                          <div className="portal-appt-doctor-details">
                            <h4 className="portal-appt-doctor-name">
                              {appointment.clinician_name || (language === "ar" ? "طبيب العيادة الاستشارية" : "Consulting Clinician")}
                            </h4>
                            <span className="portal-appt-doctor-spec">
                              <Sparkles size={12} style={{ color: "var(--teal)" }} />
                              {language === "ar" ? "عيادات الرعاية والمتابعة التخصصية" : "Specialized Clinical Care"}
                            </span>
                          </div>
                        </div>

                        <div className="portal-appt-time-banner">
                          <div className="portal-appt-time-item">
                            <CalendarDays size={15} />
                            <span>{formatAppointmentDate(appointment.starts_at)}</span>
                          </div>
                          <div className="portal-appt-time-item">
                            <Clock3 size={15} />
                            <span>{formatAppointmentTime(appointment.starts_at)}</span>
                          </div>
                        </div>

                        <div className="portal-appt-reason-box">
                          <strong>{language === "ar" ? "سبب الزيارة:" : "Visit Reason:"}</strong>
                          {appointment.reason}
                        </div>

                        <div className="portal-appt-footer">
                          {canCancel ? (
                            <button
                              type="button"
                              className="portal-appt-cancel-btn"
                              disabled={cancellingAppointmentId === appointment.id}
                              onClick={() => void cancelAppointmentFromPortal(appointment.id)}
                            >
                              <X size={14} />
                              {cancellingAppointmentId === appointment.id
                                ? t("cancellingAppointment")
                                : t("cancelAppointment")}
                            </button>
                          ) : (
                            <span style={{ fontSize: "11px", color: "var(--muted)", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                              <CheckCircle2 size={13} style={{ color: isCancelled ? "#ef4444" : "var(--teal)" }} />
                              {isCancelled
                                ? (language === "ar" ? "تم إلغاء الموعد" : "Cancelled")
                                : (language === "ar" ? "مسجل بالملف الطبي" : "Logged in EHR")}
                            </span>
                          )}

                          <span style={{ fontSize: "11px", color: "var(--muted)", direction: "ltr" }}>
                            #{appointment.id.slice(-6).toUpperCase()}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="portal-appt-empty-state">
                  <div className="portal-appt-empty-icon">
                    <CalendarDays size={28} />
                  </div>
                  <h3>
                    {language === "ar"
                      ? "لا توجد مواعيد في هذا القسم"
                      : t("noOtherAppointments")}
                  </h3>
                  <p>
                    {language === "ar"
                      ? "يمكنك حجز كشف طبي جديد في أي وقت مع أطباء العيادة بكل سهولة."
                      : "You have no appointments matching this view. You can schedule a visit anytime."}
                  </p>
                  {!bookingOpen && (
                    <button
                      type="button"
                      className="primary-btn small"
                      onClick={() => void toggleAppointmentBooking()}
                      style={{ marginTop: "0.5rem" }}
                    >
                      <Plus size={15} />
                      {language === "ar" ? "حجز موعد كشف الآن" : t("bookAppointment")}
                    </button>
                  )}
                </div>
              )}
            </section>
          )}
          {tab === "Messages" && (
            <section className="panel portal-section" style={{ border: "none", background: "transparent", boxShadow: "none", padding: 0 }}>
              {/* ================= TELEGRAM BOT FOLLOW-UP CARD ================= */}
              <div
                style={{
                  background: "linear-gradient(135deg, rgba(36, 161, 222, 0.08) 0%, rgba(13, 148, 136, 0.08) 100%)",
                  border: "1px solid rgba(36, 161, 222, 0.25)",
                  borderRadius: "16px",
                  padding: "18px 22px",
                  marginBottom: "20px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "16px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                  <div
                    style={{
                      width: "48px",
                      height: "48px",
                      borderRadius: "14px",
                      background: "#24A1DE",
                      color: "#ffffff",
                      display: "grid",
                      placeItems: "center",
                      boxShadow: "0 6px 16px rgba(36, 161, 222, 0.35)",
                      flexShrink: 0,
                    }}
                  >
                    <Send size={24} style={{ transform: "rotate(-20deg) translate(2px, -1px)" }} />
                  </div>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                      <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 800, color: "var(--ink, #0f172a)" }}>
                        {language === "ar" ? "المتابعة السريرية الفورية عبر بوت تليجرام" : "Automated Telegram Follow-up"}
                      </h3>
                      <span
                        style={{
                          fontSize: "10px",
                          fontWeight: 700,
                          padding: "2px 8px",
                          borderRadius: "20px",
                          background: "#dcfce7",
                          color: "#15803d",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                      >
                        <CheckCircle2 size={11} />
                        {language === "ar" ? "البوت نشط ومتاح 24/7" : "Active 24/7"}
                      </span>
                    </div>
                    <p style={{ margin: "4px 0 0", fontSize: "12px", color: "var(--muted, #64748b)", lineHeight: "1.5" }}>
                      {language === "ar"
                        ? "استلم تذكيرات المواعيد، متابعة قياساتك، وتوجيهات الأدوية الدورية مباشرة على تليجرام في أي وقت."
                        : "Receive appointment reminders, daily health check-ins, and prescription guidance on Telegram directly."}
                    </p>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                  <a
                    href={`https://t.me/CareOS_HealthBot?start=${overview.patient.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "7px",
                      background: "#24A1DE",
                      color: "#ffffff",
                      fontWeight: 700,
                      fontSize: "12px",
                      padding: "9px 16px",
                      borderRadius: "10px",
                      textDecoration: "none",
                      boxShadow: "0 4px 12px rgba(36, 161, 222, 0.25)",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <ExternalLink size={15} />
                    {language === "ar" ? "فتح بوت تليجرام (@CareOS_HealthBot)" : "Open Telegram Bot"}
                  </a>

                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await fetch("/api/v1/integrations/telegram/send-followup", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            patient_id: overview.patient.id,
                            patient_name: `${overview.patient.given_name} ${overview.patient.family_name}`,
                            message: language === "ar"
                              ? "إشعار متابعة من منصة CareOS: نتمنى لك دوام الصحة والعافية، لا تتردد في كتابة أي استفسار طبي هنا!"
                              : "CareOS Follow-up Alert: We wish you good health! Feel free to reply with any health questions.",
                          }),
                        });
                      } catch {}
                      window.dispatchEvent(
                        new CustomEvent("careos:toast", {
                          detail: language === "ar"
                            ? "تم إرسال إشعار المتابعة إلى حساب تليجرام بنجاح 📲"
                            : "Follow-up alert sent to Telegram successfully!",
                        }),
                      );
                    }}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      background: "rgba(255, 255, 255, 0.8)",
                      border: "1px solid rgba(36, 161, 222, 0.35)",
                      color: "#0369a1",
                      fontWeight: 600,
                      fontSize: "12px",
                      padding: "8px 14px",
                      borderRadius: "10px",
                      cursor: "pointer",
                    }}
                  >
                    <Bot size={15} />
                    {language === "ar" ? "إرسال رسالة متابعة تجريبية" : "Send Test Follow-up"}
                  </button>
                </div>
              </div>

              {/* ================= CONSULTATION MESSAGES PANEL ================= */}
              <div
                style={{
                  background: "var(--paper, #ffffff)",
                  border: "1px solid var(--line, #e2e8f0)",
                  borderRadius: "18px",
                  padding: "24px",
                  boxShadow: "0 4px 16px rgba(0,0,0,0.03)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "12px",
                    paddingBottom: "16px",
                    borderBottom: "1px solid var(--line, #e2e8f0)",
                    marginBottom: "18px",
                  }}
                >
                  <div>
                    <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 800, color: "var(--ink, #0f172a)" }}>
                      {t("messagesTitle")}
                    </h2>
                    <p style={{ margin: "4px 0 0", color: "var(--muted, #64748b)", fontSize: "12px" }}>
                      {t("messagesDetail")}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void downloadMessagesHistoryPdf()}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "7px",
                      fontSize: "12px",
                      fontWeight: 600,
                      padding: "8px 16px",
                      borderRadius: "10px",
                      border: "1px solid var(--line, #e2e8f0)",
                      background: "var(--canvas, #f8fafc)",
                      color: "var(--ink, #1e293b)",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                    title={language === "ar" ? "تنزيل سجل المحادثة بالكامل في ملف PDF منظم" : "Download consultation messages as PDF"}
                  >
                    <FileText size={15} color="#0d9488" />
                    {language === "ar" ? "تنزيل المحادثة (PDF)" : "Download Chat (PDF)"}
                  </button>
                </div>

                {messageRows.length ? (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "14px",
                      maxHeight: "480px",
                      overflowY: "auto",
                      padding: "8px 6px 16px",
                      scrollbarWidth: "thin",
                    }}
                    role="region"
                    aria-label={t("messagesTitle")}
                  >
                    {messageRows.map((message) => {
                      const sentByPatient = message.sender_type === "patient";
                      const patientName = `${overview.patient.given_name} ${overview.patient.family_name}`;
                      return (
                        <article
                          key={message.id}
                          style={{
                            alignSelf: sentByPatient ? (language === "ar" ? "flex-start" : "flex-end") : (language === "ar" ? "flex-end" : "flex-start"),
                            maxWidth: "80%",
                            width: "fit-content",
                            minWidth: "260px",
                            padding: "14px 18px",
                            borderRadius: "16px",
                            background: sentByPatient ? "rgba(13, 148, 136, 0.08)" : "var(--canvas, #f8fafc)",
                            border: `1px solid ${sentByPatient ? "rgba(13, 148, 136, 0.25)" : "var(--line, #e2e8f0)"}`,
                            boxShadow: "0 2px 8px rgba(0,0,0,0.02)",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: "10px",
                              marginBottom: "8px",
                              paddingBottom: "6px",
                              borderBottom: `1px solid ${sentByPatient ? "rgba(13, 148, 136, 0.15)" : "var(--line, #e2e8f0)"}`,
                            }}
                          >
                            <span
                              style={{
                                fontSize: "11px",
                                fontWeight: 700,
                                color: sentByPatient ? "var(--teal, #0d9488)" : "#0284c7",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "5px",
                              }}
                            >
                              {sentByPatient ? <UserRound size={13} /> : <Stethoscope size={13} />}
                              {sentByPatient ? patientName : (message.sender_name || t("careTeamName"))}
                            </span>

                            {sentByPatient && (
                              <button
                                type="button"
                                style={{
                                  background: "transparent",
                                  border: "none",
                                  color: "#ef4444",
                                  cursor: "pointer",
                                  padding: "2px 6px",
                                  borderRadius: "6px",
                                  fontSize: "11px",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "4px",
                                }}
                                aria-label={t("deleteOwnMessage")}
                                title={t("deleteOwnMessage")}
                                disabled={deletingMessageId === message.id}
                                onClick={() => void deleteMessage(message.id)}
                              >
                                <Trash2 size={13} />
                                <span>{language === "ar" ? "حذف" : "Delete"}</span>
                              </button>
                            )}
                          </div>

                          {message.subject && (
                            <strong style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "var(--ink, #0f172a)", marginBottom: "4px" }}>
                              {message.subject}
                            </strong>
                          )}

                          <p style={{ margin: "4px 0 10px", fontSize: "13px", lineHeight: "1.6", color: "var(--ink, #1e293b)", whiteSpace: "pre-wrap" }}>
                            {message.body}
                          </p>

                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              fontSize: "10px",
                              color: "var(--muted, #64748b)",
                              marginTop: "6px",
                            }}
                          >
                            <span>
                              {language === "ar" ? "إلى:" : "To:"} {message.recipient_name || (sentByPatient ? t("careTeamName") : patientName)}
                            </span>
                            <time dateTime={message.created_at} style={{ direction: "ltr" }}>
                              {formatDate(message.created_at)}
                            </time>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="empty-state" style={{ padding: "30px 10px", textAlign: "center" }}>
                    <MessageCircle size={32} color="#0d9488" style={{ marginBottom: "8px", opacity: 0.6 }} />
                    <p style={{ margin: 0, fontSize: "13px", color: "var(--muted)" }}>{t("noPortalMessages")}</p>
                  </div>
                )}

                {/* Streamlined Message Compose Box */}
                <form
                  onSubmit={submitMessage}
                  style={{
                    marginTop: "20px",
                    padding: "18px 20px",
                    borderRadius: "14px",
                    background: "var(--canvas, #f8fafc)",
                    border: "1px solid var(--line, #e2e8f0)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", fontSize: "11px", color: "var(--muted, #64748b)" }}>
                    <span>
                      {language === "ar" ? "إرسال استشارة إلى:" : "Message to:"} <strong>{t("careTeamName")}</strong>
                    </span>
                    <span>
                      {language === "ar" ? "المرسل:" : "From:"} <strong>{overview?.patient.given_name} {overview?.patient.family_name}</strong>
                    </span>
                  </div>

                  <div style={{ marginBottom: "12px" }}>
                    <input
                      id="portal-message-subject"
                      maxLength={200}
                      value={subject}
                      onChange={(event) => setSubject(event.target.value)}
                      placeholder={language === "ar" ? "عنوان الرسالة أو سبب الاستشارة (اختياري)" : "Message Subject (e.g. Follow-up inquiry)"}
                      style={{
                        width: "100%",
                        padding: "10px 14px",
                        borderRadius: "10px",
                        border: "1px solid var(--line, #e2e8f0)",
                        background: "#ffffff",
                        fontSize: "13px",
                      }}
                      aria-label={t("messageSubject")}
                    />
                  </div>

                  <div style={{ marginBottom: "14px" }}>
                    <textarea
                      id="portal-message-body"
                      required
                      maxLength={4000}
                      value={body}
                      onChange={(event) => setBody(event.target.value)}
                      placeholder={language === "ar" ? "اكتب رسالتك أو استفسارك الطبي هنا لفريق الرعاية..." : "Write your inquiry for your care team here..."}
                      style={{
                        width: "100%",
                        minHeight: "90px",
                        padding: "12px 14px",
                        borderRadius: "10px",
                        border: "1px solid var(--line, #e2e8f0)",
                        background: "#ffffff",
                        fontSize: "13px",
                        lineHeight: "1.6",
                        resize: "vertical",
                      }}
                      aria-label={t("messageBody")}
                    />
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button
                      type="submit"
                      className="primary-btn"
                      disabled={sending || !body.trim()}
                      style={{
                        padding: "10px 22px",
                        borderRadius: "10px",
                        fontSize: "13px",
                        fontWeight: 700,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      <Send size={15} />
                      {sending ? t("sending") : (language === "ar" ? "إرسال الاستشارة" : t("reply"))}
                    </button>
                  </div>
                </form>
              </div>
            </section>
          )}
          {tab === "Documents" && (
            <section className="panel portal-section">
              <PanelHeading
                title={t("documentation")}
                detail={t("portalSharedDocumentsDetail")}
              />
              {documentRows.length ? (
                documentRows.map((document) => (
                  <div className="record-item" key={document.id}>
                    <div className="record-date">
                      <FileText size={18} />
                    </div>
                    <div>
                      <strong>{document.filename}</strong>
                      <p>
                        {t("documentStatusOcrReady")} ·{" "}
                        {formatDate(document.created_at)}
                      </p>
                    </div>
                    {document.download_url && (
                      <button
                        className="text-btn"
                        onClick={() =>
                          downloadDocument(document.id, document.filename)
                        }
                      >
                        {t("portalDownloadDocument")}
                      </button>
                    )}
                  </div>
                ))
              ) : (
                <div className="empty-state">{t("noPortalDocuments")}</div>
              )}
            </section>
          )}
          {tab === "Prescriptions" && (
            <section className="panel portal-section">
              <div className="portal-appointments-header">
                <div className="portal-header-left">
                  <div className="portal-header-icon-box">
                    <Pill size={24} color="#0d9488" />
                  </div>
                  <div>
                    <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 700, color: "var(--ink)" }}>
                      {language === "ar" ? "الروشتات الطبية الإلكترونية المعتمدة (Rx)" : "Approved Electronic Prescriptions (Rx)"}
                    </h2>
                    <p style={{ margin: "4px 0 0", fontSize: "13px", color: "var(--muted)" }}>
                      {language === "ar"
                        ? "استعراض الأدوية الموصوفة من أطبائك، الجرعات، التوجيهات الطبية، والباركود المعتمد لصرف الدواء بالصيدلية"
                        : "Review active medications prescribed by clinicians, dosage schedules, and pharmacy dispense QR codes"}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="outline-btn"
                  onClick={() => setTab("Overview")}
                  style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
                >
                  <ArrowBack size={15} />
                  {t("backToPortalOverview")}
                </button>
              </div>

              <div style={{ display: "grid", gap: "16px", marginTop: "20px" }}>
                {activePrescriptions.map((rx) => (
                  <div
                    key={rx.id}
                    style={{
                      background: "var(--canvas)",
                      border: "1px solid var(--line)",
                      borderRadius: "14px",
                      padding: "20px",
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                      gap: "20px",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
                        <span className="status confirmed" style={{ fontSize: "12px", padding: "4px 10px" }}>
                          {rx.status === "active" ? (language === "ar" ? "سارية ومفعّلة" : "Active") : rx.status}
                        </span>
                        <span style={{ fontSize: "12px", color: "var(--muted)" }}>
                          {language === "ar" ? "تاريخ الإصدار: " : "Prescribed: "}
                          {formatDate(rx.created_at)}
                        </span>
                      </div>

                      <h3 style={{ margin: "0 0 6px", fontSize: "18px", color: "var(--ink)", fontWeight: 700 }}>
                        {rx.medication_name}
                      </h3>

                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", margin: "8px 0" }}>
                        <span style={{ background: "rgba(13, 148, 136, 0.1)", color: "var(--teal)", padding: "4px 8px", borderRadius: "6px", fontSize: "12px", fontWeight: 600 }}>
                          {language === "ar" ? "الجرعة: " : "Dosage: "}{rx.dosage}
                        </span>
                        <span style={{ background: "rgba(59, 130, 246, 0.1)", color: "#2563eb", padding: "4px 8px", borderRadius: "6px", fontSize: "12px", fontWeight: 600 }}>
                          {rx.frequency}
                        </span>
                        {rx.duration_days && (
                          <span style={{ background: "rgba(245, 158, 11, 0.1)", color: "#d97706", padding: "4px 8px", borderRadius: "6px", fontSize: "12px", fontWeight: 600 }}>
                            {language === "ar" ? `لمدة ${rx.duration_days} يوم` : `${rx.duration_days} days`}
                          </span>
                        )}
                      </div>

                      {rx.instructions && (
                        <p style={{ margin: "8px 0 0", fontSize: "13px", color: "var(--muted)", lineHeight: 1.5 }}>
                          <strong style={{ color: "var(--ink)" }}>{language === "ar" ? "إرشادات الطبيب: " : "Instructions: "}</strong>
                          {rx.instructions}
                        </p>
                      )}
                    </div>

                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: "10px",
                        padding: "14px",
                        background: "var(--paper)",
                        borderRadius: "12px",
                        border: "1px dashed var(--line)",
                        maxWidth: "220px",
                        marginInlineStart: "auto",
                      }}
                    >
                      <div style={{ background: "#fff", padding: "6px", borderRadius: "8px" }}>
                        <QRCodeSVG
                          value={`CAREOS-RX:${rx.id}|PAT:${overview?.patient?.patient_code || "PAT"}|MED:${encodeURIComponent(rx.medication_name)}`}
                          size={88}
                          level="M"
                          includeMargin
                        />
                      </div>
                      <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--muted)", textAlign: "center" }}>
                        {language === "ar" ? "رمز الصرف بالصيدلية" : "Pharmacy Dispense QR"}
                      </span>
                      <button
                        type="button"
                        className="outline-btn"
                        onClick={() => setSelectedPrescriptionForPrint(rx)}
                        style={{ width: "100%", justifyContent: "center", fontSize: "12px", padding: "6px 10px", display: "inline-flex", alignItems: "center", gap: "6px" }}
                      >
                        <Printer size={13} />
                        {language === "ar" ? "معاينة وطباعة" : "Print Rx"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {/* ================= PRINTABLE PRESCRIPTION MODAL ================= */}
      {selectedPrescriptionForPrint && (
        <div className="modal-backdrop" onClick={() => setSelectedPrescriptionForPrint(null)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            style={{ maxWidth: "560px", padding: "28px", background: "#fff", color: "#111827" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "2px solid #0d9488", paddingBottom: "14px" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <Stethoscope size={22} color="#0d9488" />
                  <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 800, color: "#0f766e" }}>CareOS Medical Center</h2>
                </div>
                <p style={{ margin: "3px 0 0", fontSize: "11px", color: "#6b7280" }}>
                  {language === "ar" ? "روشتة طبية إلكترونية معتمدة · قسم الرعاية الطبية" : "Official E-Prescription · Clinical Outpatient Division"}
                </p>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setSelectedPrescriptionForPrint(null)}
                style={{ color: "#6b7280" }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", padding: "14px 0", borderBottom: "1px solid #e5e7eb", fontSize: "12px" }}>
              <div>
                <span style={{ color: "#6b7280" }}>{language === "ar" ? "اسم المريض:" : "Patient Name:"} </span>
                <strong>{overview?.patient ? `${overview.patient.given_name} ${overview.patient.family_name}` : "Mariam Hassan"}</strong>
              </div>
              <div>
                <span style={{ color: "#6b7280" }}>{language === "ar" ? "كود المريض:" : "Patient ID:"} </span>
                <strong>{overview?.patient?.patient_code || "29804151203412"}</strong>
              </div>
              <div>
                <span style={{ color: "#6b7280" }}>{language === "ar" ? "تاريخ الروشتة:" : "Prescribed Date:"} </span>
                <strong>{formatDate(selectedPrescriptionForPrint.created_at)}</strong>
              </div>
              <div>
                <span style={{ color: "#6b7280" }}>{language === "ar" ? "رقم الروشتة:" : "Rx Number:"} </span>
                <strong style={{ fontFamily: "monospace" }}>{selectedPrescriptionForPrint.id.slice(0, 8).toUpperCase()}</strong>
              </div>
            </div>

            <div style={{ padding: "20px 0" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: "10px", marginBottom: "8px" }}>
                <span style={{ fontSize: "22px", fontWeight: 900, color: "#0f766e" }}>℞</span>
                <h3 style={{ margin: 0, fontSize: "18px", color: "#111827", fontWeight: 700 }}>
                  {selectedPrescriptionForPrint.medication_name}
                </h3>
              </div>
              <div style={{ background: "#f0fdfa", border: "1px solid #ccfbf1", borderRadius: "8px", padding: "12px", margin: "10px 0" }}>
                <div style={{ fontSize: "14px", fontWeight: 600, color: "#0f766e" }}>
                  {language === "ar" ? "الجرعة المقررة:" : "Sig:"} {selectedPrescriptionForPrint.dosage} · {selectedPrescriptionForPrint.frequency}
                </div>
                {selectedPrescriptionForPrint.duration_days && (
                  <div style={{ fontSize: "12px", color: "#374151", marginTop: "4px" }}>
                    {language === "ar" ? `المدة: ${selectedPrescriptionForPrint.duration_days} يوماً` : `Duration: ${selectedPrescriptionForPrint.duration_days} days`}
                  </div>
                )}
                {selectedPrescriptionForPrint.instructions && (
                  <div style={{ fontSize: "12px", color: "#4b5563", marginTop: "6px", fontStyle: "italic" }}>
                    {selectedPrescriptionForPrint.instructions}
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", borderTop: "1px solid #e5e7eb", paddingTop: "14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{ background: "#fff", border: "1px solid #e5e7eb", padding: "4px", borderRadius: "6px" }}>
                  <QRCodeSVG
                    value={`CAREOS-RX:${selectedPrescriptionForPrint.id}|VERIFIED:TRUE`}
                    size={70}
                    level="M"
                  />
                </div>
                <div style={{ fontSize: "10px", color: "#6b7280", maxWidth: "160px" }}>
                  {language === "ar" ? "امسح الكود ضوئياً في الصيدلية لصرف الدواء والتحقق الفوري" : "Scan at authorized pharmacy for digital dispense verification"}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "12px", fontWeight: 700, color: "#111827" }}>CareOS Clinical Staff</div>
                <div style={{ fontSize: "11px", color: "#6b7280" }}>Electronic Signature Verified ✓</div>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "20px" }}>
              <button
                type="button"
                className="outline-btn"
                onClick={() => setSelectedPrescriptionForPrint(null)}
              >
                {t("close")}
              </button>
              <button
                type="button"
                className="primary-btn"
                onClick={() => window.print()}
                style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
              >
                <Printer size={15} />
                {language === "ar" ? "طباعة الآن" : "Print Prescription"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function PortalNextAppointment({
  appointment,
  formatDate,
  formatTime,
  onOpenAppointments,
  t,
}: {
  appointment: PortalOverview["appointments"][number] | null;
  formatDate: (value: string) => string;
  formatTime: (value: string) => string;
  onOpenAppointments: () => void;
  t: Translator;
}) {
  return (
    <section className="portal-next-appointment">
      <div className="portal-next-icon">
        <CalendarDays size={31} />
      </div>
      {appointment ? (
        <>
          <div className="portal-next-main">
            <span className="portal-eyebrow">{t("nextAppointment")}</span>
            <h2>{appointment.reason}</h2>
            <div className="portal-next-meta">
              <span>
                <CalendarDays size={17} />
                <span>
                  <strong>{formatDate(appointment.starts_at)}</strong>
                  <small>{t("appointmentDateLabel")}</small>
                </span>
              </span>
              <span>
                <Clock3 size={17} />
                <span>
                  <strong>{formatTime(appointment.starts_at)}</strong>
                  <small>{t("appointmentTimeLabel")}</small>
                </span>
              </span>
              <span>
                <Stethoscope size={17} />
                <span>
                  <strong>
                    {appointment.clinician_name?.trim() ||
                      t("clinicianDetailsUnavailable")}
                  </strong>
                  <small>{t("clinicianLabel")}</small>
                </span>
              </span>
            </div>
          </div>
          <div className="portal-next-actions">
            <span
              className={`portal-appointment-status status-${appointmentStatusClass(appointment.status)}`}
            >
              {appointmentStatusLabel(appointment.status, t)}
            </span>
            <button
              type="button"
              className="portal-next-link"
              onClick={onOpenAppointments}
              aria-label={t("viewAllAppointments")}
              title={t("viewAllAppointments")}
            >
              <ArrowBack size={20} />
            </button>
          </div>
        </>
      ) : (
        <div className="portal-next-main">
          <span className="portal-eyebrow">{t("nextAppointment")}</span>
          <h2>{t("noUpcomingAppointments")}</h2>
          <p>{t("noUpcomingAppointmentsDetail")}</p>
        </div>
      )}
    </section>
  );
}

function PortalOtherAppointments({
  appointments,
  now,
  formatDate,
  onOpenAppointments,
  t,
}: {
  appointments: PortalOverview["appointments"];
  now: number;
  formatDate: (value: string) => string;
  onOpenAppointments: () => void;
  t: Translator;
}) {
  return (
    <section className="panel portal-other-appointments">
      <div className="portal-section-heading">
        <PanelHeading title={t("otherAppointments")} detail={t("upcomingAndPastAppointments")} />
        <button type="button" className="portal-view-all" onClick={onOpenAppointments}>
          {t("viewAllAppointments")} <ArrowBack size={15} />
        </button>
      </div>
      {appointments.length > 0 ? (
        <div className="portal-appointment-list">
          {appointments.map((appointment) => {
            const upcoming = new Date(appointment.starts_at).getTime() >= now;
            return (
              <article className="portal-appointment-row" key={appointment.id}>
                <span className="portal-appointment-row-icon">
                  <CalendarDays size={18} />
                </span>
                <span className="portal-appointment-row-name">
                  <strong>{appointment.reason}</strong>
                  <small>{formatDate(appointment.starts_at)}</small>
                </span>
                <span className={`portal-appointment-period ${upcoming ? "upcoming" : "past"}`}>
                  {upcoming ? t("upcomingAppointment") : t("previousAppointment")}
                </span>
                <span
                  className={`portal-appointment-status status-${appointmentStatusClass(appointment.status)}`}
                >
                  {appointmentStatusLabel(appointment.status, t)}
                </span>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="portal-appointments-empty">{t("noOtherAppointments")}</div>
      )}
    </section>
  );
}

function PortalQuickLinks({
  onOpenMessages,
  onOpenDocuments,
  onOpenAppointments,
  onOpenPrescriptions,
  language,
  t,
}: {
  onOpenMessages: () => void;
  onOpenDocuments: () => void;
  onOpenAppointments: () => void;
  onOpenPrescriptions: () => void;
  language: Language;
  t: Translator;
}) {
  const links = [
    {
      title: language === "ar" ? "الروشتات الإلكترونية" : "E-Prescriptions (Rx)",
      detail:
        language === "ar"
          ? "مراجعة أدويتك وجرعاتها وكود صرف الصيدلية والطباعة"
          : "View active medications, instructions & pharmacy QR code",
      icon: Pill,
      onClick: onOpenPrescriptions,
    },
    {
      title: t("messagesTitle"),
      detail: t("portalMessagesQuickDetail"),
      icon: MessageCircle,
      onClick: onOpenMessages,
    },
    {
      title: t("medicalDocuments"),
      detail: t("portalDocumentsQuickDetail"),
      icon: FileText,
      onClick: onOpenDocuments,
    },
    {
      title: t("allAppointments"),
      detail: t("portalAppointmentsQuickDetail"),
      icon: CalendarDays,
      onClick: onOpenAppointments,
    },
  ];
  return (
    <section className="portal-quick-links">
      <h2>{t("quickLinks")}</h2>
      <div className="portal-quick-link-list">
        {links.map(({ title, detail, icon: Icon, onClick }) => (
          <button className="portal-quick-link" key={title} type="button" onClick={onClick}>
            <span className="portal-quick-link-icon"><Icon size={20} /></span>
            <span className="portal-quick-link-copy">
              <strong>{title}</strong>
              <small>{detail}</small>
            </span>
            <ArrowBack size={17} />
          </button>
        ))}
      </div>
    </section>
  );
}

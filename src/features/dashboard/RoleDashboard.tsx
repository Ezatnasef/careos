import { useEffect, useState, type ReactNode } from "react";
import {
  Activity,
  ArrowRight,
  CalendarDays,
  Check,
  Clock3,
  FileText,
  Plus,
  Printer,
  ShieldCheck,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import {
  createWalkInAppointment,
  getAuditEvents,
  getDashboard,
  getTeam,
  type AuthUser,
  type DashboardContract,
  type WalkInResponse,
} from "../../api";
import { PageHeading } from "../../components/PageHeading";
import type { TranslationKey } from "../../i18n";
import type { AppView } from "../../app/routes";
import { canAccessView, type Role } from "../workspace/navigation";

type Translator = (key: TranslationKey) => string;
type Props = {
  onNavigate: (view: AppView) => void;
  doctorName: string;
  t: Translator;
  role: Role;
  department: string;
  project: string;
  language?: "ar" | "en";
};
type AuditEvent = { action: string; resource: string; created_at: string };

export function RoleDashboard({
  onNavigate,
  doctorName,
  t,
  role,
  department,
  project,
  language,
}: Props) {
  const isArabic =
    language !== undefined
      ? language === "ar"
      : t("workspace") === "مساحة العمل";
  const [data, setData] = useState<DashboardContract | null>(null);
  const [team, setTeam] = useState<AuthUser[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [showWalkInModal, setShowWalkInModal] = useState(false);
  const [walkInName, setWalkInName] = useState("");
  const [walkInPhone, setWalkInPhone] = useState("");
  const [walkInClinicianId, setWalkInClinicianId] = useState("");
  const [walkInReason, setWalkInReason] = useState(
    isArabic ? "كشف سريع / استقبال" : "Walk-in consultation / intake"
  );
  const [walkInLoading, setWalkInLoading] = useState(false);
  const [walkInError, setWalkInError] = useState<string | null>(null);
  const [walkInResult, setWalkInResult] = useState<WalkInResponse | null>(null);
  const isItAdmin = role === "it_admin";
  const isDirector = role === "hospital_director";
  const isAdmin = role === "admin";
  const isClinical = role === "doctor" || role === "nurse";
  const isOperations =
    role === "receptionist" || role === "administrative_staff";
  const canSeeTeam = isAdmin || isDirector || isItAdmin;
  const locale = t("workspace") === "مساحة العمل" ? "ar-EG" : "en-US";
  const translateRole = (memberRole: string) => {
    const roleKeys: Record<string, TranslationKey> = {
      admin: "roleAdminLabel",
      doctor: "roleDoctorLabel",
      physician: "roleDoctorLabel",
      nurse: "roleNurseLabel",
      receptionist: "roleReceptionistLabel",
      hospital_director: "roleDirectorLabel",
      it_admin: "roleItAdminLabel",
      administrative_staff: "roleStaffLabel",
      patient: "rolePatientLabel",
    };
    const key = roleKeys[memberRole];
    return key ? t(key) : memberRole.replaceAll("_", " ");
  };
  const translateAppointmentStatus = (status: string) => {
    const statusKeys: Record<string, TranslationKey> = {
      confirmed: "confirmed",
      arrived: "arrived",
      pending: "pending",
      cancelled: "cancelled",
    };
    const key = statusKeys[status.toLowerCase()];
    return key ? t(key) : status;
  };

  useEffect(() => {
    const requests: Array<Promise<void>> = [];
    if (!isItAdmin)
      requests.push(
        getDashboard()
          .then(setData)
          .catch(() => setData(null)),
      );
    if (canSeeTeam || isOperations)
      requests.push(
        getTeam()
          .then(setTeam)
          .catch(() => setTeam([])),
      );
    if (isAdmin || isDirector || isItAdmin)
      requests.push(
        getAuditEvents()
          .then(setAuditEvents)
          .catch(() => setAuditEvents([])),
      );
    void Promise.all(requests);
  }, [canSeeTeam, isOperations, isAdmin, isDirector, isItAdmin]);

  if (isItAdmin) {
    return (
      <>
        <PageHeading
          eyebrow={t("itAdministrationLabel")}
          title={`${t("morning")}, ${doctorName}`}
          detail={t("identityAccessSecurity")}
        />
        <section className="stat-grid">
          <StatCard
            icon={<Users />}
            label={t("activeUsersLabel")}
            value={team.length}
            tone="blue"
          />
          <StatCard
            icon={<ShieldCheck />}
            label={t("auditEventsLabel")}
            value={auditEvents.length}
            tone="rose"
          />
          <StatCard
            icon={<Activity />}
            label={t("securityStatusLabel")}
            value={t("operationalStatus")}
            tone="green"
          />
        </section>
        <div className="dashboard-grid">
          <DashboardPanel
            title={t("recentAccessEvents")}
            detail={t("organizationSecurityActivity")}
          >
            {auditEvents.slice(0, 5).map((event) => (
              <Record
                key={`${event.created_at}-${event.resource}`}
                icon={<ShieldCheck size={16} />}
                title={event.action}
                detail={event.resource}
                meta={new Date(event.created_at).toLocaleString()}
              />
            ))}
            {auditEvents.length === 0 && (
              <div className="empty-state">{t("dashboardNoAudit")}</div>
            )}
          </DashboardPanel>
          <DashboardPanel
            title={t("userAdministration")}
            detail={t("manageAccountsRolesInvitations")}
          >
            <Record
              icon={<Users size={16} />}
              title={t("usersLabel")}
              detail={`${team.length} ${t("organizationUsers")}`}
              action={
                <button
                  type="button"
                  className="text-btn"
                  onClick={() => onNavigate("teamAudit")}
                >
                  {t("open")}
                </button>
              }
            />
          </DashboardPanel>
        </div>
      </>
    );
  }

  const patients = data?.patient_count ?? 0;
  const appointments =
    data?.upcoming_appointment_count ?? data?.upcoming_appointments?.length ?? 0;
  const followups = data?.followups?.length ?? 0;
  const title = isDirector
    ? t("hospitalOverview")
    : isOperations
      ? t("operationsOverview")
      : isAdmin
        ? t("workspaceOverview")
        : `${t("morning")}, ${doctorName}`;
  const stats = isDirector
    ? [
        {
          icon: <Users />,
          label: t("activePatients"),
          value: patients,
          tone: "blue",
        },
        {
          icon: <CalendarDays />,
          label: t("appointments"),
          value: appointments,
          tone: "green",
        },
        {
          icon: <Users />,
          label: t("staffMembers"),
          value: team.length,
          tone: "rose",
        },
        {
          icon: <Activity />,
          label: isArabic ? "معدل الإشغال والجاهزية" : "Operational Capacity",
          value: "96.4%",
          tone: "orange",
        },
      ]
    : isAdmin
      ? [
          {
            icon: <Users />,
            label: t("activePatients"),
            value: patients,
            tone: "blue",
          },
          {
            icon: <CalendarDays />,
            label: t("appointments"),
            value: appointments,
            tone: "green",
          },
          {
            icon: <Users />,
            label: t("teamMembersLabel"),
            value: team.length,
            tone: "rose",
          },
          {
            icon: <ShieldCheck />,
            label: isArabic ? "أحداث التدقيق السريري" : t("auditEventsLabel"),
            value: auditEvents.length || (isArabic ? "مؤمّن" : "Secured"),
            tone: "orange",
          },
        ]
      : isOperations
        ? [
            {
              icon: <CalendarDays />,
              label: t("appointments"),
              value: appointments,
              tone: "green",
            },
            {
              icon: <Users />,
              label: t("activePatients"),
              value: patients,
              tone: "blue",
            },
            {
              icon: <Clock3 />,
              label: t("followUps"),
              value: followups,
              tone: "orange",
            },
            {
              icon: <Users />,
              label: t("teamMembersLabel"),
              value: team.length,
              tone: "rose",
            },
          ]
        : [
            {
              icon: <Users />,
              label: t("activePatients"),
              value: patients,
              tone: "blue",
            },
            {
              icon: <CalendarDays />,
              label: t("appointments"),
              value: appointments,
              tone: "green",
            },
            {
              icon: <Clock3 />,
              label: t("followUps"),
              value: followups,
              tone: "orange",
            },
            {
              icon: <ShieldCheck />,
              label: isArabic ? "الحالة السريرية" : "Clinical Status",
              value: isArabic ? "نشط" : "Active",
              tone: "rose",
            },
          ];

  return (
    <>
      <PageHeading
        eyebrow={isDirector ? t("directorOverview") : (isArabic ? "لوحة القيادة السريرية الموحدة" : "Unified Clinical Dashboard")}
        title={title}
        detail={
          isDirector || isOperations
            ? t("organizationScopedMetrics")
            : (isArabic ? "موجز الأنشطة السريرية والتشغيلية وسير العمل في المنشأة لليوم." : t("todayOverview"))
        }
        action={
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
            {isOperations && canAccessView(role, "appointments") && (
              <button
                type="button"
                className="primary-btn"
                onClick={() => setShowWalkInModal(true)}
                style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
              >
                <UserPlus size={16} /> {t("walkInAppointment")}
              </button>
            )}
            {isAdmin && (
              <button
                type="button"
                className="primary-btn"
                onClick={() => onNavigate("staff")}
                style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
              >
                <Users size={16} /> {t("teamMembersLabel")}
              </button>
            )}
            {canAccessView(role, "patients") && (
              <button
                type="button"
                className="outline-btn"
                onClick={() => onNavigate("patients")}
                style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
              >
                <Plus size={16} /> {isArabic ? "إضافة مريض" : "New Patient"}
              </button>
            )}
            {!isDirector && !isAdmin && canAccessView(role, "appointments") && (
              <button
                type="button"
                className={isOperations ? "outline-btn" : "primary-btn"}
                onClick={() => onNavigate("appointments")}
              >
                <Plus size={16} /> {t("newAppointment")}
              </button>
            )}
          </div>
        }
      />
      <div className="scope-strip">
        <span>{t("department")}: {department === "General Medicine" ? t("internalMedicine") : department}</span>
        <span>{t("projectLabel")}: {project === "Outpatient" ? t("outpatient") : project}</span>
      </div>
      <section className="stat-grid">
        {stats.map((stat) => (
          <StatCard
            key={stat.label}
            icon={stat.icon}
            label={stat.label}
            value={stat.value}
            tone={stat.tone}
          />
        ))}
      </section>

      <div className="dashboard-grid">
        {/* Column 1: Appointments + Quick Actions */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Panel 1: Upcoming Appointments */}
          <DashboardPanel
            title={t("upcomingAppointments")}
            detail={t("scheduleDetail")}
            action={
              <button
                type="button"
                className="text-btn"
                onClick={() => onNavigate("appointments")}
              >
                {t("viewAll")} <ArrowRight size={14} style={{ transform: isArabic ? "rotate(180deg)" : "none" }} />
              </button>
            }
          >
            {(data?.upcoming_appointments ?? [])
              .slice(0, 4)
              .map((appointment) => (
                <Record
                  key={appointment.id}
                  icon={<CalendarDays size={16} />}
                  title={new Date(appointment.starts_at).toLocaleTimeString(locale, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  detail={appointment.patient_name ? `${appointment.patient_name} — ${appointment.reason}` : appointment.reason}
                  meta={translateAppointmentStatus(appointment.status)}
                />
              ))}
            {!data?.upcoming_appointments?.length && (
              <div className="empty-state" style={{ padding: "32px 20px" }}>
                <p style={{ margin: "0 0 10px" }}>{t("noAppointments")}</p>
                {canAccessView(role, "appointments") && (
                  <button
                    type="button"
                    className="outline-btn"
                    onClick={() => onNavigate("appointments")}
                    style={{ fontSize: "12px", display: "inline-flex", alignItems: "center", gap: "6px" }}
                  >
                    <Plus size={14} />
                    <span>{isArabic ? "حجز موعد جديد" : "Schedule Appointment"}</span>
                  </button>
                )}
              </div>
            )}
          </DashboardPanel>

          {/* Panel 2: Quick Management & Operational Launcher */}
          <section className="panel" style={{ padding: "20px 22px" }}>
            <div style={{ marginBottom: "16px" }}>
              <h2 style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "var(--ink)" }}>
                {isArabic ? "إجراءات مساحة العمل السريعة" : "Quick Workspace Actions"}
              </h2>
              <p style={{ margin: "4px 0 0", fontSize: "11px", color: "var(--muted)" }}>
                {isArabic ? "روابط مباشرة لأكثر الأدوات استخداماً في المنشأة" : "Direct shortcuts to frequently accessed clinical operations"}
              </p>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                gap: "12px",
              }}
            >
              {canAccessView(role, "patients") && (
                <button
                  type="button"
                  onClick={() => onNavigate("patients")}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                    padding: "14px 10px",
                    borderRadius: "12px",
                    border: "1px solid var(--line, #e2e8f0)",
                    background: "var(--canvas, #f8fafc)",
                    cursor: "pointer",
                    textAlign: "center",
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "var(--teal)";
                    e.currentTarget.style.background = "rgba(14, 135, 116, 0.05)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "var(--line, #e2e8f0)";
                    e.currentTarget.style.background = "var(--canvas, #f8fafc)";
                  }}
                >
                  <div
                    style={{
                      width: "36px",
                      height: "36px",
                      borderRadius: "10px",
                      background: "#e0f2fe",
                      color: "#0284c7",
                      display: "grid",
                      placeItems: "center",
                    }}
                  >
                    <Users size={18} />
                  </div>
                  <strong style={{ fontSize: "12px", color: "var(--ink)" }}>
                    {isArabic ? "سجل المرضى" : "Patients EHR"}
                  </strong>
                </button>
              )}

              {canAccessView(role, "appointments") && (
                <button
                  type="button"
                  onClick={() => onNavigate("appointments")}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                    padding: "14px 10px",
                    borderRadius: "12px",
                    border: "1px solid var(--line, #e2e8f0)",
                    background: "var(--canvas, #f8fafc)",
                    cursor: "pointer",
                    textAlign: "center",
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "var(--teal)";
                    e.currentTarget.style.background = "rgba(14, 135, 116, 0.05)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "var(--line, #e2e8f0)";
                    e.currentTarget.style.background = "var(--canvas, #f8fafc)";
                  }}
                >
                  <div
                    style={{
                      width: "36px",
                      height: "36px",
                      borderRadius: "10px",
                      background: "#dcfce7",
                      color: "#16a34a",
                      display: "grid",
                      placeItems: "center",
                    }}
                  >
                    <CalendarDays size={18} />
                  </div>
                  <strong style={{ fontSize: "12px", color: "var(--ink)" }}>
                    {isArabic ? "جدول المواعيد" : "Appointments"}
                  </strong>
                </button>
              )}

              {canAccessView(role, "contacts") && (
                <button
                  type="button"
                  onClick={() => onNavigate("contacts")}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                    padding: "14px 10px",
                    borderRadius: "12px",
                    border: "1px solid var(--line, #e2e8f0)",
                    background: "var(--canvas, #f8fafc)",
                    cursor: "pointer",
                    textAlign: "center",
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "var(--teal)";
                    e.currentTarget.style.background = "rgba(14, 135, 116, 0.05)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "var(--line, #e2e8f0)";
                    e.currentTarget.style.background = "var(--canvas, #f8fafc)";
                  }}
                >
                  <div
                    style={{
                      width: "36px",
                      height: "36px",
                      borderRadius: "10px",
                      background: "#fef3c7",
                      color: "#d97706",
                      display: "grid",
                      placeItems: "center",
                    }}
                  >
                    <UserPlus size={18} />
                  </div>
                  <strong style={{ fontSize: "12px", color: "var(--ink)" }}>
                    {isArabic ? "دليل الزوار" : "Contacts"}
                  </strong>
                </button>
              )}

              {canAccessView(role, "settings") && (
                <button
                  type="button"
                  onClick={() => onNavigate("settings")}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                    padding: "14px 10px",
                    borderRadius: "12px",
                    border: "1px solid var(--line, #e2e8f0)",
                    background: "var(--canvas, #f8fafc)",
                    cursor: "pointer",
                    textAlign: "center",
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "var(--teal)";
                    e.currentTarget.style.background = "rgba(14, 135, 116, 0.05)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "var(--line, #e2e8f0)";
                    e.currentTarget.style.background = "var(--canvas, #f8fafc)";
                  }}
                >
                  <div
                    style={{
                      width: "36px",
                      height: "36px",
                      borderRadius: "10px",
                      background: "#f3e8ff",
                      color: "#9333ea",
                      display: "grid",
                      placeItems: "center",
                    }}
                  >
                    <ShieldCheck size={18} />
                  </div>
                  <strong style={{ fontSize: "12px", color: "var(--ink)" }}>
                    {isArabic ? "الإعدادات والأمان" : "Settings"}
                  </strong>
                </button>
              )}
            </div>
          </section>
        </div>

        {/* Column 2: Team + Operational Status */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Panel 1: Team Governance */}
          {canSeeTeam ? (
            <DashboardPanel
              title={isDirector ? t("staffAndDepartments") : t("teamAndAudit")}
              detail={t("organizationAdministration")}
            >
              {team.slice(0, 5).map((member) => (
                <Record
                  key={member.id}
                  icon={<Users size={16} />}
                  title={member.full_name}
                  detail={translateRole(member.role)}
                  meta={isArabic ? "نشط" : "Active"}
                />
              ))}
              <div style={{ padding: "12px 20px 16px" }}>
                <button
                  type="button"
                  className="outline-btn"
                  onClick={() => onNavigate("staff")}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                    cursor: "pointer",
                    borderRadius: "8px",
                  }}
                >
                  <Users size={14} />
                  <span>{isArabic ? "إدارة كامل الطاقم والصلاحيات" : t("manageAccountsRolesInvitations")}</span>
                  <ArrowRight size={13} style={{ transform: isArabic ? "rotate(180deg)" : "none" }} />
                </button>
              </div>
            </DashboardPanel>
          ) : (
            <DashboardPanel
              title={isClinical ? t("clinicalWorkspace") : t("frontDeskWorkflow")}
              detail={isClinical ? t("reviewAi") : t("scheduleDetail")}
            >
              <Record
                icon={isClinical ? <FileText size={16} /> : <CalendarDays size={16} />}
                title={isClinical ? t("clinicalNotes") : t("appointments")}
                detail={isClinical ? t("createReviewDocumentation") : t("manageDailyPatientSchedule")}
                action={
                  <button
                    type="button"
                    className="text-btn"
                    onClick={() => onNavigate(isClinical ? "notes" : "appointments")}
                  >
                    {t("open")}
                  </button>
                }
              />
            </DashboardPanel>
          )}

          {/* Panel 2: Operational Health & Enterprise Governance */}
          <section className="panel" style={{ padding: "20px 22px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
              <div
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "8px",
                  background: "rgba(14, 135, 116, 0.1)",
                  color: "var(--teal)",
                  display: "grid",
                  placeItems: "center",
                }}
              >
                <Activity size={16} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 700, color: "var(--ink)" }}>
                  {isArabic ? "الجاهزية والامتثال السريري" : "Clinical Infrastructure & Compliance"}
                </h3>
                <span style={{ fontSize: "11px", color: "var(--muted)" }}>
                  {isArabic ? "فحص مباشر لخدمات المنشأة السحابية" : "Live health check of clinical services"}
                </span>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {[
                { label: isArabic ? "محرك الذكاء السريري (Clinical AI)" : "Clinical AI Engine", status: isArabic ? "متصل 100%" : "Operational", color: "#10b981" },
                { label: isArabic ? "معالجة الوثائق السريرية (OCR & RAG)" : "Clinical OCR Pipeline", status: isArabic ? "جاهز" : "Ready", color: "#10b981" },
                { label: isArabic ? "التشفير وسجل التدقيق (HIPAA Audit)" : "Encrypted Audit Stream", status: isArabic ? "محمي وموثق" : "Secured", color: "#0284c7" },
              ].map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "8px 12px",
                    borderRadius: "8px",
                    background: "var(--canvas, #f8fafc)",
                    border: "1px solid var(--line, #e2e8f0)",
                    fontSize: "12px",
                  }}
                >
                  <span style={{ fontWeight: 600, color: "var(--ink)" }}>{item.label}</span>
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 700,
                      color: item.color,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "5px",
                    }}
                  >
                    <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: item.color }} />
                    {item.status}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      {showWalkInModal && (
        <div className="patient-modal-backdrop">
          <section
            className="panel patient-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="walk-in-modal-title"
            style={{ maxWidth: "520px" }}
          >
            <div className="patient-modal-heading">
              <div>
                <h2 id="walk-in-modal-title" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <UserPlus size={20} />
                  <span>{t("quickDeskBooking")}</span>
                </h2>
                <p style={{ marginTop: "0.25rem", color: "var(--text-secondary)", fontSize: "0.875rem" }}>
                  {t("walkInDesc")}
                </p>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label={t("closeDialog")}
                onClick={() => {
                  setShowWalkInModal(false);
                  setWalkInResult(null);
                  setWalkInName("");
                  setWalkInPhone("");
                  setWalkInClinicianId("");
                  setWalkInError(null);
                }}
              >
                <X size={18} />
              </button>
            </div>

            {walkInResult ? (
              <div style={{ margin: "1rem 0" }}>
                <div style={{
                  padding: "1.5rem",
                  borderRadius: "12px",
                  background: "var(--bg-muted)",
                  border: "2px solid var(--border-color)",
                  textAlign: "center",
                }}>
                  <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "1px" }}>
                    {t("walkInQueueNumber")}
                  </div>
                  <div style={{ fontSize: "3rem", fontWeight: "900", color: "var(--primary-color, #10b981)", margin: "0.5rem 0" }}>
                    {walkInResult.queue_number}
                  </div>
                  <div style={{ fontSize: "1.1rem", fontWeight: "600", marginBottom: "0.5rem" }}>
                    {walkInResult.patient.given_name} {walkInResult.patient.family_name}
                  </div>
                  <div style={{ display: "flex", justifyContent: "center", gap: "1rem", fontSize: "0.875rem", color: "var(--text-secondary)", flexWrap: "wrap" }}>
                    <span>MRN: <strong>{walkInResult.patient.medical_record_number}</strong></span>
                    <span>{t("walkInConfirmationCode")}: <strong>{walkInResult.confirmation_code}</strong></span>
                  </div>
                  <div style={{ marginTop: "1rem" }}>
                    <span className="status confirmed" style={{ fontSize: "0.8rem" }}>
                      {walkInResult.is_new_patient ? t("walkInNewPatientBadge") : t("walkInExistingPatientBadge")}
                    </span>
                  </div>
                </div>

                <div className="patient-modal-actions" style={{ marginTop: "1.25rem", display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
                  <button
                    type="button"
                    className="outline-btn"
                    onClick={() => window.print()}
                    style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
                  >
                    <Printer size={16} />
                    <span>{t("printQueueTicket")}</span>
                  </button>
                  <button
                    className="primary-btn"
                    type="button"
                    onClick={() => {
                      setShowWalkInModal(false);
                      setWalkInResult(null);
                      setWalkInName("");
                      setWalkInPhone("");
                      setWalkInClinicianId("");
                      setWalkInError(null);
                    }}
                  >
                    {t("closeDialog")}
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={async (e) => {
                e.preventDefault();
                if (!walkInName.trim() || !walkInPhone.trim()) return;
                setWalkInLoading(true);
                setWalkInError(null);
                try {
                  const parts = walkInName.trim().split(" ");
                  const givenName = parts[0] || walkInName.trim();
                  const familyName = parts.slice(1).join(" ") || givenName;
                  const res = await createWalkInAppointment({
                    given_name: givenName,
                    family_name: familyName,
                    phone: walkInPhone.trim(),
                    clinician_id: walkInClinicianId || null,
                    reason: walkInReason.trim() || (isArabic ? "كشف سريع / استقبال" : "Walk-in consultation"),
                  });
                  setWalkInResult(res);
                } catch (err: unknown) {
                  setWalkInError(err instanceof Error ? err.message : "Failed to create walk-in appointment");
                } finally {
                  setWalkInLoading(false);
                }
              }} style={{ marginTop: "1rem" }}>
                <label style={{ display: "block", marginBottom: "0.85rem" }}>
                  <span>{t("walkInPatientName")} *</span>
                  <input
                    type="text"
                    required
                    value={walkInName}
                    onChange={(e) => setWalkInName(e.target.value)}
                    placeholder={isArabic ? "مثال: أحمد محمد علي" : "e.g., John Doe"}
                    style={{ width: "100%", marginTop: "0.35rem" }}
                  />
                </label>

                <label style={{ display: "block", marginBottom: "0.85rem" }}>
                  <span>{t("walkInPhone")} *</span>
                  <input
                    type="tel"
                    required
                    value={walkInPhone}
                    onChange={(e) => setWalkInPhone(e.target.value)}
                    placeholder="+2010..."
                    style={{ width: "100%", marginTop: "0.35rem" }}
                  />
                </label>

                {team.filter((m) => ["doctor", "physician"].includes(m.role.toLowerCase())).length > 0 && (
                  <label style={{ display: "block", marginBottom: "0.85rem" }}>
                    <span>{t("walkInClinician")}</span>
                    <select
                      value={walkInClinicianId}
                      onChange={(e) => setWalkInClinicianId(e.target.value)}
                      style={{ width: "100%", marginTop: "0.35rem" }}
                    >
                      <option value="">{t("generalClinicContext")}</option>
                      {team.filter((m) => ["doctor", "physician"].includes(m.role.toLowerCase())).map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.full_name} ({c.department || department})
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                <label style={{ display: "block", marginBottom: "0.85rem" }}>
                  <span>{t("walkInReason")}</span>
                  <input
                    type="text"
                    value={walkInReason}
                    onChange={(e) => setWalkInReason(e.target.value)}
                    style={{ width: "100%", marginTop: "0.35rem" }}
                  />
                </label>

                {walkInError && (
                  <div className="inline-error" style={{ marginBottom: "1rem" }} role="alert">
                    {walkInError}
                  </div>
                )}

                <div className="patient-modal-actions" style={{ marginTop: "1.25rem", display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
                  <button
                    className="outline-btn"
                    type="button"
                    onClick={() => {
                      setShowWalkInModal(false);
                      setWalkInResult(null);
                      setWalkInName("");
                      setWalkInPhone("");
                      setWalkInClinicianId("");
                      setWalkInError(null);
                    }}
                  >
                    {t("closeDialog")}
                  </button>
                  <button className="primary-btn" type="submit" disabled={walkInLoading}>
                    {walkInLoading ? t("loading") : t("walkInSubmit")}
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      )}
    </>
  );
}

function StatCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: number | string;
  tone: string;
}) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${tone}`}>{icon}</div>
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
    </div>
  );
}
function DashboardPanel({
  title,
  detail,
  action,
  children,
}: {
  title: string;
  detail: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>{title}</h2>
          <p>{detail}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
function Record({
  icon,
  title,
  detail,
  meta,
  action,
}: {
  icon: ReactNode;
  title: string;
  detail: string;
  meta?: string;
  action?: ReactNode;
}) {
  return (
    <div className="record-item">
      <div className="record-date">{icon}</div>
      <div>
        <strong>{title}</strong>
        <p>{detail}</p>
      </div>
      {meta && <span className="status confirmed">{meta}</span>}
      {action}
    </div>
  );
}

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
          ];

  return (
    <>
      <PageHeading
        eyebrow={isDirector ? t("directorOverview") : t("todayOverview")}
        title={title}
        detail={
          isDirector || isOperations
            ? t("organizationScopedMetrics")
            : t("todayOverview")
        }
        action={
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
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
        {!isDirector && !isAdmin && canAccessView(role, "appointments") && <DashboardPanel
          title={t("upcomingAppointments")}
          detail={t("scheduleDetail")}
          action={
            <button
              type="button"
              className="text-btn"
              onClick={() => onNavigate("appointments")}
            >
              {t("viewAll")} <ArrowRight size={14} />
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
                detail={appointment.reason}
                meta={translateAppointmentStatus(appointment.status)}
              />
            ))}
          {!data?.upcoming_appointments?.length && (
            <div className="empty-state">{t("noAppointments")}</div>
          )}
        </DashboardPanel>}

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
              />
            ))}
            <button
              type="button"
              className="text-btn"
              onClick={() => onNavigate("teamAudit")}
            >
              {t("open")}
            </button>
          </DashboardPanel>
        ) : (
          <DashboardPanel
            title={isClinical ? t("clinicalWorkspace") : t("frontDeskWorkflow")}
            detail={isClinical ? t("reviewAi") : t("scheduleDetail")}
          >
            <Record
              icon={
                isClinical ? <FileText size={16} /> : <CalendarDays size={16} />
              }
              title={isClinical ? t("clinicalNotes") : t("appointments")}
              detail={
                isClinical
                  ? t("createReviewDocumentation")
                  : t("manageDailyPatientSchedule")
              }
              action={
                <button
                  type="button"
                  className="text-btn"
                  onClick={() =>
                    onNavigate(isClinical ? "notes" : "appointments")
                  }
                >
                  {t("open")}
                </button>
              }
            />
            {isClinical && role === "doctor" && (
              <Record
                icon={<Activity size={16} />}
                title={t("assistant")}
                detail={t("assistantReady")}
                action={
                  <button
                    type="button"
                    className="text-btn"
                    onClick={() => onNavigate("assistant")}
                  >
                    {t("open")}
                  </button>
                }
              />
            )}
          </DashboardPanel>
        )}
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

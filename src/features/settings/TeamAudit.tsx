import { useEffect, useState } from "react";
import { MoreHorizontal, Plus, ShieldCheck } from "lucide-react";
import { getAuditEvents, getTeam } from "../../api/team";
import type { Language, TranslationKey } from "../../i18n";
import { PageHeading } from "../../components/PageHeading";

type Translator = (key: TranslationKey) => string;

type TeamAuditProps = { t: Translator; language: Language };

export function TeamAudit({ t, language }: TeamAuditProps) {
  const [tab, setTab] = useState<"team" | "audit">("team");
  const [members, setMembers] = useState<Array<{ name: string; email: string; role: string; status: string; department: string; focus: string; shift: string }>>([]);
  const [events, setEvents] = useState<Array<{ action: string; resource: string; time: string; actor: string }>>([]);
  const locale = language === "ar" ? "ar-EG" : "en-US";

  const translateRole = (role: string) => {
    const roleKeys: Record<string, TranslationKey> = {
      admin: "roleAdminLabel",
      administrator: "roleAdminLabel",
      doctor: "roleDoctorLabel",
      physician: "roleDoctorLabel",
      nurse: "roleNurseLabel",
      receptionist: "roleReceptionistLabel",
      hospital_director: "roleDirectorLabel",
      it_admin: "roleItAdminLabel",
      administrative_staff: "roleStaffLabel",
      patient: "rolePatientLabel",
    };
    const key = roleKeys[role.toLowerCase().replaceAll(" ", "_")];
    return key ? t(key) : language === "ar" ? t("teamMemberRole") : role.replaceAll("_", " ");
  };

  const translateDepartment = (department: string) => {
    const normalized = department.toLowerCase().trim();
    if (normalized === "general medicine" || normalized === "internal medicine") {
      return t("internalMedicine");
    }
    return language === "ar" ? t("departmentName") : department;
  };

  const translateAuditValue = (value: string, type: "action" | "resource") => {
    const normalized = value.toLowerCase().replaceAll(".", "_").replaceAll("-", "_").replaceAll(" ", "_");
    const keys: Record<string, TranslationKey> = {
      login: "auditLoginAction",
      auth_login: "auditLoginAction",
      user_login: "auditLoginAction",
      logout: "auditLogoutAction",
      auth_logout: "auditLogoutAction",
      team_invite: "auditInviteAction",
      invite_member: "auditInviteAction",
      patient: "auditPatientResource",
      patients: "auditPatientResource",
      user: "auditTeamResource",
      team: "auditTeamResource",
      appointment: "auditAppointmentResource",
      document: "auditDocumentResource",
      organization: "auditOrganizationResource",
    };
    const key = keys[normalized];
    if (key) return t(key);
    return type === "action" ? t("auditRecordedAction") : t("auditSystemRecord");
  };

  useEffect(() => {
    Promise.all([getTeam(), getAuditEvents()]).then(([team, audit]) => {
      setMembers(
        team.map((member) => ({
          name: member.full_name,
          email: member.email,
          role: member.role,
          status: member.onboarding_complete ? t("active") : t("invited"),
          department: member.department ? translateDepartment(member.department) : t("internalMedicine"),
          focus: "",
          shift: "",
        })),
      );
      setEvents(
        audit.map((event) => ({
          action: translateAuditValue(event.action, "action"),
          resource: translateAuditValue(event.resource, "resource"),
          actor: t("auditClinicalSystem"),
          time: new Date(event.created_at).toLocaleString(locale),
        })),
      );
    }).catch(() => {
      setMembers([]);
      setEvents([]);
    });
  }, [language, t]);

  const teamMetrics = [
    { label: "auditCliniciansOnDuty", value: "18", tone: "confirmed" },
    { label: "auditPendingApprovals", value: "11", tone: "pending" },
    { label: "auditOpenShifts", value: "3", tone: "danger" },
    { label: "auditAverageResponse", value: language === "ar" ? "12 دقيقة" : "12 min", tone: "confirmed" },
  ];

  return (
    <>
      <PageHeading
        eyebrow={t("teamAuditEyebrow")}
        title={t("teamAuditTitle")}
        detail={t("teamAuditDetail")}
        action={
          <button type="button" className="primary-btn">
            <Plus size={16} /> {t("inviteMember")}
          </button>
        }
      />
      <section className="panel team-audit-panel">
        <div className="tabs team-audit-tabs">
          <button type="button" className={tab === "team" ? "active" : ""} onClick={() => setTab("team")}>{t("teamMembers")}</button>
          <button type="button" className={tab === "audit" ? "active" : ""} onClick={() => setTab("audit")}>{t("auditLog")}</button>
        </div>
        {tab === "team" ? (
          <>
            <div className="team-summary-grid">
              {teamMetrics.map((metric) => (
                <div className="team-summary-card" key={metric.label}>
                  <span>{t(metric.label)}</span>
                  <strong>{metric.value}</strong>
                  <em className={`status ${metric.tone}`}>{metric.tone === "danger" ? t("auditAction") : metric.tone === "pending" ? t("staffReview") : t("auditHealthy")}</em>
                </div>
              ))}
            </div>
            <div className="team-list">
              {members.map((member) => (
                <div className="team-row" key={member.email}>
                  <div className="avatar avatar-doctor">{member.name.split(" ").map((part) => part[0]).join("").slice(0, 2)}</div>
                  <div className="team-person">
                    <strong>{member.name}</strong>
                    <span>{member.email}</span>
                  </div>
                  <span>{translateRole(member.role)}</span>
                  <span>{member.department}</span>
                  <span className="status confirmed">{member.status}</span>
                  <button type="button" className="round-btn" aria-label={language === "ar" ? "المزيد" : "More actions"}>
                    <MoreHorizontal size={16} />
                  </button>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="audit-list">
            {events.map((event) => (
              <div className="audit-row" key={`${event.action}-${event.resource}-${event.time}`}>
                <div className="audit-icon"><ShieldCheck size={15} /></div>
                <div>
                  <strong>{event.action}</strong>
                  <span>{event.resource}</span>
                </div>
                <span className="audit-actor">{event.actor}</span>
                <time>{event.time}</time>
              </div>
            ))}
            {events.length === 0 && (
              <div className="assistant-empty">
                <strong>{t("dashboardNoAudit")}</strong>
              </div>
            )}
          </div>
        )}
      </section>
    </>
  );
}

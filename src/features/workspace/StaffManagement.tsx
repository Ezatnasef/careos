import { Activity, ArrowUpRight, Clock3, UserPlus, Users } from "lucide-react";
import { PageHeading } from "../../components/PageHeading";
import { PanelHeading } from "../../components/PanelHeading";
import type { TranslationKey } from "../../i18n";

type Translator = (key: TranslationKey) => string;

export function StaffManagement({ t }: { t: Translator }) {
  const staff: Array<{
    name: string;
    role: TranslationKey;
    schedule: TranslationKey;
    load: string;
    status: TranslationKey;
  }> = [
    { name: "Dr. Rana Samir", role: "staffLeadPhysician", schedule: "staffConsulting", load: "82%", status: "staffAvailable" },
    { name: "Nurse Huda Ali", role: "staffTriageLead", schedule: "staffCurrentShift", load: "91%", status: "staffBusy" },
    { name: "Mariam Saleh", role: "staffReceptionCoordinator", schedule: "staffFrontDesk", load: "76%", status: "staffAvailable" },
    { name: "Samir Khaled", role: "staffClinicalAdmin", schedule: "staffDocumentation", load: "68%", status: "staffReview" },
  ];

  const quickActions: TranslationKey[] = [
    "staffReviewAfternoonCoverage",
    "staffConfirmNurseHandoff",
    "staffApproveOnboarding",
    "staffAuditAccess",
  ];

  return (
    <>
      <PageHeading
        eyebrow={t("teamMembersLabel")}
        title={t("staffManagementTitle")}
        detail={t("staffManagementDetail")}
        action={
          <button type="button" className="primary-btn">
            <UserPlus size={16} /> {t("inviteStaff")}
          </button>
        }
      />

      <div className="dashboard-grid">
        <section className="panel">
          <PanelHeading title={t("staffCoverageOverview")} detail={t("staffCapacitySummary")} />
          <div className="team-summary-grid">
            <div className="team-summary-card">
              <span>{t("staffOnDuty")}</span>
              <strong>28</strong>
              <em className="status confirmed">{t("staffAcrossFiveTeams")}</em>
            </div>
            <div className="team-summary-card">
              <span>{t("staffOpenSlots")}</span>
              <strong>7</strong>
              <em className="status pending">{t("staffNeedCoverage")}</em>
            </div>
            <div className="team-summary-card">
              <span>{t("staffAverageLoad")}</span>
              <strong>79%</strong>
              <em className="status confirmed">{t("staffBalanced")}</em>
            </div>
            <div className="team-summary-card">
              <span>{t("staffEscalations")}</span>
              <strong>3</strong>
              <em className="status danger">{t("staffRequiresReview")}</em>
            </div>
          </div>
        </section>

        <section className="panel">
          <PanelHeading title={t("staffCurrentStaffing")} detail={t("staffDailyAssignments")} />
          <div className="team-list">
            {staff.map((person) => (
              <div className="team-row" key={person.name}>
                <div className="avatar avatar-doctor">{person.name.split(" ").slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</div>
                <div className="team-person">
                  <strong>{person.name}</strong>
                  <span>{t(person.role)}</span>
                </div>
                <span>{t(person.schedule)}</span>
                <span className={`status ${person.status === "staffAvailable" ? "confirmed" : person.status === "staffBusy" ? "pending" : "danger"}`}>
                  {t(person.status)}
                </span>
                <span>{person.load}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="dashboard-grid">
        <section className="panel">
          <PanelHeading title={t("staffShiftReadiness")} detail={t("staffByStream")} />
          <div className="stat-grid compact">
            <div className="stat-card">
              <div className="stat-icon blue"><Users size={16} /></div>
              <span className="stat-label">{t("staffConsultation")}</span>
              <strong className="stat-value">5/6</strong>
            </div>
            <div className="stat-card">
              <div className="stat-icon green"><Activity size={16} /></div>
              <span className="stat-label">{t("staffTriage")}</span>
              <strong className="stat-value">4/5</strong>
            </div>
            <div className="stat-card">
              <div className="stat-icon orange"><Clock3 size={16} /></div>
              <span className="stat-label">{t("staffSupportDesk")}</span>
              <strong className="stat-value">2/3</strong>
            </div>
          </div>
        </section>

        <section className="panel">
          <PanelHeading title={t("staffPriorityActions")} detail={t("staffHighPriorityTasks")} />
          <div className="team-list">
            {quickActions.map((action) => (
              <div className="team-row" key={action}>
                <div className="avatar avatar-doctor"><ArrowUpRight size={14} /></div>
                <div className="team-person">
                  <strong>{t(action)}</strong>
                  <span>{t("staffOperationalQueue")}</span>
                </div>
                <button
                  type="button"
                  className="text-btn"
                  onClick={() =>
                    window.dispatchEvent(
                      new CustomEvent("careos:toast", { detail: t("staffActionOpened") }),
                    )
                  }
                >
                  {t("adminOpen")}
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

import {
  ArrowUpRight,
  BriefcaseBusiness,
  Building2,
  ClipboardCheck,
  ShieldCheck,
  Users,
} from "lucide-react";
import { PageHeading } from "../../components/PageHeading";
import { PanelHeading } from "../../components/PanelHeading";
import type { TranslationKey } from "../../i18n";

type Translator = (key: TranslationKey) => string;

export function AdminHub({ t }: { t: Translator }) {
  const metrics: Array<{
    label: TranslationKey;
    value: string;
    detail: TranslationKey;
  }> = [
    { label: "adminActiveStaff", value: "86", detail: "adminAcrossTeams" },
    { label: "adminOpenApprovals", value: "11", detail: "adminPendingReview" },
    { label: "adminComplianceChecks", value: "98%", detail: "adminThisMonth" },
    { label: "adminOperationalUptime", value: "99.7%", detail: "adminSystemAvailability" },
  ];

  const workstreams: Array<{
    title: TranslationKey;
    owner: TranslationKey;
    status: TranslationKey;
  }> = [
    { title: "adminClinicalAccess", owner: "adminFrontDeskNurses", status: "adminHealthy" },
    { title: "adminInsuranceBilling", owner: "adminAdminTeam", status: "adminReview" },
    { title: "adminStaffOnboarding", owner: "adminHrCoordinator", status: "adminHealthy" },
    { title: "adminPolicySignoffs", owner: "adminDirectorOffice", status: "adminAction" },
  ];

  const governance: TranslationKey[] = [
    "adminMarchReviews",
    "adminAuditSynced",
    "adminOnboardingApproval",
    "adminRetentionReview",
  ];

  return (
    <>
      <PageHeading
        eyebrow={t("organizationAdministration")}
        title={t("organizationAdministrationTitle")}
        detail={t("organizationAdministrationDetail")}
      />

      <div className="dashboard-grid">
        <section className="panel">
          <PanelHeading title={t("adminOperationalOverview")} detail={t("adminStaffingCoverage")} />
          <div className="team-summary-grid">
            {metrics.map((metric) => (
              <div className="team-summary-card" key={metric.label}>
                <span>{t(metric.label)}</span>
                <strong>{metric.value}</strong>
                <em className="status confirmed">{t(metric.detail)}</em>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <PanelHeading title={t("adminWorkstreamStatus")} detail={t("adminPriorityAreas")} />
          <div className="team-list">
            {workstreams.map((item) => (
              <div className="team-row" key={item.title}>
                <div className="avatar avatar-doctor"><Building2 size={14} /></div>
                <div className="team-person">
                  <strong>{t(item.title)}</strong>
                  <span>{t(item.owner)}</span>
                </div>
                <span className={`status ${item.status === "adminAction" ? "danger" : item.status === "adminReview" ? "pending" : "confirmed"}`}>
                  {t(item.status)}
                </span>
                <button
                  type="button"
                  className="text-btn"
                  onClick={() =>
                    window.dispatchEvent(
                      new CustomEvent("careos:toast", { detail: `${t(item.title)} ${t("adminItemOpened")}` }),
                    )
                  }
                >
                  {t("adminOpen")} <ArrowUpRight size={12} />
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="dashboard-grid">
        <section className="panel">
          <PanelHeading title={t("adminGovernance")} detail={t("adminComplianceWatchlist")} />
          <div className="team-list">
            {governance.map((item) => (
              <div className="team-row" key={item}>
                <div className="avatar avatar-doctor"><ClipboardCheck size={14} /></div>
                <div className="team-person">
                  <strong>{t(item)}</strong>
                  <span>{t("adminOrganizationPolicy")}</span>
                </div>
                <span className="status confirmed">{t("adminVerified")}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <PanelHeading title={t("adminAdministrativeActions")} detail={t("adminRecommendedSteps")} />
          <div className="stat-grid compact">
            <div className="stat-card">
              <div className="stat-icon blue"><Users size={16} /></div>
              <span className="stat-label">{t("adminStaffOnboarding")}</span>
              <strong className="stat-value">4</strong>
            </div>
            <div className="stat-card">
              <div className="stat-icon green"><BriefcaseBusiness size={16} /></div>
              <span className="stat-label">{t("adminOpenSchedules")}</span>
              <strong className="stat-value">7</strong>
            </div>
            <div className="stat-card">
              <div className="stat-icon orange"><ShieldCheck size={16} /></div>
              <span className="stat-label">{t("adminAccessReviews")}</span>
              <strong className="stat-value">3</strong>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}

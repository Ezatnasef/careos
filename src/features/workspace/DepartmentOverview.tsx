import { Building2, CheckCircle2, Clock3, Users } from "lucide-react";
import { PageHeading } from "../../components/PageHeading";
import { PanelHeading } from "../../components/PanelHeading";
import type { TranslationKey } from "../../i18n";

type Translator = (key: TranslationKey) => string;

type DepartmentSummary = {
  name: string;
  head: string;
  capacity: number;
  active: number;
  followUpDue: number;
  status: "stable" | "watch" | "urgent";
};

export function DepartmentOverview({ t }: { t: Translator }) {
  const departments: DepartmentSummary[] = [
    {
      name: "General Medicine",
      head: "Dr. Rana Samir",
      capacity: 24,
      active: 18,
      followUpDue: 6,
      status: "stable",
    },
    {
      name: "Cardiology",
      head: "Dr. Nabil Awad",
      capacity: 12,
      active: 10,
      followUpDue: 4,
      status: "watch",
    },
    {
      name: "Nursing Triage",
      head: "Nurse Huda Ali",
      capacity: 30,
      active: 22,
      followUpDue: 9,
      status: "urgent",
    },
  ];

  const statusTone = {
    stable: "status confirmed",
    watch: "status pending",
    urgent: "status danger",
  } as const;

  return (
    <>
      <PageHeading
        eyebrow={t("departments")}
        title={t("departmentsTitle")}
        detail={t("departmentsDetail")}
      />

      <div className="dashboard-grid">
        <section className="panel">
          <PanelHeading
            title={t("departmentDistribution")}
            detail={t("currentWorkload")}
          />
          <div className="team-list">
            {departments.map((department) => (
              <div className="team-row" key={department.name}>
                <div className="avatar avatar-doctor">
                  {department.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="team-person">
                  <strong>{department.name}</strong>
                  <span>{department.head}</span>
                </div>
                <span>
                  {department.active}/{department.capacity} active
                </span>
                <span className={statusTone[department.status]}>
                  {department.status === "stable"
                    ? "Stable"
                    : department.status === "watch"
                      ? "Watch"
                      : "Urgent"}
                </span>
                <button
                  type="button"
                  className="text-btn"
                  onClick={() =>
                    window.dispatchEvent(
                      new CustomEvent("careos:toast", {
                        detail: `${department.name} overview opened.`,
                      }),
                    )
                  }
                >
                  {t("open")}
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <PanelHeading
            title={t("operations")}
            detail={"Department operations overview"}
          />
          <div className="stat-grid compact">
            <div className="stat-card">
              <div className="stat-icon blue"><Building2 size={16} /></div>
              <span className="stat-label">Assigned Units</span>
              <strong className="stat-value">3</strong>
            </div>
            <div className="stat-card">
              <div className="stat-icon green"><CheckCircle2 size={16} /></div>
              <span className="stat-label">Follow-ups completed</span>
              <strong className="stat-value">18</strong>
            </div>
            <div className="stat-card">
              <div className="stat-icon orange"><Clock3 size={16} /></div>
              <span className="stat-label">Pending reviews</span>
              <strong className="stat-value">11</strong>
            </div>
            <div className="stat-card">
              <div className="stat-icon rose"><Users size={16} /></div>
              <span className="stat-label">Capacity load</span>
              <strong className="stat-value">79%</strong>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}

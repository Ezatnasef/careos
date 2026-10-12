import { Download } from "lucide-react";
import { PageHeading } from "../../components/PageHeading";
import { PanelHeading } from "../../components/PanelHeading";
import type { TranslationKey } from "../../i18n";

type Translator = (key: TranslationKey) => string;

type ReportItem = {
  id: string;
  title: TranslationKey;
  category: TranslationKey;
  updated: TranslationKey;
  status: TranslationKey;
  value: TranslationKey;
};

export function ReportsPage({ t }: { t: Translator }) {
  const reports: ReportItem[] = [
    {
      id: "daily-overview",
      title: "reportDailyOverview",
      category: "reportOperations",
      updated: "reportTodayAt0930",
      status: "reportReady",
      value: "reportOnTimeVisits",
    },
    {
      id: "nurse-triage",
      title: "reportNurseTriage",
      category: "reportTriage",
      updated: "reportTodayAt0840",
      status: "reportReview",
      value: "reportElevenReviews",
    },
    {
      id: "patient-followup",
      title: "reportFollowupAdherence",
      category: "reportOutcomes",
      updated: "reportYesterday",
      status: "reportQueued",
      value: "reportAdherence81",
    },
  ];

  const reportSnapshots = [
    { label: "reportVisitsOnTime", value: "reportVisitsValue", tone: "blue", status: "reportOnTarget" },
    { label: "reportOpenReviews", value: "reportOpenReviewsValue", tone: "green", status: "reportHealthy" },
    { label: "reportDischargeDelays", value: "reportDischargeDelaysValue", tone: "orange", status: "reportWatch" },
    { label: "reportCareGaps", value: "reportCareGapsValue", tone: "rose", status: "reportUrgent" },
  ];

  return (
    <>
      <PageHeading
        eyebrow={t("reports")}
        title={t("reportsTitle")}
        detail={t("reportsDetail")}
      />

      <div className="dashboard-grid">
        <section className="panel">
          <PanelHeading
            title={t("analyticsTitle")}
            detail={t("analyticsDetail")}
          />
          <div className="report-snapshot-grid">
            {reportSnapshots.map((snapshot) => (
              <div className="report-snapshot-card" key={snapshot.label}>
                <span>{t(snapshot.label)}</span>
                <strong>{t(snapshot.value)}</strong>
                <em className={`status ${snapshot.tone === "blue" ? "confirmed" : snapshot.tone === "green" ? "confirmed" : snapshot.tone === "orange" ? "pending" : "danger"}`}>
                  {t(snapshot.status)}
                </em>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <PanelHeading
            title={t("generatedReports")}
            detail={t("reportSnapshotsDetail")}
          />
          <div className="team-list">
            {reports.map((report) => (
              <div className="team-row" key={report.id}>
                <div className="avatar avatar-doctor">
                  {t(report.title).slice(0, 2).toUpperCase()}
                </div>
                <div className="team-person">
                  <strong>{t(report.title)}</strong>
                  <span>{t(report.category)}</span>
                </div>
                <span>{t(report.updated)}</span>
                <span className={`status ${report.status === "reportReady" ? "confirmed" : "pending"}`}>
                  {t(report.status)}
                </span>
                <button
                  type="button"
                  className="outline-btn"
                  onClick={() =>
                    window.dispatchEvent(
                      new CustomEvent("careos:toast", {
                        detail: `${t(report.title)} ${t("reportExportQueued")}`,
                      }),
                    )
                  }
                >
                  <Download size={14} /> {t("exportReport")}
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

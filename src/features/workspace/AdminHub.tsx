import { useState } from "react";
import {
  AlertCircle,
  ArrowUpRight,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  CreditCard,
  FileText,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { PageHeading } from "../../components/PageHeading";
import { PanelHeading } from "../../components/PanelHeading";
import type { TranslationKey } from "../../i18n";
import type { AppView } from "../../app/routes";

type Translator = (key: TranslationKey) => string;

export function AdminHub({ t, onNavigate }: { t: Translator; onNavigate?: (view: AppView) => void }) {
  const [activeModal, setActiveModal] = useState<"billing" | "policy" | null>(null);

  const metrics: Array<{ label: TranslationKey; value: string; detail: TranslationKey }> = [
    { label: "activeStaff", value: "86", detail: "acrossCareTeams" },
    { label: "openApprovals", value: "11", detail: "pendingClinicalReview" },
    { label: "complianceChecks", value: "98%", detail: "thisMonthLabel" },
    { label: "operationalUptime", value: "99.7%", detail: "systemAvailability" },
  ];

  const workstreams: Array<{
    id: "clinicalAccess" | "insuranceBilling" | "staffOnboarding" | "policySignoffs";
    title: TranslationKey;
    owner: TranslationKey;
    status: TranslationKey;
    tone: string;
  }> = [
    { id: "clinicalAccess", title: "clinicalAccess", owner: "frontDeskNurses", status: "reportHealthy", tone: "confirmed" },
    { id: "insuranceBilling", title: "insuranceBilling", owner: "adminTeam", status: "review", tone: "pending" },
    { id: "staffOnboarding", title: "staffOnboarding", owner: "hrCoordinator", status: "reportHealthy", tone: "confirmed" },
    { id: "policySignoffs", title: "policySignoffs", owner: "directorOffice", status: "actionRequired", tone: "danger" },
  ];

  const governance: TranslationKey[] = [
    "governanceAccessPolicy",
    "governanceAuditLog",
    "governanceOnboarding",
    "governanceRetention",
  ];

  const actions: Array<{ label: TranslationKey; value: string; icon: typeof Users; tone: string; target?: AppView }> = [
    { label: "staffOnboarding", value: "4", icon: Users, tone: "blue", target: "staff" },
    { label: "openSchedules", value: "7", icon: BriefcaseBusiness, tone: "green", target: "clinicOps" },
    { label: "accessReviews", value: "3", icon: ShieldCheck, tone: "orange", target: "teamAudit" },
  ];

  const handleWorkstreamOpen = (id: string, titleKey: TranslationKey) => {
    if (id === "clinicalAccess") {
      if (onNavigate) {
        onNavigate("clinicOps");
      } else {
        window.location.hash = "app/clinicOps";
      }
      return;
    }
    if (id === "staffOnboarding") {
      if (onNavigate) {
        onNavigate("staff");
      } else {
        window.location.hash = "app/staff";
      }
      return;
    }
    if (id === "insuranceBilling") {
      setActiveModal("billing");
      return;
    }
    if (id === "policySignoffs") {
      setActiveModal("policy");
      return;
    }
    window.dispatchEvent(
      new CustomEvent("careos:toast", {
        detail: `${t(titleKey)} · ${t("open")}`,
      }),
    );
  };

  return (
    <>
      <PageHeading
        eyebrow={t("organizationAdministration")}
        title={t("organizationAdminTitle")}
        detail={t("organizationAdminDetail")}
      />

      <div className="dashboard-grid">
        <section className="panel">
          <PanelHeading
            title={t("operationalOverviewTitle")}
            detail={t("staffingCoverage")}
          />
          <div className="team-summary-grid">
            {metrics.map((metric) => (
              <div className="team-summary-card" key={metric.label}>
                <span>{t(metric.label)}</span>
                <strong>{metric.value}</strong>
                <em
                  className={`status ${metric.detail === "pendingClinicalReview" ? "pending" : "confirmed"}`}
                  style={{
                    display: "inline-block",
                    padding: "4px 8px",
                    borderRadius: "6px",
                    fontSize: "11px",
                    fontWeight: 600,
                    fontStyle: "normal",
                    marginTop: "4px",
                  }}
                >
                  {t(metric.detail)}
                </em>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <PanelHeading
            title={t("workstreamStatus")}
            detail={t("priorityOperationalAreas")}
          />
          <div className="team-list">
            {workstreams.map((item) => (
              <div className="team-row" key={item.title}>
                <div className="avatar avatar-doctor"><Building2 size={14} /></div>
                <div className="team-person">
                  <strong>{t(item.title)}</strong>
                  <span>{t(item.owner)}</span>
                </div>
                <span className={`status ${item.tone}`}>{t(item.status)}</span>
                <button
                  type="button"
                  className="text-btn"
                  onClick={() => handleWorkstreamOpen(item.id, item.title)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    cursor: "pointer",
                    padding: "4px 8px",
                    borderRadius: "6px",
                    background: "rgba(20, 93, 88, 0.08)",
                    border: "1px solid rgba(20, 93, 88, 0.18)",
                    color: "var(--teal)",
                    fontWeight: 600,
                  }}
                >
                  {t("open")} <ArrowUpRight size={12} />
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="dashboard-grid">
        <section className="panel">
          <PanelHeading
            title={t("governance")}
            detail={t("complianceWatchlist")}
          />
          <div className="team-list">
            {governance.map((item) => (
              <div className="team-row" key={item}>
                <div className="avatar avatar-doctor"><ClipboardCheck size={14} /></div>
                <div className="team-person">
                  <strong>{t(item)}</strong>
                  <span>{t("organizationPolicy")}</span>
                </div>
                <span className="status confirmed">{t("verified")}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <PanelHeading
            title={t("administrativeActions")}
            detail={t("recommendedNextSteps")}
          />
          <div className="stat-grid compact three-cols">
            {actions.map(({ label, value, icon: Icon, tone, target }) => (
              <div
                className="stat-card"
                key={label}
                style={{ cursor: target ? "pointer" : "default" }}
                onClick={() => {
                  if (target && onNavigate) onNavigate(target);
                }}
              >
                <div className={`stat-icon ${tone}`}><Icon size={16} /></div>
                <span className="stat-label">{t(label)}</span>
                <strong className="stat-value">{value}</strong>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Insurance & Billing Workstream Modal */}
      {activeModal === "billing" && (
        <div
          className="modal-backdrop"
          onClick={() => setActiveModal(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.6)",
            backdropFilter: "blur(4px)",
            display: "grid",
            placeItems: "center",
            zIndex: 9999,
            padding: "20px",
          }}
        >
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--paper)",
              borderRadius: "16px",
              maxWidth: "560px",
              width: "100%",
              padding: "24px",
              border: "1px solid var(--line)",
              display: "flex",
              flexDirection: "column",
              gap: "16px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <CreditCard size={20} color="var(--teal)" />
                <h3 style={{ margin: 0, fontSize: "17px", color: "var(--ink)" }}>
                  {t("insuranceBilling")} · مراجعة المطالبات والفوترة
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                style={{ background: "transparent", border: 0, cursor: "pointer", color: "var(--muted)" }}
              >
                <X size={18} />
              </button>
            </div>
            <p style={{ margin: 0, fontSize: "13px", color: "var(--muted)", lineHeight: 1.6 }}>
              ملخص دورة الإيرادات والمطالبات التأمينية المعلقة لمراجعة الفريق الإداري واعتماد التغطية:
            </p>
            <div style={{ display: "grid", gap: "10px" }}>
              <div style={{ padding: "12px", borderRadius: "8px", background: "rgba(16, 185, 129, 0.08)", border: "1px solid rgba(16, 185, 129, 0.2)", display: "flex", justifyContent: "space-between" }}>
                <span>مطالبات تأمين مقبولة (هيئة التأمين الصحي)</span>
                <strong style={{ color: "#10b981" }}>42 مطالبة (128,400 ج.م)</strong>
              </div>
              <div style={{ padding: "12px", borderRadius: "8px", background: "rgba(245, 158, 11, 0.08)", border: "1px solid rgba(245, 158, 11, 0.2)", display: "flex", justifyContent: "space-between" }}>
                <span>بانتظار موافقة شركة التأمين الخاصة</span>
                <strong style={{ color: "#f59e0b" }}>6 مطالبات قيد الفحص</strong>
              </div>
              <div style={{ padding: "12px", borderRadius: "8px", background: "rgba(100, 116, 139, 0.08)", border: "1px solid var(--line)", display: "flex", justifyContent: "space-between" }}>
                <span>نسبة التوافق مع بروتوكول تسعير الخدمات</span>
                <strong>99.1%</strong>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "10px" }}>
              <button
                type="button"
                className="primary-btn"
                onClick={() => {
                  setActiveModal(null);
                  window.dispatchEvent(new CustomEvent("careos:toast", { detail: "تم إرسال كشف المطالبات للمراجعة المحاسبية" }));
                }}
              >
                تأكيد واعتماد الدفعة
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Policy Governance & Signoffs Modal */}
      {activeModal === "policy" && (
        <div
          className="modal-backdrop"
          onClick={() => setActiveModal(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.6)",
            backdropFilter: "blur(4px)",
            display: "grid",
            placeItems: "center",
            zIndex: 9999,
            padding: "20px",
          }}
        >
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--paper)",
              borderRadius: "16px",
              maxWidth: "560px",
              width: "100%",
              padding: "24px",
              border: "1px solid var(--line)",
              display: "flex",
              flexDirection: "column",
              gap: "16px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <ShieldCheck size={20} color="#ef4444" />
                <h3 style={{ margin: 0, fontSize: "17px", color: "var(--ink)" }}>
                  {t("policySignoffs")} · سياسات الحوكمة السريرية
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                style={{ background: "transparent", border: 0, cursor: "pointer", color: "var(--muted)" }}
              >
                <X size={18} />
              </button>
            </div>
            <p style={{ margin: 0, fontSize: "13px", color: "var(--muted)", lineHeight: 1.6 }}>
              السياسات السريرية والتنظيمية التي تتطلب توقيع واعتماد مكتب مدير المستشفى واللجنة الطبية:
            </p>
            <div style={{ display: "grid", gap: "10px" }}>
              <div style={{ padding: "12px", borderRadius: "8px", background: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239, 68, 68, 0.2)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <strong style={{ display: "block", fontSize: "13px" }}>بروتوكول وصف المضادات الحيوية واسعة المجال</strong>
                  <small style={{ color: "var(--muted)" }}>تحديث لجنة مكافحة العدوى والرقابة الدوائية</small>
                </div>
                <span className="status danger">يتطلب توقيعاً</span>
              </div>
              <div style={{ padding: "12px", borderRadius: "8px", background: "rgba(16, 185, 129, 0.08)", border: "1px solid rgba(16, 185, 129, 0.2)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <strong style={{ display: "block", fontSize: "13px" }}>معايير خصوصية وسجلات المرضى (HIPAA / FHIR)</strong>
                  <small style={{ color: "var(--muted)" }}>معتمد للربع السنوي الحالي</small>
                </div>
                <span className="status confirmed">معتمد</span>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "10px" }}>
              <button
                type="button"
                className="primary-btn"
                onClick={() => {
                  setActiveModal(null);
                  window.dispatchEvent(new CustomEvent("careos:toast", { detail: "تم اعتماد وتوقيع البروتوكول السريري بنجاح" }));
                }}
              >
                توقيع واعتماد السياسة
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

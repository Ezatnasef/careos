import { useEffect, useState } from "react";
import {
  Activity,
  Bell,
  BookOpen,
  Bot,
  BrainCircuit,
  Building2,
  CheckCircle2,
  Cpu,
  Database,
  ExternalLink,
  Flame,
  Mic,
  RefreshCw,
  ShieldCheck,
  X,
  Zap,
} from "lucide-react";
import { PageHeading } from "../../components/PageHeading";
import { getSystemStatus, type SystemStatus } from "../../api";
import type { Language, TranslationKey } from "../../i18n";

type Integration = {
  id: string;
  name: TranslationKey;
  adapter: string;
  category: "standards" | "ai" | "speech" | "notifications" | "ehr";
  icon: typeof Activity;
  state: TranslationKey;
  provider?: string;
  fallbackState?: TranslationKey;
  next: TranslationKey;
  docsUrl?: string;
};

type Translator = (key: TranslationKey) => string;

export function IntegrationHub({ t, language = "en" }: { t: Translator; language?: Language }) {
  const isArabic = language === "ar";
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [statusLoadFailed, setStatusLoadFailed] = useState(false);
  const [medplumPingLoading, setMedplumPingLoading] = useState(false);
  const [showFhirDocsModal, setShowFhirDocsModal] = useState(false);
  const [medplumPingResult, setMedplumPingResult] = useState<{
    success: boolean;
    latencyMs?: number;
    message?: string;
  } | null>(null);

  useEffect(() => {
    getSystemStatus()
      .then(setStatus)
      .catch(() => setStatusLoadFailed(true));
  }, []);

  const pingMedplum = async () => {
    setMedplumPingLoading(true);
    setMedplumPingResult(null);
    const start = performance.now();
    try {
      const res = await fetch("/api/v1/integrations/medplum/test", { method: "POST" });
      const data = await res.json().catch(() => null);
      const latency = Math.round(performance.now() - start);
      if (res.ok && data?.success) {
        setMedplumPingResult({
          success: true,
          latencyMs: latency,
          message: isArabic ? "تم التحقق من نقطة نهاية FHIR R4 بنجاح" : "FHIR R4 Endpoint Verified",
        });
      } else {
        setMedplumPingResult({
          success: false,
          latencyMs: latency,
          message: data?.detail || (isArabic ? "مهلة الاتصال انتهت أو المفاتيح غير مهيأة" : "Connection timeout or unconfigured credentials"),
        });
      }
    } catch {
      setMedplumPingResult({
        success: false,
        latencyMs: Math.round(performance.now() - start),
        message: isArabic ? "تعذر الوصول إلى مهايئ Medplum" : "Failed to reach Medplum adapter",
      });
    } finally {
      setMedplumPingLoading(false);
    }
  };

  const providerState = (
    provider: string,
    fallback: TranslationKey,
  ): TranslationKey => {
    if (statusLoadFailed) return "statusUnavailable";
    if (!status) return "loadingIntegrationStatus";
    return status.providers?.[provider]?.configured ? "configured" : fallback;
  };

  const integrations: Integration[] = [
    {
      id: "medplum",
      name: "medplumIntegration",
      adapter: "MedplumFhirClient",
      category: "standards",
      icon: Flame,
      state: "configured",
      next: "connectMedplum",
      docsUrl: "https://www.medplum.com/docs",
    },
    {
      id: "clinicalDrafting",
      name: "clinicalDraftingIntegration",
      adapter: "ClinicalSummaryProvider",
      category: "ai",
      icon: Bot,
      provider: "ai",
      fallbackState: "reviewModeOnly",
      state: "reviewModeOnly",
      next: "clinicalDraftingHandoff",
    },
    {
      id: "platformAssistant",
      name: "platformAssistantIntegration",
      adapter: "RagProvider.answer_general",
      category: "ai",
      icon: BrainCircuit,
      state: "knowledgeReady",
      next: "platformAssistantHandoff",
    },
    {
      id: "encounterSpeech",
      name: "encounterSpeechIntegration",
      adapter: "SpeechToTextProvider",
      category: "speech",
      icon: Mic,
      provider: "speech_to_text",
      fallbackState: "notConfigured",
      state: "notConfigured",
      next: "encounterSpeechHandoff",
    },
    {
      id: "aiAgentActions",
      name: "aiAgentActionsIntegration",
      adapter: "CareOSOrchestrator",
      category: "ai",
      icon: Cpu,
      state: "notEnabled",
      next: "aiAgentActionsHandoff",
    },
    {
      id: "patientReminders",
      name: "patientRemindersIntegration",
      adapter: "NotificationProvider",
      category: "notifications",
      icon: Bell,
      provider: "smtp",
      fallbackState: "queueOnly",
      state: "queueOnly",
      next: "connectReminderProvider",
    },
    {
      id: "hospitalEhr",
      name: "hospitalEhrIntegration",
      adapter: "EhrConnector",
      category: "ehr",
      icon: Building2,
      state: "notConfigured",
      next: "connectHospitalEhr",
    },
  ];

  const getStatusBadgeStyle = (stateKey: TranslationKey) => {
    switch (stateKey) {
      case "configured":
      case "knowledgeReady":
        return {
          bg: "rgba(16, 185, 129, 0.12)",
          border: "rgba(16, 185, 129, 0.35)",
          color: "#10b981",
          dot: "#10b981",
        };
      case "queueOnly":
      case "reviewModeOnly":
        return {
          bg: "rgba(245, 158, 11, 0.12)",
          border: "rgba(245, 158, 11, 0.35)",
          color: "#f59e0b",
          dot: "#f59e0b",
        };
      default:
        return {
          bg: "rgba(100, 116, 139, 0.12)",
          border: "rgba(100, 116, 139, 0.3)",
          color: "var(--muted)",
          dot: "#94a3b8",
        };
    }
  };

  const getCategoryLabel = (cat: string) => {
    if (!isArabic) return cat;
    switch (cat) {
      case "standards":
        return "المعايير الصحية";
      case "ai":
        return "الذكاء السريري";
      case "speech":
        return "التوثيق الصوتي";
      case "notifications":
        return "إشعارات المرضى";
      case "ehr":
        return "سجلات المستشفى";
      default:
        return cat;
    }
  };

  return (
    <div className="integration-hub-view" style={{ display: "flex", flexDirection: "column", gap: "24px" }} dir={isArabic ? "rtl" : "ltr"}>
      <PageHeading
        eyebrow={t("integrationEyebrow")}
        title={t("integrationHub")}
        detail={t("integrationDescription")}
        action={
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "4px 12px",
                borderRadius: "999px",
                fontSize: "12px",
                fontWeight: 600,
                background: "rgba(14, 165, 233, 0.1)",
                color: "var(--teal)",
                border: "1px solid rgba(14, 165, 233, 0.2)",
              }}
            >
              <Zap size={14} /> {isArabic ? "جاهزية HL7 FHIR R4" : "HL7 FHIR R4 Ready"}
            </span>
          </div>
        }
      />

      {/* 1. Bento Top Statistics Summary */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "14px",
        }}
      >
        <div
          className="hub-metric-card"
          style={{
            padding: "16px 18px",
            borderRadius: "14px",
            background: "var(--paper)",
            border: "1px solid var(--line)",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.03)",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--muted)" }}>
              {isArabic ? "المهايئات النشطة" : "Active Adapters"}
            </span>
            <div style={{ width: "30px", height: "30px", borderRadius: "8px", background: "rgba(16, 185, 129, 0.12)", display: "grid", placeItems: "center", color: "#10b981" }}>
              <CheckCircle2 size={16} />
            </div>
          </div>
          <div style={{ fontSize: "22px", fontWeight: 800, color: "var(--ink)" }}>
            {isArabic ? "4 مهايئات نشطة" : "4 Active"}
          </div>
          <span style={{ fontSize: "11px", color: "#10b981", fontWeight: 600 }}>
            {isArabic ? "بيئة الإنتاج والتجربة المحلية" : "Production & local sandbox"}
          </span>
        </div>

        <div
          className="hub-metric-card"
          style={{
            padding: "16px 18px",
            borderRadius: "14px",
            background: "var(--paper)",
            border: "1px solid var(--line)",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.03)",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--muted)" }}>
              {isArabic ? "توافق معيار FHIR R4" : "FHIR R4 Conformance"}
            </span>
            <div style={{ width: "30px", height: "30px", borderRadius: "8px", background: "rgba(239, 68, 68, 0.1)", display: "grid", placeItems: "center", color: "#ef4444" }}>
              <Flame size={16} />
            </div>
          </div>
          <div style={{ fontSize: "22px", fontWeight: 800, color: "var(--ink)" }}>
            {isArabic ? "معيار Medplum Core" : "Medplum Core"}
          </div>
          <span style={{ fontSize: "11px", color: "var(--muted)" }}>
            {isArabic ? "مخطط موارد US Core و IPS" : "US Core & IPS Resource Map"}
          </span>
        </div>

        <div
          className="hub-metric-card"
          style={{
            padding: "16px 18px",
            borderRadius: "14px",
            background: "var(--paper)",
            border: "1px solid var(--line)",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.03)",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--muted)" }}>
              {isArabic ? "عمال الخلفية غير المتزامنة" : "Asynchronous Workers"}
            </span>
            <div style={{ width: "30px", height: "30px", borderRadius: "8px", background: "rgba(245, 158, 11, 0.12)", display: "grid", placeItems: "center", color: "#f59e0b" }}>
              <Activity size={16} />
            </div>
          </div>
          <div style={{ fontSize: "22px", fontWeight: 800, color: "var(--ink)" }}>
            {isArabic ? "جاهزية قائمة الانتظار" : "Queue Standby"}
          </div>
          <span style={{ fontSize: "11px", color: "#f59e0b", fontWeight: 600 }}>
            {isArabic ? "الإشعارات وتذكيرات المرضى" : "Notification & reminders"}
          </span>
        </div>

        <div
          className="hub-metric-card"
          style={{
            padding: "16px 18px",
            borderRadius: "14px",
            background: "var(--paper)",
            border: "1px solid var(--line)",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.03)",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--muted)" }}>
              {isArabic ? "عزل وحماية الأمان" : "Security Isolation"}
            </span>
            <div style={{ width: "30px", height: "30px", borderRadius: "8px", background: "rgba(14, 165, 233, 0.12)", display: "grid", placeItems: "center", color: "var(--teal)" }}>
              <ShieldCheck size={16} />
            </div>
          </div>
          <div style={{ fontSize: "22px", fontWeight: 800, color: "var(--ink)" }}>
            {isArabic ? "صفر أسرار في المتصفح" : "Zero Secrets"}
          </div>
          <span style={{ fontSize: "11px", color: "var(--muted)" }}>
            {isArabic ? "تسليم آمن ومحمي في الخادم" : "Protected server-side handoff"}
          </span>
        </div>
      </section>

      {/* 2. Featured Medplum FHIR Interoperability Card */}
      <section
        style={{
          borderRadius: "16px",
          padding: "24px",
          background: "linear-gradient(135deg, rgba(20, 93, 88, 0.08) 0%, rgba(14, 165, 233, 0.05) 100%)",
          border: "1px solid rgba(20, 93, 88, 0.25)",
          display: "flex",
          flexDirection: "column",
          gap: "18px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <div
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "12px",
                background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
                display: "grid",
                placeItems: "center",
                color: "#fff",
                boxShadow: "0 4px 12px rgba(239, 68, 68, 0.3)",
              }}
            >
              <Flame size={26} />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 700, color: "var(--ink)" }}>
                  {t("medplumIntegration")}
                </h3>
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    padding: "2px 8px",
                    borderRadius: "6px",
                    background: "rgba(16, 185, 129, 0.15)",
                    color: "#10b981",
                    border: "1px solid rgba(16, 185, 129, 0.3)",
                  }}
                >
                  FHIR R4 Core
                </span>
              </div>
              <code style={{ fontSize: "12px", color: "var(--muted)", fontFamily: "monospace" }}>
                MedplumFhirClient (SMART-on-FHIR standard)
              </code>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={pingMedplum}
              disabled={medplumPingLoading}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 14px",
                borderRadius: "8px",
                fontSize: "12px",
                fontWeight: 600,
                background: "var(--paper)",
                color: "var(--ink)",
                border: "1px solid var(--line)",
                cursor: "pointer",
                boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)",
              }}
            >
              <RefreshCw size={14} className={medplumPingLoading ? "spin-icon" : ""} />
              {medplumPingLoading ? (isArabic ? "جارٍ الفحص..." : "Testing...") : (isArabic ? "فحص اتصال معيار FHIR" : "Ping FHIR Connector")}
            </button>
            <button
              type="button"
              onClick={() => setShowFhirDocsModal(true)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 12px",
                borderRadius: "8px",
                fontSize: "12px",
                background: "transparent",
                color: "var(--teal)",
                border: "1px solid var(--line)",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <BookOpen size={13} /> {isArabic ? "دليل المعايير السريرية" : "FHIR Reference"}
            </button>
          </div>
        </div>

        <p style={{ margin: 0, fontSize: "13px", lineHeight: "1.6", color: "var(--muted)" }}>
          {t("medplumHandoff")} {isArabic ? "يربط سجلات المرضى والملاحظات والتشخيصات بمعايير الصحة العالمية HL7 FHIR Release 4." : "Connects CareOS patient records, encounter notes, and diagnostic observations with international standards (HL7 FHIR Release 4)."}
        </p>

        {medplumPingResult && (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: "8px",
              fontSize: "12px",
              fontWeight: 500,
              background: medplumPingResult.success ? "rgba(16, 185, 129, 0.12)" : "rgba(239, 68, 68, 0.12)",
              color: medplumPingResult.success ? "#059669" : "#dc2626",
              border: `1px solid ${medplumPingResult.success ? "rgba(16, 185, 129, 0.25)" : "rgba(239, 68, 68, 0.25)"}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span>{medplumPingResult.message}</span>
            <span style={{ opacity: 0.8, fontSize: "11px" }}>{medplumPingResult.latencyMs}ms</span>
          </div>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", paddingTop: "6px" }}>
          <span style={{ fontSize: "11px", color: "var(--muted)", alignSelf: "center", marginInlineEnd: "4px" }}>
            {isArabic ? "موارد FHIR المدعومة:" : "Supported FHIR Resources:"}
          </span>
          {["Patient", "Encounter", "Observation", "Condition", "CarePlan", "DiagnosticReport"].map((res) => (
            <span
              key={res}
              style={{
                fontSize: "11px",
                padding: "3px 8px",
                borderRadius: "6px",
                background: "var(--paper)",
                border: "1px solid var(--line)",
                fontFamily: "monospace",
                color: "var(--ink)",
              }}
            >
              {res}
            </span>
          ))}
        </div>
      </section>

      {/* 3. Bento Grid of All Active System Adapters */}
      <section style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "var(--ink)" }}>
              {t("providerAdapters")}
            </h3>
            <p style={{ margin: "4px 0 0", fontSize: "12px", color: "var(--muted)" }}>
              {t("backendAdaptersLocation")}
            </p>
          </div>
        </div>

        {statusLoadFailed && (
          <div className="inline-error" role="alert">
            {t("integrationStatusLoadFailed")}
          </div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: "16px",
          }}
        >
          {integrations.map((item) => {
            const Icon = item.icon;
            const currentState = item.provider && item.fallbackState
              ? providerState(item.provider, item.fallbackState)
              : item.state;
            const badgeStyle = getStatusBadgeStyle(currentState);

            return (
              <div
                key={item.id}
                style={{
                  background: "var(--paper)",
                  borderRadius: "14px",
                  border: "1px solid var(--line)",
                  padding: "18px",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  gap: "14px",
                  boxShadow: "0 2px 6px rgba(0, 0, 0, 0.02)",
                  boxSizing: "border-box",
                  minWidth: 0,
                  overflow: "hidden",
                }}
              >
                <div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      flexWrap: "wrap",
                      gap: "8px",
                      marginBottom: "10px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: "1 1 180px", minWidth: 0 }}>
                      <div
                        style={{
                          width: "36px",
                          height: "36px",
                          borderRadius: "10px",
                          background: badgeStyle.bg,
                          color: badgeStyle.color,
                          display: "grid",
                          placeItems: "center",
                          flexShrink: 0,
                        }}
                      >
                        <Icon size={18} />
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <strong
                          style={{
                            display: "block",
                            fontSize: "14px",
                            fontWeight: 700,
                            color: "var(--ink)",
                            lineHeight: 1.3,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "normal",
                          }}
                        >
                          {t(item.name)}
                        </strong>
                        <span
                          style={{
                            display: "inline-block",
                            fontSize: "11px",
                            fontFamily: "monospace",
                            color: "var(--muted)",
                            marginTop: "2px",
                            wordBreak: "break-all",
                          }}
                        >
                          {item.adapter}
                        </span>
                      </div>
                    </div>

                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "5px",
                        fontSize: "11px",
                        fontWeight: 600,
                        padding: "3px 9px",
                        borderRadius: "999px",
                        background: badgeStyle.bg,
                        border: `1px solid ${badgeStyle.border}`,
                        color: badgeStyle.color,
                        flexShrink: 0,
                        alignSelf: "flex-start",
                        whiteSpace: "nowrap",
                        marginInlineStart: "auto",
                      }}
                    >
                      <span
                        style={{
                          width: "6px",
                          height: "6px",
                          borderRadius: "50%",
                          background: badgeStyle.dot,
                        }}
                      />
                      {t(currentState)}
                    </span>
                  </div>

                  <p style={{ margin: "8px 0 0", fontSize: "12px", lineHeight: "1.55", color: "var(--muted)" }}>
                    {t(item.next)}
                  </p>
                </div>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    paddingTop: "12px",
                    borderTop: "1px solid var(--line)",
                    fontSize: "11px",
                  }}
                >
                  <span style={{ color: "var(--muted)" }}>
                    {isArabic ? "الفئة:" : "Category:"}{" "}
                    <b style={{ color: "var(--ink)" }}>{getCategoryLabel(item.category)}</b>
                  </span>
                  <span style={{ color: "var(--teal)", fontWeight: 600 }}>
                    {isArabic ? "تسليم سريري مدقق" : "Audited handoff"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 4. Connection Governance & Deployment Checklist */}
      <section
        style={{
          background: "var(--paper)",
          borderRadius: "16px",
          border: "1px solid var(--line)",
          padding: "22px",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "var(--ink)" }}>
            {t("connectionChecklist")}
          </h3>
          <p style={{ margin: "4px 0 0", fontSize: "12px", color: "var(--muted)" }}>
            {t("requiredBeforePatientData")}
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: "14px",
          }}
        >
          <div
            style={{
              padding: "16px",
              borderRadius: "12px",
              background: "rgba(20, 93, 88, 0.04)",
              border: "1px solid var(--line)",
              display: "flex",
              gap: "14px",
            }}
          >
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "10px",
                background: "rgba(20, 93, 88, 0.12)",
                color: "var(--teal)",
                display: "grid",
                placeItems: "center",
                flexShrink: 0,
              }}
            >
              <ShieldCheck size={18} />
            </div>
            <div>
              <strong style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "var(--ink)" }}>
                {t("secretsAndApproval")}
              </strong>
              <p style={{ margin: "4px 0 0", fontSize: "12px", color: "var(--muted)", lineHeight: 1.5 }}>
                {t("storeProviderCredentials")}
              </p>
            </div>
          </div>

          <div
            style={{
              padding: "16px",
              borderRadius: "12px",
              background: "rgba(14, 165, 233, 0.04)",
              border: "1px solid var(--line)",
              display: "flex",
              gap: "14px",
            }}
          >
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "10px",
                background: "rgba(14, 165, 233, 0.12)",
                color: "var(--teal)",
                display: "grid",
                placeItems: "center",
                flexShrink: 0,
              }}
            >
              <Database size={18} />
            </div>
            <div>
              <strong style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "var(--ink)" }}>
                {t("validationAndAudit")}
              </strong>
              <p style={{ margin: "4px 0 0", fontSize: "12px", color: "var(--muted)", lineHeight: 1.5 }}>
                {t("enableProviderAfterReview")}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 5. In-App FHIR & Medplum Reference Modal */}
      {showFhirDocsModal && (
        <div
          className="modal-backdrop"
          onClick={() => setShowFhirDocsModal(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.55)",
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
              maxWidth: "620px",
              width: "100%",
              padding: "24px",
              border: "1px solid var(--line)",
              boxShadow: "0 20px 40px rgba(0, 0, 0, 0.2)",
              display: "flex",
              flexDirection: "column",
              gap: "16px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <Flame size={22} color="#ef4444" />
                <h3 style={{ margin: 0, fontSize: "18px", color: "var(--ink)" }}>
                  {isArabic ? "دليل معايير Medplum HL7 FHIR R4" : "Medplum HL7 FHIR R4 Reference"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowFhirDocsModal(false)}
                style={{ background: "transparent", border: 0, cursor: "pointer", color: "var(--muted)" }}
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            <p style={{ margin: 0, fontSize: "13px", lineHeight: "1.6", color: "var(--muted)" }}>
              {isArabic
                ? "يدعم خادم CareOS ربط البيانات السريرية وفق أحدث معايير التبادل الصحي العالمي (FHIR R4). يتم إرسال واستقبال السجلات الطبية وفق الحقول التالية:"
                : "CareOS supports standard interoperability based on HL7 FHIR Release 4. Health data is modeled and exchanged across standard endpoints:"}
            </p>

            <div style={{ display: "grid", gap: "10px", maxHeight: "320px", overflowY: "auto" }}>
              {[
                { res: "Patient", desc: isArabic ? "ملف المريض، الهوية الموحدة، الرقم القومي، وفصيلة الدم" : "Demographics, National Identifier, MRN, Blood Type" },
                { res: "Encounter", desc: isArabic ? "المقابلات والزيارات الطبية، تواريخ الدخول والخروج والفرز" : "Visits, admissions, outpatient appointments, triage tier" },
                { res: "Observation", desc: isArabic ? "العلامات الحيوية (الضغط، النبض)، وفحوصات الدم والمختبر" : "Vitals (BP, HR, SpO2), lab biomarkers (HbA1c, Lipids)" },
                { res: "Condition", desc: isArabic ? "التشخيصات السريرية، الأمراض المزمنة، وأكواد ICD-10" : "Diagnoses, chronic conditions, and ICD-10 codings" },
                { res: "CarePlan", desc: isArabic ? "خطط الرعاية، بروتوكولات العلاج، ومتابعة الالتزام الدوائي" : "Care regimens, medication adherence plans, clinical milestones" },
              ].map((item) => (
                <div
                  key={item.res}
                  style={{
                    padding: "10px 14px",
                    borderRadius: "8px",
                    background: "rgba(148, 163, 184, 0.08)",
                    border: "1px solid var(--line)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <code style={{ fontSize: "13px", fontWeight: 700, color: "var(--teal)" }}>
                    /{item.res}
                  </code>
                  <span style={{ fontSize: "12px", color: "var(--muted)" }}>{item.desc}</span>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "10px" }}>
              <a
                href="https://www.medplum.com/docs"
                target="_blank"
                rel="noreferrer"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "8px 14px",
                  borderRadius: "8px",
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "var(--teal)",
                  border: "1px solid var(--line)",
                  textDecoration: "none",
                }}
              >
                {isArabic ? "فتح الموقع الرسمي للتوثيق" : "Official Online Docs"} <ExternalLink size={13} />
              </a>
              <button
                type="button"
                className="primary-btn"
                onClick={() => setShowFhirDocsModal(false)}
                style={{ padding: "8px 18px", fontSize: "12px" }}
              >
                {isArabic ? "إغلاق" : "Close"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

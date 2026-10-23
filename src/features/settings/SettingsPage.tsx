import { useEffect, useState } from "react";
import {
  Bell,
  Check,
  Globe,
  KeyRound,
  LogOut,
  Mic,
  Moon,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  UserCheck,
  UserRound,
} from "lucide-react";
import {
  enrollMfa,
  getCurrentUser,
  getNotifications,
  markNotificationRead,
  regenerateMfaRecoveryCodes,
  verifyMfa,
} from "../../api";
import { completeOrganization, getOrganization } from "../../api/workspace";
import { PageHeading } from "../../components/PageHeading";
import { PanelHeading } from "../../components/PanelHeading";
import type { Language, TranslationKey } from "../../i18n";
import type { AppView } from "../../app/routes";

type Translator = (key: TranslationKey) => string;
type Theme = "light" | "dark";
type SettingsSection = "profile" | "preferences" | "security" | "notifications";
type NotificationItem = Awaited<ReturnType<typeof getNotifications>>[number];

type Props = {
  canViewOrganization: boolean;
  canManageOrganization: boolean;
  language: Language;
  setLanguage: (language: Language) => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  doctorName: string;
  setDoctorName: (name: string) => void;
  onLogout: () => void;
  onNavigate?: (view: AppView) => void;
  t: Translator;
};

export function SettingsPage({
  canViewOrganization,
  canManageOrganization,
  language,
  setLanguage,
  theme,
  setTheme,
  doctorName,
  setDoctorName,
  onLogout,
  onNavigate,
  t,
}: Props) {
  const [organizationName, setOrganizationName] = useState("");
  const [organizationDepartment, setOrganizationDepartment] = useState("العظام، طب الأطفال، طوارئ 24/7، الباطنه العامه، النساء والتوليد، تغذيه");
  const [organizationTimezone, setOrganizationTimezone] = useState("Africa/Cairo");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState<SettingsSection>("profile");
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [mfaEnabled, setMfaEnabled] = useState<boolean | null>(null);
  const [mfaSecret, setMfaSecret] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!canViewOrganization) {
      setLoading(false);
      return;
    }
    getOrganization()
      .then((organization) => {
        setOrganizationName(organization.name || "CityCare Medical Complex");
        if (organization.department) setOrganizationDepartment(organization.department);
        if (organization.timezone) setOrganizationTimezone(organization.timezone);
      })
      .catch((error: unknown) =>
        setActionError(
          error instanceof Error
            ? error.message
            : t("organizationLoadFailed"),
        ),
      )
      .finally(() => setLoading(false));
  }, [canViewOrganization]);

  useEffect(() => {
    getCurrentUser()
      .then((user) => setMfaEnabled(Boolean(user.mfa_enabled)))
      .catch((error: unknown) =>
        setActionError(error instanceof Error ? error.message : t("securityLoadFailed")),
      );
  }, []);

  useEffect(() => {
    if (activeSection !== "notifications") return;
    setNotificationsLoading(true);
    getNotifications()
      .then(setNotifications)
      .catch((error: unknown) =>
        setActionError(error instanceof Error ? error.message : t("notificationLoadFailed")),
      )
      .finally(() => setNotificationsLoading(false));
  }, [activeSection]);

  const loadRecoveryCodes = async () => {
    setActionError(null);
    try {
      const result = await regenerateMfaRecoveryCodes();
      setRecoveryCodes(result.recovery_codes);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : t("securityActionFailed"));
    }
  };

  const markRead = async (notification: NotificationItem) => {
    if (notification.read) return;
    setActionError(null);
    try {
      await markNotificationRead(notification.id);
      setNotifications((current) =>
        current.map((item) =>
          item.id === notification.id ? { ...item, read: true } : item,
        ),
      );
    } catch (error) {
      setActionError(error instanceof Error ? error.message : t("notificationActionFailed"));
    }
  };

  const localizeNotification = (item: NotificationItem) => {
    if (language === "ar") {
      let title = item.title;
      let body = item.body;
      if (item.kind === "patient_message" || title.toLowerCase().includes("patient message") || title.includes("رسالة جديدة")) {
        title = "رسالة جديدة من مريض";
        body = "توجد رسالة جديدة في صندوق رسائل فريق الرعاية.";
      } else if (title.includes("Lab Results Ready") || title.includes("نتائج التحاليل")) {
        title = title.replace("Lab Results Ready - ", "نتائج التحاليل جاهزة - ");
        body = "وصلت نتائج فحص الدهون والسكر التراكمي HbA1c. سكر الصائم 108 مجم/ديسيلتر.";
      } else if (title.includes("Upcoming Consultation") || title.includes("موعد استشارة")) {
        title = title.replace("Upcoming Consultation - ", "موعد استشارة قادم - ");
        body = "استشارة أمراض القلب مجدولة لليوم الساعة 11:30 صباحاً في الغرفة 2.";
      }
      return { title, body };
    } else {
      let title = item.title;
      let body = item.body;
      if (title.includes("رسالة جديدة") || item.kind === "patient_message") {
        title = "New patient message";
        body = "A new message is waiting in the care team inbox.";
      } else if (title.includes("نتائج التحاليل") || title.includes("Lab Results")) {
        title = "Lab Results Ready - Mariam Hassan (DEMO-001)";
        body = "Lipid panel and HbA1c results have arrived. Fasting blood glucose is 108 mg/dL.";
      } else if (title.includes("موعد استشارة") || title.includes("Upcoming Consultation")) {
        title = "Upcoming Consultation - Ahmed Mansour (DEMO-002)";
        body = "Cardiology consultation scheduled for today at 11:30 AM in Room 2.";
      }
      return { title, body };
    }
  };

  const handleNotificationClick = (item: NotificationItem) => {
    void markRead(item);
    if (!onNavigate) return;
    const titleLower = item.title.toLowerCase();
    const kindLower = (item.kind || "").toLowerCase();
    if (kindLower.includes("message") || titleLower.includes("message") || titleLower.includes("رسالة")) {
      onNavigate("messages");
    } else if (titleLower.includes("lab") || titleLower.includes("result") || titleLower.includes("تحاليل") || titleLower.includes("document")) {
      onNavigate("documents");
    } else if (titleLower.includes("consultation") || titleLower.includes("appointment") || titleLower.includes("موعد") || titleLower.includes("استشارة")) {
      onNavigate("appointments");
    }
  };

  const settingsSections = [
    { id: "profile" as const, label: t("profile"), icon: <UserRound size={17} /> },
    { id: "preferences" as const, label: t("preferences"), icon: <SlidersHorizontal size={17} /> },
    { id: "security" as const, label: t("security"), icon: <ShieldCheck size={17} /> },
    { id: "notifications" as const, label: t("notificationsSetting"), icon: <Bell size={17} /> },
  ];

  const getInitials = (name: string) => {
    const parts = name.trim().split(" ");
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.slice(0, 2).toUpperCase() || "DR";
  };

  return (
    <>
      <PageHeading
        eyebrow={t("workspace")}
        title={t("settingsTitle")}
        detail={t("settingsDetail")}
      />
      <div className="settings-layout" dir={language === "ar" ? "rtl" : "ltr"}>
        <nav className="panel settings-nav" aria-label={t("settingsTitle")}>
          {settingsSections.map((section) => (
            <button
              key={section.id}
              type="button"
              className={activeSection === section.id ? "active" : ""}
              aria-current={activeSection === section.id ? "page" : undefined}
              onClick={() => {
                setActiveSection(section.id);
                setActionError(null);
              }}
            >
              {section.icon} <span>{section.label}</span>
            </button>
          ))}
        </nav>

        <section className="settings-modern-card" aria-live="polite">
          {activeSection === "profile" && (
            <>
              <div className="settings-avatar-banner">
                <div className="settings-avatar-circle">
                  {getInitials(doctorName)}
                </div>
                <div className="settings-avatar-info">
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    <h3>{doctorName || "Dr. Rana Samir"}</h3>
                    <span className="status confirmed">
                      <UserCheck size={12} style={{ marginInlineEnd: "4px" }} />
                      {language === "ar" ? "حساب نشط وموثق" : "Verified Clinical Staff"}
                    </span>
                  </div>
                  <p>{language === "ar" ? "استشاري الباطنة العامة · مجمع CityCare الطبي" : "Internal Medicine Specialist · CityCare Medical Complex"}</p>
                </div>
              </div>

              <div className="settings-form-grid">
                <label>
                  {t("displayName")}
                  <input
                    value={doctorName}
                    placeholder="e.g. Dr. Rana Samir"
                    onChange={(event) => setDoctorName(event.target.value)}
                  />
                </label>

                <label>
                  {t("specialtyLabel")}
                  <input
                    defaultValue={language === "ar" ? "باطنه عامه" : "Internal Medicine"}
                  />
                </label>

                {canViewOrganization && (
                  <>
                    <label>
                      {t("organizationName")}
                      <input
                        value={organizationName || "CityCare Medical Complex"}
                        disabled={loading || !canManageOrganization}
                        onChange={(event) => setOrganizationName(event.target.value)}
                      />
                    </label>

                    <label>
                      {language === "ar" ? "الأقسام السريرية التابعة" : "Clinical Departments"}
                      <input
                        value={organizationDepartment}
                        disabled={loading || !canManageOrganization}
                        onChange={(event) => setOrganizationDepartment(event.target.value)}
                      />
                    </label>

                    <label style={{ gridColumn: "1 / -1" }}>
                      {language === "ar" ? "المنطقة الزمنية المعتمدة" : "Timezone"}
                      <select
                        value={organizationTimezone}
                        disabled={loading || !canManageOrganization}
                        onChange={(event) => setOrganizationTimezone(event.target.value)}
                      >
                        <option value="Africa/Cairo">Africa/Cairo (توقيت القاهرة GMT+2)</option>
                        <option value="Asia/Riyadh">Asia/Riyadh (توقيت الرياض GMT+3)</option>
                        <option value="UTC">UTC (Universal Coordinated Time)</option>
                        <option value="Europe/London">Europe/London (GMT)</option>
                      </select>
                    </label>
                  </>
                )}
              </div>

              {actionError && (
                <div className="inline-error" role="alert">
                  {actionError}
                </div>
              )}

              <div className="settings-actions" style={{ display: "flex", gap: "10px", marginTop: "10px", flexWrap: "wrap" }}>
                {canManageOrganization && (
                  <button
                    className="primary-btn"
                    style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
                    disabled={saving || loading || !organizationName.trim()}
                    onClick={async () => {
                      setSaving(true);
                      setActionError(null);
                      try {
                        await completeOrganization(
                          organizationName.trim(),
                          organizationDepartment.trim() || "Clinical care",
                          organizationTimezone,
                        );
                        window.dispatchEvent(
                          new CustomEvent("careos:toast", {
                            detail: language === "ar" ? "تم حفظ التغييرات بنجاح" : t("savedChanges"),
                          }),
                        );
                      } catch (error) {
                        setActionError(error instanceof Error ? error.message : t("organizationSaveFailed"));
                      } finally {
                        setSaving(false);
                      }
                    }}
                  >
                    <Save size={15} />
                    {saving ? t("working") : (language === "ar" ? "حفظ التغييرات" : t("saveChanges"))}
                  </button>
                )}
                <button
                  className="danger-btn"
                  style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
                  onClick={onLogout}
                >
                  <LogOut size={15} /> {language === "ar" ? "تسجيل الخروج" : t("signOut")}
                </button>
              </div>
            </>
          )}

          {activeSection === "preferences" && (
            <>
              <PanelHeading title={t("preferences")} detail={t("preferencesDetail")} />
              
              <div className="settings-form-grid">
                <label>
                  <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <Globe size={15} /> {t("languageSetting")}
                  </span>
                  <select value={language} onChange={(event) => setLanguage(event.target.value as Language)}>
                    <option value="ar">العربية (Arabic) - الافتراضية</option>
                    <option value="en">English (US)</option>
                  </select>
                </label>

                <label>
                  <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <Mic size={15} /> {language === "ar" ? "نبرة الصوت السريري للمساعد (TTS)" : "Clinical Assistant Voice (TTS)"}
                  </span>
                  <select
                    value={localStorage.getItem("careos-preferred-voice") === "Mariam" ? "Mariam" : "Mohammed"}
                    onChange={(event) => {
                      localStorage.setItem("careos-preferred-voice", event.target.value);
                      window.dispatchEvent(
                        new CustomEvent("careos:toast", {
                          detail: language === "ar" ? "تم حفظ نبرة الصوت المحددة" : "Voice preference saved",
                        }),
                      );
                    }}
                  >
                    <option value="Mohammed">
                      {language === "ar" ? "محمد - صوت مصري نيورالي رجالي (طبيعي وواضح)" : "Mohammed - Egyptian Neural Male (Natural & Clear)"}
                    </option>
                    <option value="Mariam">
                      {language === "ar" ? "مريم - صوت مصري نيورالي نسائي (هادئ ومهني)" : "Mariam - Egyptian Neural Female (Gentle & Professional)"}
                    </option>
                  </select>
                </label>
              </div>

              <div className="theme-setting" style={{ marginTop: "1rem" }}>
                <span style={{ fontWeight: 600, fontSize: "0.85rem", color: "var(--ink)", display: "block", marginBottom: "0.5rem" }}>
                  {t("themeSetting")}
                </span>
                <div className="settings-theme-options" style={{ display: "flex", gap: "10px" }}>
                  <button
                    type="button"
                    className={theme === "light" ? "active" : ""}
                    aria-pressed={theme === "light"}
                    onClick={() => setTheme("light")}
                    style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "8px 16px", borderRadius: "8px" }}
                  >
                    <Sun size={16} /> {t("lightMode")}
                  </button>
                  <button
                    type="button"
                    className={theme === "dark" ? "active" : ""}
                    aria-pressed={theme === "dark"}
                    onClick={() => setTheme("dark")}
                    style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "8px 16px", borderRadius: "8px" }}
                  >
                    <Moon size={16} /> {t("darkMode")}
                  </button>
                </div>
              </div>
            </>
          )}

          {activeSection === "security" && (
            <>
              <PanelHeading title={t("security")} detail={t("securityDetail")} />
              
              <div style={{ display: "grid", gap: "1rem", marginTop: "0.5rem" }}>
                <div style={{ padding: "1rem", borderRadius: "10px", background: "var(--canvas)", border: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
                  <div>
                    <strong style={{ display: "block", color: "var(--ink)" }}>{t("mfaStatus")}</strong>
                    <span style={{ fontSize: "12px", color: "var(--muted)" }}>
                      {language === "ar" ? "حماية الحساب عبر المصادقة الثنائية (TOTP Authenticator)" : "Two-factor authentication with authenticator apps"}
                    </span>
                  </div>
                  <span className={`status ${mfaEnabled ? "confirmed" : "pending"}`}>
                    {mfaEnabled === null ? t("working") : mfaEnabled ? t("mfaEnabled") : t("mfaDisabled")}
                  </span>
                </div>

                <div style={{ padding: "1rem", borderRadius: "10px", background: "var(--canvas)", border: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
                  <div>
                    <strong style={{ display: "block", color: "var(--ink)" }}>
                      {language === "ar" ? "دخول المستشفى الموحد (Enterprise SSO)" : "Hospital Enterprise SSO"}
                    </strong>
                    <span style={{ fontSize: "12px", color: "var(--muted)" }}>
                      {language === "ar" ? "مفعل ومربوط بدليل Active Directory / Azure AD للمستشفى" : "Connected and audited via Active Directory / Azure AD"}
                    </span>
                  </div>
                  <span className="status confirmed">
                    <ShieldCheck size={13} style={{ marginInlineEnd: "4px" }} />
                    {language === "ar" ? "نشط ومؤمن" : "Active & Audited"}
                  </span>
                </div>
              </div>

              {mfaEnabled === false && !mfaSecret && (
                <div style={{ marginTop: "1rem" }}>
                  <p style={{ fontSize: "13px", color: "var(--muted)", marginBottom: "0.75rem" }}>
                    {t("mfaSetupInstructions")}
                  </p>
                  <button
                    className="primary-btn"
                    type="button"
                    style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
                    onClick={async () => {
                      setActionError(null);
                      try {
                        const result = await enrollMfa();
                        setMfaSecret(result.secret);
                      } catch (error) {
                        setActionError(error instanceof Error ? error.message : t("securityActionFailed"));
                      }
                    }}
                  >
                    <ShieldCheck size={16} /> {t("enableMfa")}
                  </button>
                </div>
              )}

              {mfaSecret && (
                <div style={{ marginTop: "1rem", padding: "1rem", border: "1px dashed var(--line)", borderRadius: "8px" }}>
                  <p style={{ fontSize: "13px", color: "var(--ink)" }}>{t("mfaSecretInstructions")}</p>
                  <code style={{ display: "block", padding: "8px 12px", background: "var(--canvas)", borderRadius: "6px", margin: "8px 0", letterSpacing: "1px" }}>
                    {mfaSecret}
                  </code>
                  <label style={{ display: "flex", flexDirection: "column", gap: "4px", margin: "10px 0" }}>
                    {t("verificationCode")}
                    <input
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      value={mfaCode}
                      placeholder="123456"
                      onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                      style={{ maxWidth: "200px" }}
                    />
                  </label>
                  <button
                    className="primary-btn"
                    type="button"
                    disabled={mfaCode.length !== 6}
                    onClick={async () => {
                      setActionError(null);
                      try {
                        const result = await verifyMfa(mfaCode);
                        setMfaEnabled(result.enabled);
                        setRecoveryCodes(result.recovery_codes);
                        setMfaSecret("");
                        setMfaCode("");
                      } catch (error) {
                        setActionError(error instanceof Error ? error.message : t("securityActionFailed"));
                      }
                    }}
                  >
                    <Check size={16} /> {t("verifyMfa")}
                  </button>
                </div>
              )}

              {mfaEnabled && (
                <div style={{ marginTop: "1rem" }}>
                  <button
                    className="outline-btn"
                    type="button"
                    style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
                    onClick={() => void loadRecoveryCodes()}
                  >
                    <KeyRound size={15} /> {t("regenerateRecoveryCodes")}
                  </button>
                </div>
              )}

              {recoveryCodes.length > 0 && (
                <div className="recovery-codes" aria-live="polite" style={{ marginTop: "1rem", padding: "1rem", background: "var(--canvas)", borderRadius: "8px" }}>
                  <strong>{t("recoveryCodes")}</strong>
                  <p style={{ fontSize: "12px", color: "var(--muted)", margin: "4px 0 10px" }}>{t("recoveryCodesWarning")}</p>
                  <ul style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "6px", padding: 0, listStyle: "none" }}>
                    {recoveryCodes.map((code) => (
                      <li key={code}><code style={{ padding: "4px 8px", background: "var(--paper)", borderRadius: "4px" }}>{code}</code></li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}

          {activeSection === "notifications" && (
            <>
              <PanelHeading title={t("notificationsSetting")} detail={t("notificationsDetail")} />
              {notificationsLoading ? (
                <div className="loading-state">{t("working")}</div>
              ) : notifications.length ? (
                <div style={{ display: "grid", gap: "0.75rem", marginTop: "0.5rem" }}>
                  {notifications.map((notification) => {
                    const localized = localizeNotification(notification);
                    return (
                      <article
                        key={notification.id}
                        onClick={() => handleNotificationClick(notification)}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: "12px",
                          padding: "1rem 1.25rem",
                          borderRadius: "10px",
                          border: "1px solid var(--line)",
                          background: notification.read ? "var(--canvas)" : "linear-gradient(135deg, rgba(20, 93, 88, 0.04), rgba(14, 165, 142, 0.02))",
                          cursor: "pointer",
                          transition: "border-color 0.15s",
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                            <strong style={{ color: "var(--ink)", fontSize: "0.92rem" }}>{localized.title}</strong>
                            {!notification.read && (
                              <span className="status pending" style={{ fontSize: "10px", padding: "2px 6px" }}>
                                {language === "ar" ? "جديد" : "New"}
                              </span>
                            )}
                          </div>
                          <p style={{ margin: "2px 0 6px", color: "var(--muted)", fontSize: "0.82rem" }}>{localized.body}</p>
                          <time style={{ fontSize: "11px", color: "var(--muted)" }} dateTime={notification.created_at}>
                            {new Date(notification.created_at).toLocaleString(language === "ar" ? "ar-EG" : "en-US")}
                          </time>
                        </div>
                        <button
                          className="outline-btn"
                          type="button"
                          style={{ flexShrink: 0, fontSize: "11px", padding: "6px 12px" }}
                          disabled={notification.read}
                          onClick={(e) => {
                            e.stopPropagation();
                            void markRead(notification);
                          }}
                        >
                          {notification.read ? (language === "ar" ? "مقروء" : t("read")) : (language === "ar" ? "تمييز كمقروء" : t("markRead"))}
                        </button>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="empty-state">{t("noNotifications")}</div>
              )}
            </>
          )}

          {actionError && <div className="inline-error settings-error" role="alert">{actionError}</div>}
        </section>
      </div>
    </>
  );
}

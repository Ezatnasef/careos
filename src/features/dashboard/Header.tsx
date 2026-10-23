import { useEffect, useState } from "react";
import {
  Bell,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Menu,
  Moon,
  Sun,
  UserRound,
} from "lucide-react";
import {
  getNotifications,
  markNotificationRead,
} from "../../api/notifications";
import { GlobalChat } from "../chat/GlobalChat";
import { navItems, type Role } from "../workspace/navigation";
import type { AppView } from "../../app/routes";
import { viewFromLocation } from "../../app/routes";
import type { Language, TranslationKey } from "../../i18n";

type Theme = "light" | "dark";
type Translator = (key: TranslationKey) => string;

type HeaderProps = {
  view: AppView;
  language: Language;
  setLanguage: (language: Language) => void;
  setMobileNav: (open: boolean) => void;
  showNotifications: boolean;
  setShowNotifications: (show: boolean) => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  onHelp: () => void;
  onAccount: () => void;
  onNavigate: (view: AppView) => void;
  t: Translator;
  role?: Role;
  allowDemoRoleSwitch?: boolean;
  onRoleChange?: (role: Role) => void;
};

export function Header({
  view,
  language,
  setLanguage,
  setMobileNav,
  showNotifications,
  setShowNotifications,
  theme,
  setTheme,
  onHelp,
  onAccount,
  onNavigate,
  t,
  role,
  allowDemoRoleSwitch = false,
  onRoleChange,
}: HeaderProps) {
  const routeView = viewFromLocation();
  const displayedView =
    view === "portal" &&
    (routeView === "appointments" || routeView === "messages")
      ? routeView
      : view;
  const current = navItems.find((item) => item.id === displayedView) ?? navItems[0];
  const [notifications, setNotifications] = useState<
    Array<{ id: string; kind: string; title: string; body: string; read: boolean }>
  >([]);
  const [notificationError, setNotificationError] = useState("");

  useEffect(() => {
    if (role === "patient") {
      setNotifications([]);
      return;
    }
    const loadNotifications = () => {
      getNotifications()
        .then((items) => {
          setNotifications(items.slice(0, 5));
          setNotificationError("");
        })
        .catch(() => setNotificationError(t("notificationLoadFailed")));
    };
    loadNotifications();
    const interval = window.setInterval(loadNotifications, 15_000);
    return () => window.clearInterval(interval);
  }, [role, showNotifications, language]);

  const getLocalizedNotification = (notif: { kind: string; title: string; body: string }) => {
    if (language === "ar") {
      let title = notif.title;
      let body = notif.body;
      if (notif.kind === "patient_message" || title.toLowerCase().includes("patient message") || title.includes("رسالة جديدة")) {
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
      let title = notif.title;
      let body = notif.body;
      if (title.includes("رسالة جديدة") || notif.kind === "patient_message") {
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

  const handleNotificationClick = async (notification: { id: string; kind: string; title: string; body: string; read: boolean }) => {
    if (!notification.read) {
      try {
        await markNotificationRead(notification.id);
        setNotifications((current) =>
          current.map((item) =>
            item.id === notification.id ? { ...item, read: true } : item,
          ),
        );
        setNotificationError("");
      } catch {
        setNotificationError(t("notificationActionFailed"));
        return;
      }
    }
    setShowNotifications(false);
    const titleLower = notification.title.toLowerCase();
    const kindLower = (notification.kind || "").toLowerCase();
    if (kindLower.includes("message") || titleLower.includes("message") || titleLower.includes("رسالة")) {
      onNavigate(role === "patient" ? "portal" : "messages");
    } else if (titleLower.includes("lab") || titleLower.includes("result") || titleLower.includes("تحاليل") || titleLower.includes("document") || titleLower.includes("تقرير")) {
      onNavigate(role === "patient" ? "portal" : "documents");
    } else if (titleLower.includes("consultation") || titleLower.includes("appointment") || titleLower.includes("موعد") || titleLower.includes("استشارة")) {
      onNavigate(role === "patient" ? "portal" : "appointments");
    } else {
      onNavigate(role === "patient" ? "portal" : "dashboard");
    }
  };

  return (
    <header className="topbar">
      <button
        className="icon-btn menu-btn"
        onClick={() => setMobileNav(true)}
        aria-label={t("openNavigation")}
      >
        <Menu size={20} />
      </button>
      <button
        type="button"
        className="breadcrumb"
        onClick={() => onNavigate(role === "patient" ? "portal" : "dashboard")}
        aria-label={t("workspaceOverview")}
      >
        <span>{t("workspace")}</span>
        <ChevronRight size={14} />
        <strong>{t(current.label)}</strong>
      </button>
      <div className="top-actions">
        {allowDemoRoleSwitch && onRoleChange && role && (
          <select
            value={role}
            onChange={(e) => onRoleChange(e.target.value as Role)}
            className="glass-control-btn role-switch-control"
            aria-label={t("demoRole")}
          >
            <option value="doctor">{t("demoRoleDoctor")}</option>
            <option value="admin">{t("demoRoleAdmin")}</option>
            <option value="nurse">{t("demoRoleNurse")}</option>
            <option value="receptionist">{t("demoRoleReceptionist")}</option>
            <option value="hospital_director">{t("demoRoleDirector")}</option>
            <option value="patient">{t("demoRolePatient")}</option>
          </select>
        )}
        <button
          type="button"
          className="glass-control-btn glass-icon-btn topbar-control-btn"
          aria-label={theme === "light" ? t("darkMode") : t("lightMode")}
          onClick={() => setTheme(theme === "light" ? "dark" : "light")}
        >
          {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
        </button>
        <label className="topbar-language-control">
          <select
            className="topbar-language-btn"
            value={language}
            onChange={(event) =>
              setLanguage(event.target.value === "ar" ? "ar" : "en")
            }
            aria-label={t("languageSetting")}
          >
            <option value="en">EN</option>
            <option value="ar">AR</option>
          </select>
          <ChevronDown size={13} />
        </label>
        <button
          type="button"
          className="icon-btn topbar-icon-btn"
          aria-label={t("help")}
          onClick={onHelp}
        >
          <CircleHelp size={19} />
        </button>
        <div className="notification-wrap">
          <button
            type="button"
            className="icon-btn notification topbar-icon-btn"
            aria-label={t("notificationLabel")}
            onClick={() => setShowNotifications(!showNotifications)}
          >
            <Bell size={19} />
            {notifications.some((notification) => !notification.read) && <i />}
          </button>

          {showNotifications && (
            <div className="notification-popover" dir={language === "ar" ? "rtl" : "ltr"}>
              <strong>{t("notifications")}</strong>
              {notificationError && (
                <p role="alert">{notificationError}</p>
              )}
              {notifications.length > 0 ? (
                notifications.map((notification) => {
                  const localized = getLocalizedNotification(notification);
                  return (
                    <button
                      className="notification-item"
                      key={notification.id}
                      onClick={() => void handleNotificationClick(notification)}
                      style={{ cursor: "pointer", textAlign: language === "ar" ? "right" : "left" }}
                    >
                      <b style={{ color: "var(--ink)" }}>{localized.title}</b>
                      <br />
                      <span style={{ color: "var(--muted)", fontSize: "12px" }}>{localized.body}</span>
                    </button>
                  );
                })
              ) : (
                <p>{t("noNotifications")}</p>
              )}
            </div>
          )}
        </div>
        <button
          type="button"
          className="top-avatar"
          onClick={onAccount}
          aria-label="Open account"
        >
          <UserRound size={18} aria-hidden="true" />
        </button>
      </div>
      <GlobalChat
        t={t}
        guest={role === "patient"}
        language={language}
        role={role ?? "receptionist"}
        view={displayedView}
      />
    </header>
  );
}

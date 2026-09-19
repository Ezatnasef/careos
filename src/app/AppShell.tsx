import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { LoadingState } from "../components/LoadingState";
import { bootstrapAuth, bootstrapPortalAuth } from "./authBootstrap";
import { navigateToView, viewFromLocation, type AppView } from "./routes";
import { translations, type Language, type TranslationKey } from "../i18n";
import { completeOrganization, exchangeHospitalSso, logout as apiLogout, login as apiLogin, portalLogin, register as apiRegister, startHospitalSso } from "../api";
import { canAccessView, roleAccessWarning, type Role } from "../features/workspace/navigation";
import { LoginRoute } from "../features/auth/LoginRoute";
import { Onboarding } from "../features/auth/Onboarding";
import { Sidebar } from "../features/dashboard/Sidebar";
import { Header } from "../features/dashboard/Header";
import { Dashboard } from "../features/dashboard/Dashboard";
import { Assistant } from "../features/dashboard/Assistant";
import { ClinicalNotes } from "../features/dashboard/ClinicalNotes";
import { Patients } from "../features/patients/Patients";
import { Appointments } from "../features/appointments/Appointments";
import { DocumentWorkflow } from "../features/documents/DocumentWorkflow";
import { Messages } from "../features/messages/Messages";
import { PatientPortal } from "../features/portal/PatientPortal";
import { Analytics } from "../features/analytics/Analytics";
import { TeamAudit, } from "../features/settings/TeamAudit";
import { IntegrationHub } from "../features/settings/IntegrationHub";
import { SettingsPage } from "../features/settings/SettingsPage";
import { Landing } from "../features/landing/Landing";
import type { ReactNode } from "react";

type Theme = "light" | "dark";
type Translator = (key: TranslationKey) => string;

export default function AppShell() {
  const [showLanding, setShowLanding] = useState(() => !window.location.hash.startsWith("#app"));
  const [userRole, setUserRole] = useState<Role>(() => (localStorage.getItem("careos-user-role") as Role) || "doctor");
  const [view, setView] = useState<AppView>(() => viewFromLocation());
  const [language, setLanguage] = useState<Language>(() => (localStorage.getItem("careos-language") as Language) || "en");
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem("careos-theme") as Theme) || "light");
  const [authStatus, setAuthStatus] = useState<"checking" | "authenticated" | "unauthenticated">("checking");
  const [onboardingComplete, setOnboardingComplete] = useState(() => localStorage.getItem("careos-onboarding-complete") === "true");
  const [portalMode, setPortalMode] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [loginMode, setLoginMode] = useState<"signin" | "signup">("signin");
  const [loginAccessMethod, setLoginAccessMethod] = useState<"email" | "sso">("email");
  const [toast, setToast] = useState<string | null>(null);
  const [doctorName, setDoctorName] = useState(() => localStorage.getItem("careos-doctor-name") || "Dr. Rana Samir");
  const [department, setDepartment] = useState(() => localStorage.getItem("careos-user-department") || "General Medicine");
  const [project, setProject] = useState(() => localStorage.getItem("careos-user-project") || "Outpatient");
  const loggedIn = authStatus === "authenticated";
  const t: Translator = (key) => translations[language][key] ?? translations.en[key];
  const changeLanguage = (next: Language) => { setLanguage(next); localStorage.setItem("careos-language", next); };
  const changeTheme = (next: Theme) => { setTheme(next); localStorage.setItem("careos-theme", next); };
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(null), 2800); };
  const changeView = (next: AppView) => { if (!canAccessView(userRole, next)) { notify(roleAccessWarning[userRole] || "This page is not available to your current role."); return; } setView(next); localStorage.setItem("careos-active-view", next); navigateToView(next); };

  useEffect(() => { const handler = () => { if (!window.location.hash.startsWith("#app")) { setShowLanding(true); return; } setShowLanding(false); const next = viewFromLocation(); if (canAccessView(userRole, next)) setView(next); }; window.addEventListener("hashchange", handler); window.addEventListener("popstate", handler); return () => { window.removeEventListener("hashchange", handler); window.removeEventListener("popstate", handler); }; }, [userRole]);
  useEffect(() => { const token = localStorage.getItem("careos-access-token"); const portalToken = localStorage.getItem("careos-portal-token"); if (!token && !portalToken) { setAuthStatus("unauthenticated"); return; } let active = true; const restore = token ? bootstrapAuth().then((user) => ({ kind: "staff" as const, user })) : bootstrapPortalAuth().then((user) => ({ kind: "portal" as const, user })); restore.then((result) => { if (!active || !result.user) return; setDoctorName(result.user.full_name); setPortalMode(result.kind === "portal"); if (result.kind === "staff") { setUserRole((result.user.role as Role) || "doctor"); setDepartment(result.user.department || "General Medicine"); setProject(result.user.project || "Outpatient"); setOnboardingComplete(Boolean(result.user.onboarding_complete)); } else setOnboardingComplete(true); setShowLanding(false); setAuthStatus("authenticated"); }).catch(() => { localStorage.removeItem("careos-access-token"); localStorage.removeItem("careos-portal-token"); setAuthStatus("unauthenticated"); }); return () => { active = false; }; }, []);
  useEffect(() => { const handler = (event: Event) => notify((event as CustomEvent<string>).detail); window.addEventListener("careos:toast", handler); return () => window.removeEventListener("careos:toast", handler); }, []);

  if (authStatus === "checking") return <div className="app-loading-screen"><ShieldCheck size={22} /><LoadingState label={language === "ar" ? "جارٍ التحقق من الجلسة..." : "Checking your session..."} /></div>;
  if (showLanding && !loggedIn) return <Landing language={language} setLanguage={changeLanguage} onEnter={(mode = "signin") => { setLoginMode(mode); window.location.hash = "app"; setShowLanding(false); }} t={t} theme={theme} setTheme={changeTheme} />;
  if (!loggedIn) return <LoginRoute language={language} setLanguage={changeLanguage} initialMode={loginMode} initialAccessMethod={loginAccessMethod} onBackHome={() => { setShowLanding(true); window.location.hash = ""; }} t={t} onLogin={async ({ mode, email, password, fullName, organizationName, authMethod, role, department: nextDepartment = "", project: nextProject = "" }) => { try { if (role === "patient" && authMethod !== "sso") { const result = await portalLogin(email, password); setDoctorName(result.user.full_name); setPortalMode(true); setOnboardingComplete(true); setAuthStatus("authenticated"); return; } const result = authMethod === "sso" ? await (async () => { const start = await startHospitalSso("hospital_sso", email); return exchangeHospitalSso("demo-sso-code", start.state, "hospital_sso"); })() : mode === "signup" ? await apiRegister(email, password, fullName, organizationName, nextDepartment, nextProject) : await apiLogin(email, password); setDoctorName(result.user.full_name); setUserRole((result.user.role as Role) || role); setDepartment(result.user.department || "General Medicine"); setProject(result.user.project || "Outpatient"); setLoginAccessMethod(authMethod); setOnboardingComplete(Boolean(result.user.onboarding_complete)); setAuthStatus("authenticated"); } catch (error) { if (import.meta.env.DEV) { setLoginAccessMethod(authMethod); setOnboardingComplete(false); setAuthStatus("authenticated"); notify(t("demoMode")); } else notify(error instanceof Error ? error.message : "Could not connect to the server."); } }} />;
  if (!onboardingComplete) return <Onboarding language={language} setLanguage={changeLanguage} t={t} complete={async (name) => { try { await Promise.race([completeOrganization(name, "Clinical care", "Africa/Cairo"), new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error("Workspace setup timed out")), 5000))]); } catch { notify(t("demoMode")); } localStorage.setItem("careos-onboarding-complete", "true"); setOnboardingComplete(true); }} onBack={() => { setAuthStatus("unauthenticated"); setOnboardingComplete(false); }} />;

  const pages: Partial<Record<AppView, ReactNode>> = { dashboard: <Dashboard onNavigate={changeView} doctorName={doctorName} t={t} role={userRole} department={department} project={project} />, patients: <Patients t={t} department={department} project={project} />, assistant: <Assistant t={t} />, notes: <ClinicalNotes t={t} />, documents: <DocumentWorkflow t={t} />, appointments: <Appointments t={t} language={language} />, messages: <Messages t={t} />, portal: <PatientPortal t={t} />, analytics: <Analytics t={t} />, settings: <SettingsPage language={language} setLanguage={changeLanguage} theme={theme} setTheme={changeTheme} doctorName={doctorName} setDoctorName={(name) => { setDoctorName(name); localStorage.setItem("careos-doctor-name", name); }} onLogout={async () => { await apiLogout(); setAuthStatus("unauthenticated"); }} t={t} />, integrations: <IntegrationHub />, teamAudit: <TeamAudit t={t} language={language} /> };
  return <div className={`app-shell ${theme === "dark" ? "dark-mode" : ""}`} dir={language === "ar" ? "rtl" : "ltr"}><Sidebar view={view} setView={changeView} mobileNav={mobileNav} setMobileNav={setMobileNav} language={language} doctorName={doctorName} role={userRole} t={t} />{mobileNav && <button className="mobile-overlay" onClick={() => setMobileNav(false)} aria-label={t("closeNavigation")} />}<main className="main-content"><Header view={view} language={language} setLanguage={changeLanguage} setMobileNav={setMobileNav} showNotifications={showNotifications} setShowNotifications={setShowNotifications} theme={theme} setTheme={changeTheme} onHelp={() => setHelpOpen(true)} t={t} /><div className="page-content">{pages[view] ?? pages.dashboard}</div></main>{helpOpen && <div className="modal-backdrop" onClick={() => setHelpOpen(false)}><div className="modal" onClick={(event) => event.stopPropagation()}><h2>{t("helpTitle")}</h2><p>{t("helpBody")}</p><button className="primary-btn" onClick={() => setHelpOpen(false)}>{t("close")}</button></div></div>}{toast && <div className="toast" role="status">{toast}</div>}</div>;
}

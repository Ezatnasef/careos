import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { LoadingState } from "../components/LoadingState";
import { bootstrapAuth, bootstrapPortalAuth } from "./authBootstrap";
import { navigateToView, viewFromLocation, type AppView } from "./routes";
import { translations, type Language, type TranslationKey } from "../i18n";
import { completeOrganization, demoLogin as apiDemoLogin, exchangeHospitalSso, logout as apiLogout, login as apiLogin, portalLogin, portalSignUp, register as apiRegister, startHospitalSso } from "../api";
import { canAccessView, firstAllowedView, normalizeFrontendRole, roleAccessWarning, rolePermissions, type Role } from "../features/workspace/navigation";
import { LoginRoute, type DemoAccount } from "../features/auth/LoginRoute";
import { Onboarding } from "../features/auth/Onboarding";
import { Sidebar } from "../features/dashboard/Sidebar";
import { Header } from "../features/dashboard/Header";
import { RoleDashboard } from "../features/dashboard/RoleDashboard";
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
import { AccountPage } from "../features/settings/AccountPage";
import { Landing } from "../features/landing/Landing";
import { DepartmentOverview } from "../features/workspace/DepartmentOverview";
import { ReportsPage } from "../features/workspace/ReportsPage";
import { AdminHub } from "../features/workspace/AdminHub";
import { FileLibrary } from "../features/workspace/FileLibrary";
import { StaffManagement } from "../features/workspace/StaffManagement";
import { ClinicOperationsBoard } from "../features/workspace/ClinicOperationsBoard";
import { ContactDirectory } from "../features/directory/ContactDirectory";
import type { ReactNode } from "react";

type Theme = "light" | "dark";
type Translator = (key: TranslationKey) => string;

export default function AppShell() {
  const [showLanding, setShowLanding] = useState(() => !window.location.hash.startsWith("#app"));
  const [userRole, setUserRole] = useState<Role>("receptionist");
  const [userPermissions, setUserPermissions] = useState<string[]>([]);
  const [view, setView] = useState<AppView>(() => viewFromLocation());
  const [language, setLanguage] = useState<Language>(() => (localStorage.getItem("careos-language") as Language) || "ar");
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
  const isOfflineDemo = localStorage.getItem("careos-demo-mode") === "true";
  const t: Translator = (key) => translations[language][key] ?? translations.en[key];
  const changeLanguage = (next: Language) => { setLanguage(next); localStorage.setItem("careos-language", next); };
  const changeTheme = (next: Theme) => { setTheme(next); localStorage.setItem("careos-theme", next); };
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(null), 2800); };
  const changeView = (next: AppView) => {
    if (!canAccessView(userRole, next, userPermissions)) {
      const fallback = firstAllowedView(userRole, userPermissions);
      setView(fallback);
      navigateToView(fallback);
      return;
    }
    setView(next);
    localStorage.setItem("careos-active-view", next);
    navigateToView(next);
  };

  useEffect(() => {
    const handler = () => {
      if (!window.location.hash.startsWith("#app")) {
        setShowLanding(true);
        return;
      }
      if (!loggedIn) return;
      setShowLanding(false);
      const next = viewFromLocation();
      if (canAccessView(userRole, next, userPermissions)) {
        setView(next);
        return;
      }
      const fallback = firstAllowedView(userRole, userPermissions);
      setView(fallback);
      if (next !== fallback) navigateToView(fallback);
    };
    window.addEventListener("hashchange", handler);
    window.addEventListener("popstate", handler);
    return () => {
      window.removeEventListener("hashchange", handler);
      window.removeEventListener("popstate", handler);
    };
  }, [loggedIn, userPermissions, userRole]);
  useEffect(() => {
    if (!loggedIn || !window.location.hash.startsWith("#app")) return;
    const next = viewFromLocation();
    if (canAccessView(userRole, next, userPermissions)) {
      setView(next);
      return;
    }
    const fallback = firstAllowedView(userRole, userPermissions);
    setView(fallback);
    navigateToView(fallback);
  }, [loggedIn, userPermissions, userRole]);
  useEffect(() => {
    const token = localStorage.getItem("careos-access-token");
    const portalToken = localStorage.getItem("careos-portal-token");
    if (!token && !portalToken) {
      setAuthStatus("unauthenticated");
      return;
    }

    let active = true;
    const restore = token
      ? bootstrapAuth().then((user) => ({ kind: "staff" as const, user }))
      : bootstrapPortalAuth().then((user) => ({ kind: "portal" as const, user }));

    restore
      .then((result) => {
        if (!active) return;
        if (!result.user) {
          setAuthStatus("unauthenticated");
          return;
        }

        setDoctorName(result.user.full_name);
        setPortalMode(result.kind === "portal");
        if (result.kind === "staff") {
          setUserRole(normalizeFrontendRole(result.user.role));
          setUserPermissions(result.user.permissions ?? []);
          setDepartment(result.user.department || "General Medicine");
          setProject(result.user.project || "Outpatient");
          setOnboardingComplete(Boolean(result.user.onboarding_complete));
        } else {
          setUserRole("patient");
          setUserPermissions([]);
          setView("portal");
          setOnboardingComplete(true);
        }
        setShowLanding(false);
        setAuthStatus("authenticated");
      })
      .catch(() => {
        if (!active) return;
        localStorage.removeItem("careos-access-token");
        localStorage.removeItem("careos-portal-token");
        setAuthStatus("unauthenticated");
      });

    return () => {
      active = false;
    };
  }, []);
  useEffect(() => { const handler = (event: Event) => notify((event as CustomEvent<string>).detail); window.addEventListener("careos:toast", handler); return () => window.removeEventListener("careos:toast", handler); }, []);
  useEffect(() => {
    const handleSessionExpired = () => {
      setAuthStatus("unauthenticated");
      setPortalMode(false);
      setUserPermissions([]);
      setShowLanding(false);
      window.dispatchEvent(
        new CustomEvent("careos:toast", {
          detail: translations[language].sessionExpired,
        }),
      );
    };
    window.addEventListener("careos:session-expired", handleSessionExpired);
    return () =>
      window.removeEventListener("careos:session-expired", handleSessionExpired);
  }, [language]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    if (!code || !state) return;
    const expectedState = sessionStorage.getItem("careos-sso-state");
    sessionStorage.removeItem("careos-sso-state");
    window.history.replaceState({}, "", `${window.location.pathname}${window.location.hash}`);
    if (!expectedState || expectedState !== state) {
      setAuthStatus("unauthenticated");
      notify("SSO verification failed: invalid state.");
      return;
    }
    let active = true;
    exchangeHospitalSso(code, state, "hospital_sso").then((result) => {
      if (!active) return;
      setDoctorName(result.user.full_name);
      setUserRole(normalizeFrontendRole(result.user.role));
      setUserPermissions(result.user.permissions ?? []);
      setDepartment(result.user.department || "General Medicine");
      setProject(result.user.project || "Outpatient");
      setOnboardingComplete(Boolean(result.user.onboarding_complete));
      setShowLanding(false);
      setAuthStatus("authenticated");
    }).catch((error) => {
      if (active) {
        setAuthStatus("unauthenticated");
        notify(error instanceof Error ? error.message : "Hospital SSO verification failed.");
      }
    });
    return () => { active = false; };
  }, []);

  const handleDemoLogin = async (account: DemoAccount, customName?: string) => {
    try {
      const result = await apiDemoLogin(account.role, account.username, account.password);
      if (result.portal_access_token) {
        setPortalMode(true);
        setDoctorName(customName || result.user.full_name);
        setUserRole("patient");
        setUserPermissions([]);
        setView("portal");
        setOnboardingComplete(true);
        navigateToView("portal");
      } else {
        const user = result.user as {
          full_name: string;
          role: string;
          permissions?: string[];
          department?: string;
          project?: string;
          onboarding_complete?: boolean;
        };
        setPortalMode(false);
        const displayName = customName
          ? (customName.startsWith("د.") || customName.toLowerCase().startsWith("dr.") ? customName : `د. ${customName}`)
          : user.full_name;
        setDoctorName(displayName);
        setUserRole(normalizeFrontendRole(user.role));
        setUserPermissions(user.permissions ?? []);
        setDepartment(user.department || "General Medicine");
        setProject(user.project || "Demo workspace");
        setOnboardingComplete(Boolean(user.onboarding_complete));
        setView("dashboard");
        localStorage.setItem("careos-active-view", "dashboard");
        navigateToView("dashboard");
      }
      setShowLanding(false);
      setAuthStatus("authenticated");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Demo login failed.");
    }
  };

  if (authStatus === "checking") return <div className="app-loading-screen"><ShieldCheck size={22} /><LoadingState label={language === "ar" ? "جارٍ التحقق من الجلسة..." : "Checking your session..."} /></div>;
  if (showLanding && !loggedIn) return <Landing language={language} setLanguage={changeLanguage} onEnter={(mode = "signin") => { setLoginMode(mode); window.location.hash = "app/dashboard"; setView("dashboard"); setShowLanding(false); }} onDemoLogin={handleDemoLogin} t={t} theme={theme} setTheme={changeTheme} />;
  if (!loggedIn) return <LoginRoute theme={theme} language={language} setLanguage={setLanguage} initialMode={loginMode} initialAccessMethod={loginAccessMethod} onBackHome={() => { setShowLanding(true); window.location.hash = ""; }} t={t} onDemoLogin={handleDemoLogin} onLogin={async ({ mode, email, password, fullName, organizationName, authMethod, role, department: nextDepartment = "", project: nextProject = "", patientData }) => { try { if (authMethod === "sso") { const start = await startHospitalSso("hospital_sso", email); sessionStorage.setItem("careos-sso-state", start.state); window.location.assign(start.redirect_url); return; } if (role === "patient") { if (patientData) { localStorage.setItem("careos-patient-profile", JSON.stringify(patientData)); } try { const result = mode === "signup" ? await portalSignUp({ full_name: fullName, email, password, phone: patientData?.phone || "", national_id: patientData?.nationalId, date_of_birth: patientData?.dateOfBirth, gender: patientData?.gender, blood_type: patientData?.bloodType, emergency_contact: patientData?.emergencyContact, chronic_conditions: patientData?.chronicConditions, allergies: patientData?.allergies, address: patientData?.address }) : await portalLogin(email, password); setDoctorName(result.user.full_name || fullName || "مريض CareOS"); } catch (err) { notify(err instanceof Error ? err.message : "فشل تسجيل الدخول أو إنشاء الحساب"); return; } setPortalMode(true); setUserRole("patient"); setUserPermissions([]); setOnboardingComplete(true); setAuthStatus("authenticated"); setView("portal"); localStorage.setItem("careos-active-view", "portal"); navigateToView("portal"); return; } const result = mode === "signup" ? await apiRegister(email, password, fullName, organizationName, nextDepartment, nextProject) : await apiLogin(email, password); setDoctorName(result.user.full_name); setUserRole(normalizeFrontendRole(result.user.role)); setUserPermissions(result.user.permissions ?? []); setDepartment(result.user.department || "General Medicine"); setProject(result.user.project || "Outpatient"); setLoginAccessMethod(authMethod); setOnboardingComplete(Boolean(result.user.onboarding_complete)); setView("dashboard"); localStorage.setItem("careos-active-view", "dashboard"); navigateToView("dashboard"); setAuthStatus("authenticated"); } catch (error) { notify(error instanceof Error ? error.message : "Could not connect to the server."); } }} />;
  if (!onboardingComplete) return <Onboarding language={language} setLanguage={changeLanguage} t={t} complete={async (name, dept = "General Medicine", tz = "Africa/Cairo") => { try { await Promise.race([completeOrganization(name, dept, tz), new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error("Workspace setup timed out")), 5000))]); localStorage.setItem("careos-onboarding-complete", "true"); setDepartment(dept); setOnboardingComplete(true); } catch (error) { notify(error instanceof Error ? error.message : "Could not complete workspace setup."); } }} onBack={() => { setAuthStatus("unauthenticated"); setOnboardingComplete(false); }} />;

  const logout = async () => { await apiLogout(); setUserPermissions([]); setUserRole("receptionist"); setAuthStatus("unauthenticated"); };
  const pages: Partial<Record<AppView, ReactNode>> = {
    dashboard: <RoleDashboard key={userRole} onNavigate={changeView} doctorName={doctorName} t={t} role={userRole} department={department} project={project} language={language} />,
    patients: <Patients t={t} department={department} project={project} canCreatePatient={userPermissions.includes("patients.create")} onNavigate={(next) => changeView(next)} />,
    assistant: <Assistant t={t} />,
    notes: <ClinicalNotes t={t} language={language} />,
    documents: <DocumentWorkflow t={t} language={language} canReviewDocuments={userRole === "doctor" || userRole === "nurse" || userPermissions.includes("documents.create") || userPermissions.includes("patient.write")} />,
    appointments: <Appointments t={t} language={language} />,
    messages: <Messages t={t} language={language} />,
    portal: <PatientPortal t={t} language={language} />,
    analytics: <Analytics t={t} />,
    departments: <DepartmentOverview t={t} language={language} />,
    reports: <ReportsPage t={t} />,
    clinicOps: <ClinicOperationsBoard t={t} />,
    admin: <AdminHub t={t} onNavigate={changeView} />,
    files: <FileLibrary t={t} canOpenDocuments={canAccessView(userRole, "documents", userPermissions)} onOpenDocuments={() => changeView("documents")} />,
    staff: <StaffManagement t={t} language={language} />,
    settings: <SettingsPage canViewOrganization={userPermissions.includes("hospital.settings.view")} canManageOrganization={userPermissions.includes("hospital.settings.manage")} language={language} setLanguage={changeLanguage} theme={theme} setTheme={changeTheme} doctorName={doctorName} setDoctorName={(name) => { setDoctorName(name); localStorage.setItem("careos-doctor-name", name); }} onLogout={logout} onNavigate={changeView} t={t} />,
    account: <AccountPage doctorName={doctorName} role={userRole} department={department} project={project} onLogout={logout} t={t} />,
    integrations: <IntegrationHub t={t} language={language} />,
    teamAudit: <TeamAudit t={t} language={language} />,
    contacts: <ContactDirectory t={t} language={language} />,
  };
  const activeView = portalMode && view !== "account" ? "portal" : canAccessView(userRole, view, userPermissions) ? view : firstAllowedView(userRole, userPermissions);
    return <div className={`app-shell ${theme === "dark" ? "dark-mode" : ""}`} dir={language === "ar" ? "rtl" : "ltr"}><Sidebar view={activeView} setView={changeView} mobileNav={mobileNav} setMobileNav={setMobileNav} language={language} doctorName={doctorName} role={userRole} permissions={userPermissions} t={t} />{mobileNav && <button className="mobile-overlay" onClick={() => setMobileNav(false)} aria-label={t("openNavigation")} />}<main className="main-content"><Header view={activeView} language={language} setLanguage={changeLanguage} setMobileNav={setMobileNav} showNotifications={showNotifications} setShowNotifications={setShowNotifications} theme={theme} setTheme={changeTheme} onHelp={() => setHelpOpen(true)} onAccount={() => changeView("account")} onNavigate={changeView} t={t} role={userRole} allowDemoRoleSwitch={false} onRoleChange={(newRole) => { setUserRole(newRole); setUserPermissions(rolePermissions[newRole] || []); const nextView = newRole === "patient" ? "portal" : "dashboard"; setPortalMode(newRole === "patient"); setView(nextView); localStorage.setItem("careos-active-view", nextView); navigateToView(nextView); }} /><div className="page-content">{pages[activeView] ?? pages.dashboard}</div></main>{helpOpen && <div className="modal-backdrop" onClick={() => setHelpOpen(false)}><div className="modal" onClick={(event) => event.stopPropagation()}><h2>{t("helpTitle")}</h2><p>{t("helpBody")}</p><button className="primary-btn" onClick={() => setHelpOpen(false)}>{t("close")}</button></div></div>}{toast && <div className="toast" role="status">{toast}</div>}</div>;
}

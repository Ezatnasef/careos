import { useState } from "react";
import {
  Activity,
  ArrowUpRight,
  Building2,
  ChevronLeft,
  Eye,
  EyeOff,
  FileText,
  HeartPulse,
  Home,
  Lock,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  UserPlus,
} from "lucide-react";
import type { Language, TranslationKey } from "../../i18n";
import type { Role } from "../workspace/navigation";
import { GoogleAuthModal, GoogleIcon, type GoogleUserPayload } from "../../components/GoogleAuthButton";

type Translator = (key: TranslationKey) => string;

export type PatientRegistrationData = {
  nationalId: string;
  dateOfBirth: string;
  gender: string;
  bloodType: string;
  phone: string;
  emergencyContact: string;
  chronicConditions: string;
  allergies?: string;
  currentMedications?: string;
  address?: string;
};

type Payload = {
  mode: "signin" | "signup";
  email: string;
  password: string;
  fullName: string;
  organizationName: string;
  authMethod: "email" | "sso";
  role: Role;
  department?: string;
  project?: string;
  patientData?: PatientRegistrationData;
};
export type DemoAccount = {
  role: Role;
  title: string;
  username: string;
  password: string;
};
export const demoAccounts: DemoAccount[] = [
  {
    role: "admin",
    title: "Admin",
    username: "admin.demo",
    password: "Admin@123",
  },
  {
    role: "doctor",
    title: "Doctor",
    username: "doctor.demo",
    password: "Doctor@123",
  },
  {
    role: "nurse",
    title: "Nurse",
    username: "nurse.demo",
    password: "Nurse@123",
  },
  {
    role: "receptionist",
    title: "Receptionist",
    username: "reception.demo",
    password: "Reception@123",
  },
  {
    role: "hospital_director",
    title: "Hospital Director",
    username: "director.demo",
    password: "Director@123",
  },
  {
    role: "it_admin",
    title: "IT Admin",
    username: "itadmin.demo",
    password: "ITAdmin@123",
  },
  {
    role: "administrative_staff",
    title: "Administrative Staff",
    username: "staff.demo",
    password: "Staff@123",
  },
  {
    role: "patient",
    title: "Patient",
    username: "patient.demo",
    password: "Patient@123",
  },
];
const demoRoleTranslation: Record<Role, TranslationKey> = {
  admin: "roleAdminLabel",
  doctor: "roleDoctorLabel",
  nurse: "roleNurseLabel",
  receptionist: "roleReceptionistLabel",
  hospital_director: "roleDirectorLabel",
  it_admin: "roleItAdminLabel",
  administrative_staff: "roleStaffLabel",
  patient: "rolePatientLabel",
};
type Props = {
  onLogin: (payload: Payload) => void;
  onDemoLogin?: (account: DemoAccount) => void;
  language: Language;
  setLanguage: (language: Language) => void;
  t: Translator;
  initialMode?: "signin" | "signup";
  initialAccessMethod?: "email" | "sso";
  onBackHome: () => void;
};

export function LoginRoute({
  onLogin,
  onDemoLogin,
  language,
  setLanguage,
  t,
  initialMode = "signin",
  initialAccessMethod = "email",
  onBackHome,
}: Props) {
  const [mode, setMode] = useState(initialMode);
  const [accessMethod, setAccessMethod] = useState(initialAccessMethod);
  const [role, setRole] = useState<Role>("doctor");
  const [email, setEmail] = useState("dr.rana@citycare.org");
  const [password, setPassword] = useState("password123");
  const [fullName, setFullName] = useState("");
  const [organizationName, setOrganizationName] = useState("CityCare");
  const [department, setDepartment] = useState("General Medicine");
  const [project, setProject] = useState("Outpatient");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState(email);
  const [recoverySent, setRecoverySent] = useState(false);
  const isSignUp = mode === "signup";
  const [signupTarget, setSignupTarget] = useState<"facility" | "patient">("patient");
  // Dedicated patient registration fields
  const [patientFullName, setPatientFullName] = useState("");
  const [patientNationalId, setPatientNationalId] = useState("");
  const [patientDob, setPatientDob] = useState("");
  const [patientGender, setPatientGender] = useState("male");
  const [patientBloodType, setPatientBloodType] = useState("O+");
  const [patientPhone, setPatientPhone] = useState("");
  const [patientEmergencyContact, setPatientEmergencyContact] = useState("");
  const [patientConditions, setPatientConditions] = useState("");
  const [patientAllergies, setPatientAllergies] = useState("");
  const [patientMedications, setPatientMedications] = useState("");
  const [patientAddress, setPatientAddress] = useState("");
  const [patientEmail, setPatientEmail] = useState("");
  const [patientPassword, setPatientPassword] = useState("");
  const [patientConfirmPassword, setPatientConfirmPassword] = useState("");
  const [showPatientPassword, setShowPatientPassword] = useState(false);
  const [showGoogleModal, setShowGoogleModal] = useState(false);
  const demoRoleLabel = (demoRole: Role) => t(demoRoleTranslation[demoRole]);

  const handleGoogleSuccess = (user: GoogleUserPayload) => {
    onLogin({
      mode: "signin",
      email: user.email,
      password: "demo-patient-password",
      fullName: user.fullName,
      organizationName: "Patient Care",
      authMethod: "email",
      role: "patient",
    });
  };

  const handleRecoverySubmit = () => {
    setRecoverySent(true);
  };

  return (
    <div className="login-screen" dir={language === "ar" ? "rtl" : "ltr"}>
      <div className="login-art">
        <div className="art-top-bar">
          <div className="login-brand">
            <div className="brand-mark">
              <HeartPulse size={19} />
            </div>
            <span>
              care<span>os</span>
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <button
              className="login-home-button"
              onClick={onBackHome}
              aria-label={t("backToHome")}
              title={language === "ar" ? "العودة للرئيسية" : "Back to Home"}
            >
              <Home size={16} />
            </button>
          </div>
        </div>

        <div className="art-main-content">
          <div className="login-quote">
            <h1>
              {t("loginQuoteFirst")}
              <br />
              <em>{t("loginQuoteSecond")}</em>
            </h1>
            <p>{t("loginArtDetail")}</p>
          </div>

          <div className="art-cards-grid">
            <div className="art-glass-card">
              <div className="card-icon">
                <FileText size={18} />
              </div>
              <div className="card-body">
                <strong>{language === "ar" ? "ملف وسجل طبي موحد (EHR & MRN)" : "Unified Medical Record"}</strong>
                <span>{language === "ar" ? "ربط فوري للرقم القومي والملف السريري بجميع العيادات والفحوصات الطبية" : "Instant sync for national ID, clinical files, and medical visits"}</span>
              </div>
            </div>

            <div className="art-glass-card">
              <div className="card-icon">
                <HeartPulse size={18} />
              </div>
              <div className="card-body">
                <strong>{language === "ar" ? "الملف الحيوي وفصائل الدم والحساسية" : "Vital Profile & Allergies"}</strong>
                <span>{language === "ar" ? "توثيق فصيلة الدم والحساسيات الدوائية والأمراض المزمنة لتأمين القرارات السريرية" : "Accurate tracking for blood type, drug allergies & chronic conditions"}</span>
              </div>
            </div>

            <div className="art-glass-card">
              <div className="card-icon">
                <Activity size={18} />
              </div>
              <div className="card-body">
                <strong>{language === "ar" ? "بوابة المرضى والمواعيد الذكية" : "Patient Portal & Scheduling"}</strong>
                <span>{language === "ar" ? "حجز فوري ومتابعة مواعيد العيادات مع الاستشاريين والتذكير التلقائي 24/7" : "Self-service booking, care plan tracking and real-time reminders"}</span>
              </div>
            </div>

            <div className="art-glass-card">
              <div className="card-icon">
                <Stethoscope size={18} />
              </div>
              <div className="card-body">
                <strong>{language === "ar" ? "النتائج والفحوصات والروشتات الرقمية" : "Diagnostics & E-Prescriptions"}</strong>
                <span>{language === "ar" ? "اطلاع لحظي على نتائج التحاليل المخبرية وتقارير الأشعة والوصفات الطبية" : "Real-time access to lab test results, imaging reports & digital prescriptions"}</span>
              </div>
            </div>

            <div className="art-glass-card">
              <div className="card-icon">
                <ShieldCheck size={18} />
              </div>
              <div className="card-body">
                <strong>{language === "ar" ? "أعلى معايير الخصوصية والأمان السريري" : "Enterprise Clinical Security"}</strong>
                <span>{language === "ar" ? "تشفير شامل وسجلات تدقيق متوافقة مع أرقى المعايير الصحية والطبية العالمية" : "End-to-end encryption and audit trail compliance"}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="login-form-wrap">
        <div className="login-mobile-header" aria-hidden="true" />

        {showRecovery ? (
          <div className="login-form recovery-form">
            <div className="login-form-top recovery-top">
              <button
                className="back-link"
                onClick={() => {
                  setShowRecovery(false);
                  setRecoverySent(false);
                }}
              >
                <ChevronLeft size={14} /> {t("backToSignIn")}
              </button>
            </div>

            <div className="eyebrow">{t("accountRecovery")}</div>
            <h2>{t("resetPassword")}</h2>
            <p>
              {t("resetLinkDetail")}
            </p>

            <label>
              {t("emailAddress")}
              <input
                type="email"
                value={recoveryEmail}
                onChange={(event) => setRecoveryEmail(event.target.value)}
                placeholder="name@citycare.org"
              />
            </label>

            {recoverySent && (
              <div className="recovery-success">
                {t("resetLinkSent")} {recoveryEmail}.
              </div>
            )}

            <button
              className="primary-btn login-button"
              onClick={handleRecoverySubmit}
            >
              {t("sendResetLink")} <ArrowUpRight size={16} />
            </button>
          </div>
        ) : (
          <div className={`login-form ${isSignUp && signupTarget === "patient" ? "wide-mode" : ""}`}>
            <div className="login-form-top">
              <button className="back-link" onClick={onBackHome}>
                <ChevronLeft size={14} />{" "}
                {language === "ar" ? "العودة للرئيسية" : "Back to Home"}
              </button>
              <button
                className="glass-control-btn"
                onClick={() => setLanguage(language === "en" ? "ar" : "en")}
                aria-label={
                  language === "en" ? "Switch to Arabic" : "Switch to English"
                }
              >
                {language === "en" ? "AR" : "EN"}
              </button>
            </div>

            <div className="auth-tabs" role="tablist">
              <button
                role="tab"
                aria-selected={!isSignUp}
                className={!isSignUp ? "active" : ""}
                onClick={() => setMode("signin")}
              >
                {language === "ar" ? "تسجيل الدخول" : "Sign In"}
              </button>
              <button
                role="tab"
                aria-selected={isSignUp}
                className={isSignUp ? "active" : ""}
                onClick={() => setMode("signup")}
              >
                {language === "ar" ? "تسجيل حساب جديد" : "Create Account"}
              </button>
            </div>

            <div className="eyebrow">
              {!isSignUp
                ? t("welcome")
                : signupTarget === "patient"
                ? (language === "ar" ? "الملف الطبي الإلكتروني وبوابة المريض" : "Patient Electronic Health Record")
                : (language === "ar" ? "منظومة سحابية متكاملة" : t("createAccountEyebrow"))}
            </div>
            <h2>
              {!isSignUp
                ? (language === "ar" ? "تسجيل الدخول إلى النظام" : t("signIn"))
                : signupTarget === "patient"
                ? (language === "ar" ? "فتح ملف طبي وتسجيل مريض جديد" : "Patient Registration & Medical Record")
                : (language === "ar" ? "تسجيل منشأة طبية جديدة" : t("createAccount"))}
            </h2>
            <p>
              {!isSignUp
                ? (language === "ar" ? "استخدم بيانات اعتماد حسابك للمتابعة أو سجل كمريض جديد لفتح ملف طبي." : t("signInDetail"))
                : signupTarget === "patient"
                ? (language === "ar" ? "يرجى استيفاء البيانات الطبية والشخصية بدقة لربط الملف بالسجلات الطبية والتحاليل والحجوزات." : "Please provide comprehensive medical and personal information for seamless care coordination.")
                : (language === "ar" ? "أنشئ مساحة عمل سحابية لعيادتك أو مستشفاك وابدأ في دقائق." : t("createAccountDetail"))}
            </p>

            {isSignUp ? (
              <>
                <div className="account-type-selector">
                  <button
                    type="button"
                    className={`type-option ${signupTarget === "patient" ? "active" : ""}`}
                    onClick={() => setSignupTarget("patient")}
                  >
                    <UserPlus size={18} />
                    <div className="type-meta">
                      <strong>{language === "ar" ? "مريض جديد (فتح ملف طبي)" : "New Patient (Open EHR)"}</strong>
                      <span>{language === "ar" ? "بوابة المرضى، المواعيد والنتائج" : "Patient portal, bookings & records"}</span>
                    </div>
                  </button>
                  <button
                    type="button"
                    className={`type-option ${signupTarget === "facility" ? "active" : ""}`}
                    onClick={() => setSignupTarget("facility")}
                  >
                    <Building2 size={18} />
                    <div className="type-meta">
                      <strong>{language === "ar" ? "منشأة طبية / كادر طبي" : "Medical Facility / Staff"}</strong>
                      <span>{language === "ar" ? "عيادات، مستشفيات والأطباء" : "Clinics, hospitals & clinicians"}</span>
                    </div>
                  </button>
                </div>

                {signupTarget === "facility" ? (
                  <>
                    <label>
                      {t("fullName")}
                      <input
                        value={fullName}
                        onChange={(event) => setFullName(event.target.value)}
                        placeholder={language === "ar" ? "د. أحمد سامي" : "Dr. Alex Taylor"}
                      />
                    </label>
                    <label>
                      {t("organizationName")}
                      <input
                        value={organizationName}
                        onChange={(event) =>
                          setOrganizationName(event.target.value)
                        }
                        placeholder={language === "ar" ? "مستشفى الأمل التخصصي" : "CityCare Medical"}
                      />
                    </label>
                    <label>
                      {t("email")}
                      <input
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder="doctor@hospital.org"
                      />
                    </label>
                    <label>
                      {t("password")}
                      <div className="password-input-wrap">
                        <input
                          type={showPassword ? "text" : "password"}
                          value={password}
                          onChange={(event) => setPassword(event.target.value)}
                        />
                        <button
                          type="button"
                          className="password-visibility-button"
                          onClick={() => setShowPassword((current) => !current)}
                          aria-label={
                            showPassword ? t("hidePassword") : t("showPassword")
                          }
                          title={
                            showPassword ? t("hidePassword") : t("showPassword")
                          }
                        >
                          {showPassword ? (
                            <EyeOff size={16} />
                          ) : (
                            <Eye size={16} />
                          )}
                        </button>
                      </div>
                    </label>
                    <label>
                      {t("confirmPassword")}
                      <div className="password-input-wrap">
                        <input
                          type={showConfirmPassword ? "text" : "password"}
                          value={confirmPassword}
                          onChange={(event) =>
                            setConfirmPassword(event.target.value)
                          }
                        />
                        <button
                          type="button"
                          className="password-visibility-button"
                          onClick={() =>
                            setShowConfirmPassword((current) => !current)
                          }
                          aria-label={
                            showConfirmPassword
                              ? t("hideConfirmPassword")
                              : t("showConfirmPassword")
                          }
                          title={
                            showConfirmPassword
                              ? t("hideConfirmPassword")
                              : t("showConfirmPassword")
                          }
                        >
                          {showConfirmPassword ? (
                            <EyeOff size={16} />
                          ) : (
                            <Eye size={16} />
                          )}
                        </button>
                      </div>
                    </label>

                    <button
                      className="primary-btn login-button"
                      disabled={!fullName || !organizationName || !email || password !== confirmPassword}
                      onClick={() =>
                        onLogin({
                          mode: "signup",
                          email,
                          password,
                          fullName,
                          organizationName,
                          authMethod: "email",
                          role: "admin",
                          department,
                          project,
                        })
                      }
                    >
                      {language === "ar" ? "إنشاء المنشأة وبدء الإعداد" : t("createWorkspace")}{" "}
                      <ArrowUpRight size={16} />
                    </button>
                  </>
                ) : (
                  <div className="patient-intake-card">
                    <div className="intake-hero-badge">
                      <div className="badge-icon">
                        <HeartPulse size={20} />
                      </div>
                      <div className="badge-content">
                        <strong>{language === "ar" ? "فتح ملف طبي إلكتروني معتمد (EHR)" : "Electronic Health Record Setup"}</strong>
                        <p>{language === "ar" ? "يتم إصدار رقم سجل طبي موحد (MRN) وحساب رسمي في بوابة المرضى لحجز المواعيد واستلام الفحوصات الطبية إلكترونياً." : "A unique MRN and patient portal account will be issued for instant appointment booking and clinical records."}</p>
                      </div>
                    </div>

                    {/* Google Instant Patient Registration */}
                    <div style={{ margin: "16px 0 20px" }}>
                      <button
                        type="button"
                        onClick={() => setShowGoogleModal(true)}
                        style={{
                          width: "100%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "10px",
                          padding: "12px 18px",
                          borderRadius: "12px",
                          border: "1px solid #cbd5e1",
                          background: "#ffffff",
                          color: "#0f172a",
                          fontWeight: 700,
                          fontSize: "14px",
                          cursor: "pointer",
                          boxShadow: "0 2px 6px rgba(0,0,0,0.04)",
                          transition: "all 0.15s ease",
                        }}
                      >
                        <GoogleIcon size={18} />
                        <span>{language === "ar" ? "التسجيل السريع كـ مريض عبر حساب Google" : "Instant Patient Sign-Up with Google"}</span>
                      </button>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", margin: "14px 0 4px", color: "var(--muted, #64748b)", fontSize: "12px" }}>
                        <div style={{ flex: 1, height: "1px", background: "var(--line, #e2e8f0)" }} />
                        <span>{language === "ar" ? "أو تعبئة الملف الطبي يدوياً" : "Or fill health intake manually"}</span>
                        <div style={{ flex: 1, height: "1px", background: "var(--line, #e2e8f0)" }} />
                      </div>
                    </div>

                    {/* Section 1: البيانات الشخصية والهوية */}
                    <div className="form-section-card">
                      <div className="section-title">
                        <UserPlus size={15} />
                        <span>{language === "ar" ? "البيانات الشخصية وبطاقة الهوية" : "Personal & Identity Information"}</span>
                      </div>

                      <div className="field-group">
                        <label className="field-label">
                          <span>{language === "ar" ? "الاسم الكامل للمريض (رباعي كما في بطاقة الرقم القومي)" : "Full Patient Name (as on National ID)"}</span>
                          <span className="req">*</span>
                        </label>
                        <input
                          type="text"
                          className="form-control"
                          value={patientFullName}
                          onChange={(event) => setPatientFullName(event.target.value)}
                          placeholder={language === "ar" ? "أحمد محمد محمود حسن" : "Ahmed Mohamed Mahmoud Hassan"}
                          required
                        />
                      </div>

                      <div className="form-grid-2">
                        <div className="field-group">
                          <label className="field-label">
                            <span>{language === "ar" ? "الرقم القومي / رقم الهوية (14 رقم)" : "National ID / Civil ID (14 digits)"}</span>
                            <span className="req">*</span>
                          </label>
                          <input
                            type="text"
                            className="form-control"
                            dir="ltr"
                            value={patientNationalId}
                            onChange={(event) => setPatientNationalId(event.target.value.replace(/\D/g, "").slice(0, 14))}
                            placeholder="29804151203412"
                            maxLength={14}
                            required
                          />
                        </div>

                        <div className="field-group">
                          <label className="field-label">
                            <span>{language === "ar" ? "تاريخ الميلاد" : "Date of Birth"}</span>
                            <span className="req">*</span>
                          </label>
                          <input
                            type="date"
                            className="form-control"
                            value={patientDob}
                            onChange={(event) => setPatientDob(event.target.value)}
                            required
                          />
                        </div>
                      </div>

                      <div className="form-grid-2">
                        <div className="field-group">
                          <label className="field-label">
                            <span>{language === "ar" ? "النوع / الجنس" : "Gender"}</span>
                            <span className="req">*</span>
                          </label>
                          <div className="custom-select-wrap">
                            <select
                              className="form-control form-select"
                              value={patientGender}
                              onChange={(event) => setPatientGender(event.target.value)}
                            >
                              <option value="male">{language === "ar" ? "ذكر" : "Male"}</option>
                              <option value="female">{language === "ar" ? "أنثى" : "Female"}</option>
                            </select>
                          </div>
                        </div>

                        <div className="field-group">
                          <label className="field-label">
                            <span>{language === "ar" ? "المحافظة والمدينة / العنوان السكني" : "City / Residential Address"}</span>
                          </label>
                          <input
                            type="text"
                            className="form-control"
                            value={patientAddress}
                            onChange={(event) => setPatientAddress(event.target.value)}
                            placeholder={language === "ar" ? "القاهرة - المعادي" : "Cairo, Maadi"}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Section 2: البيانات والملف الطبي الحيوي */}
                    <div className="form-section-card">
                      <div className="section-title">
                        <Activity size={15} />
                        <span>{language === "ar" ? "البيانات والملف الطبي الحيوي" : "Vital Clinical Profile"}</span>
                      </div>

                      <div className="field-group">
                        <label className="field-label">
                          <span>{language === "ar" ? "فصيلة الدم (Blood Group)" : "Blood Group"}</span>
                          <span className="req">*</span>
                        </label>
                        <div className="blood-group-chips">
                          {["O+", "A+", "B+", "AB+", "O-", "A-", "B-", "AB-"].map((bg) => (
                            <button
                              type="button"
                              key={bg}
                              className={`blood-chip ${patientBloodType === bg ? "active" : ""}`}
                              onClick={() => setPatientBloodType(bg)}
                            >
                              {bg}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="form-grid-2">
                        <div className="field-group">
                          <label className="field-label">
                            <span>{language === "ar" ? "الحساسية الدوائية أو الغذائية" : "Allergies (Drug / Food)"}</span>
                          </label>
                          <input
                            type="text"
                            className="form-control"
                            value={patientAllergies}
                            onChange={(event) => setPatientAllergies(event.target.value)}
                            placeholder={language === "ar" ? "مثل: بنسلين، سلفا، أو لا توجد" : "e.g., Penicillin, Sulfa, or None"}
                          />
                        </div>

                        <div className="field-group">
                          <label className="field-label">
                            <span>{language === "ar" ? "الحالات والأمراض المزمنة السابقة" : "Chronic Conditions / Medical History"}</span>
                          </label>
                          <input
                            type="text"
                            className="form-control"
                            value={patientConditions}
                            onChange={(event) => setPatientConditions(event.target.value)}
                            placeholder={language === "ar" ? "مثل: سكري، ضغط، ربو، أو سليم" : "e.g., Diabetes, Hypertension, or None"}
                          />
                        </div>
                      </div>

                      <div className="field-group">
                        <label className="field-label">
                          <span>{language === "ar" ? "الأدوية التي يتم تناولها بانتظام" : "Current Regular Medications"}</span>
                        </label>
                        <input
                          type="text"
                          className="form-control"
                          value={patientMedications}
                          onChange={(event) => setPatientMedications(event.target.value)}
                          placeholder={language === "ar" ? "مثل: أدوية الضغط أو فيتامينات، أو لا يوجد" : "e.g., Daily prescriptions or None"}
                        />
                      </div>
                    </div>

                    {/* Section 3: بيانات التواصل وحساب البوابة */}
                    <div className="form-section-card">
                      <div className="section-title">
                        <ShieldCheck size={15} />
                        <span>{language === "ar" ? "بيانات التواصل وحساب بوابة المريض" : "Contact & Portal Credentials"}</span>
                      </div>

                      <div className="form-grid-2">
                        <div className="field-group">
                          <label className="field-label">
                            <span>{language === "ar" ? "رقم الهاتف المحمول (للتواصل والواتساب)" : "Mobile Phone (SMS & WhatsApp)"}</span>
                            <span className="req">*</span>
                          </label>
                          <input
                            type="tel"
                            className="form-control"
                            dir="ltr"
                            value={patientPhone}
                            onChange={(event) => setPatientPhone(event.target.value)}
                            placeholder="01012345678"
                            required
                          />
                        </div>

                        <div className="field-group">
                          <label className="field-label">
                            <span>{language === "ar" ? "جهة اتصال للطوارئ (الاسم ورقم الهاتف)" : "Emergency Contact (Name & Phone)"}</span>
                          </label>
                          <input
                            type="text"
                            className="form-control"
                            value={patientEmergencyContact}
                            onChange={(event) => setPatientEmergencyContact(event.target.value)}
                            placeholder={language === "ar" ? "الأخ: 01099887766" : "Brother: +20 101 987 6543"}
                          />
                        </div>
                      </div>

                      <div className="field-group">
                        <label className="field-label">
                          <span>{language === "ar" ? "البريد الإلكتروني للدخول للبوابة" : "Portal Account Email"}</span>
                          <span className="req">*</span>
                        </label>
                        <input
                          type="email"
                          className="form-control"
                          dir="ltr"
                          value={patientEmail}
                          onChange={(event) => setPatientEmail(event.target.value)}
                          placeholder="patient@example.com"
                          required
                        />
                      </div>

                      <div className="form-grid-2">
                        <div className="field-group">
                          <label className="field-label">
                            <span>{t("password")} (8 أحرف كحد أدنى)</span>
                            <span className="req">*</span>
                          </label>
                          <div className="password-input-wrap">
                            <input
                              type={showPatientPassword ? "text" : "password"}
                              className="form-control"
                              value={patientPassword}
                              onChange={(event) => setPatientPassword(event.target.value)}
                              placeholder="••••••••"
                              required
                            />
                            <button
                              type="button"
                              className="password-visibility-button"
                              onClick={() => setShowPatientPassword((curr) => !curr)}
                              aria-label={showPatientPassword ? t("hidePassword") : t("showPassword")}
                            >
                              {showPatientPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                          </div>
                        </div>

                        <div className="field-group">
                          <label className="field-label">
                            <span>{t("confirmPassword")}</span>
                            <span className="req">*</span>
                          </label>
                          <input
                            type={showPatientPassword ? "text" : "password"}
                            className="form-control"
                            value={patientConfirmPassword}
                            onChange={(event) => setPatientConfirmPassword(event.target.value)}
                            placeholder="••••••••"
                            required
                          />
                        </div>
                      </div>

                      {patientPassword && patientConfirmPassword && patientPassword !== patientConfirmPassword && (
                        <div className="form-error-inline">
                          {language === "ar" ? "كلمتا المرور غير متطابقتين" : "Passwords do not match"}
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      className="primary-btn submit-patient-btn"
                      disabled={
                        !patientFullName.trim() ||
                        !patientPhone.trim() ||
                        !patientEmail.trim() ||
                        patientPassword.length < 8 ||
                        patientPassword !== patientConfirmPassword
                      }
                      onClick={() =>
                        onLogin({
                          mode: "signup",
                          email: patientEmail.trim(),
                          password: patientPassword,
                          fullName: patientFullName.trim(),
                          organizationName: "CityCare Medical Complex",
                          authMethod: "email",
                          role: "patient",
                          patientData: {
                            nationalId: patientNationalId.trim(),
                            dateOfBirth: patientDob,
                            gender: patientGender,
                            bloodType: patientBloodType,
                            phone: patientPhone.trim(),
                            emergencyContact: patientEmergencyContact.trim(),
                            chronicConditions: patientConditions.trim(),
                            allergies: patientAllergies.trim(),
                            currentMedications: patientMedications.trim(),
                            address: patientAddress.trim(),
                          },
                        })
                      }
                    >
                      <span>{language === "ar" ? "فتح الملف الطبي ودخول بوابة المريض" : "Open Medical Record & Enter Portal"}</span>
                      <ArrowUpRight size={18} />
                    </button>
                  </div>
                )}
              </>
            ) : (
              <>
                <label>
                  {t("email")}
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </label>

                <label>
                  {t("password")}
                  <div className="password-input-wrap">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                    />
                    <button
                      type="button"
                      className="password-visibility-button"
                      onClick={() => setShowPassword((current) => !current)}
                      aria-label={
                        showPassword ? t("hidePassword") : t("showPassword")
                      }
                      title={
                        showPassword ? t("hidePassword") : t("showPassword")
                      }
                    >
                      {showPassword ? (
                        <EyeOff size={16} />
                      ) : (
                        <Eye size={16} />
                      )}
                    </button>
                  </div>
                </label>

                <a
                  href="#"
                  className="forgot-password"
                  onClick={(event) => {
                    event.preventDefault();
                    setShowRecovery(true);
                  }}
                >
                  {t("forgotPassword")}
                </a>

                <button
                  className="primary-btn login-button"
                  onClick={() =>
                    onLogin({
                      mode: "signin",
                      email,
                      password,
                      fullName,
                      organizationName,
                      authMethod: "email",
                      role,
                      department,
                      project,
                    })
                  }
                >
                  {language === "ar" ? "تسجيل الدخول إلى مساحة العمل" : t("signIn")}{" "}
                  <ArrowUpRight size={16} />
                </button>

                <div className="sso-divider">
                  <span>{language === "ar" ? "أو عبر الدخول المؤسسي الموحد" : "Or Enterprise Single Sign-On"}</span>
                </div>

                <button
                  type="button"
                  className="hospital-sso-btn"
                  onClick={() =>
                    onLogin({
                      mode: "signin",
                      email: "dr.rana@citycare.org",
                      password: "password123",
                      fullName: "Dr. Rana Samir",
                      organizationName: "CityCare",
                      authMethod: "sso",
                      role,
                    })
                  }
                >
                  <ShieldCheck size={18} />
                  <span>{language === "ar" ? "دخول المستشفى الموحد (Hospital SSO)" : "Hospital SSO Sign-In"}</span>
                </button>
                <p className="sso-caption">
                  {language === "ar"
                    ? "للكوادر الطبية والموظفين المسجلين في دليل هوية المستشفى (Azure AD / Active Directory)"
                    : "For hospital staff and clinicians authenticated through central enterprise directory."}
                </p>

                <div className="sso-divider" style={{ margin: "16px 0 10px" }}>
                  <span>{language === "ar" ? "أو الدخول السريع للمرضى" : "Or Patient Sign-In"}</span>
                </div>

                <button
                  type="button"
                  onClick={() => setShowGoogleModal(true)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "10px",
                    padding: "11px 16px",
                    borderRadius: "10px",
                    border: "1px solid #cbd5e1",
                    background: "#ffffff",
                    color: "#0f172a",
                    fontWeight: 700,
                    fontSize: "13px",
                    boxShadow: "0 2px 6px rgba(0,0,0,0.03)",
                    cursor: "pointer",
                    marginBottom: "12px",
                  }}
                >
                  <GoogleIcon size={18} />
                  <span>{language === "ar" ? "الدخول كـ مريض عبر Google" : "Sign in as Patient with Google"}</span>
                </button>

                <button
                  type="button"
                  className="outline-btn"
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                    padding: "11px 14px",
                    borderRadius: "10px",
                    border: "1px solid var(--teal)",
                    color: "var(--teal)",
                    fontWeight: 700,
                    fontSize: "13px",
                    background: "rgba(20, 93, 88, 0.05)",
                    cursor: "pointer",
                  }}
                  onClick={() => {
                    setMode("signup");
                    setSignupTarget("patient");
                  }}
                >
                  <UserPlus size={16} />
                  <span>
                    {language === "ar"
                      ? "تسجيل مريض جديد (فتح ملف طبي وبوابة المريض)"
                      : "Register as New Patient (Open Medical Record)"}
                  </span>
                </button>
              </>
            )}
            {onDemoLogin && !isSignUp && (
              <div className="demo-login-panel">
                <div className="eyebrow">{t("demoAccountsTitle")}</div>
                <p>
                  {t("demoAccountsDetail")}
                </p>
                <div className="demo-login-grid">
                  {demoAccounts.map((account) => (
                    <article className="demo-account-card" key={account.role}>
                      <strong>{demoRoleLabel(account.role)}</strong>
                      <span>{t("usernameLabel")}: {account.username}</span>
                      <span>{t("passwordLabel")}: {account.password}</span>
                      <button
                        type="button"
                        className="outline-btn"
                        onClick={() => onDemoLogin(account)}
                      >
                        {t("loginAs")} {demoRoleLabel(account.role)}
                      </button>
                    </article>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <GoogleAuthModal
        isOpen={showGoogleModal}
        onClose={() => setShowGoogleModal(false)}
        onSuccess={handleGoogleSuccess}
        target="patient"
        language={language}
      />
    </div>
  );
}

import { useState } from "react";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Building2,
  Check,
  Globe,
  HeartPulse,
  Plus,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Users,
  X,
} from "lucide-react";
import type { Language, TranslationKey } from "../../i18n";

type Translator = (key: TranslationKey) => string;

type OnboardingProps = {
  language: Language;
  setLanguage: (language: Language) => void;
  complete: (organizationName: string, department?: string, timezone?: string) => void;
  t: Translator;
  onBack?: () => void;
};

interface FacilityTypeOption {
  id: string;
  nameAr: string;
  nameEn: string;
  descAr: string;
  descEn: string;
}

const facilityTypes: FacilityTypeOption[] = [
  {
    id: "general_hospital",
    nameAr: "مستشفى عام / تخصصي",
    nameEn: "General / Specialty Hospital",
    descAr: "عيادات خارجية، أقسام طوارئ، وتنويم داخلي",
    descEn: "Outpatient clinics, inpatient care, & 24/7 ER",
  },
  {
    id: "specialty_clinic",
    nameAr: "مجمع عيادات ومراكز طبية",
    nameEn: "Specialized Medical Polyclinic",
    descAr: "عيادات استشارية متعددة التخصصات",
    descEn: "Multi-specialty consultation clinics",
  },
  {
    id: "day_surgery",
    nameAr: "مركز جراحات اليوم الواحد",
    nameEn: "Day Surgery & Ambulatory Center",
    descAr: "عمليات وإجراءات تداخلية سريعة",
    descEn: "Short-stay and ambulatory surgical care",
  },
  {
    id: "diagnostic_center",
    nameAr: "مركز تشخيصي / تحاليل وأشعة",
    nameEn: "Diagnostic & Lab Center",
    descAr: "فحوصات مخبرية وتصوير طبي متكامل",
    descEn: "Advanced laboratory and medical imaging",
  },
];

interface DepartmentOption {
  id: string;
  nameAr: string;
  nameEn: string;
}

const defaultDepartments: DepartmentOption[] = [
  { id: "internal_medicine", nameAr: "الباطنة العامة", nameEn: "General Medicine" },
  { id: "emergency", nameAr: "طوارئ 24/7", nameEn: "Emergency 24/7" },
  { id: "pediatrics", nameAr: "طب الأطفال", nameEn: "Pediatrics" },
  { id: "obgyn", nameAr: "النساء والتوليد", nameEn: "OB/GYN" },
  { id: "orthopedics", nameAr: "العظام", nameEn: "Orthopedics" },
  { id: "ophthalmology", nameAr: "العيون", nameEn: "Ophthalmology" },
];

export function Onboarding({ language, setLanguage, complete, t, onBack }: OnboardingProps) {
  const isAr = language === "ar";
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1: Profile
  const [organizationName, setOrganizationName] = useState("CityCare Medical Complex");
  const [facilityType, setFacilityType] = useState("general_hospital");
  const [timezone, setTimezone] = useState("Africa/Cairo");

  // Step 2: Departments
  const [selectedDepts, setSelectedDepts] = useState<string[]>([
    "internal_medicine",
    "emergency",
    "pediatrics",
    "obgyn",
    "orthopedics",
    "ophthalmology",
  ]);
  const [customDeptInput, setCustomDeptInput] = useState("");
  const [customDepts, setCustomDepts] = useState<string[]>([]);

  // Step 3: Staff Invitation & Launch
  const [staffEmail, setStaffEmail] = useState("");
  const [staffRole, setStaffRole] = useState<"doctor" | "nurse" | "receptionist">("doctor");
  const [staffDept, setStaffDept] = useState("internal_medicine");
  const [invitedList, setInvitedList] = useState<{ email: string; role: string; department: string }[]>([]);

  const toggleDepartment = (deptId: string) => {
    setSelectedDepts((prev) =>
      prev.includes(deptId) ? prev.filter((d) => d !== deptId) : [...prev, deptId]
    );
  };

  const handleAddCustomDept = () => {
    const trimmed = customDeptInput.trim();
    if (trimmed && !customDepts.includes(trimmed)) {
      setCustomDepts((prev) => [...prev, trimmed]);
      setCustomDeptInput("");
    }
  };

  const handleRemoveCustomDept = (name: string) => {
    setCustomDepts((prev) => prev.filter((d) => d !== name));
  };

  const activeDepartmentList = [
    ...selectedDepts.map((id) => {
      const found = defaultDepartments.find((d) => d.id === id);
      return { id, name: isAr ? (found?.nameAr ?? id) : (found?.nameEn ?? id) };
    }),
    ...customDepts.map((name) => ({ id: name, name })),
  ];

  const handleAddInvite = () => {
    const trimmed = staffEmail.trim();
    if (trimmed && !invitedList.some((i) => i.email === trimmed)) {
      const chosenDept = activeDepartmentList.find((d) => d.id === staffDept)?.name || (isAr ? "الباطنة العامة" : "General Medicine");
      setInvitedList((prev) => [...prev, { email: trimmed, role: staffRole, department: chosenDept }]);
      setStaffEmail("");
    }
  };

  const handleRemoveInvite = (email: string) => {
    setInvitedList((prev) => prev.filter((i) => i.email !== email));
  };

  const handleComplete = () => {
    const allDeptNames = [
      ...selectedDepts.map((id) => {
        const found = defaultDepartments.find((d) => d.id === id);
        return isAr ? found?.nameAr : found?.nameEn;
      }),
      ...customDepts,
    ].filter(Boolean);

    const primaryDept = allDeptNames.length > 0 ? allDeptNames.join(", ") : "General Medicine";
    complete(organizationName, primaryDept, timezone);
  };

  const selectedFacility = facilityTypes.find((f) => f.id === facilityType);

  return (
    <div className="onboarding-screen" dir={isAr ? "rtl" : "ltr"}>
      <div className="onboarding-card onboarding-card-extended">
        {/* Header / Brand */}
        <div className="onboarding-top-bar">
          <div className="brand">
            <div className="brand-mark">
              <HeartPulse size={19} />
            </div>
            <span>
              care<span>os</span>
            </span>
          </div>

          <button
            className="glass-control-btn"
            onClick={() => setLanguage(isAr ? "en" : "ar")}
            aria-label="Switch Language"
          >
            <Globe size={13} style={{ marginRight: isAr ? 0 : 5, marginLeft: isAr ? 5 : 0 }} />
            {isAr ? "English" : "العربية"}
          </button>
        </div>

        {/* Step Indicator & Progress */}
        <div className="onboarding-step-header">
          <div className="step-pill">
            <Sparkles size={13} />
            <span>
              {isAr
                ? `الخطوة ${step} من 3`
                : `Step ${step} of 3`}
            </span>
          </div>
          <span className="step-tagline">
            {step === 1 && (isAr ? "هوية المنشأة الطبية" : "Facility Identity")}
            {step === 2 && (isAr ? "العيادات والأقسام" : "Clinics & Departments")}
            {step === 3 && (isAr ? "جاهزية الفريق والانطلاق" : "Go-Live & Team")}
          </span>
        </div>

        <div className="onboarding-progress">
          <span
            style={{
              width: step === 1 ? "33.333%" : step === 2 ? "66.666%" : "100%",
            }}
          />
        </div>

        {/* ================= STEP 1: Facility Profile ================= */}
        {step === 1 && (
          <div className="onboarding-step-content">
            <div className="eyebrow">{isAr ? "الإعداد الأولي للمنشأة" : "Initial Workspace Setup"}</div>
            <h1>{isAr ? "مرحباً بك في مساحة عملك الطبية" : "Welcome to Your Clinical Workspace"}</h1>
            <p>
              {isAr
                ? "دعنا نضبط هوية المنشأة الطبية لتجهيز السجلات ونظام المواعيد وفقاً للمعايير المعتمدة."
                : "Let's configure your medical facility identity to initialize patient records and scheduling."}
            </p>

            <label className="onboarding-field">
              {isAr ? "اسم المستشفى / المنشأة الطبية الرسمية *" : "Official Facility / Hospital Name *"}
              <input
                type="text"
                value={organizationName}
                onChange={(e) => setOrganizationName(e.target.value)}
                placeholder={isAr ? "مثال: مجمع عيادات العاصمة التخصصي" : "e.g. CityCare Medical Center"}
              />
            </label>

            <div className="onboarding-field">
              <label>{isAr ? "نوع المنشأة الطبية" : "Facility Operational Type"}</label>
              <div className="facility-type-grid">
                {facilityTypes.map((type) => (
                  <div
                    key={type.id}
                    className={`facility-type-card ${facilityType === type.id ? "active" : ""}`}
                    onClick={() => setFacilityType(type.id)}
                  >
                    <div className="facility-type-header">
                      <Building2 size={16} />
                      <strong>{isAr ? type.nameAr : type.nameEn}</strong>
                      {facilityType === type.id && <Check size={14} className="check-icon" />}
                    </div>
                    <p>{isAr ? type.descAr : type.descEn}</p>
                  </div>
                ))}
              </div>
            </div>

            <label className="onboarding-field">
              {isAr ? "المنطقة الزمنية المعتمدة" : "Operational Timezone"}
              <select
                className="onboarding-select"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
              >
                <option value="Africa/Cairo">Africa / Cairo (توقيت القاهرة - GMT+2)</option>
                <option value="Asia/Riyadh">Asia / Riyadh (توقيت الرياض - GMT+3)</option>
                <option value="Asia/Dubai">Asia / Dubai (توقيت دبي - GMT+4)</option>
                <option value="UTC">UTC (التوقيت العالمي الموحد)</option>
              </select>
            </label>
          </div>
        )}

        {/* ================= STEP 2: Departments ================= */}
        {step === 2 && (
          <div className="onboarding-step-content">
            <div className="eyebrow">{isAr ? "تجهيز الأقسام والعيادات" : "Clinics & Specialties"}</div>
            <h1>{isAr ? "ما هي العيادات المتوفرة في المنشأة؟" : "Select Active Clinics & Departments"}</h1>
            <p>
              {isAr
                ? "اختر العيادات المتاحة لتهيئة جداول الأطباء واستقبال المرضى تلقائياً. يمكنك تعديلها لاحقاً."
                : "Select available clinics to pre-configure doctor schedules and patient intake queues."}
            </p>

            <div className="depts-chips-grid">
              {defaultDepartments.map((dept) => {
                const isSelected = selectedDepts.includes(dept.id);
                return (
                  <button
                    key={dept.id}
                    type="button"
                    className={`dept-chip ${isSelected ? "selected" : ""}`}
                    onClick={() => toggleDepartment(dept.id)}
                  >
                    <Stethoscope size={14} />
                    <span>{isAr ? dept.nameAr : dept.nameEn}</span>
                    {isSelected ? <Check size={14} /> : <Plus size={14} className="add-icon" />}
                  </button>
                );
              })}
            </div>

            {customDepts.length > 0 && (
              <div className="custom-depts-list">
                <span className="custom-dept-label">
                  {isAr ? "أقسام مخصصة إضافية:" : "Custom Departments:"}
                </span>
                <div className="custom-chips">
                  {customDepts.map((name) => (
                    <span key={name} className="dept-chip selected custom">
                      <Activity size={13} />
                      {name}
                      <button
                        type="button"
                        onClick={() => handleRemoveCustomDept(name)}
                        aria-label="Remove"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="custom-dept-add-wrap">
              <label>{isAr ? "إضافة قسم أو عيادة تخصصية أخرى:" : "Add Custom Specialty / Department:"}</label>
              <div className="custom-dept-row">
                <input
                  type="text"
                  value={customDeptInput}
                  onChange={(e) => setCustomDeptInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddCustomDept();
                    }
                  }}
                  placeholder={isAr ? "مثال: جراحة المخ والأعصاب، عيادة التغذية..." : "e.g. Neurosurgery, Clinical Nutrition"}
                />
                <button
                  type="button"
                  className="outline-btn"
                  disabled={!customDeptInput.trim()}
                  onClick={handleAddCustomDept}
                >
                  <Plus size={14} /> {isAr ? "إضافة" : "Add"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================= STEP 3: Summary & Launch ================= */}
        {step === 3 && (
          <div className="onboarding-step-content">
            <div className="eyebrow">{isAr ? "إطلاق المنظومة" : "Final Review & Launch"}</div>
            <h1>{isAr ? "أنت جاهز لإطلاق مساحة العمل!" : "Your Workspace is Ready!"}</h1>
            <p>
              {isAr
                ? "راجع ملخص المنشأة، ويمكنك أيضاً إضافة كادر طبي مبدئي أو إكمال الدخول فورياً."
                : "Review your facility summary. You may also invite clinical team members or jump right in."}
            </p>

            {/* Facility Summary Card */}
            <div className="onboarding-summary-box">
              <div className="summary-item">
                <Building2 size={16} className="summary-icon" />
                <div>
                  <strong>{organizationName || "Hospital"}</strong>
                  <span>{isAr ? selectedFacility?.nameAr : selectedFacility?.nameEn}</span>
                </div>
              </div>
              <div className="summary-item">
                <ShieldCheck size={16} className="summary-icon" />
                <div>
                  <strong>{isAr ? "الأقسام المفعّلة" : "Activated Departments"}</strong>
                  <span>
                    {selectedDepts.length + customDepts.length}{" "}
                    {isAr ? "عيادات وتخصصات جاهزة" : "clinical departments ready"}
                  </span>
                </div>
              </div>
            </div>

            {/* Optional Staff Invite */}
            <div className="onboarding-field invite-section">
              <label>{isAr ? "دعوة طبيب أو موظف استقبال (اختياري)" : "Invite a Team Member (Optional)"}</label>
              <div className="invite-row">
                <input
                  type="email"
                  value={staffEmail}
                  onChange={(e) => setStaffEmail(e.target.value)}
                  placeholder="doctor@hospital.org"
                />
                <select
                  value={staffRole}
                  onChange={(e) => setStaffRole(e.target.value as any)}
                  className="onboarding-select-compact"
                >
                  <option value="doctor">{isAr ? "طبيب" : "Doctor"}</option>
                  <option value="nurse">{isAr ? "تمريض" : "Nurse"}</option>
                  <option value="receptionist">{isAr ? "استقبال" : "Receptionist"}</option>
                </select>
                <select
                  value={staffDept}
                  onChange={(e) => setStaffDept(e.target.value)}
                  className="onboarding-select-compact"
                >
                  {activeDepartmentList.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="outline-btn"
                  disabled={!staffEmail.trim() || !staffEmail.includes("@")}
                  onClick={handleAddInvite}
                >
                  <Users size={14} /> {isAr ? "إضافة" : "Invite"}
                </button>
              </div>

              {invitedList.length > 0 && (
                <div className="invited-badges">
                  {invitedList.map((item) => (
                    <span key={item.email} className="invited-badge">
                      <span>{item.email}</span>
                      <em>
                        ({item.role === "doctor" ? (isAr ? "طبيب" : "Doctor") : item.role === "nurse" ? (isAr ? "تمريض" : "Nurse") : (isAr ? "استقبال" : "Receptionist")} - {item.department})
                      </em>
                      <button type="button" onClick={() => handleRemoveInvite(item.email)}>
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="onboarding-actions">
          {step === 1 && onBack && (
            <button className="outline-btn onboarding-back-button" onClick={onBack}>
              {isAr ? "إلغاء والعودة" : "Cancel"}
            </button>
          )}

          {step > 1 && (
            <button className="outline-btn" onClick={() => setStep((s) => (s - 1) as any)}>
              {isAr ? <ArrowRight size={14} /> : <ArrowLeft size={14} />}
              {isAr ? "السابق" : "Back"}
            </button>
          )}

          {step < 3 ? (
            <button
              className="primary-btn"
              disabled={step === 1 && organizationName.trim().length < 2}
              onClick={() => setStep((s) => (s + 1) as any)}
            >
              {isAr ? "التالي" : "Next"}{" "}
              {isAr ? <ArrowLeft size={14} /> : <ArrowRight size={14} />}
            </button>
          ) : (
            <button className="primary-btn" onClick={handleComplete}>
              {isAr ? "إطلاق مساحة العمل والدخول" : "Launch Workspace & Enter"}{" "}
              <ArrowUpRight size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

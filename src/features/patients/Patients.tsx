import { useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Check,
  ChevronRight,
  Copy,
  Download,
  FileText,
  KeyRound,
  Pill,
  Plus,
  Printer,
  Search,
  ShieldAlert,
  User,
  UserPlus,
  X,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { createEncounter } from "../../api/encounters";
import { getPatients } from "../../api/patients";
import {
  activateBreakGlassAccess,
  createPatient,
  createPatientPrescription,
  getPatientPortalAccount,
  getPatientPrescriptions,
  getPatientVitals,
  provisionPatientPortalAccount,
  recordPatientVitals,
  type ApiPatient,
  type PatientPortalAccountInfo,
  type PatientRegistrationInput,
  type PrescriptionRecord,
  type ProvisionPortalAccountResponse,
  type VitalSignsRecord,
} from "../../api";
import { PageHeading } from "../../components/PageHeading";
import type { TranslationKey } from "../../i18n";
import { navigateToView, type AppView } from "../../app/routes";

function computeLiveNews2(
  rr?: number,
  spo2?: number,
  onO2?: boolean,
  sbp?: number,
  hr?: number,
  temp?: number,
  consciousness = "alert",
): { score: number; risk: "low" | "medium" | "high" } {
  let score = 0;
  let singleThree = false;

  if (rr !== undefined && !isNaN(rr)) {
    if (rr <= 8 || rr >= 25) { score += 3; singleThree = true; }
    else if (rr >= 21 && rr <= 24) score += 2;
    else if (rr >= 9 && rr <= 11) score += 1;
  }

  if (spo2 !== undefined && !isNaN(spo2)) {
    if (spo2 <= 91) { score += 3; singleThree = true; }
    else if (spo2 >= 92 && spo2 <= 93) score += 2;
    else if (spo2 >= 94 && spo2 <= 95) score += 1;
  }

  if (onO2) score += 2;

  if (sbp !== undefined && !isNaN(sbp)) {
    if (sbp <= 90 || sbp >= 220) { score += 3; singleThree = true; }
    else if (sbp >= 91 && sbp <= 100) score += 2;
    else if (sbp >= 101 && sbp <= 110) score += 1;
  }

  if (hr !== undefined && !isNaN(hr)) {
    if (hr <= 40 || hr >= 131) { score += 3; singleThree = true; }
    else if (hr >= 111 && hr <= 130) score += 2;
    else if ((hr >= 41 && hr <= 50) || (hr >= 91 && hr <= 110)) score += 1;
  }

  if (consciousness && consciousness.toLowerCase() !== "alert") {
    score += 3;
    singleThree = true;
  }

  if (temp !== undefined && !isNaN(temp)) {
    if (temp <= 35.0) { score += 3; singleThree = true; }
    else if (temp >= 39.1) score += 2;
    else if ((temp >= 35.1 && temp <= 36.0) || (temp >= 38.1 && temp <= 39.0)) score += 1;
  }

  const risk = score >= 7 ? "high" : (score >= 5 || singleThree ? "medium" : "low");
  return { score, risk };
}

type Translator = (key: TranslationKey) => string;
const emptyPatientForm: PatientRegistrationInput = {
  medical_record_number: "",
  given_name: "",
  family_name: "",
  preferred_name: "",
  preferred_language: "ar" as const,
  date_of_birth: "",
  gender: "unspecified",
  phone: "",
  email: "",
  address: "",
  emergency_contact: "",
};

function codeFromLocation(): string {
  const query = window.location.hash.split("?")[1];
  return query ? new URLSearchParams(query).get("code") ?? "" : "";
}

export function Patients({
  t,
  department,
  project,
  onNavigate,
  canCreatePatient = true,
}: {
  t: Translator;
  department: string;
  project: string;
  onNavigate?: (view: AppView) => void;
  canCreatePatient?: boolean;
}) {
  const [query, setQuery] = useState(codeFromLocation);
  const [items, setItems] = useState<ApiPatient[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startingEncounter, setStartingEncounter] = useState<string | null>(
    null,
  );
  const [showPatientForm, setShowPatientForm] = useState(false);
  const [patientForm, setPatientForm] =
    useState<PatientRegistrationInput>(emptyPatientForm);
  const [savingPatient, setSavingPatient] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [qrPatient, setQrPatient] = useState<ApiPatient | null>(null);
  const [portalPatient, setPortalPatient] = useState<ApiPatient | null>(null);
  const [portalInfo, setPortalInfo] = useState<PatientPortalAccountInfo | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalEmail, setPortalEmail] = useState("");
  const [portalPassword, setPortalPassword] = useState("");
  const [portalSuccess, setPortalSuccess] = useState<ProvisionPortalAccountResponse | null>(null);
  const [portalError, setPortalError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [patientFormDepartment, setPatientFormDepartment] = useState(department || "الباطنة العامة (General Medicine)");

  // Vitals & NEWS2 State
  const [vitalsPatient, setVitalsPatient] = useState<ApiPatient | null>(null);
  const [vitalsList, setVitalsList] = useState<VitalSignsRecord[]>([]);
  const [vitalsLoading, setVitalsLoading] = useState(false);
  const [vitalsSaving, setVitalsSaving] = useState(false);
  const [vitalsError, setVitalsError] = useState<string | null>(null);
  const [vitalsSuccess, setVitalsSuccess] = useState(false);
  const [vitalsForm, setVitalsForm] = useState({
    respiratory_rate: "",
    oxygen_saturation: "",
    on_supplemental_oxygen: false,
    systolic_bp: "",
    diastolic_bp: "",
    heart_rate: "",
    temperature_celsius: "",
    consciousness_level: "alert",
    notes: "",
  });

  // Break-Glass State
  const [breakGlassPatient, setBreakGlassPatient] = useState<ApiPatient | null>(null);
  const [breakGlassReason, setBreakGlassReason] = useState("حالة طوارئ وإنعاش حرجة / Emergency Trauma Alert");
  const [breakGlassJustification, setBreakGlassJustification] = useState("");
  const [breakGlassLoading, setBreakGlassLoading] = useState(false);
  const [breakGlassSuccess, setBreakGlassSuccess] = useState<string | null>(null);
  const [breakGlassError, setBreakGlassError] = useState<string | null>(null);

  // E-Prescription State
  const [selectedPatientForRx, setSelectedPatientForRx] = useState<ApiPatient | null>(null);
  const [patientPrescriptions, setPatientPrescriptions] = useState<PrescriptionRecord[]>([]);
  const [loadingRxList, setLoadingRxList] = useState(false);
  const [savingRx, setSavingRx] = useState(false);
  const [rxError, setRxError] = useState<string | null>(null);
  const [rxMedication, setRxMedication] = useState("");
  const [rxDosage, setRxDosage] = useState("500 mg");
  const [rxRoute, setRxRoute] = useState("Oral");
  const [rxFrequency, setRxFrequency] = useState("Every 12 hours after meals");
  const [rxDurationDays, setRxDurationDays] = useState("7");
  const [rxInstructions, setRxInstructions] = useState("");
  const [rxOverrideAllergy, setRxOverrideAllergy] = useState(false);

  const isArabic = typeof document !== "undefined" && document.documentElement.dir === "rtl";

  const openPrescriptionModal = async (patient: ApiPatient) => {
    setSelectedPatientForRx(patient);
    setRxError(null);
    setRxMedication("");
    setRxInstructions("");
    setRxOverrideAllergy(false);
    setLoadingRxList(true);
    try {
      const list = await getPatientPrescriptions(patient.id);
      setPatientPrescriptions(Array.isArray(list) ? list : []);
    } catch {
      setPatientPrescriptions([]);
    } finally {
      setLoadingRxList(false);
    }
  };

  const handleSavePrescription = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatientForRx || !rxMedication.trim()) return;
    setSavingRx(true);
    setRxError(null);
    try {
      const newRx = await createPatientPrescription(selectedPatientForRx.id, {
        medication_name: rxMedication.trim(),
        dosage: rxDosage,
        route: rxRoute,
        frequency: rxFrequency,
        duration_days: parseInt(rxDurationDays, 10) || 7,
        instructions: rxInstructions.trim(),
        override_allergy_warning: rxOverrideAllergy,
      });
      setPatientPrescriptions((prev) => [newRx, ...prev]);
      setRxMedication("");
      setRxInstructions("");
      setRxOverrideAllergy(false);
      window.dispatchEvent(
        new CustomEvent("careos:toast", {
          detail: isArabic ? "تم اعتماد وحفظ الروشتة الطبية بنجاح" : "Prescription approved & saved successfully",
        }),
      );
    } catch (err: unknown) {
      setRxError(err instanceof Error ? err.message : "Failed to create prescription");
    } finally {
      setSavingRx(false);
    }
  };

  const openVitalsModal = (patient: ApiPatient) => {
    setVitalsPatient(patient);
    setVitalsError(null);
    setVitalsSuccess(false);
    setVitalsForm({
      respiratory_rate: "16",
      oxygen_saturation: "98",
      on_supplemental_oxygen: false,
      systolic_bp: "120",
      diastolic_bp: "80",
      heart_rate: "75",
      temperature_celsius: "37.0",
      consciousness_level: "alert",
      notes: "",
    });
    setVitalsLoading(true);
    getPatientVitals(patient.id)
      .then(setVitalsList)
      .catch(() => setVitalsList([]))
      .finally(() => setVitalsLoading(false));
  };

  const handleSaveVitals = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vitalsPatient) return;
    setVitalsSaving(true);
    setVitalsError(null);
    try {
      await recordPatientVitals(vitalsPatient.id, {
        respiratory_rate: vitalsForm.respiratory_rate ? parseInt(vitalsForm.respiratory_rate, 10) : undefined,
        oxygen_saturation: vitalsForm.oxygen_saturation ? parseFloat(vitalsForm.oxygen_saturation) : undefined,
        on_supplemental_oxygen: vitalsForm.on_supplemental_oxygen,
        systolic_bp: vitalsForm.systolic_bp ? parseInt(vitalsForm.systolic_bp, 10) : undefined,
        diastolic_bp: vitalsForm.diastolic_bp ? parseInt(vitalsForm.diastolic_bp, 10) : undefined,
        heart_rate: vitalsForm.heart_rate ? parseInt(vitalsForm.heart_rate, 10) : undefined,
        temperature_celsius: vitalsForm.temperature_celsius ? parseFloat(vitalsForm.temperature_celsius) : undefined,
        consciousness_level: vitalsForm.consciousness_level,
        notes: vitalsForm.notes,
      });
      setVitalsSuccess(true);
      const updated = await getPatientVitals(vitalsPatient.id);
      setVitalsList(updated);
    } catch (err: unknown) {
      setVitalsError(err instanceof Error ? err.message : "Failed to record vitals");
    } finally {
      setVitalsSaving(false);
    }
  };

  const openBreakGlassModal = (patient: ApiPatient) => {
    setBreakGlassPatient(patient);
    setBreakGlassReason("حالة طوارئ وإنعاش حرجة / Emergency Trauma Alert");
    setBreakGlassJustification("");
    setBreakGlassSuccess(null);
    setBreakGlassError(null);
  };

  const handleActivateBreakGlass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!breakGlassPatient || !breakGlassJustification.trim()) return;
    setBreakGlassLoading(true);
    setBreakGlassError(null);
    try {
      const res = await activateBreakGlassAccess(breakGlassPatient.id, {
        reason: breakGlassReason,
        justification: breakGlassJustification.trim(),
      });
      setBreakGlassSuccess(res.expires_at);
    } catch (err: unknown) {
      setBreakGlassError(err instanceof Error ? err.message : "Failed to activate emergency break-glass");
    } finally {
      setBreakGlassLoading(false);
    }
  };

  const openPortalModal = (patient: ApiPatient) => {
    setPortalPatient(patient);
    setPortalInfo(null);
    setPortalEmail(patient.email || "");
    setPortalPassword("");
    setPortalSuccess(null);
    setPortalError(null);
    setCopied(false);
    setPortalLoading(true);
    getPatientPortalAccount(patient.id)
      .then((info) => {
        setPortalInfo(info);
        if (info.email) setPortalEmail(info.email);
      })
      .catch(() => {
        setPortalInfo({ has_account: false, patient_id: patient.id, email: null, is_active: false, created_at: null });
      })
      .finally(() => setPortalLoading(false));
  };

  const handleProvisionPortal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!portalPatient || !portalEmail.trim()) return;
    setPortalLoading(true);
    setPortalError(null);
    try {
      const result = await provisionPatientPortalAccount(portalPatient.id, {
        email: portalEmail.trim(),
        full_name: `${portalPatient.given_name} ${portalPatient.family_name}`.trim(),
        temporary_password: portalPassword.trim() || undefined,
      });
      setPortalSuccess(result);
      setPortalInfo({
        has_account: true,
        patient_id: portalPatient.id,
        email: result.email,
        is_active: true,
        created_at: new Date().toISOString(),
      });
    } catch (err: unknown) {
      setPortalError(err instanceof Error ? err.message : "Failed to provision portal account");
    } finally {
      setPortalLoading(false);
    }
  };

  const handleCopyCredentials = () => {
    if (!portalSuccess) return;
    const text = `CareOS Patient Portal:\nEmail: ${portalSuccess.email}\nTemporary Password: ${portalSuccess.temporary_password || "(unchanged)"}`;
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  const pageSize = 25;
  useEffect(() => {
    setLoading(true);
    getPatients(query, page, pageSize)
      .then((records) => {
        setItems(records);
        setError(null);
      })
      .catch((reason: unknown) =>
        setError(
          reason instanceof Error
            ? reason.message === "Insufficient permissions"
              ? t("permissionDenied")
              : reason.message
            : "Could not load patients.",
        ),
      )
      .finally(() => setLoading(false));
  }, [query, page]);
  useEffect(() => {
    setPage(1);
  }, [query]);
  useEffect(() => {
    const syncQrSearch = () => {
      const code = codeFromLocation();
      if (code && window.location.hash.startsWith("#app/patients")) {
        setQuery(code);
        setPage(1);
      }
    };
    window.addEventListener("hashchange", syncQrSearch);
    return () => window.removeEventListener("hashchange", syncQrSearch);
  }, []);
  const startEncounter = async (patientId: string) => {
    setStartingEncounter(patientId);
    try {
      const encounter = await createEncounter(patientId);
      localStorage.setItem("careos-active-encounter-id", encounter.id);
      window.dispatchEvent(
        new CustomEvent("careos:toast", { detail: "Encounter started." }),
      );
      if (onNavigate) onNavigate("notes");
      else navigateToView("notes");
    } catch (reason: unknown) {
      setError(
        reason instanceof Error ? reason.message : "Could not start encounter.",
      );
    } finally {
      setStartingEncounter(null);
    }
  };
  const registerPatient = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (savingPatient) return;
    setSavingPatient(true);
    setFormError(null);
    try {
      await createPatient({
        ...patientForm,
        medical_record_number: patientForm.medical_record_number || undefined,
        department: patientFormDepartment || department,
        project,
      });
      setShowPatientForm(false);
      setPatientForm(emptyPatientForm);
      setQuery("");
      setPage(1);
      window.dispatchEvent(
        new CustomEvent("careos:toast", { detail: t("patientCreated") }),
      );
    } catch (reason) {
      setFormError(
        reason instanceof Error ? reason.message : t("patientsUnavailable"),
      );
    } finally {
      setSavingPatient(false);
    }
  };
  const downloadQr = () => {
    if (!qrPatient) return;
    const svg = document.querySelector("#patient-qr-code svg");
    if (!(svg instanceof SVGSVGElement)) return;
    const file = new Blob([new XMLSerializer().serializeToString(svg)], {
      type: "image/svg+xml",
    });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${qrPatient.patient_code}.svg`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const patientQrUrl = (patient: ApiPatient) =>
    `${window.location.origin}${window.location.pathname}#app/patients?code=${encodeURIComponent(patient.patient_code)}`;
  return (
    <>
      <PageHeading
        eyebrow={t("careDirectory")}
        title={t("patients")}
        detail={t("searchManage")}
        action={
          canCreatePatient ? <button className="primary-btn" onClick={() => {
            setFormError(null);
            setPatientForm(emptyPatientForm);
            setShowPatientForm(true);
          }}>
            <Plus size={17} /> {t("addPatient")}
          </button> : undefined
        }
      />
      <div className="toolbar">
        <div className="search-box">
          <Search size={17} />
          <input
            placeholder={t("searchPatients")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <span className="scope-pill">{t("searchCriteria")}</span>
        <span className="scope-pill">
          {t("departmentScope")}: {department}
        </span>
        <span className="scope-pill">
          {t("projectScope")}: {project}
        </span>
      </div>
      <section className="panel table-panel">
        <div className="table-header">
          <span>{t("patient")}</span>
          <span>{t("condition")}</span>
          <span>{t("careStatus")}</span>
          <span />
        </div>
        {loading && <div className="loading-state">{t("loadingPatients")}</div>}
        {!loading && error && (
          <div className="error-state" role="alert">
            {error}
          </div>
        )}
        {!loading &&
          !error &&
          items.map((patient) => (
            <div className="patient-table-row" key={patient.id}>
              <div className="patient-cell">
                <div
                  className="patient-avatar"
                  style={{ background: "#8db4ad" }}
                >{`${patient.given_name[0] || "P"}${patient.family_name[0] || ""}`}</div>
                <div>
                  <strong>
                    {patient.given_name} {patient.family_name}
                  </strong>
                  <span>
                    <span className="patient-code-label">
                      {t("patientCode")}: <code className="patient-code">{patient.patient_code}</code>
                    </span>
                    <button
                      type="button"
                      className="patient-qr-preview"
                      aria-label={`${t("generatePatientQr")}: ${patient.patient_code}`}
                      onClick={() => setQrPatient(patient)}
                    >
                      <QRCodeSVG
                        value={patientQrUrl(patient)}
                        size={48}
                        level="M"
                        includeMargin
                      />
                    </button>
                    {" · "}
                    {patient.medical_record_number} ·{" "}
                    {new Date().getFullYear() -
                      new Date(patient.date_of_birth).getFullYear()}{" "}
                    {t("years")}
                  </span>
                </div>
              </div>
              <span>{patient.condition || t("notRecorded")}</span>
              <span className="status confirmed">
                {patient.care_status || "—"}
              </span>
              <div className="patient-row-actions">
                <button
                  type="button"
                  className="outline-btn"
                  title={t("vitalsTitle")}
                  onClick={(e) => {
                    e.stopPropagation();
                    openVitalsModal(patient);
                  }}
                >
                  <Activity size={13} color="#10b981" />
                  <span>{t("vitalSigns")}</span>
                </button>
                <button
                  type="button"
                  className="outline-btn"
                  title={isArabic ? "إصدار ومراجعة الروشتة الإلكترونية" : "E-Prescriptions (Rx)"}
                  onClick={(e) => {
                    e.stopPropagation();
                    void openPrescriptionModal(patient);
                  }}
                  style={{
                    borderColor: "rgba(13, 148, 136, 0.4)",
                    color: "var(--teal)",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                  }}
                >
                  <Pill size={13} />
                  <span>{isArabic ? "الروشتة Rx" : "Prescription Rx"}</span>
                </button>
                <button
                  type="button"
                  className="outline-btn"
                  title={t("breakGlassTitle")}
                  onClick={(e) => {
                    e.stopPropagation();
                    openBreakGlassModal(patient);
                  }}
                  style={{
                    borderColor: "rgba(239, 68, 68, 0.4)",
                    color: "#ef4444",
                  }}
                >
                  <ShieldAlert size={13} />
                  <span>{t("emergencyBreakGlass")}</span>
                </button>
                <button
                  type="button"
                  className="outline-btn"
                  title={t("portalAccountTitle")}
                  onClick={(e) => {
                    e.stopPropagation();
                    openPortalModal(patient);
                  }}
                >
                  <KeyRound size={13} />
                  <span>{t("activatePortalAccount")}</span>
                </button>
                <button
                  className="outline-btn"
                  disabled={startingEncounter === patient.id}
                  onClick={() => void startEncounter(patient.id)}
                >
                  {startingEncounter === patient.id
                    ? t("startingEncounter")
                    : t("startEncounter")}
                </button>
              </div>
              <ChevronRight size={17} />
            </div>
          ))}
        {!loading && !error && items.length === 0 && (
          <div className="empty-state">{t("noPatients")}</div>
        )}
        <div className="pagination-controls">
          <button
            className="outline-btn"
            disabled={loading || page === 1}
            onClick={() => setPage((value) => value - 1)}
          >
            {t("previous")}
          </button>
          <span>
            {t("page")} {page}
          </span>
          <button
            className="outline-btn"
            disabled={loading || items.length < pageSize}
            onClick={() => setPage((value) => value + 1)}
          >
            {t("next")}
          </button>
        </div>
      </section>
      {showPatientForm && (
        <div className="patient-modal-backdrop">
          <section
            className="panel patient-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="patient-registration-title"
          >
            <div className="patient-modal-heading">
              <div className="patient-modal-title-box">
                <div className="patient-modal-icon">
                  <UserPlus size={22} />
                </div>
                <div>
                  <h2 id="patient-registration-title">{t("newPatientTitle")}</h2>
                  <p className="patient-modal-subtitle">
                    {t("patientModalSubtitle")}
                  </p>
                </div>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label={t("closeDialog")}
                onClick={() => setShowPatientForm(false)}
              >
                <X size={18} />
              </button>
            </div>
            <form className="patient-registration-form" onSubmit={registerPatient}>
              <div className="patient-form-section-title">
                <User size={14} />
                <span>{t("personalDetails")}</span>
              </div>

              <div className="patient-form-field">
                <label htmlFor="patient-given-name" className="field-label">
                  <span>{t("givenName")}</span>
                  <span className="required-star">*</span>
                </label>
                <input
                  id="patient-given-name"
                  required
                  maxLength={120}
                  placeholder={t("givenName")}
                  value={patientForm.given_name}
                  onChange={(event) => setPatientForm({ ...patientForm, given_name: event.target.value })}
                />
              </div>

              <div className="patient-form-field">
                <label htmlFor="patient-family-name" className="field-label">
                  <span>{t("familyName")}</span>
                  <span className="required-star">*</span>
                </label>
                <input
                  id="patient-family-name"
                  required
                  maxLength={120}
                  placeholder={t("familyName")}
                  value={patientForm.family_name}
                  onChange={(event) => setPatientForm({ ...patientForm, family_name: event.target.value })}
                />
              </div>

              <div className="patient-form-field">
                <label htmlFor="patient-preferred-name" className="field-label">
                  <span>{t("preferredName")}</span>
                </label>
                <input
                  id="patient-preferred-name"
                  maxLength={120}
                  placeholder={t("preferredName")}
                  value={patientForm.preferred_name}
                  onChange={(event) => setPatientForm({ ...patientForm, preferred_name: event.target.value })}
                />
              </div>

              <div className="patient-form-field">
                <label htmlFor="patient-dob" className="field-label">
                  <span>{t("dateOfBirth")}</span>
                  <span className="required-star">*</span>
                </label>
                <input
                  id="patient-dob"
                  required
                  type="date"
                  value={patientForm.date_of_birth}
                  onChange={(event) => setPatientForm({ ...patientForm, date_of_birth: event.target.value })}
                />
              </div>

              <div className="patient-form-field">
                <label htmlFor="patient-gender" className="field-label">
                  <span>{t("gender")}</span>
                </label>
                <select
                  id="patient-gender"
                  value={patientForm.gender}
                  onChange={(event) => setPatientForm({ ...patientForm, gender: event.target.value })}
                >
                  <option value="unspecified">{t("notRecorded")}</option>
                  <option value="female">{t("female")}</option>
                  <option value="male">{t("male")}</option>
                  <option value="other">{t("otherGender")}</option>
                </select>
              </div>

              <div className="patient-form-field">
                <label htmlFor="patient-pref-lang" className="field-label">
                  <span>{t("preferredLanguage")}</span>
                </label>
                <select
                  id="patient-pref-lang"
                  value={patientForm.preferred_language}
                  onChange={(event) => setPatientForm({ ...patientForm, preferred_language: event.target.value as "ar" | "en" })}
                >
                  <option value="ar">{t("arabic")}</option>
                  <option value="en">{t("english")}</option>
                </select>
              </div>

              <div className="patient-form-section-title patient-form-wide">
                <FileText size={14} />
                <span>{t("clinicalContactDetails")}</span>
              </div>

              <div className="patient-form-field">
                <label htmlFor="patient-mrn" className="field-label">
                  <span>{t("medicalRecordNumber")}</span>
                </label>
                <input
                  id="patient-mrn"
                  minLength={2}
                  maxLength={64}
                  value={patientForm.medical_record_number}
                  placeholder={t("medicalRecordNumberHint")}
                  onChange={(event) => setPatientForm({ ...patientForm, medical_record_number: event.target.value })}
                />
              </div>

              <div className="patient-form-field">
                <label htmlFor="patient-phone" className="field-label">
                  <span>{t("phoneNumber")}</span>
                </label>
                <input
                  id="patient-phone"
                  type="tel"
                  maxLength={40}
                  placeholder="05XXXXXXXX"
                  value={patientForm.phone}
                  onChange={(event) => setPatientForm({ ...patientForm, phone: event.target.value })}
                />
              </div>

              <div className="patient-form-field">
                <label htmlFor="patient-email" className="field-label">
                  <span>{t("contactEmail")}</span>
                </label>
                <input
                  id="patient-email"
                  type="email"
                  placeholder="patient@example.com"
                  value={patientForm.email}
                  onChange={(event) => setPatientForm({ ...patientForm, email: event.target.value })}
                />
              </div>

              <div className="patient-form-field">
                <label htmlFor="patient-emergency" className="field-label">
                  <span>{t("emergencyContact")}</span>
                </label>
                <input
                  id="patient-emergency"
                  maxLength={240}
                  placeholder={t("emergencyContactPlaceholder")}
                  value={patientForm.emergency_contact}
                  onChange={(event) => setPatientForm({ ...patientForm, emergency_contact: event.target.value })}
                />
              </div>

              <div className="patient-form-field">
                <label htmlFor="patient-department-select" className="field-label">
                  <span>القسم والعيادة المعنية</span>
                </label>
                <select
                  id="patient-department-select"
                  value={patientFormDepartment}
                  onChange={(event) => setPatientFormDepartment(event.target.value)}
                  style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid var(--line)", background: "var(--paper)", color: "var(--ink)" }}
                >
                  <option value="الباطنة العامة (General Medicine)">الباطنة العامة (General Medicine)</option>
                  <option value="طوارئ 24/7 (Emergency)">طوارئ 24/7 (Emergency)</option>
                  <option value="طب الأطفال (Pediatrics)">طب الأطفال (Pediatrics)</option>
                  <option value="النساء والتوليد (OB/GYN)">النساء والتوليد (OB/GYN)</option>
                  <option value="العظام والمفاصل (Orthopedics)">العظام والمفاصل (Orthopedics)</option>
                  <option value="طب وجراحة العيون (Ophthalmology)">طب وجراحة العيون (Ophthalmology)</option>
                </select>
              </div>

              <div className="patient-form-field patient-form-wide">
                <label htmlFor="patient-address" className="field-label">
                  <span>{t("address")}</span>
                </label>
                <input
                  id="patient-address"
                  maxLength={500}
                  placeholder={t("addressPlaceholder")}
                  value={patientForm.address}
                  onChange={(event) => setPatientForm({ ...patientForm, address: event.target.value })}
                />
              </div>

              {formError && <div className="inline-error patient-form-wide" role="alert">{formError}</div>}

              <div className="patient-modal-actions patient-form-wide">
                <button className="outline-btn" type="button" onClick={() => setShowPatientForm(false)}>
                  <X size={15} />
                  <span>{t("cancel")}</span>
                </button>
                <button className="primary-btn" type="submit" disabled={savingPatient}>
                  {savingPatient ? (
                    <span>{t("loading")}</span>
                  ) : (
                    <>
                      <Check size={16} />
                      <span>{t("registerPatient")}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {qrPatient && (
        <div className="patient-modal-backdrop">
          <section
            className="panel patient-modal patient-qr-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="patient-qr-title"
          >
            <div className="patient-modal-heading">
              <h2 id="patient-qr-title">{t("patientQrTitle")}</h2>
              <button
                className="icon-button"
                type="button"
                aria-label={t("closeDialog")}
                onClick={() => setQrPatient(null)}
              >
                <X size={18} />
              </button>
            </div>
            <strong>{qrPatient.given_name} {qrPatient.family_name}</strong>
            <code className="patient-code">{qrPatient.patient_code}</code>
            <div id="patient-qr-code" className="patient-qr-code">
              <QRCodeSVG value={patientQrUrl(qrPatient)} size={240} level="M" includeMargin />
            </div>
            <p>{t("patientQrPrivacy")}</p>
            <a className="text-btn" href={patientQrUrl(qrPatient)}>
              {t("openSecurePatientRecord")}
            </a>
            <div className="patient-modal-actions">
              <button className="outline-btn" type="button" onClick={() => setQrPatient(null)}>
                {t("closeDialog")}
              </button>
              <button className="primary-btn" type="button" onClick={downloadQr}>
                <Download size={16} /> {t("downloadPatientQr")}
              </button>
            </div>
          </section>
        </div>
      )}
      {portalPatient && (
        <div className="patient-modal-backdrop">
          <section
            className="panel patient-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="portal-modal-title"
            style={{ maxWidth: "520px" }}
          >
            <div className="patient-modal-heading">
              <div>
                <h2 id="portal-modal-title" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <KeyRound size={20} />
                  <span>{t("portalAccountTitle")}</span>
                </h2>
                <p style={{ marginTop: "0.25rem", color: "var(--text-secondary)", fontSize: "0.875rem" }}>
                  {t("portalAccountDescription")}
                </p>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label={t("closeDialog")}
                onClick={() => setPortalPatient(null)}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ margin: "1rem 0", padding: "0.75rem 1rem", borderRadius: "8px", background: "var(--bg-muted)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <strong style={{ display: "block" }}>{portalPatient.given_name} {portalPatient.family_name}</strong>
                <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>MRN: {portalPatient.medical_record_number}</span>
              </div>
              <span className={`status ${portalInfo?.has_account ? "confirmed" : "pending"}`}>
                {portalInfo?.has_account ? t("portalAccountActive") : t("portalAccountInactive")}
              </span>
            </div>

            {portalSuccess && (
              <div style={{ margin: "1rem 0", padding: "1rem", borderRadius: "8px", background: "rgba(16, 185, 129, 0.1)", border: "1px solid rgba(16, 185, 129, 0.3)" }}>
                <strong style={{ color: "#10b981", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <Check size={18} /> {t("provisionSuccess")}
                </strong>
                <div style={{ marginTop: "0.75rem", fontSize: "0.9rem", lineHeight: "1.6" }}>
                  <div><strong>Email:</strong> {portalSuccess.email}</div>
                  <div><strong>{t("temporaryPassword")}:</strong> <code>{portalSuccess.temporary_password || "(unchanged)"}</code></div>
                </div>
                <div style={{ marginTop: "0.75rem" }}>
                  <button
                    type="button"
                    className="outline-btn"
                    onClick={handleCopyCredentials}
                    style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
                  >
                    {copied ? <Check size={15} color="#10b981" /> : <Copy size={15} />}
                    <span>{copied ? t("credentialsCopied") : t("copyCredentials")}</span>
                  </button>
                </div>
              </div>
            )}

            <form onSubmit={(e) => void handleProvisionPortal(e)}>
              <label style={{ display: "block", marginBottom: "0.85rem" }}>
                <span>{t("contactEmail")} *</span>
                <input
                  type="email"
                  required
                  value={portalEmail}
                  onChange={(e) => setPortalEmail(e.target.value)}
                  placeholder="patient@example.com"
                  style={{ width: "100%", marginTop: "0.35rem" }}
                />
              </label>

              <label style={{ display: "block", marginBottom: "0.85rem" }}>
                <span>{t("temporaryPassword")} ({t("temporaryPasswordHint")})</span>
                <input
                  type="text"
                  value={portalPassword}
                  onChange={(e) => setPortalPassword(e.target.value)}
                  placeholder="Care@123456"
                  minLength={8}
                  style={{ width: "100%", marginTop: "0.35rem" }}
                />
              </label>

              {portalError && (
                <div className="inline-error" style={{ marginBottom: "1rem" }} role="alert">
                  {portalError}
                </div>
              )}

              <div className="patient-modal-actions" style={{ marginTop: "1.25rem", display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
                <button className="outline-btn" type="button" onClick={() => setPortalPatient(null)}>
                  {t("closeDialog")}
                </button>
                <button className="primary-btn" type="submit" disabled={portalLoading}>
                  {portalLoading ? t("loading") : (portalInfo?.has_account ? t("resetPassword") : t("activatePortalAccount"))}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {vitalsPatient && (
        <div className="patient-modal-backdrop">
          <section
            className="panel patient-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="vitals-modal-title"
            style={{ maxWidth: "580px" }}
          >
            <div className="patient-modal-heading">
              <div>
                <h2 id="vitals-modal-title" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <Activity size={20} color="#10b981" />
                  <span>{t("vitalsTitle")}</span>
                </h2>
                <p style={{ marginTop: "0.25rem", color: "var(--text-secondary)", fontSize: "0.875rem" }}>
                  {t("vitalsDescription")}
                </p>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label={t("closeDialog")}
                onClick={() => setVitalsPatient(null)}
              >
                <X size={18} />
              </button>
            </div>

            {/* Real-time reactive NEWS2 score banner */}
            {(() => {
              const live = computeLiveNews2(
                vitalsForm.respiratory_rate ? parseInt(vitalsForm.respiratory_rate, 10) : undefined,
                vitalsForm.oxygen_saturation ? parseFloat(vitalsForm.oxygen_saturation) : undefined,
                vitalsForm.on_supplemental_oxygen,
                vitalsForm.systolic_bp ? parseInt(vitalsForm.systolic_bp, 10) : undefined,
                vitalsForm.heart_rate ? parseInt(vitalsForm.heart_rate, 10) : undefined,
                vitalsForm.temperature_celsius ? parseFloat(vitalsForm.temperature_celsius) : undefined,
                vitalsForm.consciousness_level,
              );
              const toneColor = live.risk === "high" ? "#ef4444" : live.risk === "medium" ? "#f59e0b" : "#10b981";
              const bgTone = live.risk === "high" ? "rgba(239, 68, 68, 0.12)" : live.risk === "medium" ? "rgba(245, 158, 11, 0.12)" : "rgba(16, 185, 129, 0.12)";
              const riskLabel = live.risk === "high" ? t("news2HighRisk") : live.risk === "medium" ? t("news2MediumRisk") : t("news2LowRisk");

              return (
                <div style={{
                  margin: "1rem 0",
                  padding: "0.85rem 1.25rem",
                  borderRadius: "10px",
                  background: bgTone,
                  border: `1.5px solid ${toneColor}`,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}>
                  <div>
                    <strong style={{ fontSize: "1.1rem", color: toneColor }}>
                      {t("news2Score")}: {live.score}
                    </strong>
                    <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>
                      {vitalsPatient.given_name} {vitalsPatient.family_name} · MRN: {vitalsPatient.medical_record_number}
                    </div>
                  </div>
                  <span style={{
                    padding: "0.35rem 0.85rem",
                    borderRadius: "999px",
                    fontWeight: "700",
                    fontSize: "0.85rem",
                    background: toneColor,
                    color: "#fff",
                  }}>
                    {riskLabel}
                  </span>
                </div>
              );
            })()}

            {vitalsSuccess && (
              <div style={{ padding: "0.75rem 1rem", borderRadius: "8px", background: "rgba(16, 185, 129, 0.1)", border: "1px solid rgba(16, 185, 129, 0.3)", color: "#10b981", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <Check size={16} /> <strong>{t("vitalsRecorded")}</strong>
              </div>
            )}

            <form onSubmit={(e) => void handleSaveVitals(e)}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                <label>
                  <span>{t("respiratoryRate")}</span>
                  <input
                    type="number"
                    min={4}
                    max={60}
                    value={vitalsForm.respiratory_rate}
                    onChange={(e) => setVitalsForm({ ...vitalsForm, respiratory_rate: e.target.value })}
                    style={{ width: "100%", marginTop: "0.25rem" }}
                  />
                </label>
                <label>
                  <span>{t("oxygenSaturation")}</span>
                  <input
                    type="number"
                    min={40}
                    max={100}
                    value={vitalsForm.oxygen_saturation}
                    onChange={(e) => setVitalsForm({ ...vitalsForm, oxygen_saturation: e.target.value })}
                    style={{ width: "100%", marginTop: "0.25rem" }}
                  />
                </label>
                <label>
                  <span>{t("systolicBP")}</span>
                  <input
                    type="number"
                    min={40}
                    max={300}
                    value={vitalsForm.systolic_bp}
                    onChange={(e) => setVitalsForm({ ...vitalsForm, systolic_bp: e.target.value })}
                    style={{ width: "100%", marginTop: "0.25rem" }}
                  />
                </label>
                <label>
                  <span>{t("diastolicBP")}</span>
                  <input
                    type="number"
                    min={20}
                    max={200}
                    value={vitalsForm.diastolic_bp}
                    onChange={(e) => setVitalsForm({ ...vitalsForm, diastolic_bp: e.target.value })}
                    style={{ width: "100%", marginTop: "0.25rem" }}
                  />
                </label>
                <label>
                  <span>{t("heartRate")}</span>
                  <input
                    type="number"
                    min={20}
                    max={260}
                    value={vitalsForm.heart_rate}
                    onChange={(e) => setVitalsForm({ ...vitalsForm, heart_rate: e.target.value })}
                    style={{ width: "100%", marginTop: "0.25rem" }}
                  />
                </label>
                <label>
                  <span>{t("temperature")}</span>
                  <input
                    type="number"
                    step="0.1"
                    min={25}
                    max={45}
                    value={vitalsForm.temperature_celsius}
                    onChange={(e) => setVitalsForm({ ...vitalsForm, temperature_celsius: e.target.value })}
                    style={{ width: "100%", marginTop: "0.25rem" }}
                  />
                </label>
              </div>

              <div style={{ marginTop: "0.75rem", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", alignItems: "center" }}>
                <label>
                  <span>{t("consciousnessLevel")}</span>
                  <select
                    value={vitalsForm.consciousness_level}
                    onChange={(e) => setVitalsForm({ ...vitalsForm, consciousness_level: e.target.value })}
                    style={{ width: "100%", marginTop: "0.25rem" }}
                  >
                    <option value="alert">Alert (واعي ومستجيب بالكامل)</option>
                    <option value="voice">Voice (يستجيب للصوت فقط)</option>
                    <option value="pain">Pain (يستجيب للألم فقط)</option>
                    <option value="unresponsive">Unresponsive (فاقد للوعي تماماً)</option>
                  </select>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "1.2rem", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={vitalsForm.on_supplemental_oxygen}
                    onChange={(e) => setVitalsForm({ ...vitalsForm, on_supplemental_oxygen: e.target.checked })}
                  />
                  <span>{t("supplementalOxygen")}</span>
                </label>
              </div>

              {vitalsError && (
                <div className="inline-error" style={{ margin: "0.85rem 0" }} role="alert">
                  {vitalsError}
                </div>
              )}

              {vitalsList.length > 0 && (
                <div style={{ marginTop: "1rem", maxHeight: "120px", overflowY: "auto", borderTop: "1px solid var(--border-color)", paddingTop: "0.5rem" }}>
                  <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: "600" }}>{t("latestVitals")}:</span>
                  {vitalsList.slice(0, 3).map((v) => (
                    <div key={v.id} style={{ fontSize: "0.8rem", display: "flex", justifyContent: "space-between", padding: "0.2rem 0", color: "var(--text-secondary)" }}>
                      <span>BP: {v.systolic_bp}/{v.diastolic_bp} · HR: {v.heart_rate} · SpO2: {v.oxygen_saturation}%</span>
                      <strong style={{ color: v.clinical_risk === "high" ? "#ef4444" : v.clinical_risk === "medium" ? "#f59e0b" : "#10b981" }}>
                        NEWS2: {v.news2_score}
                      </strong>
                    </div>
                  ))}
                </div>
              )}

              <div className="patient-modal-actions" style={{ marginTop: "1.25rem", display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
                <button className="outline-btn" type="button" onClick={() => setVitalsPatient(null)}>
                  {t("closeDialog")}
                </button>
                <button className="primary-btn" type="submit" disabled={vitalsSaving}>
                  {vitalsSaving ? t("loading") : t("saveVitals")}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {breakGlassPatient && (
        <div className="patient-modal-backdrop">
          <section
            className="panel patient-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="break-glass-title"
            style={{ maxWidth: "520px", border: "2px solid #ef4444" }}
          >
            <div className="patient-modal-heading" style={{ borderBottom: "1px solid rgba(239, 68, 68, 0.2)", paddingBottom: "0.75rem" }}>
              <div>
                <h2 id="break-glass-title" style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "#ef4444" }}>
                  <ShieldAlert size={22} />
                  <span>{t("breakGlassTitle")}</span>
                </h2>
                <p style={{ marginTop: "0.25rem", color: "var(--text-secondary)", fontSize: "0.875rem" }}>
                  {t("breakGlassDescription")}
                </p>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label={t("closeDialog")}
                onClick={() => setBreakGlassPatient(null)}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ margin: "1rem 0", padding: "0.85rem", borderRadius: "8px", background: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239, 68, 68, 0.3)" }}>
              <strong style={{ display: "block" }}>{breakGlassPatient.given_name} {breakGlassPatient.family_name}</strong>
              <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>MRN: {breakGlassPatient.medical_record_number}</span>
            </div>

            {breakGlassSuccess ? (
              <div style={{ margin: "1rem 0", padding: "1rem", borderRadius: "8px", background: "rgba(16, 185, 129, 0.1)", border: "1px solid #10b981", color: "#10b981" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: "700" }}>
                  <Check size={18} />
                  <span>{t("breakGlassSuccess")}</span>
                </div>
                <div style={{ marginTop: "0.5rem", fontSize: "0.85rem", color: "var(--text-primary)" }}>
                  صلاحية الوصول سارية حتى: <strong>{new Date(breakGlassSuccess).toLocaleTimeString()}</strong>
                </div>
                <div style={{ marginTop: "1rem", textAlign: "right" }}>
                  <button className="primary-btn" type="button" onClick={() => setBreakGlassPatient(null)}>
                    {t("closeDialog")}
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={(e) => void handleActivateBreakGlass(e)}>
                <label style={{ display: "block", marginBottom: "0.85rem" }}>
                  <span>{t("breakGlassReason")} *</span>
                  <input
                    type="text"
                    required
                    value={breakGlassReason}
                    onChange={(e) => setBreakGlassReason(e.target.value)}
                    style={{ width: "100%", marginTop: "0.35rem" }}
                  />
                </label>

                <label style={{ display: "block", marginBottom: "0.85rem" }}>
                  <span>{t("breakGlassJustification")} *</span>
                  <textarea
                    required
                    rows={3}
                    value={breakGlassJustification}
                    onChange={(e) => setBreakGlassJustification(e.target.value)}
                    placeholder="اكتب التبرير السريري لكسر الحظر والوصول لملف المريض خارج القسم..."
                    style={{ width: "100%", marginTop: "0.35rem" }}
                  />
                </label>

                {breakGlassError && (
                  <div className="inline-error" style={{ marginBottom: "1rem" }} role="alert">
                    {breakGlassError}
                  </div>
                )}

                <div className="patient-modal-actions" style={{ marginTop: "1.25rem", display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
                  <button className="outline-btn" type="button" onClick={() => setBreakGlassPatient(null)}>
                    {t("closeDialog")}
                  </button>
                  <button
                    className="primary-btn"
                    type="submit"
                    disabled={breakGlassLoading}
                    style={{ background: "#ef4444", borderColor: "#dc2626" }}
                  >
                    {breakGlassLoading ? t("loading") : t("breakGlassConfirm")}
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      )}

      {/* ================= E-PRESCRIPTION (Rx) MODAL ================= */}
      {selectedPatientForRx && (
        <div className="patient-modal-backdrop" onClick={() => setSelectedPatientForRx(null)}>
          <section
            className="panel patient-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rx-modal-title"
            style={{ maxWidth: "680px", maxHeight: "90vh", overflowY: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="patient-modal-heading" style={{ borderBottom: "2px solid var(--teal)", paddingBottom: "0.75rem" }}>
              <div className="patient-modal-title-box">
                <div className="patient-modal-icon" style={{ background: "rgba(13, 148, 136, 0.1)", color: "var(--teal)" }}>
                  <Pill size={20} />
                </div>
                <div>
                  <h2 id="rx-modal-title" style={{ margin: 0, fontSize: "18px", fontWeight: 700 }}>
                    {isArabic ? "الروشتة الطبية الإلكترونية المعتمدة (Rx)" : "Electronic Prescription Writer (Rx)"}
                  </h2>
                  <p className="patient-modal-subtitle" style={{ margin: "2px 0 0" }}>
                    {selectedPatientForRx.given_name} {selectedPatientForRx.family_name} · MRN: {selectedPatientForRx.medical_record_number || selectedPatientForRx.patient_code}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setSelectedPatientForRx(null)}
                aria-label={t("closeDialog")}
              >
                <X size={18} />
              </button>
            </div>

            {/* Patient Clinical Banner & Allergy Alert */}
            <div style={{ margin: "14px 0", padding: "10px 14px", borderRadius: "8px", background: "var(--canvas)", border: "1px solid var(--line)", fontSize: "12px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
              <div>
                <strong style={{ color: "var(--ink)", marginInlineEnd: "6px" }}>
                  {isArabic ? "الحالة السريرية والحساسيات المسجلة:" : "Conditions & Allergies:"}
                </strong>
                <span style={{ color: "var(--muted)" }}>
                  {selectedPatientForRx.condition || (isArabic ? "لا توجد حساسيات مسجلة (NKDA)" : "No known allergies")}
                </span>
              </div>
              <span className="status confirmed" style={{ fontSize: "11px" }}>
                {isArabic ? "ملف المريض موثق" : "Verified Record"}
              </span>
            </div>

            {/* Write New Prescription Form */}
            <form onSubmit={handleSavePrescription} style={{ display: "grid", gap: "12px", background: "rgba(13, 148, 136, 0.03)", padding: "16px", borderRadius: "10px", border: "1px solid rgba(13, 148, 136, 0.2)" }}>
              <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 700, color: "var(--teal)" }}>
                {isArabic ? "+ إضافة دواء جديد للروشتة" : "+ Prescribe New Medication"}
              </h3>

              {rxError && (
                <div className="error-state" role="alert" style={{ margin: 0, padding: "8px 12px", fontSize: "12px" }}>
                  <AlertTriangle size={14} />
                  <span>{rxError}</span>
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "10px" }}>
                <div>
                  <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: "4px" }}>
                    {isArabic ? "اسم الدواء والمادة الفعالة *" : "Medication Name *"}
                  </label>
                  <input
                    type="text"
                    required
                    value={rxMedication}
                    onChange={(e) => setRxMedication(e.target.value)}
                    placeholder={isArabic ? "مثال: Augmentin, Panadol, Metformin" : "e.g. Augmentin, Metformin"}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid var(--line)", background: "var(--paper)" }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: "4px" }}>
                    {isArabic ? "الجرعة والتركيز *" : "Dosage *"}
                  </label>
                  <input
                    type="text"
                    required
                    value={rxDosage}
                    onChange={(e) => setRxDosage(e.target.value)}
                    placeholder="e.g. 500 mg, 10 mg"
                    style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid var(--line)", background: "var(--paper)" }}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "10px" }}>
                <div>
                  <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: "4px" }}>
                    {isArabic ? "مسار التناول" : "Route"}
                  </label>
                  <select
                    value={rxRoute}
                    onChange={(e) => setRxRoute(e.target.value)}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid var(--line)", background: "var(--paper)" }}
                  >
                    <option value="Oral">{isArabic ? "فموي (Oral)" : "Oral"}</option>
                    <option value="Intravenous">{isArabic ? "وريدي (IV)" : "Intravenous"}</option>
                    <option value="Intramuscular">{isArabic ? "عضلي (IM)" : "Intramuscular"}</option>
                    <option value="Topical">{isArabic ? "موضعي (Topical)" : "Topical"}</option>
                    <option value="Inhalation">{isArabic ? "استنشاق (Inhalation)" : "Inhalation"}</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: "4px" }}>
                    {isArabic ? "معدل التكرار *" : "Frequency *"}
                  </label>
                  <input
                    type="text"
                    required
                    value={rxFrequency}
                    onChange={(e) => setRxFrequency(e.target.value)}
                    placeholder={isArabic ? "مثال: كل 12 ساعة بعد الأكل" : "e.g. Twice daily after meals"}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid var(--line)", background: "var(--paper)" }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: "4px" }}>
                    {isArabic ? "المدة (بالأيام)" : "Duration (days)"}
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="365"
                    value={rxDurationDays}
                    onChange={(e) => setRxDurationDays(e.target.value)}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid var(--line)", background: "var(--paper)" }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: "4px" }}>
                  {isArabic ? "توجيهات إضافية للصيدلي والمريض" : "Instructions & Patient Notes"}
                </label>
                <input
                  type="text"
                  value={rxInstructions}
                  onChange={(e) => setRxInstructions(e.target.value)}
                  placeholder={isArabic ? "مثال: تناول مع كوب ماء وفير، يُمنع إيقاف العلاج قبل انتهاء المدة" : "e.g. Take with plenty of water"}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid var(--line)", background: "var(--paper)" }}
                />
              </div>

              {(selectedPatientForRx.condition || "").toLowerCase().includes("penicillin") && rxMedication.toLowerCase().includes("cillin") && (
                <div style={{ background: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: "6px", padding: "8px 12px", display: "flex", alignItems: "center", gap: "8px", fontSize: "12px" }}>
                  <AlertTriangle size={16} color="#ef4444" />
                  <span style={{ color: "#ef4444", fontWeight: 600 }}>
                    {isArabic ? "تنبيه سريري: مسجل لدى المريض حساسية بنسلين!" : "Clinical Alert: Patient has recorded Penicillin Allergy!"}
                  </span>
                  <label style={{ marginInlineStart: "auto", display: "flex", alignItems: "center", gap: "4px", fontSize: "11px" }}>
                    <input
                      type="checkbox"
                      checked={rxOverrideAllergy}
                      onChange={(e) => setRxOverrideAllergy(e.target.checked)}
                    />
                    {isArabic ? "تجاوز التنبيه السريري" : "Clinical Override"}
                  </label>
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "4px" }}>
                <button
                  type="submit"
                  className="primary-btn"
                  disabled={savingRx || !rxMedication.trim()}
                  style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
                >
                  <Pill size={14} />
                  {savingRx ? (isArabic ? "جاري الاعتماد..." : "Prescribing...") : (isArabic ? "اعتماد وإصدار الروشتة" : "Approve & Prescribe")}
                </button>
              </div>
            </form>

            {/* Prescriptions History Section */}
            <div style={{ marginTop: "20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "var(--ink)" }}>
                  {isArabic ? "سجل الروشتات السابقة للمريض" : "Patient Prescription History"}
                </h3>
                <span style={{ fontSize: "12px", color: "var(--muted)" }}>
                  {patientPrescriptions.length} {isArabic ? "روشتات مسجلة" : "recorded"}
                </span>
              </div>

              {loadingRxList ? (
                <div className="empty-state" style={{ padding: "16px" }}>{t("loading")}</div>
              ) : patientPrescriptions.length > 0 ? (
                <div style={{ display: "grid", gap: "10px" }}>
                  {patientPrescriptions.map((rx) => (
                    <div
                      key={rx.id}
                      style={{
                        padding: "12px 16px",
                        borderRadius: "8px",
                        background: "var(--canvas)",
                        border: "1px solid var(--line)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: "10px",
                        flexWrap: "wrap",
                      }}
                    >
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <strong style={{ fontSize: "14px", color: "var(--ink)" }}>{rx.medication_name}</strong>
                          <span className="status confirmed" style={{ fontSize: "10px", padding: "2px 6px" }}>
                            {rx.status}
                          </span>
                        </div>
                        <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "2px" }}>
                          {rx.dosage} · {rx.frequency} {rx.duration_days ? `· ${rx.duration_days} days` : ""}
                        </div>
                        {rx.instructions && (
                          <div style={{ fontSize: "11px", color: "var(--muted)", fontStyle: "italic", marginTop: "2px" }}>
                            {rx.instructions}
                          </div>
                        )}
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <div style={{ background: "#fff", padding: "3px", borderRadius: "4px" }}>
                          <QRCodeSVG value={`CAREOS-RX:${rx.id}|MED:${encodeURIComponent(rx.medication_name)}`} size={46} />
                        </div>
                        <button
                          type="button"
                          className="outline-btn"
                          onClick={() => window.print()}
                          title="Print Prescription"
                          style={{ padding: "6px 8px" }}
                        >
                          <Printer size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state" style={{ padding: "16px", fontSize: "13px" }}>
                  {isArabic ? "لا توجد روشتات سابقة مسجلة لهذا المريض." : "No previous prescriptions recorded."}
                </div>
              )}
            </div>

            <div className="patient-modal-actions" style={{ marginTop: "20px", display: "flex", justifyContent: "flex-end" }}>
              <button
                className="outline-btn"
                type="button"
                onClick={() => setSelectedPatientForRx(null)}
              >
                {t("closeDialog")}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

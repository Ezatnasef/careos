import { useEffect, useState } from "react";
import { ChevronRight, Download, Plus, Search, X } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { createEncounter } from "../../api/encounters";
import { getPatients } from "../../api/patients";
import {
  createPatient,
  type ApiPatient,
  type PatientRegistrationInput,
} from "../../api";
import { PageHeading } from "../../components/PageHeading";
import type { TranslationKey } from "../../i18n";
import { navigateToView, type AppView } from "../../app/routes";

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
        department,
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
              <button
                className="outline-btn"
                disabled={startingEncounter === patient.id}
                onClick={() => void startEncounter(patient.id)}
              >
                {startingEncounter === patient.id
                  ? t("startingEncounter")
                  : t("startEncounter")}
              </button>
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
              <h2 id="patient-registration-title">{t("newPatientTitle")}</h2>
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
              <label>
                {t("givenName")}
                <input
                  required
                  maxLength={120}
                  value={patientForm.given_name}
                  onChange={(event) => setPatientForm({ ...patientForm, given_name: event.target.value })}
                />
              </label>
              <label>
                {t("familyName")}
                <input
                  required
                  maxLength={120}
                  value={patientForm.family_name}
                  onChange={(event) => setPatientForm({ ...patientForm, family_name: event.target.value })}
                />
              </label>
              <label>
                {t("preferredName")}
                <input
                  maxLength={120}
                  value={patientForm.preferred_name}
                  onChange={(event) => setPatientForm({ ...patientForm, preferred_name: event.target.value })}
                />
              </label>
              <label>
                {t("dateOfBirth")}
                <input
                  required
                  type="date"
                  value={patientForm.date_of_birth}
                  onChange={(event) => setPatientForm({ ...patientForm, date_of_birth: event.target.value })}
                />
              </label>
              <label>
                {t("gender")}
                <select
                  value={patientForm.gender}
                  onChange={(event) => setPatientForm({ ...patientForm, gender: event.target.value })}
                >
                  <option value="unspecified">{t("notRecorded")}</option>
                  <option value="female">{t("female")}</option>
                  <option value="male">{t("male")}</option>
                  <option value="other">{t("otherGender")}</option>
                </select>
              </label>
              <label>
                {t("preferredLanguage")}
                <select
                  value={patientForm.preferred_language}
                  onChange={(event) => setPatientForm({ ...patientForm, preferred_language: event.target.value as "ar" | "en" })}
                >
                  <option value="ar">{t("arabic")}</option>
                  <option value="en">{t("english")}</option>
                </select>
              </label>
              <label>
                {t("medicalRecordNumber")}
                <input
                  minLength={2}
                  maxLength={64}
                  value={patientForm.medical_record_number}
                  placeholder={t("medicalRecordNumberHint")}
                  onChange={(event) => setPatientForm({ ...patientForm, medical_record_number: event.target.value })}
                />
              </label>
              <label>
                {t("phoneNumber")}
                <input
                  type="tel"
                  maxLength={40}
                  value={patientForm.phone}
                  onChange={(event) => setPatientForm({ ...patientForm, phone: event.target.value })}
                />
              </label>
              <label>
                {t("contactEmail")}
                <input
                  type="email"
                  value={patientForm.email}
                  onChange={(event) => setPatientForm({ ...patientForm, email: event.target.value })}
                />
              </label>
              <label className="patient-form-wide">
                {t("address")}
                <input
                  maxLength={500}
                  value={patientForm.address}
                  onChange={(event) => setPatientForm({ ...patientForm, address: event.target.value })}
                />
              </label>
              <label className="patient-form-wide">
                {t("emergencyContact")}
                <input
                  maxLength={240}
                  value={patientForm.emergency_contact}
                  onChange={(event) => setPatientForm({ ...patientForm, emergency_contact: event.target.value })}
                />
              </label>
              {formError && <div className="inline-error patient-form-wide" role="alert">{formError}</div>}
              <div className="patient-modal-actions patient-form-wide">
                <button className="outline-btn" type="button" onClick={() => setShowPatientForm(false)}>
                  {t("cancel")}
                </button>
                <button className="primary-btn" type="submit" disabled={savingPatient}>
                  {savingPatient ? t("loading") : t("registerPatient")}
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
    </>
  );
}

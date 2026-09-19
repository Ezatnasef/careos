import { useEffect, useState } from "react";
import { ChevronRight, Plus, Search } from "lucide-react";
import { createPatient, getPatients } from "../../api/patients";
import { patients as demoPatients, type Patient } from "../../data";
import { PageHeading } from "../../components/PageHeading";
import type { TranslationKey } from "../../i18n";

type Translator = (key: TranslationKey) => string;
export function Patients({ t, department, project }: { t: Translator; department: string; project: string }) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<Patient[]>(demoPatients);
  useEffect(() => { getPatients(query).then((records) => setItems(records.map((item) => ({ name: `${item.given_name} ${item.family_name}`, id: item.medical_record_number, age: new Date().getFullYear() - new Date(item.date_of_birth).getFullYear(), gender: item.gender === "Male" ? "Male" : "Female", condition: "Hypertension", status: item.care_status === "needs_attention" ? "Needs attention" : "Stable", color: "#8db4ad", initials: `${item.given_name[0] || "P"}${item.family_name[0] || ""}` } as Patient)))).catch(() => undefined); }, [query]);
  const visible = items.filter((item) => `${item.name} ${item.id}`.toLowerCase().includes(query.toLowerCase()));
  return <><PageHeading eyebrow={t("careDirectory")} title={t("patients")} detail={t("searchManage")} action={<button className="primary-btn"><Plus size={17} /> {t("addPatient")}</button>} /><div className="toolbar"><div className="search-box"><Search size={17} /><input placeholder={t("searchPatients")} value={query} onChange={(event) => setQuery(event.target.value)} /></div><span className="scope-pill">Department: {department}</span><span className="scope-pill">Project: {project}</span></div><section className="panel table-panel"><div className="table-header"><span>{t("patient")}</span><span>{t("condition")}</span><span>{t("careStatus")}</span><span /></div>{visible.map((patient) => <button className="patient-table-row" key={patient.id}><div className="patient-cell"><div className="patient-avatar" style={{ background: patient.color }}>{patient.initials}</div><div><strong>{patient.name}</strong><span>{patient.id} · {patient.age} {t("years")}</span></div></div><span>{patient.condition}</span><span className="status confirmed">{patient.status}</span><ChevronRight size={17} /></button>)}{visible.length === 0 && <div className="empty-state">{t("noPatients")}</div>}</section></>;
}

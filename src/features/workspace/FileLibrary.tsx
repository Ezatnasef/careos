import { Archive, Download, FileText, Search, UploadCloud } from "lucide-react";
import { PageHeading } from "../../components/PageHeading";
import { PanelHeading } from "../../components/PanelHeading";
import type { TranslationKey } from "../../i18n";

type Translator = (key: TranslationKey) => string;

type FileEntry = {
  name: string;
  type: string;
  owner: string;
  updated: string;
  security: "Protected" | "Restricted" | "Standard";
};

export function FileLibrary({ t }: { t: Translator }) {
  const files: FileEntry[] = [
    { name: "Discharge_Summary_2026_09_12.pdf", type: "Clinical note", owner: "Dr. Rana Samir", updated: "Today, 09:30", security: "Protected" },
    { name: "Cardio_ECG_Review.jpeg", type: "Imaging", owner: "Cardiology unit", updated: "Today, 08:40", security: "Restricted" },
    { name: "Vaccination_Log_Sept.xlsx", type: "Operations", owner: "Nursing desk", updated: "Yesterday", security: "Standard" },
    { name: "Compliance_Training_Policy.pdf", type: "Policy", owner: "Quality office", updated: "2 days ago", security: "Protected" },
  ];

  return (
    <>
      <PageHeading
        eyebrow={"FILES"}
        title="Clinical file library"
        detail="Review accessible documents, approvals, and organization records in one place."
        action={
          <button type="button" className="primary-btn">
            <UploadCloud size={16} /> Add document
          </button>
        }
      />

      <section className="panel">
        <PanelHeading title="Document registry" detail="Filtered by department and privacy level" />
        <div className="toolbar" style={{ margin: "0 22px 16px" }}>
          <div className="search-box">
            <Search size={17} />
            <input placeholder="Search files or departments" defaultValue="" />
          </div>
        </div>

        <div className="team-list">
          {files.map((file) => (
            <div className="team-row" key={file.name}>
              <div className="avatar avatar-doctor"><FileText size={14} /></div>
              <div className="team-person">
                <strong>{file.name}</strong>
                <span>{file.type} · {file.owner}</span>
              </div>
              <span>{file.updated}</span>
              <span className={`status ${file.security === "Protected" ? "confirmed" : file.security === "Restricted" ? "pending" : "danger"}`}>
                {file.security}
              </span>
              <button
                type="button"
                className="outline-btn"
                onClick={() =>
                  window.dispatchEvent(
                    new CustomEvent("careos:toast", { detail: `${file.name} opened.` }),
                  )
                }
              >
                <Download size={14} /> Download
              </button>
            </div>
          ))}
        </div>
      </section>

      <div className="dashboard-grid">
        <section className="panel">
          <PanelHeading title="Archive summary" detail="Operational file coverage" />
          <div className="stat-grid compact">
            <div className="stat-card">
              <div className="stat-icon blue"><Archive size={16} /></div>
              <span className="stat-label">Documents</span>
              <strong className="stat-value">1,284</strong>
            </div>
            <div className="stat-card">
              <div className="stat-icon green"><FileText size={16} /></div>
              <span className="stat-label">Ready for review</span>
              <strong className="stat-value">18</strong>
            </div>
          </div>
        </section>

        <section className="panel">
          <PanelHeading title="Retention watch" detail="Pending archive actions" />
          <div className="team-list">
            <div className="team-row">
              <div className="avatar avatar-doctor"><Archive size={14} /></div>
              <div className="team-person">
                <strong>Quarterly policy archive</strong>
                <span>Due in 2 days</span>
              </div>
              <span className="status pending">Review</span>
            </div>
            <div className="team-row">
              <div className="avatar avatar-doctor"><Archive size={14} /></div>
              <div className="team-person">
                <strong>Archived lab pack</strong>
                <span>Ready for export</span>
              </div>
              <span className="status confirmed">Ready</span>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}

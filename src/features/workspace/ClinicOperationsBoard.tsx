import { Activity, BedDouble, Clock3, Stethoscope } from "lucide-react";
import { PageHeading } from "../../components/PageHeading";
import { PanelHeading } from "../../components/PanelHeading";
import type { TranslationKey } from "../../i18n";

type Translator = (key: TranslationKey) => string;

export function ClinicOperationsBoard({ t }: { t: Translator }) {
  const queues = [
    { patient: "Mariam Hassan", issue: "Follow-up review", wait: "12 min", status: "In consult" },
    { patient: "Layla Nasser", issue: "Blood pressure check", wait: "8 min", status: "Triaged" },
    { patient: "Sara Ahmed", issue: "Medication review", wait: "19 min", status: "Waiting" },
    { patient: "Huda Tariq", issue: "Cardiac reassessment", wait: "25 min", status: "Queued" },
  ];

  const rooms = [
    { room: "Consult 1", status: "Occupied", clinician: "Dr. Rana" },
    { room: "Consult 2", status: "Ready", clinician: "Dr. Samir" },
    { room: "Procedure", status: "In use", clinician: "Nursing team" },
    { room: "Observation", status: "Ready", clinician: "Triage" },
  ];

  return (
    <>
      <PageHeading
        eyebrow={t("operations")}
        title="Clinic operations board"
        detail="Live visibility into patient throughput, triage backlog, and available clinical rooms."
        action={
          <button type="button" className="primary-btn">
            <Activity size={16} /> Refresh board
          </button>
        }
      />

      <div className="dashboard-grid">
        <section className="panel">
          <PanelHeading title="Live flow" detail="Patient throughput snapshot" />
          <div className="team-summary-grid">
            <div className="team-summary-card">
              <span>Patients today</span>
              <strong>184</strong>
              <em className="status confirmed">+12% vs last week</em>
            </div>
            <div className="team-summary-card">
              <span>Avg. wait</span>
              <strong>17 min</strong>
              <em className="status pending">Within target</em>
            </div>
            <div className="team-summary-card">
              <span>Room use</span>
              <strong>74%</strong>
              <em className="status confirmed">Stable</em>
            </div>
            <div className="team-summary-card">
              <span>Open escalations</span>
              <strong>5</strong>
              <em className="status danger">Requires action</em>
            </div>
          </div>
        </section>

        <section className="panel">
          <PanelHeading title="Queue overview" detail="Current patient flow" />
          <div className="team-list">
            {queues.map((item) => (
              <div className="team-row" key={item.patient}>
                <div className="avatar avatar-doctor"><Stethoscope size={14} /></div>
                <div className="team-person">
                  <strong>{item.patient}</strong>
                  <span>{item.issue}</span>
                </div>
                <span>{item.wait}</span>
                <span className={`status ${item.status === "In consult" ? "confirmed" : item.status === "Triaged" ? "pending" : item.status === "Waiting" ? "pending" : "danger"}`}>
                  {item.status}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="dashboard-grid">
        <section className="panel">
          <PanelHeading title="Room readiness" detail="Clinician room status" />
          <div className="stat-grid compact">
            {rooms.map((room) => (
              <div className="stat-card" key={room.room}>
                <div className="stat-icon blue"><BedDouble size={16} /></div>
                <span className="stat-label">{room.room}</span>
                <strong className="stat-value">{room.status}</strong>
                <small>{room.clinician}</small>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <PanelHeading title="Care flow watch" detail="Operational risk indicators" />
          <div className="team-list">
            <div className="team-row">
              <div className="avatar avatar-doctor"><Clock3 size={14} /></div>
              <div className="team-person">
                <strong>First room delays</strong>
                <span>2 rooms above 20-minute threshold</span>
              </div>
              <span className="status pending">Watch</span>
            </div>
            <div className="team-row">
              <div className="avatar avatar-doctor"><Activity size={14} /></div>
              <div className="team-person">
                <strong>Follow-up queue</strong>
                <span>11 patients waiting for review</span>
              </div>
              <span className="status danger">Escalate</span>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}

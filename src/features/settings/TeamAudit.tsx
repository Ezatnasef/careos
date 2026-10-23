import { useEffect, useState } from "react";
import { Check, Edit3, KeyRound, MoreHorizontal, Plus, ShieldCheck, Trash2, UserCheck, X } from "lucide-react";
import { getAuditEvents, getTeam, createTeamUser, deleteTeamUser } from "../../api/team";
import type { Language, TranslationKey } from "../../i18n";
import { PageHeading } from "../../components/PageHeading";

type Translator = (key: TranslationKey) => string;

type TeamAuditProps = { t: Translator; language: Language };

interface TeamMember {
  id?: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  department: string;
}

const availableDepartments = [
  { id: "General Medicine", labelAr: "الباطنة العامة", labelEn: "General Medicine" },
  { id: "Emergency 24/7", labelAr: "طوارئ وعناية 24/7", labelEn: "Emergency 24/7" },
  { id: "Pediatrics", labelAr: "طب الأطفال", labelEn: "Pediatrics" },
  { id: "OB/GYN", labelAr: "النساء والتوليد", labelEn: "OB/GYN" },
  { id: "Orthopedics", labelAr: "العظام والمفاصل", labelEn: "Orthopedics" },
  { id: "Ophthalmology", labelAr: "طب وجراحة العيون", labelEn: "Ophthalmology" },
  { id: "Administration", labelAr: "إدارة المنظومة العامة", labelEn: "Hospital Administration" },
];

function roleTranslationKey(role: string): TranslationKey | null {
  switch (role) {
    case "admin":
      return "administratorRole";
    case "doctor":
    case "physician":
      return "physicianRole";
    case "nurse":
      return "roleNurseLabel";
    case "receptionist":
      return "roleReceptionistLabel";
    case "hospital_director":
      return "roleDirectorLabel";
    case "it_admin":
      return "roleItAdminLabel";
    case "administrative_staff":
      return "roleStaffLabel";
    case "care_coordinator":
      return "careCoordinatorRole";
    default:
      return null;
  }
}

function auditActionTranslationKey(action: string): TranslationKey | null {
  const normalized = action.toLowerCase();
  if (normalized.includes("login") || normalized.includes("sign_in")) return "signedInEvent";
  if (normalized.includes("invitation") || normalized.includes("invite")) return "invitedEvent";
  if (normalized.includes("organization") || normalized.includes("workspace")) {
    return "organizationEvent";
  }
  if (normalized.endsWith(".created") || normalized.endsWith("_created")) return "auditActionCreated";
  if (normalized.endsWith(".updated") || normalized.endsWith("_updated")) return "auditActionUpdated";
  if (normalized.endsWith(".deleted") || normalized.endsWith("_deleted")) return "auditActionDeleted";
  return null;
}

function localizedDepartment(department: string, t: Translator): string {
  const normalized = department.toLowerCase();
  if (normalized === "general medicine" || normalized.includes("general")) return "باطنة عامة";
  if (normalized.includes("emergency")) return "طوارئ 24/7";
  if (normalized.includes("pediatric")) return "طب الأطفال";
  if (normalized.includes("ob/gyn") || normalized.includes("obgyn")) return "نساء وتوليد";
  if (normalized.includes("orthopedic")) return "عظام ومفاصل";
  if (normalized.includes("ophthalmolog")) return "عيون ورمد";
  if (normalized.includes("admin")) return "إدارة المنظومة";
  return department || "باطنة عامة";
}

export function TeamAudit({ t, language }: TeamAuditProps) {
  const isAr = language === "ar";
  const [tab, setTab] = useState<"team" | "audit">("team");
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [events, setEvents] = useState<Array<{ action: string; resource: string; createdAt: string }>>([]);
  const [loadError, setLoadError] = useState(false);

  // Edit Member Modal State
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [editRole, setEditRole] = useState("doctor");
  const [editDepartment, setEditDepartment] = useState("General Medicine");
  const [editActive, setEditActive] = useState(true);

  // Create User Modal State
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [invitePassword, setInvitePassword] = useState("");
  const [inviteRole, setInviteRole] = useState("doctor");
  const [inviteDept, setInviteDept] = useState("General Medicine");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getTeam(), getAuditEvents()]).then(([team, audit]) => {
      setMembers(
        team.map((member) => ({
          id: member.id,
          name: member.full_name,
          email: member.email,
          role: member.role,
          active: member.onboarding_complete,
          department: member.department || "General Medicine",
        })),
      );
      setEvents(
        audit.map((event) => ({
          action: event.action,
          resource: event.resource,
          createdAt: event.created_at,
        })),
      );
      setLoadError(false);
    }).catch(() => {
      setMembers([]);
      setEvents([]);
      setLoadError(true);
    });
  }, []);

  const handleOpenEdit = (member: TeamMember) => {
    setEditingMember(member);
    setEditRole(member.role);
    setEditDepartment(member.department || "General Medicine");
    setEditActive(member.active);
  };

  const handleSaveMember = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMember) return;

    setMembers((prev) =>
      prev.map((m) =>
        m.email === editingMember.email
          ? {
              ...m,
              role: editRole,
              department: editDepartment,
              active: editActive,
            }
          : m
      )
    );

    window.dispatchEvent(
      new CustomEvent("careos:toast", {
        detail: `تم تحديث بيانات وصلاحيات ${editingMember.name} وقسم (${editDepartment}) بنجاح`,
      })
    );

    setEditingMember(null);
  };

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim() || !inviteName.trim()) return;

    setIsSubmitting(true);
    setActionError(null);
    try {
      const generatedPwd = invitePassword.trim() || ("CareOS@" + Math.random().toString(36).slice(-6) + "!");
      const created = await createTeamUser({
        full_name: inviteName.trim(),
        email: inviteEmail.trim(),
        password: generatedPwd,
        role: inviteRole,
        department: inviteDept,
      });

      const newMember: TeamMember = {
        id: created.id,
        name: created.full_name,
        email: created.email,
        role: created.role,
        department: created.department || inviteDept,
        active: true,
      };

      setMembers((prev) => [newMember, ...prev]);
      setShowInviteModal(false);
      setInviteName("");
      setInviteEmail("");
      setInvitePassword("");

      window.dispatchEvent(
        new CustomEvent("careos:toast", {
          detail: `تم إنشاء وتفعيل حساب ${newMember.name} في قسم ${newMember.department} وتعيين كلمة المرور بنجاح`,
        })
      );
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "فشل إنشاء الحساب");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteMember = async (member: TeamMember) => {
    if (!member.id) return;
    if (!window.confirm(isAr ? `هل أنت متأكد من حذف حساب ${member.name} وإلغاء صلاحياته؟` : `Are you sure you want to delete ${member.name}?`)) {
      return;
    }
    try {
      await deleteTeamUser(member.id);
      setMembers((prev) => prev.filter((m) => m.email !== member.email));
      setEditingMember(null);
      window.dispatchEvent(
        new CustomEvent("careos:toast", {
          detail: `تم حذف حساب ${member.name} وإلغاء كافة الجلسات النشطة بنجاح`,
        })
      );
    } catch (err: unknown) {
      window.dispatchEvent(
        new CustomEvent("careos:toast", {
          detail: `فشل الحذف: ${err instanceof Error ? err.message : "خطأ غير معروف"}`,
        })
      );
    }
  };

  const teamMetrics: Array<{ label: TranslationKey; value: string; valueKey?: TranslationKey; tone: string; status: TranslationKey }> = [
    { label: "cliniciansOnDuty", value: String(members.filter((m) => m.active).length || "18"), tone: "confirmed", status: "reportHealthy" },
    { label: "pendingApprovals", value: "11", tone: "pending", status: "review" },
    { label: "openShifts", value: "3", tone: "danger", status: "actionRequired" },
    { label: "averageResponse", value: "", valueKey: "averageResponseValue", tone: "confirmed", status: "reportHealthy" },
  ];
  const locale = language === "ar" ? "ar-EG" : "en-US";

  return (
    <>
      <PageHeading
        eyebrow={t("teamAuditEyebrow")}
        title={t("teamAuditTitle")}
        detail={t("teamAuditDetail")}
        action={
          <button
            type="button"
            className="primary-btn"
            onClick={() => setShowInviteModal(true)}
          >
            <Plus size={16} /> {t("inviteMember")}
          </button>
        }
      />
      <section className="panel team-audit-panel">
        <div className="tabs team-audit-tabs">
          <button type="button" className={tab === "team" ? "active" : ""} onClick={() => setTab("team")}>{t("teamMembers")}</button>
          <button type="button" className={tab === "audit" ? "active" : ""} onClick={() => setTab("audit")}>{t("auditLog")}</button>
        </div>
        {tab === "team" ? (
          <>
            <div className="team-summary-grid">
              {teamMetrics.map((metric) => (
                <div className="team-summary-card" key={metric.label}>
                  <span>{t(metric.label)}</span>
                  <strong>{metric.valueKey ? t(metric.valueKey) : metric.value}</strong>
                  <em className={`status ${metric.tone}`}>{t(metric.status)}</em>
                </div>
              ))}
            </div>
            {loadError && <div className="error-state" role="alert">{t("teamAuditLoadFailed")}</div>}
            <div className="team-list">
              {members.map((member) => (
                <div
                  className="team-row"
                  key={member.email}
                  style={{ cursor: "pointer" }}
                  onClick={() => handleOpenEdit(member)}
                >
                  <div className="avatar avatar-doctor">
                    {member.name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase()}
                  </div>
                  <div className="team-person">
                    <strong>{member.name}</strong>
                    <span>{member.email}</span>
                  </div>
                  <span>{t(roleTranslationKey(member.role) ?? "other")}</span>
                  <span>{localizedDepartment(member.department, t)}</span>
                  <span className={`status ${member.active ? "confirmed" : "pending"}`}>
                    {member.active ? t("active") : "معطل"}
                  </span>
                  <button
                    type="button"
                    className="round-btn"
                    aria-label={t("moreActions")}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenEdit(member);
                    }}
                  >
                    <MoreHorizontal size={16} />
                  </button>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            {loadError && <div className="error-state" role="alert">{t("teamAuditLoadFailed")}</div>}
            {!loadError && events.length === 0 && <div className="empty-state">{t("noAuditEvents")}</div>}
            <div className="audit-list">
              {events.map((event) => {
                const actionKey = auditActionTranslationKey(event.action);
                return (
                  <div className="audit-row" key={`${event.action}-${event.resource}-${event.createdAt}`}>
                    <div className="audit-icon"><ShieldCheck size={15} /></div>
                    <div>
                      <strong>{actionKey ? t(actionKey) : t("auditOtherEvent")}</strong>
                      <span>{event.resource}</span>
                    </div>
                    <span className="audit-actor">{t("clinicalSystem")}</span>
                    <time>{new Date(event.createdAt).toLocaleString(locale)}</time>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>

      {/* ================= EDIT MEMBER MODAL ================= */}
      {editingMember && (
        <div className="modal-backdrop" onClick={() => setEditingMember(null)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            style={{ maxWidth: "480px", padding: "26px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="patient-modal-heading" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div className="avatar avatar-doctor" style={{ width: "40px", height: "40px" }}>
                  <Edit3 size={18} />
                </div>
                <div>
                  <h2 style={{ margin: 0, fontSize: "17px" }}>إدارة وتعديل بيانات الكادر</h2>
                  <span style={{ fontSize: "12px", color: "var(--muted)" }}>{editingMember.email}</span>
                </div>
              </div>
              <button
                className="icon-button"
                type="button"
                onClick={() => setEditingMember(null)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveMember} style={{ marginTop: "18px" }}>
              <label style={{ display: "block", marginBottom: "12px" }}>
                <span style={{ fontSize: "12px", fontWeight: "bold" }}>الاسم الكامل</span>
                <input
                  type="text"
                  disabled
                  value={editingMember.name}
                  style={{ width: "100%", marginTop: "6px", opacity: 0.8 }}
                />
              </label>

              <label style={{ display: "block", marginBottom: "12px" }}>
                <span style={{ fontSize: "12px", fontWeight: "bold" }}>الدور الوظيفي والصلاحية</span>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                  style={{ width: "100%", marginTop: "6px", padding: "10px", borderRadius: "8px", border: "1px solid var(--line)" }}
                >
                  <option value="doctor">{t("roleDoctorLabel")} (Doctor)</option>
                  <option value="nurse">{t("roleNurseLabel")} (Nurse)</option>
                  <option value="receptionist">{t("roleReceptionistLabel")} (Receptionist)</option>
                  <option value="hospital_director">{t("roleDirectorLabel")} (Hospital Director)</option>
                  <option value="it_admin">{t("roleItAdminLabel")} (IT Admin)</option>
                  <option value="administrative_staff">{t("roleStaffLabel")} (Administrative Staff)</option>
                  <option value="admin">{t("roleAdminLabel")} (Administrator)</option>
                </select>
              </label>

              <label style={{ display: "block", marginBottom: "12px" }}>
                <span style={{ fontSize: "12px", fontWeight: "bold" }}>القسم الطبي المخصص (Department Scope) *</span>
                <select
                  value={editDepartment}
                  onChange={(e) => setEditDepartment(e.target.value)}
                  style={{ width: "100%", marginTop: "6px", padding: "10px", borderRadius: "8px", border: "1px solid var(--line)" }}
                >
                  {availableDepartments.map((dept) => (
                    <option key={dept.id} value={dept.id}>
                      {isAr ? dept.labelAr : dept.labelEn}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ display: "block", marginBottom: "18px" }}>
                <span style={{ fontSize: "12px", fontWeight: "bold" }}>حالة الحساب</span>
                <select
                  value={editActive ? "active" : "inactive"}
                  onChange={(e) => setEditActive(e.target.value === "active")}
                  style={{ width: "100%", marginTop: "6px", padding: "10px", borderRadius: "8px", border: "1px solid var(--line)" }}
                >
                  <option value="active">نشط ومصرح له بالدخول (Active)</option>
                  <option value="inactive">معطل ومجمد مؤقتاً (Inactive / Suspended)</option>
                </select>
              </label>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                {editingMember.id && (
                  <button
                    type="button"
                    className="outline-btn"
                    style={{ color: "#ef4444", borderColor: "rgba(239, 68, 68, 0.4)" }}
                    onClick={() => void handleDeleteMember(editingMember)}
                  >
                    <Trash2 size={15} style={{ verticalAlign: "middle", marginInlineEnd: "4px" }} />
                    {isAr ? "حذف المستخدم نهائياً" : "Delete Account"}
                  </button>
                )}
                <div style={{ display: "flex", gap: "10px", marginInlineStart: "auto" }}>
                  <button
                    type="button"
                    className="outline-btn"
                    onClick={() => setEditingMember(null)}
                  >
                    {isAr ? "إلغاء" : "Cancel"}
                  </button>
                  <button type="submit" className="primary-btn">
                    <Check size={16} /> {isAr ? "حفظ التعديلات" : "Save Changes"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= INVITE MEMBER MODAL ================= */}
      {showInviteModal && (
        <div className="modal-backdrop" onClick={() => setShowInviteModal(false)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            style={{ maxWidth: "480px", padding: "26px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="patient-modal-heading" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div className="avatar avatar-doctor" style={{ width: "40px", height: "40px" }}>
                  <UserCheck size={18} />
                </div>
                <div>
                  <h2 style={{ margin: 0, fontSize: "17px" }}>{t("inviteMember")}</h2>
                  <span style={{ fontSize: "12px", color: "var(--muted)" }}>إرسال دعوة فورية للكادر الطبي</span>
                </div>
              </div>
              <button
                className="icon-button"
                type="button"
                onClick={() => setShowInviteModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleInviteSubmit} style={{ marginTop: "18px" }}>
              <label style={{ display: "block", marginBottom: "12px" }}>
                <span style={{ fontSize: "12px", fontWeight: "bold" }}>الاسم الكامل *</span>
                <input
                  type="text"
                  required
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  placeholder="مثال: د. إبراهيم خليل"
                  style={{ width: "100%", marginTop: "6px" }}
                />
              </label>

              <label style={{ display: "block", marginBottom: "12px" }}>
                <span style={{ fontSize: "12px", fontWeight: "bold" }}>البريد الإلكتروني *</span>
                <input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="doctor@citycare.org"
                  style={{ width: "100%", marginTop: "6px" }}
                />
              </label>

              <label style={{ display: "block", marginBottom: "12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                  <span style={{ fontSize: "12px", fontWeight: "bold" }}>كلمة المرور الابتدائية *</span>
                  <button
                    type="button"
                    className="text-btn"
                    style={{ fontSize: "11px", padding: 0 }}
                    onClick={() => {
                      setInvitePassword("CareOS@" + Math.random().toString(36).slice(-6) + "!");
                    }}
                  >
                    <KeyRound size={12} style={{ display: "inline", verticalAlign: "middle", marginInlineEnd: "4px" }} />
                    توليد كلمة مرور آمنة
                  </button>
                </div>
                <input
                  type="text"
                  required
                  minLength={8}
                  value={invitePassword}
                  onChange={(e) => setInvitePassword(e.target.value)}
                  placeholder="8 أحرف على الأقل"
                  style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid var(--line)", fontFamily: "monospace" }}
                />
              </label>

              <label style={{ display: "block", marginBottom: "12px" }}>
                <span style={{ fontSize: "12px", fontWeight: "bold" }}>الدور الوظيفي والصلاحية *</span>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  style={{ width: "100%", marginTop: "6px", padding: "10px", borderRadius: "8px", border: "1px solid var(--line)" }}
                >
                  <option value="doctor">{t("roleDoctorLabel")}</option>
                  <option value="nurse">{t("roleNurseLabel")}</option>
                  <option value="receptionist">{t("roleReceptionistLabel")}</option>
                  <option value="hospital_director">{t("roleDirectorLabel")}</option>
                  <option value="it_admin">{t("roleItAdminLabel")}</option>
                  <option value="administrative_staff">{t("roleStaffLabel")}</option>
                  <option value="admin">{t("roleAdminLabel")}</option>
                </select>
              </label>

              <label style={{ display: "block", marginBottom: "18px" }}>
                <span style={{ fontSize: "12px", fontWeight: "bold" }}>القسم الطبي التابع له</span>
                <select
                  value={inviteDept}
                  onChange={(e) => setInviteDept(e.target.value)}
                  style={{ width: "100%", marginTop: "6px", padding: "10px", borderRadius: "8px", border: "1px solid var(--line)" }}
                >
                  {availableDepartments.map((dept) => (
                    <option key={dept.id} value={dept.id}>
                      {isAr ? dept.labelAr : dept.labelEn}
                    </option>
                  ))}
                </select>
              </label>

              {actionError && (
                <div className="inline-error" style={{ marginBottom: "12px", padding: "8px 12px", borderRadius: "6px" }} role="alert">
                  {actionError}
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  type="button"
                  className="outline-btn"
                  onClick={() => setShowInviteModal(false)}
                >
                  إلغاء
                </button>
                <button type="submit" className="primary-btn" disabled={isSubmitting}>
                  {isSubmitting ? "جاري الإنشاء..." : "إنشاء وتفعيل الحساب فوراً"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

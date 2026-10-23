import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Clock3,
  Filter,
  ShieldAlert,
  Trash2,
  KeyRound,
  Mail,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { PageHeading } from "../../components/PageHeading";
import { PanelHeading } from "../../components/PanelHeading";
import { getTeam, inviteTeamMember, createTeamUser, deleteTeamUser, type AuthUser } from "../../api";
import type { TranslationKey } from "../../i18n";

type Translator = (key: TranslationKey) => string;

const officialDepartments = [
  { id: "all", nameAr: "جميع الأقسام", nameEn: "All Departments" },
  { id: "internal_medicine", nameAr: "الباطنة العامة", nameEn: "General Medicine" },
  { id: "emergency", nameAr: "طوارئ 24/7", nameEn: "Emergency 24/7" },
  { id: "pediatrics", nameAr: "طب الأطفال", nameEn: "Pediatrics" },
  { id: "obgyn", nameAr: "النساء والتوليد", nameEn: "OB/GYN" },
  { id: "orthopedics", nameAr: "العظام والمفاصل", nameEn: "Orthopedics" },
  { id: "ophthalmology", nameAr: "طب وجراحة العيون", nameEn: "Ophthalmology" },
];

type PriorityTask = {
  id: string;
  actionKey: TranslationKey;
  titleAr: string;
  titleEn: string;
  descAr: string;
  descEn: string;
  deptAr: string;
  deptEn: string;
  priorityAr: string;
  priorityEn: string;
  priorityTone: "danger" | "pending" | "confirmed";
  completed: boolean;
};

const initialTasks: PriorityTask[] = [
  {
    id: "coverage",
    actionKey: "staffingTaskCoverage",
    titleAr: "مراجعة تغطية العيادة المسائية",
    titleEn: "Review Evening Clinic Staff Coverage",
    descAr: "تحتاج العيادة المسائية طبيب باطنة إضافي لتغطية زيادة تدفق الحالات بين 6م و 10م وتجنب تكدس المرضى في فترة الذروة.",
    descEn: "The evening clinic requires an additional physician to accommodate peak patient volume between 6 PM and 10 PM and eliminate wait congestion.",
    deptAr: "الباطنة العامة & الطوارئ",
    deptEn: "General Medicine & Emergency",
    priorityAr: "عالية",
    priorityEn: "High",
    priorityTone: "danger",
    completed: false,
  },
  {
    id: "handoff",
    actionKey: "staffingTaskHandoff",
    titleAr: "تأكيد تسليم المناوبة لمكتب التصاريح",
    titleEn: "Confirm Shift Handoff to Admissions Desk",
    descAr: "تسليم سجل الحالات الحرجة وتصاريح الدخول للمناوبة الليلية ومراجعة جاهزية أسرة العناية المركزة لضمان استمرارية الرعاية.",
    descEn: "Handoff critical patient log and admission approvals to the night shift team and verify ICU bed readiness.",
    deptAr: "طوارئ وعناية 24/7",
    deptEn: "Emergency & Critical Care 24/7",
    priorityAr: "حرجة",
    priorityEn: "Critical",
    priorityTone: "danger",
    completed: false,
  },
  {
    id: "onboarding",
    actionKey: "staffingTaskOnboarding",
    titleAr: "اعتماد قائمة تهيئة منسق استقبال جديد",
    titleEn: "Approve Reception Coordinator Onboarding Checklist",
    descAr: "مراجعة تدريب منسق الاستقبال على بروتوكول فرز الحالات Triage ونظام CareOS والتحقق من حسابات الدخول والصلاحيات.",
    descEn: "Verify reception coordinator training on triage protocols, CareOS system access, and role permissions.",
    deptAr: "الاستقبال والتوجيه",
    deptEn: "Reception & Triage",
    priorityAr: "متوسطة",
    priorityEn: "Medium",
    priorityTone: "pending",
    completed: false,
  },
  {
    id: "audit",
    actionKey: "staffingTaskAudit",
    titleAr: "مراجعة أحداث وصول غرف الأطباء خلال آخر 24 ساعة",
    titleEn: "Audit Clinical Room Access Events in Last 24 Hours",
    descAr: "تدقيق سجلات تسجيل الدخول والوصول لغرف الفحص وغرف الأطباء للتأكد من مطابقة تصاريح الوصول لمنع أي دخول غير مصرح.",
    descEn: "Audit room access logs and clinician session records over the last 24 hours to ensure strict access compliance.",
    deptAr: "إدارة المنظومة والأمن",
    deptEn: "System Administration & Security",
    priorityAr: "عالية",
    priorityEn: "High",
    priorityTone: "pending",
    completed: false,
  },
];

export function StaffManagement({
  t,
  language,
}: {
  t: Translator;
  language?: "ar" | "en";
}) {
  const isArabic =
    language !== undefined
      ? language === "ar"
      : typeof document !== "undefined" && document.documentElement.dir === "rtl";

  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("doctor");
  const [inviteDepartment, setInviteDepartment] = useState("internal_medicine");
  const [inviting, setInviting] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // Direct User Creation (IT Admin Direct Provisioning)
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createFullName, setCreateFullName] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createRole, setCreateRole] = useState("doctor");
  const [createDepartment, setCreateDepartment] = useState("internal_medicine");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Direct User Deletion (IT Admin)
  const [userToDelete, setUserToDelete] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [selectedDeptFilter, setSelectedDeptFilter] = useState("all");
  const [tasks, setTasks] = useState<PriorityTask[]>(initialTasks);
  const [selectedTask, setSelectedTask] = useState<PriorityTask | null>(null);
  const [realTeam, setRealTeam] = useState<AuthUser[]>([]);
  const [loadingTeam, setLoadingTeam] = useState(false);

  const fetchTeam = useCallback(async () => {
    setLoadingTeam(true);
    try {
      const data = await getTeam();
      if (Array.isArray(data) && data.length > 0) {
        setRealTeam(data);
      }
    } catch {
      // Keep existing data on network error
    } finally {
      setLoadingTeam(false);
    }
  }, []);

  useEffect(() => {
    fetchTeam();
  }, [fetchTeam]);

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setInviteError(null);
    try {
      await inviteTeamMember(inviteEmail.trim(), inviteRole);
      setInviteSuccess(true);
      fetchTeam();
      setTimeout(() => {
        setInviteSuccess(false);
        setShowInviteModal(false);
        setInviteEmail("");
      }, 2000);
    } catch (err: unknown) {
      setInviteError(err instanceof Error ? err.message : "Failed to send invitation");
    } finally {
      setInviting(false);
    }
  };

  const handleCreateUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createFullName.trim() || !createEmail.trim() || !createPassword.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      await createTeamUser({
        full_name: createFullName.trim(),
        email: createEmail.trim(),
        password: createPassword.trim(),
        role: createRole,
        department: createDepartment,
      });
      window.dispatchEvent(
        new CustomEvent("careos:toast", {
          detail: isArabic
            ? `تم إضافة المستخدم الجديد (${createFullName}) وتعيين كلمة المرور بنجاح`
            : `User (${createFullName}) created and credentials provisioned successfully`,
        })
      );
      setShowCreateModal(false);
      setCreateFullName("");
      setCreateEmail("");
      setCreatePassword("");
      fetchTeam();
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setCreating(false);
    }
  };

  const handleConfirmDeleteUser = async () => {
    if (!userToDelete) return;
    setDeleting(true);
    try {
      await deleteTeamUser(userToDelete.id);
      window.dispatchEvent(
        new CustomEvent("careos:toast", {
          detail: isArabic
            ? `تم حذف حساب المستخدم (${userToDelete.name}) وإلغاء صلاحياته بنجاح`
            : `User (${userToDelete.name}) deleted and sessions revoked successfully`,
        })
      );
      setUserToDelete(null);
      fetchTeam();
    } catch (err: unknown) {
      window.dispatchEvent(
        new CustomEvent("careos:toast", {
          detail: isArabic
            ? `فشل حذف المستخدم: ${err instanceof Error ? err.message : "خطأ غير متوقع"}`
            : `Failed to delete user: ${err instanceof Error ? err.message : "Unknown error"}`,
        })
      );
    } finally {
      setDeleting(false);
    }
  };

  const handleCompleteTask = (taskId: string) => {
    setTasks((prev) =>
      prev.map((task) =>
        task.id === taskId ? { ...task, completed: true } : task
      )
    );
    setSelectedTask(null);
    window.dispatchEvent(
      new CustomEvent("careos:toast", {
        detail: isArabic
          ? "تم اعتماد وإتمام الإجراء التشغيلي بنجاح وتحديث السجل"
          : "Operational action approved and log updated successfully",
      })
    );
  };

  const fallbackStaff = [
    {
      id: "1",
      name: "sampleStaffDoctor",
      role: "leadPhysician" as TranslationKey,
      deptId: "internal_medicine",
      deptLabelAr: "الباطنة العامة",
      deptLabelEn: "General Medicine",
      schedule: "consulting" as TranslationKey,
      load: "82%",
      status: "available" as TranslationKey,
      tone: "confirmed",
    },
    {
      id: "2",
      name: "sampleStaffNurse",
      role: "triageLead" as TranslationKey,
      deptId: "emergency",
      deptLabelAr: "طوارئ 24/7",
      deptLabelEn: "Emergency 24/7",
      schedule: "currentShift" as TranslationKey,
      load: "91%",
      status: "busy" as TranslationKey,
      tone: "pending",
    },
    {
      id: "3",
      name: "sampleStaffReceptionist",
      role: "receptionCoordinator" as TranslationKey,
      deptId: "emergency",
      deptLabelAr: "الاستقبال والتوجيه",
      deptLabelEn: "Reception & Triage",
      schedule: "frontDeskLabel" as TranslationKey,
      load: "76%",
      status: "available" as TranslationKey,
      tone: "confirmed",
    },
    {
      id: "4",
      name: "sampleStaffAdmin",
      role: "clinicalAdmin" as TranslationKey,
      deptId: "all",
      deptLabelAr: "إدارة المنظومة",
      deptLabelEn: "Hospital Administration",
      schedule: "documentation" as TranslationKey,
      load: "68%",
      status: "review" as TranslationKey,
      tone: "danger",
    },
    {
      id: "5",
      name: "sampleStaffDoctor",
      customNameAr: "د. سارة عادل",
      customNameEn: "Dr. Sara Adel",
      role: "leadPhysician" as TranslationKey,
      deptId: "pediatrics",
      deptLabelAr: "طب الأطفال",
      deptLabelEn: "Pediatrics",
      schedule: "consulting" as TranslationKey,
      load: "74%",
      status: "available" as TranslationKey,
      tone: "confirmed",
    },
    {
      id: "6",
      name: "sampleStaffDoctor",
      customNameAr: "د. شريف يسري",
      customNameEn: "Dr. Sherif Yosri",
      role: "leadPhysician" as TranslationKey,
      deptId: "orthopedics",
      deptLabelAr: "العظام والمفاصل",
      deptLabelEn: "Orthopedics",
      schedule: "consulting" as TranslationKey,
      load: "65%",
      status: "available" as TranslationKey,
      tone: "confirmed",
    },
  ];

  const mappedRealStaff = realTeam.map((u, index) => {
    const roleKey = (u.role || "").toLowerCase();
    let roleTransKey: TranslationKey = "leadPhysician";
    if (roleKey.includes("nurse")) roleTransKey = "triageLead";
    else if (roleKey.includes("reception") || roleKey.includes("clerk")) roleTransKey = "receptionCoordinator";
    else if (roleKey.includes("admin") || roleKey.includes("director")) roleTransKey = "clinicalAdmin";

    const deptId = (u.department || "internal_medicine").toLowerCase().replace(/\s+/g, "_");
    const deptInfo = officialDepartments.find((d) => d.id === deptId) || {
      id: deptId,
      nameAr: u.department || "الباطنة العامة",
      nameEn: u.department || "General Medicine",
    };

    const loadVal = `${60 + ((index * 9 + 5) % 35)}%`;
    return {
      id: u.id,
      name: "sampleStaffDoctor" as TranslationKey,
      customNameAr: u.full_name,
      customNameEn: u.full_name,
      role: roleTransKey,
      deptId: deptInfo.id,
      deptLabelAr: deptInfo.nameAr,
      deptLabelEn: deptInfo.nameEn,
      schedule: "consulting" as TranslationKey,
      load: loadVal,
      status: "available" as TranslationKey,
      tone: "confirmed",
    };
  });

  const staff = mappedRealStaff.length > 0 ? mappedRealStaff : fallbackStaff;

  const filteredStaff = selectedDeptFilter === "all"
    ? staff
    : staff.filter((s) => s.deptId === selectedDeptFilter || s.deptId === "all");

  const averageLoadCalc = Math.round(
    staff.reduce((acc, s) => acc + (parseInt(s.load, 10) || 75), 0) / (staff.length || 1),
  );

  const summary = [
    { label: "onDuty" as const, value: String(staff.length), detail: "acrossFiveTeams" as const, tone: "confirmed" },
    { label: "openSlots" as const, value: String(Math.max(2, 10 - staff.length)), detail: "needCoverage" as const, tone: "pending" },
    { label: "averageLoad" as const, value: `${averageLoadCalc}%`, detail: "balanced" as const, tone: "confirmed" },
    { label: "escalations" as const, value: String(tasks.filter((t) => !t.completed).length), detail: "requiresReview" as const, tone: "danger" },
  ];

  return (
    <>
      <PageHeading
        eyebrow={t("teamAudit")}
        title={t("staffManagementTitle")}
        detail={t("staffManagementDetail")}
        action={
          <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              className="primary-btn"
              onClick={() => setShowCreateModal(true)}
              style={{ display: "flex", alignItems: "center", gap: "6px" }}
            >
              <UserPlus size={16} />
              <span>{isArabic ? "إضافة مستخدم وتعيين كلمة مرور" : "Add User & Set Password"}</span>
            </button>
            <button
              type="button"
              className="outline-btn"
              onClick={() => setShowInviteModal(true)}
              style={{ display: "flex", alignItems: "center", gap: "6px" }}
            >
              <Mail size={15} />
              <span>{isArabic ? "دعوة بالبريد" : "Invite via Email"}</span>
            </button>
          </div>
        }
      />

      <div className="dashboard-grid">
        <section className="panel">
          <PanelHeading
            title={t("coverageOverview")}
            detail={t("liveCapacitySummary")}
          />
          <div className="team-summary-grid">
            {summary.map((item) => (
              <div className="team-summary-card" key={item.label}>
                <span>{t(item.label)}</span>
                <strong>{item.value}</strong>
                <em className={`status ${item.tone}`}>{t(item.detail)}</em>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px 0" }}>
            <PanelHeading
              title={t("currentStaffing")}
              detail={
                isArabic
                  ? "الكادر الطبي والموظفون مصنفين حسب الأقسام والصلاحيات"
                  : "Clinical staff and team members categorized by department and permissions"
              }
            />
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Filter size={14} style={{ color: "var(--muted)" }} />
              <select
                value={selectedDeptFilter}
                onChange={(e) => setSelectedDeptFilter(e.target.value)}
                className="onboarding-select-compact"
                style={{ padding: "4px 8px", fontSize: "12px", borderRadius: "6px" }}
              >
                {officialDepartments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {isArabic ? d.nameAr : d.nameEn}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="team-list">
            {filteredStaff.map((person) => (
              <div className="team-row" key={person.id}>
                <div className="avatar avatar-doctor">
                  {person.customNameAr
                    ? (isArabic ? person.customNameAr : person.customNameEn).slice(0, 2).toUpperCase()
                    : t(person.name as TranslationKey).split(" ").slice(0, 2).map((part) => part[0]).join("").toUpperCase()}
                </div>
                <div className="team-person">
                  <strong>
                    {person.customNameAr
                      ? (isArabic ? person.customNameAr : person.customNameEn)
                      : t(person.name as TranslationKey)}
                  </strong>
                  <span>
                    {t(person.role as TranslationKey)} ·{" "}
                    <em style={{ fontStyle: "normal", color: "var(--teal-dark)", fontWeight: 600 }}>
                      {isArabic ? person.deptLabelAr : person.deptLabelEn}
                    </em>
                  </span>
                </div>
                <span>{t(person.schedule as TranslationKey)}</span>
                <span className={`status ${person.tone}`}>{t(person.status as TranslationKey)}</span>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span>{person.load}</span>
                  {person.id && !["1", "2", "3", "4"].includes(person.id) && (
                    <button
                      type="button"
                      className="icon-button"
                      style={{ color: "#ef4444", padding: "6px", borderRadius: "6px" }}
                      title={isArabic ? "حذف المستخدم" : "Delete User"}
                      onClick={(e) => {
                        e.stopPropagation();
                        setUserToDelete({
                          id: person.id,
                          name: person.customNameAr || person.customNameEn || "المستخدم",
                        });
                      }}
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="dashboard-grid">
        <section className="panel">
          <PanelHeading
            title={t("shiftReadiness")}
            detail={t("staffingByStream")}
          />
          <div className="stat-grid compact three-cols">
            <div className="stat-card">
              <div className="stat-icon blue"><Users size={16} /></div>
              <span className="stat-label">{t("consultation")}</span>
              <strong className="stat-value">5/6</strong>
            </div>
            <div className="stat-card">
              <div className="stat-icon green"><Activity size={16} /></div>
              <span className="stat-label">{t("triage")}</span>
              <strong className="stat-value">4/5</strong>
            </div>
            <div className="stat-card">
              <div className="stat-icon orange"><Clock3 size={16} /></div>
              <span className="stat-label">{t("supportDesk")}</span>
              <strong className="stat-value">2/3</strong>
            </div>
          </div>
        </section>

        <section className="panel">
          <PanelHeading
            title={t("priorityActions")}
            detail={t("highPriorityStaffingTasks")}
          />
          <div className="team-list">
            {tasks.map((task) => (
              <div
                className="team-row"
                key={task.id}
                style={{ cursor: "pointer" }}
                onClick={() => setSelectedTask(task)}
              >
                <div className="avatar avatar-doctor">
                  {task.completed ? <CheckCircle2 size={16} color="#10b981" /> : <ArrowUpRight size={14} />}
                </div>
                <div className="team-person">
                  <strong>
                    {isArabic ? task.titleAr : task.titleEn}
                  </strong>
                  <span>
                    {isArabic ? task.deptAr : task.deptEn} · {t("operationalQueue")}
                  </span>
                </div>
                {task.completed ? (
                  <span className="status confirmed">{isArabic ? "مكتملة" : "Completed"}</span>
                ) : (
                  <span className={`status ${task.priorityTone}`}>
                    {isArabic ? `أولوية ${task.priorityAr}` : `${task.priorityEn} Priority`}
                  </span>
                )}
                <button
                  type="button"
                  className="text-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedTask(task);
                  }}
                >
                  {t("open")}
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* ================= TASK ACTION MODAL ================= */}
      {selectedTask && (
        <div className="modal-backdrop" onClick={() => setSelectedTask(null)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            style={{ maxWidth: "520px", padding: "26px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="patient-modal-heading" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div className="avatar avatar-doctor" style={{ background: "var(--soft-teal)", color: "var(--teal-dark)" }}>
                  <ShieldAlert size={18} />
                </div>
                <div>
                  <h2 style={{ margin: 0, fontSize: "17px" }}>
                    {isArabic ? selectedTask.titleAr : selectedTask.titleEn}
                  </h2>
                  <span style={{ fontSize: "12px", color: "var(--muted)" }}>
                    {isArabic ? `القسم المعني: ${selectedTask.deptAr}` : `Target: ${selectedTask.deptEn}`}
                  </span>
                </div>
              </div>
              <button
                className="icon-button"
                type="button"
                onClick={() => setSelectedTask(null)}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ margin: "20px 0" }}>
              <div style={{ padding: "14px", borderRadius: "8px", background: "var(--canvas)", border: "1px solid var(--line)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                  <span style={{ fontSize: "11px", fontWeight: "bold", color: "var(--muted)" }}>
                    {isArabic ? "حالة المهمة ومستوى الأولوية:" : "Task Status & Priority Level:"}
                  </span>
                  <span className={`status ${selectedTask.completed ? "confirmed" : selectedTask.priorityTone}`}>
                    {selectedTask.completed
                      ? (isArabic ? "مكتملة ومعتمدة" : "Completed & Verified")
                      : (isArabic ? `أولوية ${selectedTask.priorityAr}` : `${selectedTask.priorityEn} Priority`)}
                  </span>
                </div>
                <p style={{ margin: 0, color: "var(--ink)", fontSize: "13px", lineHeight: "1.6" }}>
                  {isArabic ? selectedTask.descAr : selectedTask.descEn}
                </p>
              </div>

              {!selectedTask.completed && (
                <div style={{ marginTop: "14px", padding: "12px", borderRadius: "8px", background: "rgba(38,166,154,0.08)", border: "1px solid var(--soft-teal)", fontSize: "12px", color: "var(--teal-dark)" }}>
                  <strong>{isArabic ? "الإجراء المطلوب:" : "Required Action:"}</strong>{" "}
                  {isArabic
                    ? "مراجعة الجاهزية والضغط على \"اعتماد وإتمام الإجراء\" لتحديث لوحة القيادة وإغلاق التنبيه."
                    : "Review readiness and select \"Approve & Complete Action\" to update the dashboard and resolve the alert."}
                </div>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "20px" }}>
              <button
                type="button"
                className="outline-btn"
                onClick={() => setSelectedTask(null)}
              >
                {isArabic ? "إغلاق" : "Close"}
              </button>
              {!selectedTask.completed && (
                <button
                  type="button"
                  className="primary-btn"
                  onClick={() => handleCompleteTask(selectedTask.id)}
                >
                  <Check size={16} /> {isArabic ? "اعتماد وإتمام الإجراء" : "Approve & Complete Action"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================= INVITE MODAL ================= */}
      {showInviteModal && (
        <div className="patient-modal-backdrop">
          <section
            className="panel patient-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="invite-staff-title"
            style={{ maxWidth: "480px" }}
          >
            <div className="patient-modal-heading">
              <div>
                <h2 id="invite-staff-title" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <UserPlus size={20} />
                  <span>{t("inviteStaffTitle")}</span>
                </h2>
                <p style={{ marginTop: "0.25rem", color: "var(--text-secondary)", fontSize: "0.875rem" }}>
                  {t("inviteStaffDescription")}
                </p>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label={t("closeDialog")}
                onClick={() => setShowInviteModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            {inviteSuccess ? (
              <div style={{ margin: "1.5rem 0", padding: "1rem", borderRadius: "8px", background: "rgba(16, 185, 129, 0.1)", border: "1px solid rgba(16, 185, 129, 0.3)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <Check size={20} color="#10b981" />
                <strong style={{ color: "#10b981" }}>{t("invitationSent")}</strong>
              </div>
            ) : (
              <form onSubmit={(e) => void handleInviteSubmit(e)}>
                <label style={{ display: "block", margin: "1rem 0" }}>
                  <span>{t("email")} *</span>
                  <input
                    type="email"
                    required
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="colleague@citycare.org"
                    style={{ width: "100%", marginTop: "0.35rem" }}
                  />
                </label>

                <label style={{ display: "block", marginBottom: "1rem" }}>
                  <span>{t("inviteStaffRole")}</span>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                    style={{ width: "100%", marginTop: "0.35rem" }}
                  >
                    <option value="doctor">{t("roleDoctorLabel")}</option>
                    <option value="nurse">{t("roleNurseLabel")}</option>
                    <option value="receptionist">{t("roleReceptionistLabel")}</option>
                    <option value="administrative_staff">{t("roleStaffLabel")}</option>
                    <option value="hospital_director">{t("roleDirectorLabel")}</option>
                    <option value="it_admin">{t("roleItAdminLabel")}</option>
                    <option value="administrator">{t("roleAdminLabel")}</option>
                  </select>
                </label>

                <label style={{ display: "block", marginBottom: "1rem" }}>
                  <span>
                    {isArabic
                      ? "القسم / العيادة التابع لها (Department Scope) *"
                      : "Department Scope *"}
                  </span>
                  <select
                    value={inviteDepartment}
                    onChange={(e) => setInviteDepartment(e.target.value)}
                    style={{ width: "100%", marginTop: "0.35rem" }}
                  >
                    {officialDepartments.filter((d) => d.id !== "all").map((dept) => (
                      <option key={dept.id} value={dept.id}>
                        {isArabic ? `${dept.nameAr} (${dept.nameEn})` : dept.nameEn}
                      </option>
                    ))}
                  </select>
                </label>

                {inviteError && (
                  <div className="inline-error" style={{ marginBottom: "1rem" }} role="alert">
                    {inviteError}
                  </div>
                )}

                <div className="patient-modal-actions" style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1.25rem" }}>
                  <button className="outline-btn" type="button" onClick={() => setShowInviteModal(false)}>
                    {t("cancel")}
                  </button>
                  <button className="primary-btn" type="submit" disabled={inviting}>
                    {inviting ? t("loading") : t("sendInvitation")}
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      )}

      {/* ================= IT ADMIN DIRECT USER CREATION MODAL ================= */}
      {showCreateModal && (
        <div className="patient-modal-backdrop" onClick={() => setShowCreateModal(false)}>
          <section
            className="panel patient-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-user-modal-title"
            style={{ maxWidth: "520px", padding: "26px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="patient-modal-heading" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div className="avatar avatar-doctor" style={{ background: "rgba(13, 148, 136, 0.12)", color: "var(--teal-dark)" }}>
                  <UserPlus size={20} />
                </div>
                <div>
                  <h2 id="create-user-modal-title" style={{ margin: 0, fontSize: "17px", fontWeight: 700 }}>
                    {isArabic ? "إضافة مستخدم جديد وتحديد الصلاحية" : "Add New User & Set Permissions"}
                  </h2>
                  <p style={{ margin: "3px 0 0", color: "var(--text-secondary)", fontSize: "12px" }}>
                    {isArabic
                      ? "إضافة كادر جديد مباشرة وتعيين البريد وكلمة المرور وتحديد الصلاحية والعيادة"
                      : "Directly provision user account with credentials, role assignment, and department"}
                  </p>
                </div>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label={t("closeDialog")}
                onClick={() => setShowCreateModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={(e) => void handleCreateUserSubmit(e)} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <label style={{ display: "block" }}>
                <span style={{ fontSize: "13px", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                  {isArabic ? "الاسم الكامل *" : "Full Name *"}
                </span>
                <input
                  type="text"
                  required
                  value={createFullName}
                  onChange={(e) => setCreateFullName(e.target.value)}
                  placeholder={isArabic ? "مثال: د. هاني الباز" : "e.g. Dr. Hany El-Baz"}
                  style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid var(--line)" }}
                />
              </label>

              <label style={{ display: "block" }}>
                <span style={{ fontSize: "13px", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                  {isArabic ? "البريد الإلكتروني المهني *" : "Work Email *"}
                </span>
                <input
                  type="email"
                  required
                  value={createEmail}
                  onChange={(e) => setCreateEmail(e.target.value)}
                  placeholder="hany.elbaz@careos.org"
                  style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid var(--line)" }}
                />
              </label>

              <label style={{ display: "block" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                  <span style={{ fontSize: "13px", fontWeight: 600 }}>
                    {isArabic ? "كلمة المرور الابتدائية *" : "Initial Password *"}
                  </span>
                  <button
                    type="button"
                    className="text-btn"
                    style={{ fontSize: "11px", padding: 0 }}
                    onClick={() => {
                      const randomPass = "CareOS@" + Math.random().toString(36).slice(-6) + "!";
                      setCreatePassword(randomPass);
                    }}
                  >
                    <KeyRound size={12} style={{ display: "inline", verticalAlign: "middle", marginInlineEnd: "4px" }} />
                    {isArabic ? "توليد كلمة مرور آمنة" : "Generate Secure Password"}
                  </button>
                </div>
                <input
                  type="text"
                  required
                  minLength={8}
                  value={createPassword}
                  onChange={(e) => setCreatePassword(e.target.value)}
                  placeholder={isArabic ? "8 أحرف على الأقل" : "At least 8 characters"}
                  style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid var(--line)", fontFamily: "monospace" }}
                />
              </label>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <label style={{ display: "block" }}>
                  <span style={{ fontSize: "13px", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                    {isArabic ? "الدور والصلاحية *" : "Role & Permissions *"}
                  </span>
                  <select
                    value={createRole}
                    onChange={(e) => setCreateRole(e.target.value)}
                    style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid var(--line)" }}
                  >
                    <option value="doctor">{t("roleDoctorLabel")}</option>
                    <option value="nurse">{t("roleNurseLabel")}</option>
                    <option value="receptionist">{t("roleReceptionistLabel")}</option>
                    <option value="administrative_staff">{t("roleStaffLabel")}</option>
                    <option value="hospital_director">{t("roleDirectorLabel")}</option>
                    <option value="it_admin">{t("roleItAdminLabel")}</option>
                    <option value="administrator">{t("roleAdminLabel")}</option>
                  </select>
                </label>

                <label style={{ display: "block" }}>
                  <span style={{ fontSize: "13px", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                    {isArabic ? "القسم / العيادة *" : "Department *"}
                  </span>
                  <select
                    value={createDepartment}
                    onChange={(e) => setCreateDepartment(e.target.value)}
                    style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid var(--line)" }}
                  >
                    {officialDepartments.filter((d) => d.id !== "all").map((dept) => (
                      <option key={dept.id} value={dept.id}>
                        {isArabic ? dept.nameAr : dept.nameEn}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {createError && (
                <div className="inline-error" style={{ padding: "8px 12px", borderRadius: "6px" }} role="alert">
                  {createError}
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "12px" }}>
                <button className="outline-btn" type="button" onClick={() => setShowCreateModal(false)}>
                  {t("cancel")}
                </button>
                <button className="primary-btn" type="submit" disabled={creating}>
                  {creating ? t("loading") : (isArabic ? "إنشاء وتفعيل الحساب فوراً" : "Create & Activate User")}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* ================= IT ADMIN DELETE USER CONFIRMATION MODAL ================= */}
      {userToDelete && (
        <div className="patient-modal-backdrop" onClick={() => setUserToDelete(null)}>
          <section
            className="panel patient-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-user-modal-title"
            style={{ maxWidth: "440px", padding: "24px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
              <div className="avatar" style={{ background: "rgba(239, 68, 68, 0.12)", color: "#ef4444" }}>
                <Trash2 size={20} />
              </div>
              <div>
                <h2 id="delete-user-modal-title" style={{ margin: 0, fontSize: "17px", fontWeight: 700, color: "#ef4444" }}>
                  {isArabic ? "تأكيد حذف المستخدم" : "Confirm User Deletion"}
                </h2>
                <p style={{ margin: "2px 0 0", color: "var(--text-secondary)", fontSize: "12px" }}>
                  {isArabic ? "إلغاء الحساب وفسخ كافة الجلسات النشطة" : "Revoke account and invalidate all active sessions"}
                </p>
              </div>
            </div>

            <p style={{ fontSize: "13px", lineHeight: "1.6", color: "var(--ink)", margin: "0 0 16px" }}>
              {isArabic
                ? `هل أنت متأكد من رغبتك في حذف حساب "${userToDelete.name}"؟ سيتم تعطيل تسجيل الدخول فوراً وفسخ أي جلسات عمل نشطة.`
                : `Are you sure you want to delete "${userToDelete.name}"? Login access will be immediately revoked and all active sessions terminated.`}
            </p>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button
                className="outline-btn"
                type="button"
                disabled={deleting}
                onClick={() => setUserToDelete(null)}
              >
                {t("cancel")}
              </button>
              <button
                className="primary-btn"
                type="button"
                disabled={deleting}
                style={{ background: "#ef4444", borderColor: "#ef4444", color: "#fff" }}
                onClick={() => void handleConfirmDeleteUser()}
              >
                {deleting ? t("loading") : (isArabic ? "تأكيد الحذف النهائي" : "Confirm Deletion")}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

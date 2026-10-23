import { useState } from "react";
import {
  Building2,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Plus,
  Shield,
  Stethoscope,
  Users,
  X,
} from "lucide-react";
import { PageHeading } from "../../components/PageHeading";
import { PanelHeading } from "../../components/PanelHeading";
import type { TranslationKey } from "../../i18n";

type Translator = (key: TranslationKey) => string;

type DepartmentSummary = {
  id: string;
  name: string;
  nameEn: string;
  head: string;
  headEn: string;
  capacity: number;
  active: number;
  followUpDue: number;
  status: "stable" | "watch" | "urgent";
  code: string;
  doctorsCount: number;
  nursesCount: number;
  specialtyDetails: string;
  specialtyDetailsEn: string;
};

const initialDepartments: DepartmentSummary[] = [
  {
    id: "internal_medicine",
    name: "الباطنة العامة",
    nameEn: "General Medicine",
    head: "د. رنا سمير",
    headEn: "Dr. Rana Samir",
    capacity: 35,
    active: 28,
    followUpDue: 6,
    status: "stable",
    code: "MED",
    doctorsCount: 8,
    nursesCount: 14,
    specialtyDetails: "فحوصات الباطنة، إدارة الأمراض المزمنة، وضبط الضغط والسكري والمتابعة السريرية.",
    specialtyDetailsEn: "Internal medicine exams, chronic condition management, hypertension & diabetes control, and clinical follow-up.",
  },
  {
    id: "emergency",
    name: "طوارئ وعناية 24/7",
    nameEn: "Emergency 24/7",
    head: "د. طارق محمود",
    headEn: "Dr. Tarek Mahmoud",
    capacity: 45,
    active: 38,
    followUpDue: 14,
    status: "urgent",
    code: "EMR",
    doctorsCount: 12,
    nursesCount: 22,
    specialtyDetails: "استقبال الحوادث، الإنعاش القلبي الرئوي، غرف الفرز والإنعاش السريع على مدار الساعة.",
    specialtyDetailsEn: "Trauma intake, cardiopulmonary resuscitation, triage rooms, and 24/7 rapid critical care.",
  },
  {
    id: "pediatrics",
    name: "طب الأطفال",
    nameEn: "Pediatrics",
    head: "د. سارة عادل",
    headEn: "Dr. Sara Adel",
    capacity: 25,
    active: 19,
    followUpDue: 4,
    status: "stable",
    code: "PED",
    doctorsCount: 6,
    nursesCount: 10,
    specialtyDetails: "رعاية حديثي الولادة، التطعيمات، متابعة النمو، وطب الأطفال العام.",
    specialtyDetailsEn: "Neonatal care, immunizations, developmental milestones, and general pediatrics.",
  },
  {
    id: "obgyn",
    name: "النساء والتوليد",
    nameEn: "OB/GYN",
    head: "د. منى كمال",
    headEn: "Dr. Mona Kamal",
    capacity: 20,
    active: 17,
    followUpDue: 8,
    status: "watch",
    code: "OBG",
    doctorsCount: 5,
    nursesCount: 9,
    specialtyDetails: "متابعة الحمل والولادة، السونار التخصصي، ورعاية صحة المرأة الوقائية والعلاجية.",
    specialtyDetailsEn: "Maternal-fetal monitoring, diagnostic ultrasound, and comprehensive women's health care.",
  },
  {
    id: "orthopedics",
    name: "العظام والمفاصل",
    nameEn: "Orthopedics",
    head: "د. شريف يسري",
    headEn: "Dr. Sherif Yosri",
    capacity: 18,
    active: 13,
    followUpDue: 3,
    status: "stable",
    code: "ORT",
    doctorsCount: 4,
    nursesCount: 7,
    specialtyDetails: "علاج الكسور، مناظير المفاصل، جراحة العظام، والتأهيل الحركي وما بعد العمليات.",
    specialtyDetailsEn: "Fracture management, arthroscopy, orthopedic surgery, and post-operative physical rehabilitation.",
  },
  {
    id: "ophthalmology",
    name: "طب وجراحة العيون",
    nameEn: "Ophthalmology",
    head: "د. إيهاب فؤاد",
    headEn: "Dr. Ehab Fouad",
    capacity: 15,
    active: 11,
    followUpDue: 2,
    status: "stable",
    code: "OPH",
    doctorsCount: 3,
    nursesCount: 5,
    specialtyDetails: "فحوصات قاع العين، تصحيح الإبصار، جراحات المياه البيضاء، وعيادات الليزر.",
    specialtyDetailsEn: "Fundoscopy, vision correction, cataract surgery, and laser therapeutics.",
  },
];

export function DepartmentOverview({
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

  const [departments, setDepartments] = useState<DepartmentSummary[]>(initialDepartments);
  const [selectedDept, setSelectedDept] = useState<DepartmentSummary | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newDeptName, setNewDeptName] = useState("");
  const [newDeptHead, setNewDeptHead] = useState("");
  const [newDeptCapacity, setNewDeptCapacity] = useState(20);

  const statusTone = {
    stable: "status confirmed",
    watch: "status pending",
    urgent: "status danger",
  } as const;

  const statusLabel = {
    stable: isArabic ? "مستقر" : "Stable",
    watch: isArabic ? "تحت الملاحظة" : "Watch",
    urgent: isArabic ? "طوارئ قصوى" : "Critical",
  };

  const handleAddDepartment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDeptName.trim()) return;
    const nameVal = newDeptName.trim();
    const headVal = newDeptHead.trim();
    const newDept: DepartmentSummary = {
      id: `custom_${Date.now()}`,
      name: nameVal,
      nameEn: nameVal,
      head: headVal || (isArabic ? "غير محدد" : "Unassigned"),
      headEn: headVal || "Unassigned",
      capacity: Number(newDeptCapacity) || 20,
      active: 0,
      followUpDue: 0,
      status: "stable",
      code: nameVal.slice(0, 3).toUpperCase(),
      doctorsCount: 1,
      nursesCount: 2,
      specialtyDetails: isArabic ? "قسم مستحدث في المنظومة السحابية." : "Newly registered department in cloud operations.",
      specialtyDetailsEn: "Newly registered department in cloud operations.",
    };
    setDepartments((prev) => [...prev, newDept]);
    setShowAddModal(false);
    setNewDeptName("");
    setNewDeptHead("");
    window.dispatchEvent(
      new CustomEvent("careos:toast", {
        detail: isArabic
          ? `تم إضافة قسم ${newDept.name} بنجاح`
          : `Department ${newDept.nameEn} added successfully`,
      }),
    );
  };

  const totalCapacity = departments.reduce((acc, d) => acc + d.capacity, 0);
  const totalActive = departments.reduce((acc, d) => acc + d.active, 0);
  const totalFollowUps = departments.reduce((acc, d) => acc + d.followUpDue, 0);
  const averageLoad = totalCapacity > 0 ? Math.round((totalActive / totalCapacity) * 100) : 0;

  return (
    <>
      <PageHeading
        eyebrow={t("departments")}
        title={t("departmentsTitle")}
        detail={t("departmentsDetail")}
        action={
          <button
            type="button"
            className="primary-btn"
            onClick={() => setShowAddModal(true)}
          >
            <Plus size={16} /> {isArabic ? "إضافة قسم أو عيادة" : "Add Department"}
          </button>
        }
      />

      <div className="dashboard-grid">
        <section className="panel">
          <PanelHeading
            title={t("departmentDistribution")}
            detail={
              isArabic
                ? `إجمالي الأقسام النشطة: ${departments.length} عيادات معتمدة`
                : `Total active: ${departments.length} accredited clinics`
            }
          />
          <div className="team-list">
            {departments.map((department) => (
              <div
                className="team-row"
                key={department.id}
                style={{ cursor: "pointer" }}
                onClick={() => setSelectedDept(department)}
              >
                <div className="avatar avatar-doctor">
                  {department.code}
                </div>
                <div className="team-person">
                  <strong>
                    {isArabic ? department.name : department.nameEn}{" "}
                    <small style={{ opacity: 0.7, fontWeight: "normal" }}>
                      ({isArabic ? department.nameEn : department.name})
                    </small>
                  </strong>
                  <span>{isArabic ? department.head : department.headEn}</span>
                </div>
                <span>
                  {isArabic
                    ? `${department.active}/${department.capacity} سعة سريرية`
                    : `${department.active}/${department.capacity} Bed Capacity`}
                </span>
                <span className={statusTone[department.status]}>
                  {statusLabel[department.status]}
                </span>
                <button
                  type="button"
                  className="text-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedDept(department);
                  }}
                >
                  {t("open")}
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <PanelHeading
            title={t("operations")}
            detail={
              isArabic
                ? "مؤشرات الطاقة الاستيعابية للأقسام"
                : "Department capacity & operational indicators"
            }
          />
          <div className="stat-grid compact">
            <div className="stat-card">
              <div className="stat-icon blue"><Building2 size={16} /></div>
              <span className="stat-label">{isArabic ? "الأقسام المعتمدة" : "Accredited Depts"}</span>
              <strong className="stat-value">{departments.length}</strong>
            </div>
            <div className="stat-card">
              <div className="stat-icon green"><CheckCircle2 size={16} /></div>
              <span className="stat-label">{isArabic ? "الحالات النشطة" : "Active Cases"}</span>
              <strong className="stat-value">{totalActive}</strong>
            </div>
            <div className="stat-card">
              <div className="stat-icon orange"><Clock3 size={16} /></div>
              <span className="stat-label">{isArabic ? "مراجعات ومتابعات اليوم" : "Today's Follow-ups"}</span>
              <strong className="stat-value">{totalFollowUps}</strong>
            </div>
            <div className="stat-card">
              <div className="stat-icon rose"><Users size={16} /></div>
              <span className="stat-label">{isArabic ? "متوسط إشغال المنظومة" : "Avg Occupancy"}</span>
              <strong className="stat-value">{averageLoad}%</strong>
            </div>
          </div>

          <div style={{ padding: "18px 20px", marginTop: "12px", borderTop: "1px solid var(--line)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--teal-dark)", fontSize: "12px", fontWeight: "bold" }}>
              <Shield size={16} />
              <span>
                {isArabic
                  ? "نطاق الصلاحيات المقيد بالأقسام (Department RBAC):"
                  : "Department Access Control (Department RBAC):"}
              </span>
            </div>
            <p style={{ margin: "6px 0 0", color: "var(--muted)", fontSize: "11px", lineHeight: "1.6" }}>
              {isArabic
                ? "أطباء وتمريض كل قسم يقتصر وصولهم السريري على مرضى وملفات قسمهم فقط، بينما يتمتع مدير المستشفى والمسؤول بصلاحية إشرافية موحدة عبر كل الأقسام."
                : "Clinical staff access is partitioned strictly to patients and records within their assigned department, while hospital directors and administrators maintain unified cross-department oversight."}
            </p>
          </div>
        </section>
      </div>

      {/* ================= DEPARTMENT DETAILS MODAL ================= */}
      {selectedDept && (
        <div className="modal-backdrop" onClick={() => setSelectedDept(null)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            style={{
              maxWidth: "580px",
              width: "92%",
              padding: "24px 28px",
              borderRadius: "18px",
              boxShadow: "0 24px 50px -12px rgba(13, 148, 136, 0.25), 0 10px 25px -5px rgba(0,0,0,0.12)",
              background: "var(--paper, #ffffff)",
              border: "1px solid var(--line, #e2e8f0)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                paddingBottom: "16px",
                borderBottom: "1px solid var(--line, #e2e8f0)",
                marginBottom: "16px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                <div
                  style={{
                    width: "48px",
                    height: "48px",
                    borderRadius: "14px",
                    background: "linear-gradient(135deg, rgba(13, 148, 136, 0.15), rgba(20, 184, 166, 0.25))",
                    color: "var(--teal, #0d9488)",
                    display: "grid",
                    placeItems: "center",
                    fontSize: "16px",
                    fontWeight: 800,
                    letterSpacing: "0.5px",
                    border: "1px solid rgba(13, 148, 136, 0.2)",
                  }}
                >
                  {selectedDept.code}
                </div>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 700, color: "var(--ink, #0f172a)" }}>
                      {isArabic ? selectedDept.name : selectedDept.nameEn}
                    </h2>
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: "6px",
                        background: "rgba(13, 148, 136, 0.1)",
                        color: "var(--teal, #0d9488)",
                        direction: "ltr",
                      }}
                    >
                      {selectedDept.code}
                    </span>
                  </div>
                  <span style={{ fontSize: "12px", color: "var(--muted, #64748b)", marginTop: "2px", display: "block" }}>
                    {isArabic ? selectedDept.nameEn : selectedDept.name} · {isArabic ? "منظومة الأقسام السريرية" : "Clinical Department"}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDept(null)}
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "10px",
                  border: "1px solid var(--line, #e2e8f0)",
                  background: "transparent",
                  color: "var(--muted, #64748b)",
                  display: "grid",
                  placeItems: "center",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#fee2e2";
                  e.currentTarget.style.color = "#ef4444";
                  e.currentTarget.style.borderColor = "#fca5a5";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "var(--muted, #64748b)";
                  e.currentTarget.style.borderColor = "var(--line, #e2e8f0)";
                }}
                aria-label={isArabic ? "إغلاق" : "Close"}
              >
                <X size={18} />
              </button>
            </div>

            {/* Department Specialty Scope Details */}
            <div
              style={{
                padding: "12px 14px",
                background: "rgba(13, 148, 136, 0.04)",
                border: "1px solid rgba(13, 148, 136, 0.15)",
                borderRadius: "12px",
                marginBottom: "18px",
                display: "flex",
                alignItems: "flex-start",
                gap: "10px",
              }}
            >
              <Stethoscope size={18} color="#0d9488" style={{ marginTop: "2px", flexShrink: 0 }} />
              <p style={{ color: "var(--ink, #1e293b)", fontSize: "13px", lineHeight: "1.6", margin: 0, fontWeight: 500 }}>
                {isArabic ? selectedDept.specialtyDetails : selectedDept.specialtyDetailsEn}
              </p>
            </div>

            {/* 4 Refined Metrics Cards (2x2 Grid) */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, 1fr)",
                gap: "12px",
                marginBottom: "18px",
              }}
            >
              {/* Card 1: Bed Capacity */}
              <div
                style={{
                  padding: "14px",
                  borderRadius: "14px",
                  background: "var(--canvas, #f8fafc)",
                  border: "1px solid var(--line, #e2e8f0)",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  gap: "8px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--muted, #64748b)" }}>
                    {isArabic ? "السعة السريرية" : "Bed Capacity"}
                  </span>
                  <Building2 size={16} color="#0d9488" />
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
                  <strong style={{ fontSize: "22px", fontWeight: 800, color: "var(--ink, #0f172a)" }}>
                    {selectedDept.active}
                  </strong>
                  <span style={{ fontSize: "13px", color: "var(--muted, #64748b)" }}>
                    / {selectedDept.capacity} {isArabic ? "سرير" : "beds"}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 700,
                      padding: "3px 8px",
                      borderRadius: "6px",
                      background:
                        selectedDept.status === "urgent"
                          ? "#fee2e2"
                          : selectedDept.status === "watch"
                          ? "#fef3c7"
                          : "#ccfbf1",
                      color:
                        selectedDept.status === "urgent"
                          ? "#dc2626"
                          : selectedDept.status === "watch"
                          ? "#d97706"
                          : "#0f766e",
                    }}
                  >
                    {isArabic
                      ? `إشغال ${Math.round((selectedDept.active / selectedDept.capacity) * 100)}%`
                      : `${Math.round((selectedDept.active / selectedDept.capacity) * 100)}% Occupancy`}
                  </span>
                </div>
              </div>

              {/* Card 2: On-duty Doctors */}
              <div
                style={{
                  padding: "14px",
                  borderRadius: "14px",
                  background: "var(--canvas, #f8fafc)",
                  border: "1px solid var(--line, #e2e8f0)",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  gap: "8px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--muted, #64748b)" }}>
                    {isArabic ? "الأطباء المناوبون" : "On-duty Physicians"}
                  </span>
                  <Stethoscope size={16} color="#0284c7" />
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
                  <strong style={{ fontSize: "22px", fontWeight: 800, color: "var(--ink, #0f172a)" }}>
                    {selectedDept.doctorsCount}
                  </strong>
                  <span style={{ fontSize: "13px", color: "var(--muted, #64748b)" }}>
                    {isArabic ? "أطباء في النوبة" : "on shift"}
                  </span>
                </div>
                <div>
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 700,
                      padding: "3px 8px",
                      borderRadius: "6px",
                      background: "#e0f2fe",
                      color: "#0369a1",
                    }}
                  >
                    {isArabic ? "أطباء واستشاريون" : "Doctors & Specialists"}
                  </span>
                </div>
              </div>

              {/* Card 3: Nursing Staff */}
              <div
                style={{
                  padding: "14px",
                  borderRadius: "14px",
                  background: "var(--canvas, #f8fafc)",
                  border: "1px solid var(--line, #e2e8f0)",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  gap: "8px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--muted, #64748b)" }}>
                    {isArabic ? "الكادر التمريضي" : "Nursing Staff"}
                  </span>
                  <Users size={16} color="#7c3aed" />
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
                  <strong style={{ fontSize: "22px", fontWeight: 800, color: "var(--ink, #0f172a)" }}>
                    {selectedDept.nursesCount}
                  </strong>
                  <span style={{ fontSize: "13px", color: "var(--muted, #64748b)" }}>
                    {isArabic ? "ممرضين مناوبين" : "active nurses"}
                  </span>
                </div>
                <div>
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 700,
                      padding: "3px 8px",
                      borderRadius: "6px",
                      background: "#f3e8ff",
                      color: "#7e22ce",
                    }}
                  >
                    {isArabic ? "تمريض معتمد" : "Licensed Nurses"}
                  </span>
                </div>
              </div>

              {/* Card 4: Daily Follow-ups */}
              <div
                style={{
                  padding: "14px",
                  borderRadius: "14px",
                  background: "var(--canvas, #f8fafc)",
                  border: "1px solid var(--line, #e2e8f0)",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  gap: "8px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--muted, #64748b)" }}>
                    {isArabic ? "متابعات اليوم" : "Today's Follow-ups"}
                  </span>
                  <Clock3 size={16} color="#ea580c" />
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
                  <strong style={{ fontSize: "22px", fontWeight: 800, color: "var(--ink, #0f172a)" }}>
                    {selectedDept.followUpDue}
                  </strong>
                  <span style={{ fontSize: "13px", color: "var(--muted, #64748b)" }}>
                    {isArabic ? "حالات مسجلة" : "active cases"}
                  </span>
                </div>
                <div>
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 700,
                      padding: "3px 8px",
                      borderRadius: "6px",
                      background: "#ffedd5",
                      color: "#c2410c",
                    }}
                  >
                    {isArabic ? "بانتظار الفحص" : "Awaiting Review"}
                  </span>
                </div>
              </div>
            </div>

            {/* Supervising Department Head Profile */}
            <div
              style={{
                padding: "14px 16px",
                borderRadius: "14px",
                background: "var(--canvas, #f8fafc)",
                border: "1px solid var(--line, #e2e8f0)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "20px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div
                  style={{
                    width: "40px",
                    height: "40px",
                    borderRadius: "50%",
                    background: "rgba(13, 148, 136, 0.12)",
                    color: "var(--teal, #0d9488)",
                    display: "grid",
                    placeItems: "center",
                    fontWeight: 700,
                    fontSize: "15px",
                  }}
                >
                  <Users size={18} />
                </div>
                <div>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted, #64748b)" }}>
                    {isArabic ? "رئيس القسم المشرف" : "Supervising Head of Department"}
                  </div>
                  <div style={{ fontSize: "15px", fontWeight: 700, color: "var(--ink, #0f172a)", marginTop: "2px" }}>
                    {isArabic ? selectedDept.head : selectedDept.headEn}
                  </div>
                </div>
              </div>
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  padding: "4px 10px",
                  borderRadius: "20px",
                  background: "#e0f2fe",
                  color: "#0369a1",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <CheckCircle2 size={12} />
                {isArabic ? "اعتماد سريري" : "Board Certified"}
              </span>
            </div>

            {/* Modal Actions Footer */}
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                alignItems: "center",
                gap: "10px",
                paddingTop: "14px",
                borderTop: "1px solid var(--line, #e2e8f0)",
              }}
            >
              <button
                type="button"
                className="outline-btn"
                onClick={() => setSelectedDept(null)}
                style={{
                  minHeight: "42px",
                  padding: "0 18px",
                  borderRadius: "10px",
                  fontWeight: 600,
                }}
              >
                {isArabic ? "إغلاق" : "Close"}
              </button>
              <button
                type="button"
                className="primary-btn"
                onClick={() => {
                  setSelectedDept(null);
                  window.location.hash = "#app/patients";
                }}
                style={{
                  minHeight: "42px",
                  padding: "0 20px",
                  borderRadius: "10px",
                  fontWeight: 700,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  boxShadow: "0 4px 14px rgba(13, 148, 136, 0.3)",
                }}
              >
                <ExternalLink size={16} /> {isArabic ? "عرض مرضى وسجلات القسم" : "View Department Patients"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= ADD DEPARTMENT MODAL ================= */}
      {showAddModal && (
        <div className="modal-backdrop" onClick={() => setShowAddModal(false)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            style={{ maxWidth: "460px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="patient-modal-heading" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h2>{isArabic ? "إضافة قسم / عيادة جديدة" : "Add New Department / Clinic"}</h2>
                <p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: "12px" }}>
                  {isArabic
                    ? "حدد اسم القسم والطاقة الاستيعابية ورئيس القسم"
                    : "Specify department name, capacity, and supervising lead"}
                </p>
              </div>
              <button
                className="icon-button"
                type="button"
                onClick={() => setShowAddModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddDepartment} style={{ marginTop: "16px" }}>
              <label style={{ display: "block", marginBottom: "12px" }}>
                <span style={{ fontSize: "12px", fontWeight: "bold" }}>
                  {isArabic ? "اسم القسم أو العيادة *" : "Department / Clinic Name *"}
                </span>
                <input
                  type="text"
                  required
                  value={newDeptName}
                  onChange={(e) => setNewDeptName(e.target.value)}
                  placeholder={isArabic ? "مثال: جراحة المخ والأعصاب" : "e.g., Neurosurgery"}
                  style={{ width: "100%", marginTop: "6px" }}
                />
              </label>

              <label style={{ display: "block", marginBottom: "12px" }}>
                <span style={{ fontSize: "12px", fontWeight: "bold" }}>
                  {isArabic ? "رئيس القسم المشرف" : "Supervising Head"}
                </span>
                <input
                  type="text"
                  value={newDeptHead}
                  onChange={(e) => setNewDeptHead(e.target.value)}
                  placeholder={isArabic ? "مثال: د. حسام فتحي" : "e.g., Dr. Hossam Fathy"}
                  style={{ width: "100%", marginTop: "6px" }}
                />
              </label>

              <label style={{ display: "block", marginBottom: "16px" }}>
                <span style={{ fontSize: "12px", fontWeight: "bold" }}>
                  {isArabic
                    ? "الطاقة الاستيعابية (عدد الأسرة / الحالات)"
                    : "Capacity (Beds / Caseload)"}
                </span>
                <input
                  type="number"
                  min="1"
                  max="500"
                  value={newDeptCapacity}
                  onChange={(e) => setNewDeptCapacity(Number(e.target.value))}
                  style={{ width: "100%", marginTop: "6px" }}
                />
              </label>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                <button
                  type="button"
                  className="outline-btn"
                  onClick={() => setShowAddModal(false)}
                >
                  {isArabic ? "إلغاء" : "Cancel"}
                </button>
                <button type="submit" className="primary-btn">
                  {isArabic ? "حفظ وتفعيل القسم" : "Save & Activate"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

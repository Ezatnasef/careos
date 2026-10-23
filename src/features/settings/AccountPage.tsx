import { useState } from "react";
import {
  Building2,
  CheckCircle2,
  Copy,
  FolderGit2,
  Hospital,
  KeyRound,
  LogOut,
  ShieldCheck,
  UserCheck,
  UserRound,
} from "lucide-react";
import { PageHeading } from "../../components/PageHeading";
import type { TranslationKey } from "../../i18n";
import type { Role } from "../workspace/navigation";

type Translator = (key: TranslationKey) => string;
type AccountPageProps = {
  doctorName: string;
  role: Role;
  department: string;
  project: string;
  onLogout: () => Promise<void>;
  t: Translator;
};

export function AccountPage({
  doctorName,
  role,
  department,
  project,
  onLogout,
  t,
}: AccountPageProps) {
  const [copied, setCopied] = useState(false);
  const isArabic = typeof document !== "undefined" && document.documentElement.dir === "rtl";

  const roleKeys: Partial<Record<Role, TranslationKey>> = {
    admin: "roleAdminLabel",
    doctor: "roleDoctorLabel",
    nurse: "roleNurseLabel",
    receptionist: "roleReceptionistLabel",
    hospital_director: "roleDirectorLabel",
    it_admin: "roleItAdminLabel",
    administrative_staff: "roleStaffLabel",
    patient: "rolePatientLabel",
  };
  const roleLabel = roleKeys[role] ? t(roleKeys[role]!) : role.replaceAll("_", " ");

  const handleCopyId = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText("USR-" + role.toUpperCase() + "-0824");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div style={{ maxWidth: "1080px", margin: "0 auto", paddingBottom: "40px" }}>
      <PageHeading
        eyebrow={t("accountEyebrow")}
        title={doctorName}
        detail={t("accountDetail")}
      />

      {/* Hero Profile Banner Card */}
      <section
        style={{
          background: "var(--paper, #ffffff)",
          border: "1px solid var(--line, #e2e8f0)",
          borderRadius: "18px",
          overflow: "hidden",
          boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.03)",
          marginBottom: "24px",
        }}
      >
        {/* Decorative Top Banner */}
        <div
          style={{
            height: "90px",
            background: "linear-gradient(135deg, rgba(13, 148, 136, 0.85) 0%, rgba(20, 184, 166, 0.75) 50%, rgba(14, 165, 233, 0.7) 100%)",
            position: "relative",
          }}
        />

        {/* Profile Content */}
        <div
          style={{
            padding: "0 28px 24px",
            position: "relative",
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            alignItems: "flex-end",
            gap: "16px",
          }}
        >
          {/* Avatar & Main Info */}
          <div style={{ display: "flex", alignItems: "flex-end", gap: "18px", marginTop: "-44px" }}>
            <div style={{ position: "relative" }}>
              <div
                style={{
                  width: "88px",
                  height: "88px",
                  borderRadius: "50%",
                  background: "#ffffff",
                  border: "4px solid #ffffff",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
                  display: "grid",
                  placeItems: "center",
                  color: "var(--teal, #0d9488)",
                }}
              >
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    borderRadius: "50%",
                    background: "rgba(13, 148, 136, 0.12)",
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  <UserRound size={42} />
                </div>
              </div>
              {/* Online Active Indicator Dot */}
              <span
                style={{
                  position: "absolute",
                  bottom: "4px",
                  right: isArabic ? "auto" : "4px",
                  left: isArabic ? "4px" : "auto",
                  width: "16px",
                  height: "16px",
                  borderRadius: "50%",
                  background: "#22c55e",
                  border: "3px solid #ffffff",
                }}
                title={isArabic ? "جلسة متصلة ونشطة" : "Active session"}
              />
            </div>

            <div style={{ paddingBottom: "4px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                <h1 style={{ margin: 0, fontSize: "22px", fontWeight: 800, color: "var(--ink, #0f172a)" }}>
                  {doctorName}
                </h1>
                <span
                  style={{
                    fontSize: "12px",
                    fontWeight: 700,
                    padding: "3px 10px",
                    borderRadius: "20px",
                    background: "rgba(13, 148, 136, 0.12)",
                    color: "var(--teal, #0d9488)",
                    border: "1px solid rgba(13, 148, 136, 0.2)",
                  }}
                >
                  {roleLabel}
                </span>
              </div>
              <p style={{ margin: "4px 0 0", fontSize: "13px", color: "var(--muted, #64748b)" }}>
                {department} · {project}
              </p>
            </div>
          </div>

          {/* Quick User Reference ID Tag */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "6px 12px",
              borderRadius: "10px",
              background: "var(--canvas, #f8fafc)",
              border: "1px solid var(--line, #e2e8f0)",
              fontSize: "12px",
            }}
          >
            <span style={{ color: "var(--muted, #64748b)" }}>{isArabic ? "معرف المستخدم:" : "User ID:"}</span>
            <code style={{ fontWeight: 700, color: "var(--ink, #0f172a)", direction: "ltr" }}>
              USR-{role.toUpperCase().slice(0, 3)}-0824
            </code>
            <button
              type="button"
              onClick={handleCopyId}
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: "2px",
                color: copied ? "#10b981" : "var(--muted, #64748b)",
                display: "grid",
                placeItems: "center",
              }}
              title={isArabic ? "نسخ المعرف" : "Copy ID"}
            >
              {copied ? <CheckCircle2 size={14} color="#10b981" /> : <Copy size={14} />}
            </button>
          </div>
        </div>
      </section>

      {/* Two Balanced Content Cards */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: "20px",
        }}
      >
        {/* Card 1: Clinical & Workplace Information */}
        <div
          style={{
            background: "var(--paper, #ffffff)",
            border: "1px solid var(--line, #e2e8f0)",
            borderRadius: "16px",
            padding: "22px 24px",
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.03)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              paddingBottom: "14px",
              borderBottom: "1px solid var(--line, #e2e8f0)",
              marginBottom: "16px",
            }}
          >
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "10px",
                background: "rgba(13, 148, 136, 0.1)",
                color: "var(--teal, #0d9488)",
                display: "grid",
                placeItems: "center",
              }}
            >
              <Building2 size={18} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "var(--ink, #0f172a)" }}>
                {isArabic ? "بيانات العمل والمنشأة" : "Workplace & Clinical Assignment"}
              </h2>
              <span style={{ fontSize: "12px", color: "var(--muted, #64748b)" }}>
                {isArabic ? "تفاصيل القسم والمنظومة التشغيلية" : "Department & operational scope"}
              </span>
            </div>
          </div>

          <div style={{ display: "grid", gap: "12px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "10px 12px",
                borderRadius: "10px",
                background: "var(--canvas, #f8fafc)",
              }}
            >
              <span style={{ fontSize: "13px", color: "var(--muted, #64748b)", display: "flex", alignItems: "center", gap: "6px" }}>
                <Building2 size={15} color="#0d9488" />
                {t("department")}
              </span>
              <strong style={{ fontSize: "13px", color: "var(--ink, #0f172a)" }}>{department}</strong>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "10px 12px",
                borderRadius: "10px",
                background: "var(--canvas, #f8fafc)",
              }}
            >
              <span style={{ fontSize: "13px", color: "var(--muted, #64748b)", display: "flex", alignItems: "center", gap: "6px" }}>
                <FolderGit2 size={15} color="#0d9488" />
                {t("projectLabel")}
              </span>
              <strong style={{ fontSize: "13px", color: "var(--ink, #0f172a)" }}>{project}</strong>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "10px 12px",
                borderRadius: "10px",
                background: "var(--canvas, #f8fafc)",
              }}
            >
              <span style={{ fontSize: "13px", color: "var(--muted, #64748b)", display: "flex", alignItems: "center", gap: "6px" }}>
                <Hospital size={15} color="#0d9488" />
                {t("workspaceLabel")}
              </span>
              <strong style={{ fontSize: "13px", color: "var(--ink, #0f172a)" }}>{t("demoHospitalName")}</strong>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "10px 12px",
                borderRadius: "10px",
                background: "var(--canvas, #f8fafc)",
              }}
            >
              <span style={{ fontSize: "13px", color: "var(--muted, #64748b)", display: "flex", alignItems: "center", gap: "6px" }}>
                <UserCheck size={15} color="#0d9488" />
                {isArabic ? "حالة الحساب" : "Account Status"}
              </span>
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  padding: "2px 8px",
                  borderRadius: "6px",
                  background: "#dcfce7",
                  color: "#15803d",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <CheckCircle2 size={12} />
                {isArabic ? "مفعل وموثق" : "Verified & Active"}
              </span>
            </div>
          </div>
        </div>

        {/* Card 2: Security & Session Access */}
        <div
          style={{
            background: "var(--paper, #ffffff)",
            border: "1px solid var(--line, #e2e8f0)",
            borderRadius: "16px",
            padding: "22px 24px",
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.03)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                paddingBottom: "14px",
                borderBottom: "1px solid var(--line, #e2e8f0)",
                marginBottom: "16px",
              }}
            >
              <div
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "10px",
                  background: "rgba(13, 148, 136, 0.1)",
                  color: "var(--teal, #0d9488)",
                  display: "grid",
                  placeItems: "center",
                }}
              >
                <ShieldCheck size={18} />
              </div>
              <div>
                <h2 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "var(--ink, #0f172a)" }}>
                  {t("accountSecurity")}
                </h2>
                <span style={{ fontSize: "12px", color: "var(--muted, #64748b)" }}>
                  {t("reviewSessionAccess")}
                </span>
              </div>
            </div>

            <div style={{ display: "grid", gap: "12px", marginBottom: "20px" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "10px 12px",
                  borderRadius: "10px",
                  background: "var(--canvas, #f8fafc)",
                }}
              >
                <span style={{ fontSize: "13px", color: "var(--muted, #64748b)", display: "flex", alignItems: "center", gap: "6px" }}>
                  <KeyRound size={15} color="#0d9488" />
                  {t("roleAccess")}
                </span>
                <strong style={{ fontSize: "13px", color: "var(--ink, #0f172a)" }}>{roleLabel}</strong>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "10px 12px",
                  borderRadius: "10px",
                  background: "var(--canvas, #f8fafc)",
                }}
              >
                <span style={{ fontSize: "13px", color: "var(--muted, #64748b)", display: "flex", alignItems: "center", gap: "6px" }}>
                  <ShieldCheck size={15} color="#0d9488" />
                  {t("sessionLabel")}
                </span>
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    padding: "2px 8px",
                    borderRadius: "6px",
                    background: "#dcfce7",
                    color: "#15803d",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  <CheckCircle2 size={12} />
                  {t("activeStatus")}
                </span>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "10px 12px",
                  borderRadius: "10px",
                  background: "var(--canvas, #f8fafc)",
                }}
              >
                <span style={{ fontSize: "13px", color: "var(--muted, #64748b)" }}>
                  {isArabic ? "بروتوكول الأمان" : "Security Protocol"}
                </span>
                <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--ink, #0f172a)" }}>
                  TLS 1.3 / RBAC Secured
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void onLogout()}
            style={{
              width: "100%",
              minHeight: "44px",
              borderRadius: "10px",
              border: "1px solid #fca5a5",
              background: "#fff1f2",
              color: "#e11d48",
              fontSize: "13px",
              fontWeight: 700,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#e11d48";
              e.currentTarget.style.color = "#ffffff";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "#fff1f2";
              e.currentTarget.style.color = "#e11d48";
            }}
          >
            <LogOut size={16} /> {t("signOut")}
          </button>
        </div>
      </section>
    </div>
  );
}


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
  const isArabic = typeof document !== "undefined" && (document.documentElement.dir === "rtl" || document.dir === "rtl" || document.querySelector(".app-shell")?.getAttribute("dir") === "rtl" || t("workspace") === "مساحة العمل");

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
          borderRadius: "20px",
          overflow: "hidden",
          boxShadow: "0 10px 30px -5px rgba(0, 0, 0, 0.05), 0 4px 12px -2px rgba(0, 0, 0, 0.025)",
          marginBottom: "28px",
        }}
      >
        {/* Decorative Top Banner */}
        <div
          style={{
            height: "125px",
            background: "linear-gradient(135deg, #0e8774 0%, #14b8a6 45%, #0284c7 100%)",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* Subtle Ambient Glow and Hospital Watermark */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "radial-gradient(circle at 15% 30%, rgba(255, 255, 255, 0.22) 0%, transparent 45%), radial-gradient(circle at 85% 75%, rgba(255, 255, 255, 0.15) 0%, transparent 50%)",
              pointerEvents: "none",
            }}
          />
          <Hospital
            size={110}
            style={{
              position: "absolute",
              top: "-15px",
              insetInlineEnd: "24px",
              color: "#ffffff",
              opacity: 0.12,
              pointerEvents: "none",
            }}
          />
        </div>

        {/* Profile Content Body */}
        <div
          style={{
            padding: "0 32px 28px",
            position: "relative",
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            alignItems: "flex-end",
            gap: "20px",
          }}
        >
          {/* Left Column: Avatar + Profile Titles */}
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: "22px",
              flexWrap: "wrap",
            }}
          >
            {/* Avatar Circle - positioned precisely overlapping the banner */}
            <div
              style={{
                position: "relative",
                marginTop: "-52px",
                flexShrink: 0,
                zIndex: 2,
              }}
            >
              <div
                style={{
                  width: "98px",
                  height: "98px",
                  borderRadius: "50%",
                  background: "var(--paper, #ffffff)",
                  border: "4px solid var(--paper, #ffffff)",
                  boxShadow: "0 10px 25px -4px rgba(14, 135, 116, 0.25), 0 4px 10px rgba(0, 0, 0, 0.08)",
                  display: "grid",
                  placeItems: "center",
                  color: "var(--teal, #0e8774)",
                }}
              >
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    borderRadius: "50%",
                    background: "linear-gradient(135deg, rgba(14, 135, 116, 0.12) 0%, rgba(20, 184, 166, 0.22) 100%)",
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  <UserRound size={46} strokeWidth={2.2} />
                </div>
              </div>

              {/* Online Active Status Indicator Dot */}
              <span
                style={{
                  position: "absolute",
                  bottom: "4px",
                  insetInlineEnd: "4px",
                  width: "18px",
                  height: "18px",
                  borderRadius: "50%",
                  background: "#10b981",
                  border: "3.5px solid var(--paper, #ffffff)",
                  boxShadow: "0 0 0 2px rgba(16, 185, 129, 0.25)",
                }}
                title={isArabic ? "جلسة متصلة ونشطة" : "Active session"}
              />
            </div>

            {/* User Name, Role Chip & Details */}
            <div style={{ paddingTop: "12px", minWidth: "220px" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  flexWrap: "wrap",
                }}
              >
                <h1
                  style={{
                    margin: 0,
                    fontSize: "24px",
                    fontWeight: 800,
                    color: "var(--ink, #0f172a)",
                    letterSpacing: "-0.02em",
                  }}
                >
                  {doctorName}
                </h1>

                {/* Role Chip */}
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                    fontSize: "12px",
                    fontWeight: 700,
                    padding: "4px 12px",
                    borderRadius: "9999px",
                    background: "rgba(14, 135, 116, 0.1)",
                    color: "var(--teal, #0e8774)",
                    border: "1px solid rgba(14, 135, 116, 0.24)",
                  }}
                >
                  <ShieldCheck size={13} strokeWidth={2.5} />
                  <span>{roleLabel}</span>
                </span>

                {/* Active Status Badge */}
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    fontSize: "11px",
                    fontWeight: 600,
                    padding: "3px 10px",
                    borderRadius: "9999px",
                    background: "rgba(16, 185, 129, 0.1)",
                    color: "#059669",
                  }}
                >
                  <span
                    style={{
                      width: "6px",
                      height: "6px",
                      borderRadius: "50%",
                      background: "#10b981",
                    }}
                  />
                  <span>{isArabic ? "نشط الآن" : "Active"}</span>
                </span>
              </div>

              {/* Subtitle / Department & Workspace */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "16px",
                  marginTop: "8px",
                  fontSize: "13px",
                  color: "var(--muted, #64748b)",
                  flexWrap: "wrap",
                }}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                  <Building2 size={14} style={{ color: "var(--teal, #0e8774)" }} />
                  <span>{department || (isArabic ? "الطب العام" : "General Medicine")}</span>
                </span>

                <span style={{ color: "var(--line, #cbd5e1)", fontSize: "12px" }}>•</span>

                <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                  <FolderGit2 size={14} style={{ color: "var(--teal, #0e8774)" }} />
                  <span>{project || (isArabic ? "مساحة العمل" : "Workspace")}</span>
                </span>
              </div>
            </div>
          </div>

          {/* Right Column: User ID Chip with Copy Action */}
          <div
            style={{
              paddingTop: "12px",
              display: "flex",
              alignItems: "center",
            }}
          >
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "10px",
                padding: "8px 16px",
                borderRadius: "14px",
                background: "var(--canvas, #f8fafc)",
                border: "1px solid var(--line, #e2e8f0)",
                boxShadow: "0 2px 6px rgba(0, 0, 0, 0.02)",
              }}
            >
              <div
                style={{
                  width: "28px",
                  height: "28px",
                  borderRadius: "8px",
                  background: "rgba(14, 135, 116, 0.1)",
                  color: "var(--teal, #0e8774)",
                  display: "grid",
                  placeItems: "center",
                  flexShrink: 0,
                }}
              >
                <KeyRound size={15} />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    color: "var(--muted, #64748b)",
                    lineHeight: 1,
                  }}
                >
                  {isArabic ? "معرّف الحساب" : "User ID"}
                </span>
                <span
                  style={{
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                    fontWeight: 700,
                    fontSize: "13px",
                    color: "var(--ink, #0f172a)",
                    direction: "ltr",
                    letterSpacing: "0.5px",
                    lineHeight: 1.2,
                  }}
                >
                  USR-{role.toUpperCase().slice(0, 3)}-0824
                </span>
              </div>

              <button
                type="button"
                onClick={handleCopyId}
                style={{
                  background: copied ? "rgba(16, 185, 129, 0.12)" : "var(--paper, #ffffff)",
                  border: `1px solid ${copied ? "#10b981" : "var(--line, #e2e8f0)"}`,
                  borderRadius: "8px",
                  cursor: "pointer",
                  padding: "6px 8px",
                  color: copied ? "#059669" : "var(--muted, #64748b)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                  fontSize: "11px",
                  fontWeight: 600,
                  transition: "all 0.15s ease",
                  marginInlineStart: "6px",
                }}
                title={isArabic ? "نسخ المعرّف" : "Copy ID"}
              >
                {copied ? (
                  <>
                    <CheckCircle2 size={13} color="#059669" />
                    <span>{isArabic ? "تم النسخ" : "Copied"}</span>
                  </>
                ) : (
                  <>
                    <Copy size={13} />
                    <span>{isArabic ? "نسخ" : "Copy"}</span>
                  </>
                )}
              </button>
            </div>
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


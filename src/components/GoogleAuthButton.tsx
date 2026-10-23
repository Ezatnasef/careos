import { useState } from "react";
import { CheckCircle2, ShieldCheck, Sparkles, X } from "lucide-react";

export function GoogleIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "inline-block", verticalAlign: "middle", flexShrink: 0 }}
      aria-hidden="true"
    >
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
        fill="#EA4335"
      />
    </svg>
  );
}

export type GoogleUserPayload = {
  fullName: string;
  email: string;
  avatarUrl?: string;
  verified: boolean;
};

type GoogleAuthModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: GoogleUserPayload) => void;
  target: "patient" | "visitor";
  language: "ar" | "en";
};

export function GoogleAuthModal({
  isOpen,
  onClose,
  onSuccess,
  target,
  language,
}: GoogleAuthModalProps) {
  const isAr = language === "ar";
  const [customName, setCustomName] = useState("");
  const [customEmail, setCustomEmail] = useState("");
  const [selectedDemoAccount, setSelectedDemoAccount] = useState<number | null>(null);

  if (!isOpen) return null;

  const defaultAccounts: GoogleUserPayload[] = [
    {
      fullName: isAr ? "مريم حسن" : "Mariam Hassan",
      email: "mariam.hassan.patient@gmail.com",
      verified: true,
    },
    {
      fullName: isAr ? "أحمد منصور الزائر" : "Ahmed Mansour (Visitor)",
      email: "ahmed.mansour.visitor@gmail.com",
      verified: true,
    },
  ];

  const handleSelect = (account: GoogleUserPayload) => {
    onSuccess(account);
    onClose();
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customEmail) return;
    const name = customName.trim() || customEmail.split("@")[0].replace(/[._]/g, " ");
    onSuccess({
      fullName: name,
      email: customEmail.trim().toLowerCase(),
      verified: true,
    });
    onClose();
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        background: "rgba(15, 23, 42, 0.65)",
        backdropFilter: "blur(6px)",
        display: "grid",
        placeItems: "center",
        padding: "16px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--paper, #ffffff)",
          border: "1px solid var(--line, #e2e8f0)",
          borderRadius: "20px",
          width: "100%",
          maxWidth: "460px",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          padding: "24px 28px",
          direction: isAr ? "rtl" : "ltr",
          position: "relative",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          style={{
            position: "absolute",
            top: "16px",
            insetInlineEnd: "16px",
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--muted, #64748b)",
            padding: "4px",
            display: "grid",
            placeItems: "center",
          }}
          aria-label={isAr ? "إغلاق" : "Close"}
        >
          <X size={18} />
        </button>

        {/* Modal Header */}
        <div style={{ textAlign: "center", marginBottom: "20px" }}>
          <div
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "50%",
              background: "#ffffff",
              boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
              border: "1px solid #e2e8f0",
              margin: "0 auto 12px",
              display: "grid",
              placeItems: "center",
            }}
          >
            <GoogleIcon size={24} />
          </div>

          <h3 style={{ margin: "0 0 6px", fontSize: "18px", fontWeight: 800, color: "var(--ink, #0f172a)" }}>
            {isAr
              ? target === "patient"
                ? "الدخول السريع كـ مريض عبر Google"
                : "تسجيل كزائر وتجربة النظام عبر Google"
              : target === "patient"
              ? "Sign in with Google as Patient"
              : "Register as Visitor via Google"}
          </h3>
          <p style={{ margin: 0, fontSize: "13px", color: "var(--muted, #64748b)" }}>
            {isAr
              ? "اختر حسابك المعتمد أو أدخل بريد الـ Gmail للمتابعة فوراً"
              : "Choose an active Google account or enter your Gmail"}
          </p>
        </div>

        {/* Quick Google Profile Selection */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "18px" }}>
          {defaultAccounts.map((acc, idx) => (
            <button
              key={acc.email}
              type="button"
              onClick={() => handleSelect(acc)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 14px",
                borderRadius: "12px",
                border: "1px solid var(--line, #e2e8f0)",
                background: "var(--canvas, #f8fafc)",
                cursor: "pointer",
                textAlign: isAr ? "right" : "left",
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--teal, #0e8774)";
                e.currentTarget.style.background = "rgba(14, 135, 116, 0.05)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--line, #e2e8f0)";
                e.currentTarget.style.background = "var(--canvas, #f8fafc)";
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "50%",
                    background: idx === 0 ? "#e0e7ff" : "#fef3c7",
                    color: idx === 0 ? "#4338ca" : "#b45309",
                    display: "grid",
                    placeItems: "center",
                    fontWeight: 700,
                    fontSize: "14px",
                  }}
                >
                  {acc.fullName.charAt(0)}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: "13px", color: "var(--ink, #0f172a)" }}>
                    {acc.fullName}
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--muted, #64748b)" }}>
                    {acc.email}
                  </div>
                </div>
              </div>
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "#059669",
                  background: "rgba(16, 185, 129, 0.1)",
                  padding: "2px 8px",
                  borderRadius: "20px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <CheckCircle2 size={12} />
                <span>{isAr ? "موثق" : "Verified"}</span>
              </span>
            </button>
          ))}
        </div>

        {/* Divider */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            margin: "16px 0",
            color: "var(--muted, #94a3b8)",
            fontSize: "12px",
          }}
        >
          <div style={{ flex: 1, height: "1px", background: "var(--line, #e2e8f0)" }} />
          <span>{isAr ? "أو استخدام بريد Google آخر" : "Or use another Google account"}</span>
          <div style={{ flex: 1, height: "1px", background: "var(--line, #e2e8f0)" }} />
        </div>

        {/* Custom Gmail Form */}
        <form onSubmit={handleCustomSubmit} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--ink, #0f172a)", marginBottom: "4px" }}>
              {isAr ? "الاسم الكامل" : "Full Name"}
            </label>
            <input
              type="text"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder={isAr ? "مثال: د. حسام فتحي أو محمد علي" : "e.g. John Doe"}
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: "10px",
                border: "1px solid var(--line, #e2e8f0)",
                background: "var(--paper, #ffffff)",
                fontSize: "13px",
                color: "var(--ink, #0f172a)",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--ink, #0f172a)", marginBottom: "4px" }}>
              {isAr ? "بريد Google (Gmail)" : "Google Account Email"}
            </label>
            <input
              type="email"
              required
              value={customEmail}
              onChange={(e) => setCustomEmail(e.target.value)}
              placeholder="username@gmail.com"
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: "10px",
                border: "1px solid var(--line, #e2e8f0)",
                background: "var(--paper, #ffffff)",
                fontSize: "13px",
                color: "var(--ink, #0f172a)",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          <button
            type="submit"
            style={{
              marginTop: "8px",
              padding: "11px",
              borderRadius: "10px",
              border: "none",
              background: "var(--teal, #0e8774)",
              color: "#ffffff",
              fontWeight: 700,
              fontSize: "14px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              boxShadow: "0 4px 12px rgba(14, 135, 116, 0.25)",
            }}
          >
            <GoogleIcon size={16} />
            <span>
              {isAr
                ? target === "patient"
                  ? "المتابعة بحساب Google والدخول"
                  : "تسجيل الزائر وتجربة المنصة فوراً"
                : target === "patient"
                ? "Continue & Enter Patient Portal"
                : "Register Lead & Try Demo"}
            </span>
          </button>
        </form>
      </div>
    </div>
  );
}

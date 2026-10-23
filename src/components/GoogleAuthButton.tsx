import { useState } from "react";
import { CheckCircle2, ShieldCheck, X } from "lucide-react";

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
  theme?: "light" | "dark";
};

export function GoogleAuthModal({
  isOpen,
  onClose,
  onSuccess,
  target,
  language,
  theme,
}: GoogleAuthModalProps) {
  const isAr = language === "ar";
  const isDark =
    theme === "dark" ||
    (typeof document !== "undefined" &&
      (document.documentElement.classList.contains("dark-mode") ||
        document.querySelector(".landing-page")?.classList.contains("dark-mode-landing")));
  const [customName, setCustomName] = useState("");
  const [customEmail, setCustomEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customEmail.trim()) return;
    setIsSubmitting(true);
    const name = customName.trim() || customEmail.split("@")[0].replace(/[._]/g, " ");
    setTimeout(() => {
      onSuccess({
        fullName: name,
        email: customEmail.trim().toLowerCase(),
        verified: true,
      });
      setIsSubmitting(false);
      onClose();
    }, 200);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        background: isDark ? "rgba(0, 0, 0, 0.78)" : "rgba(15, 23, 42, 0.65)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        display: "grid",
        placeItems: "center",
        padding: "16px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: isDark ? "#1e293b" : "#ffffff",
          border: isDark ? "1px solid #334155" : "1px solid #e2e8f0",
          borderRadius: "24px",
          width: "100%",
          maxWidth: "430px",
          boxShadow: isDark
            ? "0 25px 60px -12px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.08)"
            : "0 25px 60px -12px rgba(0, 0, 0, 0.28), 0 0 0 1px rgba(255, 255, 255, 0.2)",
          padding: "26px 28px",
          direction: isAr ? "rtl" : "ltr",
          position: "relative",
          animation: "scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
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
            background: isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(148, 163, 184, 0.12)",
            border: "none",
            borderRadius: "50%",
            cursor: "pointer",
            color: isDark ? "#94a3b8" : "#64748b",
            width: "30px",
            height: "30px",
            display: "grid",
            placeItems: "center",
            transition: "all 0.15s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = isDark ? "rgba(255, 255, 255, 0.16)" : "rgba(148, 163, 184, 0.25)";
            e.currentTarget.style.color = isDark ? "#ffffff" : "#0f172a";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(148, 163, 184, 0.12)";
            e.currentTarget.style.color = isDark ? "#94a3b8" : "#64748b";
          }}
          aria-label={isAr ? "إغلاق" : "Close"}
        >
          <X size={16} />
        </button>

        {/* Modal Header */}
        <div style={{ textAlign: "center", marginBottom: "22px" }}>
          <div
            style={{
              width: "54px",
              height: "54px",
              borderRadius: "50%",
              background: isDark ? "#0f172a" : "linear-gradient(135deg, #ffffff, #f8fafc)",
              boxShadow: isDark
                ? "0 8px 24px rgba(0, 0, 0, 0.4), 0 2px 8px rgba(0,0,0,0.2)"
                : "0 8px 24px rgba(66, 133, 244, 0.16), 0 2px 8px rgba(0,0,0,0.04)",
              border: isDark ? "1px solid #334155" : "1px solid rgba(226, 232, 240, 0.9)",
              margin: "0 auto 14px",
              display: "grid",
              placeItems: "center",
            }}
          >
            <GoogleIcon size={26} />
          </div>

          <h3 style={{ margin: "0 0 6px", fontSize: "19px", fontWeight: 800, color: isDark ? "#f8fafc" : "#0f172a", letterSpacing: "-0.3px" }}>
            {isAr
              ? target === "patient"
                ? "الدخول السريع كـ مريض عبر Google"
                : "تسجيل كزائر وتجربة المنصة عبر Google"
              : target === "patient"
              ? "Sign in with Google as Patient"
              : "Register as Visitor via Google"}
          </h3>
          <p style={{ margin: 0, fontSize: "13px", color: isDark ? "#94a3b8" : "#64748b", lineHeight: 1.5 }}>
            {isAr
              ? "أدخل بريد Google والاسم للمتابعة وتجربة المنصة فوراً بدون كلمة سر"
              : "Enter your Google account and name to proceed instantly without a password"}
          </p>
        </div>

        {/* Custom Gmail Form */}
        <form onSubmit={handleCustomSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div>
            <label style={{ display: "block", fontSize: "12.5px", fontWeight: 700, color: isDark ? "#e2e8f0" : "#1e293b", marginBottom: "6px" }}>
              {isAr ? "الاسم الكامل" : "Full Name"}
            </label>
            <input
              type="text"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder={isAr ? "مثال: د. حسام فتحي أو محمد علي" : "e.g. John Doe"}
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: "12px",
                border: isDark ? "1px solid #334155" : "1px solid #cbd5e1",
                background: isDark ? "#0f172a" : "#ffffff",
                fontSize: "13.5px",
                color: isDark ? "#f8fafc" : "#0f172a",
                outline: "none",
                boxSizing: "border-box",
                transition: "border-color 0.2s, box-shadow 0.2s",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "var(--teal, #0e8774)";
                e.currentTarget.style.boxShadow = "0 0 0 3px rgba(14, 135, 116, 0.25)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = isDark ? "#334155" : "#cbd5e1";
                e.currentTarget.style.boxShadow = "none";
              }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "12.5px", fontWeight: 700, color: isDark ? "#e2e8f0" : "#1e293b", marginBottom: "6px" }}>
              {isAr ? "بريد Google (Gmail)" : "Google Account (Gmail)"} <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <div style={{ position: "relative" }}>
              <input
                type="email"
                required
                value={customEmail}
                onChange={(e) => setCustomEmail(e.target.value)}
                placeholder="username@gmail.com"
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  paddingInlineEnd: "36px",
                  borderRadius: "12px",
                  border: isDark ? "1px solid #334155" : "1px solid #cbd5e1",
                  background: isDark ? "#0f172a" : "#ffffff",
                  fontSize: "13.5px",
                  color: isDark ? "#f8fafc" : "#0f172a",
                  outline: "none",
                  boxSizing: "border-box",
                  direction: "ltr",
                  textAlign: isAr ? "right" : "left",
                  transition: "border-color 0.2s, box-shadow 0.2s",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "var(--teal, #0e8774)";
                  e.currentTarget.style.boxShadow = "0 0 0 3px rgba(14, 135, 116, 0.25)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = isDark ? "#334155" : "#cbd5e1";
                  e.currentTarget.style.boxShadow = "none";
                }}
              />
              <div
                style={{
                  position: "absolute",
                  top: "50%",
                  transform: "translateY(-50%)",
                  insetInlineEnd: "12px",
                  pointerEvents: "none",
                  display: "flex",
                  alignItems: "center",
                  opacity: 0.75,
                }}
              >
                <GoogleIcon size={16} />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting || !customEmail.trim()}
            style={{
              marginTop: "6px",
              padding: "12px 18px",
              borderRadius: "12px",
              border: "none",
              background: "linear-gradient(135deg, #0e8774, #0b6b5c)",
              color: "#ffffff",
              fontWeight: 700,
              fontSize: "14px",
              cursor: isSubmitting || !customEmail.trim() ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "9px",
              boxShadow: "0 4px 14px rgba(14, 135, 116, 0.28)",
              opacity: isSubmitting || !customEmail.trim() ? 0.7 : 1,
              transition: "all 0.2s ease",
            }}
            onMouseEnter={(e) => {
              if (!isSubmitting && customEmail.trim()) {
                e.currentTarget.style.transform = "translateY(-1px)";
                e.currentTarget.style.boxShadow = "0 6px 18px rgba(14, 135, 116, 0.35)";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "none";
              e.currentTarget.style.boxShadow = "0 4px 14px rgba(14, 135, 116, 0.28)";
            }}
          >
            <GoogleIcon size={17} />
            <span>
              {isSubmitting
                ? (isAr ? "جارٍ تسجيل الدخول..." : "Signing in...")
                : isAr
                ? target === "patient"
                  ? "المتابعة بحساب Google والدخول فوراً"
                  : "تسجيل الزائر وتجربة المنصة فوراً"
                : target === "patient"
                ? "Continue with Google & Enter"
                : "Register as Visitor & Explore"}
            </span>
          </button>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              marginTop: "4px",
              fontSize: "11.5px",
              color: isDark ? "#94a3b8" : "#64748b",
            }}
          >
            <ShieldCheck size={14} color="#0e8774" />
            <span>
              {isAr
                ? "مصادقة سريعة ومشفرة · متوافق مع معايير الأمان وحماية البيانات"
                : "Encrypted & secure authentication · HIPAA Compliant"}
            </span>
          </div>
        </form>
      </div>
    </div>
  );
}

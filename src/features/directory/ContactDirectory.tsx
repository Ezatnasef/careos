import { useEffect, useMemo, useState } from "react";
import {
  Building,
  Check,
  Copy,
  Download,
  ExternalLink,
  Mail,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";
import {
  capturePublicLead,
  deleteLead,
  fetchDirectoryContacts,
  getExportContactsUrl,
  type DirectoryContact,
} from "../../api/directory";
import { PageHeading } from "../../components/PageHeading";
import type { Language, TranslationKey } from "../../i18n";

type Translator = (key: TranslationKey) => string;
type ContactDirectoryProps = {
  t: Translator;
  language: Language;
};

export function ContactDirectory({ t, language }: ContactDirectoryProps) {
  const isAr = language === "ar";
  const [contacts, setContacts] = useState<DirectoryContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Counts from backend
  const [stats, setStats] = useState({
    total: 0,
    staff: 0,
    patients: 0,
    leads: 0,
  });

  // Filters
  const [activeTab, setActiveTab] = useState<"all" | "staff" | "patient" | "lead">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Modal for manual lead / contact addition
  const [showAddModal, setShowAddModal] = useState(false);
  const [submittingLead, setSubmittingLead] = useState(false);
  const [newLead, setNewLead] = useState({
    full_name: "",
    email: "",
    phone: "",
    company: "",
    source: "manual_entry",
    notes: "",
  });

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetchDirectoryContacts({
        category: activeTab,
        search: searchQuery,
      });
      setContacts(res.contacts);
      setStats({
        total: res.total_count,
        staff: res.staff_count,
        patients: res.patient_count,
        leads: res.lead_count,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : isAr ? "تعذر تحميل دليل جهات الاتصال" : "Failed to load directory");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeTab]);

  // Client-side search for live responsiveness
  const filteredContacts = useMemo(() => {
    if (!searchQuery.trim()) return contacts;
    const q = searchQuery.toLowerCase().trim();
    return contacts.filter(
      (c) =>
        c.full_name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        (c.phone && c.phone.toLowerCase().includes(q)) ||
        c.department_or_source.toLowerCase().includes(q) ||
        c.role_or_type.toLowerCase().includes(q)
    );
  }, [contacts, searchQuery]);

  const handleCopyAllEmails = async () => {
    const emails = filteredContacts
      .map((c) => c.email.trim())
      .filter(Boolean);
    const uniqueEmails = Array.from(new Set(emails));

    if (uniqueEmails.length === 0) return;

    await navigator.clipboard.writeText(uniqueEmails.join(", "));
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2500);
  };

  const handleCopySingleEmail = async (email: string, id: string) => {
    await navigator.clipboard.writeText(email.trim());
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleExportCsv = () => {
    const listToExport = filteredContacts.length > 0 ? filteredContacts : contacts;
    if (listToExport.length === 0) {
      alert(isAr ? "لا توجد جهات اتصال لتصديرها حالياً" : "No contacts available to export");
      return;
    }

    const headers = isAr
      ? ["المعرف", "الفئة", "الاسم الكامل", "البريد الإلكتروني", "رقم الهاتف", "الدور / المسمى الوظيفي", "القسم أو المصدر", "تاريخ الإضافة"]
      : ["ID", "Category", "Full Name", "Email", "Phone", "Role / Title", "Department / Source", "Created At"];

    const escapeCsv = (val: unknown) => {
      const str = val == null ? "" : String(val).trim();
      return `"${str.replace(/"/g, '""')}"`;
    };

    const rows = listToExport.map((c) => [
      c.id,
      getCategoryLabel(c.category),
      c.full_name,
      c.email,
      c.phone || "-",
      c.role_or_type,
      c.department_or_source,
      c.created_at ? new Date(c.created_at).toLocaleDateString(isAr ? "ar-EG" : "en-US") : "-",
    ]);

    const csvContent =
      "\uFEFF" +
      [headers, ...rows]
        .map((row) => row.map(escapeCsv).join(","))
        .join("\r\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const catLabel = activeTab === "all" ? "All" : activeTab;
    link.setAttribute(
      "download",
      `CareOS_Contacts_${catLabel}_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    window.dispatchEvent(
      new CustomEvent("careos:toast", {
        detail: isAr
          ? `تم تصدير ملف CSV بنجاح (${listToExport.length} جهة اتصال)`
          : `Contacts exported to CSV successfully (${listToExport.length} contacts)`,
      })
    );
  };

  const handleDeleteLead = async (id: string) => {
    if (!window.confirm(isAr ? "هل أنت متأكد من حذف جهة الاتصال هذه؟" : "Are you sure you want to remove this lead?")) {
      return;
    }
    try {
      await deleteLead(id);
      loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error deleting lead");
    }
  };

  const handleCreateLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLead.full_name || !newLead.email) return;

    try {
      setSubmittingLead(true);
      await capturePublicLead(newLead);
      setShowAddModal(false);
      setNewLead({
        full_name: "",
        email: "",
        phone: "",
        company: "",
        source: "manual_entry",
        notes: "",
      });
      loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error adding contact");
    } finally {
      setSubmittingLead(false);
    }
  };

  const getCategoryBadgeClass = (category: string) => {
    switch (category) {
      case "staff":
        return "dir-tag staff";
      case "patient":
        return "dir-tag patient";
      case "lead":
      default:
        return "dir-tag lead";
    }
  };

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case "staff":
        return isAr ? "طاقم العمل" : "Medical Staff";
      case "patient":
        return isAr ? "مريض مسجل" : "Patient";
      case "lead":
      default:
        return isAr ? "زائر / مهتم" : "Visitor / Lead";
    }
  };

  const getInitials = (name: string) => {
    const parts = name.trim().split(" ");
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return (name[0] || "U").toUpperCase();
  };

  return (
    <div className="dir-container" dir={isAr ? "rtl" : "ltr"}>
      {/* Top Page Heading with Actions */}
      <PageHeading
        eyebrow={isAr ? "دليل النظام الموحد" : "Unified Directory"}
        title={isAr ? "دليل جهات الاتصال والمستخدمين" : "Audience & Contacts Directory"}
        detail={
          isAr
            ? "سجل موحد يجمع كافة الإيميلات المسجلة: الطاقم الطبي، المرضى، وزوار المنصة والمهتمين بالخدمات"
            : "Unified registry of all system emails: medical staff, registered patients, and platform visitor leads"
        }
        action={
          <div className="dir-header-actions">
            {/* Quick Copy All Emails */}
            <button
              type="button"
              onClick={handleCopyAllEmails}
              disabled={filteredContacts.length === 0}
              className={`dir-btn ${copiedAll ? "copied" : "primary"}`}
              title={isAr ? "نسخ جميع الإيميلات إلى الحافظة" : "Copy all emails to clipboard"}
            >
              {copiedAll ? <Check size={16} /> : <Copy size={16} />}
              <span>
                {copiedAll
                  ? isAr
                    ? "تم نسخ الإيميلات بنجاح!"
                    : "Emails Copied!"
                  : isAr
                  ? `نسخ الإيميلات (${filteredContacts.length})`
                  : `Copy Emails (${filteredContacts.length})`}
              </span>
            </button>

            {/* Export CSV */}
            <button
              type="button"
              onClick={handleExportCsv}
              className="dir-btn"
              title={isAr ? "تصدير جهات الاتصال الحالية إلى ملف CSV" : "Export current contacts to CSV"}
            >
              <Download size={16} />
              <span>{isAr ? "تصدير CSV" : "Export CSV"}</span>
            </button>

            {/* Add Lead / Contact */}
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="dir-btn"
            >
              <UserPlus size={16} />
              <span>{isAr ? "إضافة مهتم / زائر" : "Add Contact / Lead"}</span>
            </button>

            {/* Refresh */}
            <button
              type="button"
              onClick={loadData}
              disabled={loading}
              className="dir-btn"
              title={isAr ? "تحديث البيانات" : "Refresh"}
            >
              <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        }
      />

      {/* KPI Metric Summary Cards */}
      <div className="dir-summary-grid">
        {/* Total */}
        <div
          onClick={() => setActiveTab("all")}
          className={`dir-summary-card ${activeTab === "all" ? "active" : ""}`}
        >
          <div className="dir-card-header">
            <span className="dir-card-title">
              {isAr ? "إجمالي جهات الاتصال" : "Total Contacts"}
            </span>
            <div className="dir-card-icon all">
              <Users size={18} />
            </div>
          </div>
          <div className="dir-card-value">{stats.total}</div>
          <div className="dir-card-sub">
            {isAr ? "كافة الإيميلات المسجلة بالنظام" : "All system registered emails"}
          </div>
        </div>

        {/* Staff */}
        <div
          onClick={() => setActiveTab("staff")}
          className={`dir-summary-card ${activeTab === "staff" ? "active" : ""}`}
        >
          <div className="dir-card-header">
            <span className="dir-card-title">
              {isAr ? "الطاقم والمستخدمين" : "Medical Staff"}
            </span>
            <div className="dir-card-icon staff">
              <UserCheck size={18} />
            </div>
          </div>
          <div className="dir-card-value">{stats.staff}</div>
          <div className="dir-card-sub">
            {isAr ? "أطباء، تمريض، وإداريون" : "Physicians, nurses, admins"}
          </div>
        </div>

        {/* Patients */}
        <div
          onClick={() => setActiveTab("patient")}
          className={`dir-summary-card ${activeTab === "patient" ? "active" : ""}`}
        >
          <div className="dir-card-header">
            <span className="dir-card-title">
              {isAr ? "المرضى بإيميلات" : "Registered Patients"}
            </span>
            <div className="dir-card-icon patient">
              <Sparkles size={18} />
            </div>
          </div>
          <div className="dir-card-value">{stats.patients}</div>
          <div className="dir-card-sub">
            {isAr ? "مرضى لديهم إيميل مسجل" : "Patients with recorded email"}
          </div>
        </div>

        {/* Leads */}
        <div
          onClick={() => setActiveTab("lead")}
          className={`dir-summary-card ${activeTab === "lead" ? "active" : ""}`}
        >
          <div className="dir-card-header">
            <span className="dir-card-title">
              {isAr ? "الزوار والمهتمين" : "Visitors & Leads"}
            </span>
            <div className="dir-card-icon lead">
              <Building size={18} />
            </div>
          </div>
          <div className="dir-card-value">{stats.leads}</div>
          <div className="dir-card-sub">
            {isAr ? "طلبات العرض، النشرات، والاستفسارات" : "Demo requests & inquiries"}
          </div>
        </div>
      </div>

      {/* Filter Tabs & Search Controls Bar */}
      <div className="dir-controls-bar">
        <div className="dir-tabs">
          <button
            type="button"
            onClick={() => setActiveTab("all")}
            className={`dir-tab-btn ${activeTab === "all" ? "active" : ""}`}
          >
            {isAr ? "الكل" : "All"} ({stats.total})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("staff")}
            className={`dir-tab-btn ${activeTab === "staff" ? "active" : ""}`}
          >
            {isAr ? "الطاقم الطبي" : "Medical Staff"} ({stats.staff})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("patient")}
            className={`dir-tab-btn ${activeTab === "patient" ? "active" : ""}`}
          >
            {isAr ? "المرضى" : "Patients"} ({stats.patients})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("lead")}
            className={`dir-tab-btn ${activeTab === "lead" ? "active" : ""}`}
          >
            {isAr ? "الزوار / المهتمين" : "Visitors / Leads"} ({stats.leads})
          </button>
        </div>

        {/* Search Input */}
        <div className="dir-search-wrap">
          <Search size={15} className="dir-search-icon" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={isAr ? "بحث بالاسم، الإيميل، القسم..." : "Search name, email, department..."}
            className="dir-search-input"
          />
        </div>
      </div>

      {/* Contacts List / Table */}
      <div className="dir-table-card">
        {loading ? (
          <div style={{ padding: "60px 20px", textAlign: "center", color: "var(--muted)" }}>
            <RefreshCw size={26} className="animate-spin" style={{ margin: "0 auto 10px", color: "#0e8774" }} />
            <p style={{ margin: 0, fontSize: "14px" }}>{isAr ? "جارٍ تحميل دليل جهات الاتصال..." : "Loading contacts directory..."}</p>
          </div>
        ) : error ? (
          <div style={{ padding: "40px 20px", textAlign: "center", color: "#b91c1c" }}>
            <p style={{ margin: "0 0 10px", fontSize: "14px", fontWeight: "bold" }}>{error}</p>
            <button
              type="button"
              onClick={loadData}
              className="dir-btn"
            >
              {isAr ? "إعادة المحاولة" : "Try Again"}
            </button>
          </div>
        ) : filteredContacts.length === 0 ? (
          <div style={{ padding: "60px 20px", textAlign: "center", color: "var(--muted)" }}>
            <Mail size={36} style={{ margin: "0 auto 10px", opacity: 0.4 }} />
            <p style={{ margin: 0, fontSize: "14px", fontWeight: 600 }}>
              {isAr ? "لا توجد جهات اتصال مطابقة للبحث" : "No contacts found matching your criteria"}
            </p>
          </div>
        ) : (
          <div className="dir-table-wrap">
            <table className="dir-table">
              <thead>
                <tr>
                  <th>{isAr ? "الاسم" : "Full Name"}</th>
                  <th>{isAr ? "البريد الإلكتروني" : "Email Address"}</th>
                  <th>{isAr ? "الهاتف" : "Phone"}</th>
                  <th>{isAr ? "التصنيف" : "Category"}</th>
                  <th>{isAr ? "الدور / المصدر" : "Role / Source"}</th>
                  <th>{isAr ? "تاريخ الإضافة" : "Date Added"}</th>
                  <th style={{ textAlign: "center" }}>{isAr ? "إجراءات" : "Actions"}</th>
                </tr>
              </thead>
              <tbody>
                {filteredContacts.map((contact) => {
                  const isCopied = copiedId === contact.id;
                  return (
                    <tr key={contact.id}>
                      {/* Name & Avatar */}
                      <td>
                        <div className="dir-user-cell">
                          <div className={`dir-avatar ${contact.category}`}>
                            {getInitials(contact.full_name)}
                          </div>
                          <div>
                            <div className="dir-user-name">{contact.full_name}</div>
                            <div className="dir-user-sub">{contact.department_or_source}</div>
                          </div>
                        </div>
                      </td>

                      {/* Email */}
                      <td>
                        <div className="dir-email-cell">
                          <a
                            href={`mailto:${contact.email}`}
                            className="dir-email-link"
                          >
                            <Mail size={13} style={{ color: "var(--muted)" }} />
                            <span>{contact.email}</span>
                          </a>
                          <button
                            type="button"
                            onClick={() => handleCopySingleEmail(contact.email, contact.id)}
                            className="dir-copy-btn"
                            title={isAr ? "نسخ الإيميل" : "Copy email"}
                          >
                            {isCopied ? <Check size={13} style={{ color: "#10b981" }} /> : <Copy size={13} />}
                          </button>
                        </div>
                      </td>

                      {/* Phone */}
                      <td>
                        {contact.phone ? (
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <Phone size={13} style={{ color: "var(--muted)" }} />
                            <span dir="ltr">{contact.phone}</span>
                          </div>
                        ) : (
                          <span style={{ color: "var(--muted)" }}>—</span>
                        )}
                      </td>

                      {/* Category Badge */}
                      <td>
                        <span className={getCategoryBadgeClass(contact.category)}>
                          {getCategoryLabel(contact.category)}
                        </span>
                      </td>

                      {/* Role or Source */}
                      <td>
                        <span style={{ textTransform: "capitalize" }}>{contact.role_or_type}</span>
                      </td>

                      {/* Created At */}
                      <td style={{ color: "var(--muted)", fontSize: "11.5px" }}>
                        {contact.created_at ? contact.created_at.split("T")[0] : "—"}
                      </td>

                      {/* Actions */}
                      <td>
                        <div className="dir-action-btns">
                          <a
                            href={`mailto:${contact.email}`}
                            className="dir-icon-action"
                            title={isAr ? "إرسال بريد" : "Send email"}
                          >
                            <ExternalLink size={14} />
                          </a>

                          {contact.category === "lead" && (
                            <button
                              type="button"
                              onClick={() => handleDeleteLead(contact.id)}
                              className="dir-icon-action delete"
                              title={isAr ? "حذف المهتم" : "Delete Lead"}
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Lead / Contact Modal */}
      {showAddModal && (
        <div
          className="dir-modal-backdrop"
          onClick={() => setShowAddModal(false)}
        >
          <div
            className="dir-modal"
            onClick={(e) => e.stopPropagation()}
            dir={isAr ? "rtl" : "ltr"}
          >
            <div className="dir-modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div className="dir-card-icon lead">
                  <UserPlus size={18} />
                </div>
                <h3>{isAr ? "إضافة جهة اتصال / مهتم جديد" : "Add New Contact / Lead"}</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                style={{ border: "none", background: "transparent", fontSize: "16px", cursor: "pointer", color: "var(--muted)" }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateLead} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div className="dir-form-field">
                <label>{isAr ? "الاسم الكامل *" : "Full Name *"}</label>
                <input
                  type="text"
                  required
                  value={newLead.full_name}
                  onChange={(e) => setNewLead({ ...newLead, full_name: e.target.value })}
                  placeholder={isAr ? "مثال: د. طارق سالم" : "e.g. Dr. Tarek Salem"}
                />
              </div>

              <div className="dir-form-field">
                <label>{isAr ? "البريد الإلكتروني *" : "Email Address *"}</label>
                <input
                  type="email"
                  required
                  value={newLead.email}
                  onChange={(e) => setNewLead({ ...newLead, email: e.target.value })}
                  placeholder="contact@example.com"
                />
              </div>

              <div className="dir-form-grid">
                <div className="dir-form-field">
                  <label>{isAr ? "رقم الهاتف" : "Phone"}</label>
                  <input
                    type="tel"
                    value={newLead.phone}
                    onChange={(e) => setNewLead({ ...newLead, phone: e.target.value })}
                    placeholder="+20 100 ..."
                  />
                </div>
                <div className="dir-form-field">
                  <label>{isAr ? "الجهة / العيادة" : "Clinic / Hospital"}</label>
                  <input
                    type="text"
                    value={newLead.company}
                    onChange={(e) => setNewLead({ ...newLead, company: e.target.value })}
                    placeholder={isAr ? "مستشفى الشروق" : "Clinic Name"}
                  />
                </div>
              </div>

              <div className="dir-form-field">
                <label>{isAr ? "ملاحظات إضافية" : "Notes"}</label>
                <textarea
                  rows={2}
                  value={newLead.notes}
                  onChange={(e) => setNewLead({ ...newLead, notes: e.target.value })}
                  placeholder={isAr ? "أي تفاصيل أو اهتمام بعرض النظام..." : "Additional details..."}
                />
              </div>

              <div className="dir-modal-actions">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="dir-btn"
                >
                  {isAr ? "إلغاء" : "Cancel"}
                </button>
                <button
                  type="submit"
                  disabled={submittingLead}
                  className="dir-btn primary"
                >
                  {submittingLead ? (isAr ? "جارٍ الحفظ..." : "Saving...") : isAr ? "حفظ وإضافة" : "Save Contact"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

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

  // Debounced or live search
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

  const handleDeleteLead = async (id: string) => {
    if (!window.confirm(isAr ? "هل أنت متأكد من حذف هذه الجهة؟" : "Are you sure you want to remove this lead?")) {
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

  const getCategoryBadge = (category: string) => {
    switch (category) {
      case "staff":
        return {
          label: isAr ? "طاقم العمل" : "Staff Member",
          color: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800",
        };
      case "patient":
        return {
          label: isAr ? "مريض مسجل" : "Patient",
          color: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800",
        };
      case "lead":
      default:
        return {
          label: isAr ? "زائر / مهتم" : "Visitor / Lead",
          color: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
        };
    }
  };

  const getInitials = (name: string) => {
    const parts = name.trim().split(" ");
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return (name[0] || "U").toUpperCase();
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 py-6" dir={isAr ? "rtl" : "ltr"}>
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <PageHeading
            eyebrow={isAr ? "دليل النظام الموحد" : "Unified Directory"}
            title={isAr ? "دليل جهات الاتصال والمستخدمين" : "Audience & Contacts Directory"}
            detail={
              isAr
                ? "سجل موحد يجمع كافة الإيميلات المسجلة: الطاقم الطبي، المرضى، وزوار المنصة والمهتمين بالخدمات"
                : "Unified registry of all system emails: medical staff, registered patients, and platform visitor leads"
            }
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Quick Copy All Emails */}
          <button
            onClick={handleCopyAllEmails}
            disabled={filteredContacts.length === 0}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold transition-all shadow-sm ${
              copiedAll
                ? "bg-emerald-600 text-white"
                : "bg-teal-600 hover:bg-teal-700 text-white active:scale-95"
            } disabled:opacity-50`}
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
          <a
            href={getExportContactsUrl(activeTab, searchQuery)}
            download
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all shadow-sm"
          >
            <Download size={16} />
            <span>{isAr ? "تصدير CSV" : "Export CSV"}</span>
          </a>

          {/* Add Lead / Contact */}
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold border border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300 hover:bg-teal-100 transition-all"
          >
            <UserPlus size={16} />
            <span>{isAr ? "إضافة مهتم / زائر" : "Add Contact / Lead"}</span>
          </button>

          {/* Refresh */}
          <button
            onClick={loadData}
            disabled={loading}
            className="p-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 transition-all"
            title={isAr ? "تحديث البيانات" : "Refresh"}
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Total */}
        <div
          onClick={() => setActiveTab("all")}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            activeTab === "all"
              ? "bg-slate-900 text-white border-slate-900 shadow-md ring-2 ring-teal-500/30"
              : "bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 hover:border-slate-300"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className={`text-xs font-medium ${activeTab === "all" ? "text-slate-300" : "text-slate-500 dark:text-slate-400"}`}>
              {isAr ? "إجمالي جهات الاتصال" : "Total Contacts"}
            </span>
            <div className={`p-2 rounded-lg ${activeTab === "all" ? "bg-slate-800 text-teal-400" : "bg-teal-50 dark:bg-teal-950 text-teal-600"}`}>
              <Users size={18} />
            </div>
          </div>
          <div className="text-2xl font-bold">{stats.total}</div>
          <div className={`text-xs mt-1 ${activeTab === "all" ? "text-slate-400" : "text-slate-400"}`}>
            {isAr ? "كافة الإيميلات المسجلة بالنظام" : "All system registered emails"}
          </div>
        </div>

        {/* Staff */}
        <div
          onClick={() => setActiveTab("staff")}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            activeTab === "staff"
              ? "bg-blue-600 text-white border-blue-600 shadow-md ring-2 ring-blue-400/30"
              : "bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 hover:border-blue-200"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className={`text-xs font-medium ${activeTab === "staff" ? "text-blue-100" : "text-slate-500 dark:text-slate-400"}`}>
              {isAr ? "الطاقم والمستخدمين" : "Medical Staff"}
            </span>
            <div className={`p-2 rounded-lg ${activeTab === "staff" ? "bg-blue-700 text-white" : "bg-blue-50 dark:bg-blue-950 text-blue-600"}`}>
              <UserCheck size={18} />
            </div>
          </div>
          <div className="text-2xl font-bold">{stats.staff}</div>
          <div className={`text-xs mt-1 ${activeTab === "staff" ? "text-blue-200" : "text-slate-400"}`}>
            {isAr ? "أطباء، تمريض، وإداريون" : "Physicians, nurses, admins"}
          </div>
        </div>

        {/* Patients */}
        <div
          onClick={() => setActiveTab("patient")}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            activeTab === "patient"
              ? "bg-emerald-600 text-white border-emerald-600 shadow-md ring-2 ring-emerald-400/30"
              : "bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 hover:border-emerald-200"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className={`text-xs font-medium ${activeTab === "patient" ? "text-emerald-100" : "text-slate-500 dark:text-slate-400"}`}>
              {isAr ? "المرضى بإيميلات" : "Registered Patients"}
            </span>
            <div className={`p-2 rounded-lg ${activeTab === "patient" ? "bg-emerald-700 text-white" : "bg-emerald-50 dark:bg-emerald-950 text-emerald-600"}`}>
              <Sparkles size={18} />
            </div>
          </div>
          <div className="text-2xl font-bold">{stats.patients}</div>
          <div className={`text-xs mt-1 ${activeTab === "patient" ? "text-emerald-200" : "text-slate-400"}`}>
            {isAr ? "مرضى لديهم إيميل مسجل" : "Patients with recorded email"}
          </div>
        </div>

        {/* Leads */}
        <div
          onClick={() => setActiveTab("lead")}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            activeTab === "lead"
              ? "bg-amber-600 text-white border-amber-600 shadow-md ring-2 ring-amber-400/30"
              : "bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 hover:border-amber-200"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className={`text-xs font-medium ${activeTab === "lead" ? "text-amber-100" : "text-slate-500 dark:text-slate-400"}`}>
              {isAr ? "الزوار والمهتمين" : "Visitors & Leads"}
            </span>
            <div className={`p-2 rounded-lg ${activeTab === "lead" ? "bg-amber-700 text-white" : "bg-amber-50 dark:bg-amber-950 text-amber-600"}`}>
              <Building size={18} />
            </div>
          </div>
          <div className="text-2xl font-bold">{stats.leads}</div>
          <div className={`text-xs mt-1 ${activeTab === "lead" ? "text-amber-200" : "text-slate-400"}`}>
            {isAr ? "طلبات العرض، النشرات، والاستفسارات" : "Demo requests & inquiries"}
          </div>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
          <button
            onClick={() => setActiveTab("all")}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
              activeTab === "all"
                ? "bg-slate-900 dark:bg-teal-600 text-white"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            {isAr ? "الكل" : "All"} ({stats.total})
          </button>
          <button
            onClick={() => setActiveTab("staff")}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
              activeTab === "staff"
                ? "bg-blue-600 text-white"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            {isAr ? "الطاقم الطبي" : "Medical Staff"} ({stats.staff})
          </button>
          <button
            onClick={() => setActiveTab("patient")}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
              activeTab === "patient"
                ? "bg-emerald-600 text-white"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            {isAr ? "المرضى" : "Patients"} ({stats.patients})
          </button>
          <button
            onClick={() => setActiveTab("lead")}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
              activeTab === "lead"
                ? "bg-amber-600 text-white"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            {isAr ? "الزوار / المهتمين" : "Visitors / Leads"} ({stats.leads})
          </button>
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-72">
          <Search size={16} className={`absolute top-1/2 -translate-y-1/2 ${isAr ? "right-3" : "left-3"} text-slate-400`} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={isAr ? "بحث بالاسم، الإيميل، القسم..." : "Search name, email, department..."}
            className={`w-full py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500 ${
              isAr ? "pr-9 pl-3" : "pl-9 pr-3"
            }`}
          />
        </div>
      </div>

      {/* Contacts List / Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
        {loading ? (
          <div className="py-16 text-center text-slate-400">
            <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-teal-600" />
            <p className="text-sm">{isAr ? "جارٍ تحميل جهات الاتصال..." : "Loading contacts directory..."}</p>
          </div>
        ) : error ? (
          <div className="py-12 text-center text-rose-500">
            <p className="text-sm font-semibold">{error}</p>
            <button
              onClick={loadData}
              className="mt-3 px-3 py-1.5 text-xs bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-700 dark:text-slate-300"
            >
              {isAr ? "إعادة المحاولة" : "Try Again"}
            </button>
          </div>
        ) : filteredContacts.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <Mail size={32} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm font-medium">
              {isAr ? "لا توجد جهات اتصال مطابقة للبحث" : "No contacts found matching your criteria"}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs" dir={isAr ? "rtl" : "ltr"}>
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 font-medium">
                <tr>
                  <th className="py-3 px-4 text-start">{isAr ? "الاسم" : "Full Name"}</th>
                  <th className="py-3 px-4 text-start">{isAr ? "البريد الإلكتروني" : "Email Address"}</th>
                  <th className="py-3 px-4 text-start">{isAr ? "الهاتف" : "Phone"}</th>
                  <th className="py-3 px-4 text-start">{isAr ? "التصنيف" : "Category"}</th>
                  <th className="py-3 px-4 text-start">{isAr ? "الدور / المصدر" : "Role / Source"}</th>
                  <th className="py-3 px-4 text-start">{isAr ? "تاريخ الإضافة" : "Date Added"}</th>
                  <th className="py-3 px-4 text-center">{isAr ? "إجراءات" : "Actions"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {filteredContacts.map((contact) => {
                  const badge = getCategoryBadge(contact.category);
                  const isCopied = copiedId === contact.id;
                  return (
                    <tr
                      key={contact.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      {/* Name & Avatar */}
                      <td className="py-3.5 px-4 text-start">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-teal-100 dark:bg-teal-950 text-teal-700 dark:text-teal-300 font-bold flex items-center justify-center text-xs shrink-0">
                            {getInitials(contact.full_name)}
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900 dark:text-slate-100">
                              {contact.full_name}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {contact.department_or_source}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Email */}
                      <td className="py-3.5 px-4 text-start font-mono text-slate-700 dark:text-slate-300">
                        <div className="flex items-center gap-2">
                          <a
                            href={`mailto:${contact.email}`}
                            className="hover:text-teal-600 hover:underline flex items-center gap-1.5"
                          >
                            <Mail size={13} className="text-slate-400" />
                            <span>{contact.email}</span>
                          </a>
                          <button
                            onClick={() => handleCopySingleEmail(contact.email, contact.id)}
                            className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 transition-colors"
                            title={isAr ? "نسخ الإيميل" : "Copy email"}
                          >
                            {isCopied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                          </button>
                        </div>
                      </td>

                      {/* Phone */}
                      <td className="py-3.5 px-4 text-start text-slate-600 dark:text-slate-400">
                        {contact.phone ? (
                          <div className="flex items-center gap-1.5">
                            <Phone size={12} className="text-slate-400" />
                            <span dir="ltr">{contact.phone}</span>
                          </div>
                        ) : (
                          <span className="text-slate-300 dark:text-slate-600">—</span>
                        )}
                      </td>

                      {/* Category Badge */}
                      <td className="py-3.5 px-4 text-start">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${badge.color}`}
                        >
                          {badge.label}
                        </span>
                      </td>

                      {/* Role or Source */}
                      <td className="py-3.5 px-4 text-start text-slate-600 dark:text-slate-400">
                        <span className="capitalize">{contact.role_or_type}</span>
                      </td>

                      {/* Created At */}
                      <td className="py-3.5 px-4 text-start text-slate-400 text-[11px]">
                        {contact.created_at ? contact.created_at.split("T")[0] : "—"}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <a
                            href={`mailto:${contact.email}`}
                            className="p-1.5 rounded-lg hover:bg-teal-50 dark:hover:bg-teal-950 text-teal-600 transition-colors"
                            title={isAr ? "إرسال بريد" : "Send email"}
                          >
                            <ExternalLink size={14} />
                          </a>

                          {contact.category === "lead" && (
                            <button
                              onClick={() => handleDeleteLead(contact.id)}
                              className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950 text-rose-500 transition-colors"
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => setShowAddModal(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-3xl p-6 w-full max-w-md border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
            dir={isAr ? "rtl" : "ltr"}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-teal-50 dark:bg-teal-950 text-teal-600">
                  <UserPlus size={18} />
                </div>
                <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                  {isAr ? "إضافة جهة اتصال / مهتم جديد" : "Add New Contact / Lead"}
                </h3>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateLead} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">
                  {isAr ? "الاسم الكامل *" : "Full Name *"}
                </label>
                <input
                  type="text"
                  required
                  value={newLead.full_name}
                  onChange={(e) => setNewLead({ ...newLead, full_name: e.target.value })}
                  placeholder={isAr ? "مثال: د. طارق سالم" : "e.g. Dr. Tarek Salem"}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">
                  {isAr ? "البريد الإلكتروني *" : "Email Address *"}
                </label>
                <input
                  type="email"
                  required
                  value={newLead.email}
                  onChange={(e) => setNewLead({ ...newLead, email: e.target.value })}
                  placeholder="contact@example.com"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">
                    {isAr ? "رقم الهاتف" : "Phone"}
                  </label>
                  <input
                    type="tel"
                    value={newLead.phone}
                    onChange={(e) => setNewLead({ ...newLead, phone: e.target.value })}
                    placeholder="+20 100 ..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">
                    {isAr ? "الجهة / العيادة" : "Clinic / Hospital"}
                  </label>
                  <input
                    type="text"
                    value={newLead.company}
                    onChange={(e) => setNewLead({ ...newLead, company: e.target.value })}
                    placeholder={isAr ? "مستشفى الشروق" : "Clinic Name"}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">
                  {isAr ? "ملاحظات إضافية" : "Notes"}
                </label>
                <textarea
                  rows={2}
                  value={newLead.notes}
                  onChange={(e) => setNewLead({ ...newLead, notes: e.target.value })}
                  placeholder={isAr ? "أي تفاصيل أو اهتمام بعرض النظام..." : "Additional details..."}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50"
                >
                  {isAr ? "إلغاء" : "Cancel"}
                </button>
                <button
                  type="submit"
                  disabled={submittingLead}
                  className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold transition-all disabled:opacity-50"
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

import {
  BarChart3,
  Building2,
  CalendarDays,
  Database,
  FileBarChart,
  FileText,
  LayoutDashboard,
  MessageCircle,
  ShieldCheck,
  Stethoscope,
  UserRound,
  Users,
  HeartPulse,
  type LucideIcon,
} from "lucide-react";
import type { TranslationKey } from "../../i18n";
import type { AppView } from "../../app/routes";

export type Role =
  | "admin"
  | "doctor"
  | "nurse"
  | "receptionist"
  | "patient"
  | "hospital_director"
  | "it_admin"
  | "administrative_staff";

export type NavItem = {
  id: AppView;
  label: TranslationKey;
  icon: LucideIcon;
};

export const navItems: NavItem[] = [
  { id: "dashboard", label: "overview", icon: LayoutDashboard },
  { id: "patients", label: "patients", icon: Users },
  { id: "assistant", label: "assistant", icon: Stethoscope },
  { id: "notes", label: "notes", icon: FileText },
  { id: "documents", label: "documentation", icon: Database },
  { id: "appointments", label: "appointments", icon: CalendarDays },
  { id: "messages", label: "messages", icon: MessageCircle },
  { id: "portal", label: "patientPortal", icon: UserRound },
  { id: "analytics", label: "analytics", icon: BarChart3 },
  { id: "departments", label: "departments", icon: Building2 },
  { id: "reports", label: "reports", icon: FileBarChart },
  { id: "clinicOps", label: "operations", icon: HeartPulse },
  { id: "admin", label: "organizationAdministration", icon: ShieldCheck },
  { id: "staff", label: "teamMembersLabel", icon: Users },
  { id: "teamAudit", label: "teamAudit", icon: ShieldCheck },
];

export const roleNavMap: Record<Role, AppView[]> = {
  admin: [
    "dashboard",
    "departments",
    "analytics",
    "reports",
    "clinicOps",
    "admin",
    "staff",
    "teamAudit",
    "integrations",
    "settings",
    "account",
  ],
  doctor: [
    "dashboard",
    "patients",
    "assistant",
    "notes",
    "documents",
    "appointments",
    "messages",
    "departments",
    "clinicOps",
    "integrations",
    "settings",
    "account",
  ],
  nurse: [
    "dashboard",
    "patients",
    "assistant",
    "notes",
    "appointments",
    "messages",
    "clinicOps",
    "settings",
    "account",
  ],
  receptionist: [
    "dashboard",
    "patients",
    "appointments",
    "messages",
    "departments",
    "clinicOps",
    "settings",
    "account",
  ],
  hospital_director: [
    "dashboard",
    "departments",
    "analytics",
    "reports",
    "clinicOps",
    "admin",
    "staff",
    "teamAudit",
    "integrations",
    "settings",
    "account",
  ],
  it_admin: [
    "dashboard",
    "admin",
    "staff",
    "teamAudit",
    "integrations",
    "settings",
    "account",
  ],
  administrative_staff: [
    "dashboard",
    "patients",
    "appointments",
    "departments",
    "reports",
    "clinicOps",
    "settings",
    "account",
  ],
  patient: [
    "portal",
    "appointments",
    "messages",
    "account",
  ],
};

export const rolePermissions: Record<Role, string[]> = {
  admin: [
    "dashboard.read",
    "analytics.read",
    "analytics.view",
    "team.read",
    "team.invite",
    "users.view",
    "users.invite",
    "roles.view",
    "roles.assign",
    "roles.manage",
    "permissions.view",
    "hospital.view",
    "hospital.settings.view",
    "hospital.settings.manage",
    "departments.view",
    "departments.manage",
    "reports.view",
    "reports.operational.view",
    "audit.read",
    "audit_logs.view",
    "sso.view",
    "sso.manage",
    "rag.query",
  ],
  doctor: [
    "dashboard.read",
    "patient.read",
    "patient.write",
    "patients.view",
    "patients.demographics.view",
    "patients.create",
    "appointment.read",
    "appointment.write",
    "appointments.view",
    "appointments.create",
    "clinical.note",
    "clinical_notes.view",
    "clinical_notes.create",
    "documents.view",
    "documents.create",
    "analytics.read",
    "analytics.view",
    "departments.view",
    "reports.view",
    "reports.operational.view",
    "team.read",
    "audit.read",
    "audit_logs.view",
    "rag.query",
  ],
  nurse: [
    "dashboard.read",
    "patient.read",
    "patient.write",
    "patients.view",
    "patients.create",
    "appointment.read",
    "clinical.note",
    "clinical_notes.view",
    "clinical_notes.create",
    "documents.view",
    "documents.create",
    "analytics.read",
    "departments.view",
    "reports.view",
    "rag.query",
  ],
  receptionist: [
    "dashboard.read",
    "patient.read",
    "patients.view",
    "patients.demographics.view",
    "appointment.read",
    "appointment.write",
    "appointments.view",
    "appointments.create",
    "documents.view",
    "analytics.read",
    "departments.view",
    "reports.view",
    "rag.query",
  ],
  patient: [
    "dashboard.read",
    "patient.read",
    "patient.self.view",
    "appointment.read",
    "messages.self.view",
  ],
  hospital_director: [
    "dashboard.read",
    "patient.read",
    "patients.view",
    "appointment.read",
    "appointments.view",
    "documents.view",
    "users.view",
    "hospital.view",
    "hospital.settings.view",
    "hospital.settings.manage",
    "departments.view",
    "reports.view",
    "reports.operational.view",
    "analytics.view",
    "audit_logs.view",
    "team.read",
    "rag.query",
  ],
  it_admin: [
    "dashboard.read",
    "users.view",
    "roles.view",
    "permissions.view",
    "sso.view",
    "sso.manage",
    "audit_logs.view",
  ],
  administrative_staff: [
    "dashboard.read",
    "patient.read",
    "patients.search",
    "patients.view",
    "patients.demographics.view",
    "appointments.view",
    "appointments.create",
    "appointments.update",
    "documents.view",
    "documents.create",
    "checkin.view",
    "departments.view",
    "reports.operational.view",
    "team.read",
    "rag.query",
  ],
};

export const viewPermissions: Record<AppView, string[]> = {
  dashboard: ["dashboard.read"],
  patients: ["patient.read", "patients.view", "patients.demographics.view"],
  assistant: ["clinical.note", "clinical_notes.create", "clinical_notes.view"],
  notes: ["clinical.note", "clinical_notes.view"],
  documents: ["patient.read", "documents.view", "documents.create"],
  appointments: ["appointment.read", "appointments.view"],
  portal: ["patient.read", "patient.self.view"],
  analytics: ["analytics.read", "analytics.view"],
  messages: ["patient.read", "messages.self.view"],
  departments: ["team.read", "departments.view"],
  reports: ["analytics.read", "reports.view", "reports.operational.view"],
  admin: ["team.read", "hospital.settings.view", "hospital.settings.manage"],
  files: ["patient.read", "documents.view", "documents.create"],
  staff: ["team.read", "users.view", "team.invite"],
  clinicOps: ["dashboard.read", "appointment.read", "patients.view", "analytics.read"],
  settings: ["dashboard.read", "hospital.settings.view", "hospital.settings.manage"],
  integrations: ["dashboard.read", "sso.view", "sso.manage"],
  account: ["dashboard.read"],
  teamAudit: ["team.read", "users.view", "audit.read", "audit_logs.view"],
};

export const roleAccessWarning: Partial<Record<Role, string>> = {
  patient: "Patient accounts can view their care information and appointments, but not clinical admin or team management screens.",
  receptionist: "Receptionists can manage scheduling and patient check-in, but not clinical notes or staff audit screens.",
  nurse: "Nurses can access the patient queue and notes, but not staff-level admin or audit settings.",
};

const roleAliases: Record<string, Role> = {
  administrator: "admin",
  physician: "doctor",
  director: "hospital_director",
  it_administrator: "it_admin",
  staff: "administrative_staff",
};

export function normalizeFrontendRole(role: string | null | undefined): Role {
  const normalized = String(role || "").trim().toLowerCase().replaceAll(" ", "_");
  const canonical = roleAliases[normalized] ?? normalized;
  return (Object.hasOwn(roleNavMap, canonical) ? canonical : "receptionist") as Role;
}

export function permissionsForRole(role: Role): string[] {
  return rolePermissions[role] ?? [];
}

export function canAccessView(role: Role, view: AppView, permissions?: readonly string[]): boolean {
  if (view === "account") return true;
  if (view === "portal") return role === "patient";
  if (role === "patient") return ["portal", "appointments", "messages", "account"].includes(view);

  const allowedForRole = roleNavMap[role] ?? [];
  if (!allowedForRole.includes(view)) {
    return false;
  }

  const required = viewPermissions[view];
  if (!required || required.length === 0) return true;
  const effectivePermissions = permissions && permissions.length > 0 ? permissions : permissionsForRole(role);
  return required.some((permission) => effectivePermissions.includes(permission));
}

export function firstAllowedView(role: Role, permissions?: readonly string[]): AppView {
  const candidates = roleNavMap[role] ?? roleNavMap.receptionist;
  return candidates.find((candidate) => canAccessView(role, candidate, permissions)) ?? "dashboard";
}

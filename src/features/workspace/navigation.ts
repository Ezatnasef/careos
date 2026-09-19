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
  type LucideIcon,
} from "lucide-react";
import type { TranslationKey } from "../../i18n";
import type { AppView } from "../../app/routes";

export type Role = "admin" | "doctor" | "nurse" | "receptionist" | "patient";

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
  { id: "teamAudit", label: "teamAudit", icon: ShieldCheck },
];

export const roleNavMap: Record<Role, AppView[]> = {
  admin: ["dashboard", "patients", "documents", "appointments", "analytics", "departments", "reports", "teamAudit", "settings"],
  doctor: ["dashboard", "patients", "assistant", "notes", "documents", "appointments", "analytics", "messages", "settings"],
  nurse: ["dashboard", "patients", "notes", "documents", "appointments", "messages", "analytics", "settings"],
  receptionist: ["dashboard", "patients", "documents", "appointments", "messages", "analytics", "settings"],
  patient: ["portal", "appointments", "messages", "settings"],
};

export const rolePermissions: Record<Role, string[]> = {
  admin: ["dashboard.read", "patient.read", "patient.write", "appointment.read", "appointment.write", "clinical.note", "analytics.read", "team.read", "team.invite"],
  doctor: ["dashboard.read", "patient.read", "patient.write", "appointment.read", "appointment.write", "clinical.note", "analytics.read"],
  nurse: ["dashboard.read", "patient.read", "patient.write", "appointment.read", "clinical.note"],
  receptionist: ["dashboard.read", "patient.read", "appointment.read", "appointment.write"],
  patient: ["dashboard.read", "patient.read", "appointment.read"],
};

export const viewPermissions: Record<AppView, string[]> = {
  dashboard: ["dashboard.read"],
  patients: ["patient.read", "patient.write"],
  assistant: ["clinical.note"],
  notes: ["clinical.note"],
  documents: ["patient.read", "clinical.note"],
  appointments: ["appointment.read", "appointment.write"],
  portal: ["patient.read", "appointment.read"],
  analytics: ["analytics.read"],
  messages: ["dashboard.read"],
  departments: ["team.read"],
  reports: ["analytics.read"],
  settings: ["dashboard.read"],
  integrations: ["dashboard.read"],
  teamAudit: ["team.read"],
};

export const roleAccessWarning: Partial<Record<Role, string>> = {
  patient: "Patient accounts can view their care information and appointments, but not clinical admin or team management screens.",
  receptionist: "Receptionists can manage scheduling and patient check-in, but not clinical notes or staff audit screens.",
  nurse: "Nurses can access the patient queue and notes, but not staff-level admin or audit settings.",
};

export function canAccessView(role: Role, view: AppView): boolean {
  return (viewPermissions[view] ?? ["dashboard.read"]).some((permission) => rolePermissions[role]?.includes(permission));
}

import { ApiError, clearSession, portalRequest, request } from "./api/client";
import { demoAccounts } from "./features/auth/LoginRoute";
import { rolePermissions, type Role } from "./features/workspace/navigation";

export type AuthUser = {
  id: string;
  organization_id: string;
  workspace_id?: string | null;
  department?: string;
  project?: string;
  email: string;
  full_name: string;
  role: string;
  permissions?: string[];
  onboarding_complete: boolean;
  mfa_enabled?: boolean;
};

export type Organization = {
  id: string;
  name: string;
  department: string;
  timezone: string;
  onboarding_complete?: boolean;
};

export type Workspace = {
  id: string;
  organization_id: string;
  name: string;
  department: string;
  timezone: string;
  onboarding_complete?: boolean;
};

export type DashboardContract = {
  patient_count: number;
  upcoming_appointment_count?: number;
  upcoming_appointments: ApiAppointment[];
  followups: ApiPatient[];
  kpi?: Record<string, number | string>;
};

export type SSOStartResponse = {
  provider: string;
  redirect_url: string;
  state: string;
  nonce: string;
};

export type ApiPatient = {
  id: string; patient_code: string; medical_record_number: string; given_name: string; family_name: string;
  department?: string; project?: string;
  date_of_birth: string; gender: string; condition: string; care_status: string;
  email?: string; phone?: string;
};
export type PatientRegistrationInput = {
  medical_record_number?: string;
  given_name: string;
  family_name: string;
  preferred_name?: string;
  preferred_language?: "ar" | "en";
  date_of_birth: string;
  gender?: string;
  condition?: string;
  care_status?: string;
  department?: string;
  project?: string;
  phone?: string;
  email?: string;
  address?: string;
  emergency_contact?: string;
};
export type SystemStatus = { app: string; environment: string; deployment: string; metrics_enabled: boolean; sso_ready: boolean; providers?: Record<string, { configured: boolean; provider?: string; backend?: string }> };
export type ApiAppointment = { id: string; patient_id: string; patient_name?: string; patient_code?: string; clinician_name?: string | null; starts_at: string; duration_minutes?: number; reason: string; status: string; reminder_status: string };
export type ApiNote = { id: string; patient_id: string; encounter_id?: string | null; body: string; ai_draft: string | null; status: string; signed_at: string | null };
export type ApiEncounter = { id: string; organization_id: string; patient_id: string; clinician_id: string; encounter_type: string; status: string; started_at: string; ended_at: string | null };
export type ApiTranscript = { id: string; encounter_id: string; audio_file_id: string; provider: string; language: string; dialect: string; transcript_text: string | null; status: string; job_status?: string | null; job_wait_seconds?: number | null; worker_status?: "active" | "unresponsive" | "unknown"; confidence: number | null; error_code: string | null; created_at: string; completed_at: string | null };
export type ApiMessage = {
  id: string;
  patient_id: string;
  patient_name?: string | null;
  subject: string;
  body: string;
  sender_type: string;
  sender_name?: string | null;
  direction: string;
  recipient_name?: string | null;
  read: boolean;
  created_at: string;
};
export type PortalPatientResponse = {
  patient: ApiPatient;
  messages: ApiMessage[];
  documents: Array<{ id: string; filename: string; ocr_status: string; extracted_text?: string | null; created_at: string }>;
  latest_status: string;
};
export type PortalOverview = {
  patient: ApiPatient;
  appointments: ApiAppointment[];
  messages: ApiMessage[];
  documents: Array<{ id: string; filename: string; ocr_status: string; created_at: string; download_url?: string | null }>;
  prescriptions?: PrescriptionRecord[];
};
export type PortalClinician = { id: string; full_name: string };
export type PortalClinicianDirectory = {
  timezone: string;
  clinicians: PortalClinician[];
};
export type PortalAvailabilitySlot = {
  date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  starts_at: string;
};
export type ClinicianSchedule = {
  id: string;
  clinician_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  slot_duration_minutes: number;
};
export type StructuredClinicalCandidates = {
  document_type: string;
  document_date?: string | null;
  patient_metadata?: {
    patient_name?: string | null;
    mrn?: string | null;
    age?: number | string | null;
    sex?: string | null;
  };
  diagnoses?: Array<{
    value: string;
    status: string;
    confidence?: number;
    page?: number | null;
  }>;
  medications?: Array<{
    name: string;
    strength?: string | null;
    dosage?: string | null;
    dose?: string | null;
    frequency?: string | null;
    duration?: string | null;
    raw?: string;
    status?: string;
    confidence?: number;
    page?: number | null;
  }>;
  allergies?: Array<{
    substance: string;
    status: string;
    confidence?: number;
    page?: number | null;
  }>;
  labs?: Array<{
    test: string;
    value: string;
    unit?: string | null;
    date?: string | null;
    raw?: string;
    status?: string;
    confidence?: number;
    page?: number | null;
  }>;
  clinical_findings?: Array<{
    value: string;
    status?: string;
    page?: number | null;
  }>;
  follow_up?: Array<{
    value: string;
    status?: string;
    page?: number | null;
  }>;
  unreadable_segments?: Array<{
    raw: string;
    status: string;
    field_hint?: string;
    requires_human_review?: boolean;
    confidence?: number;
    page?: number | null;
  }>;
  conflicts?: Array<{
    domain: string;
    description: string;
    items?: string[];
  }>;
  field_status?: Record<string, string>;
  provenance?: {
    source?: string;
    source_document_id?: string | null;
    ocr_applied?: boolean;
    ocr_engine?: string | null;
    ocr_confidence?: number | null;
    review_status?: string;
    candidate_only?: boolean;
    requires_human_review?: boolean;
  };
};

export type OcrDiagnostics = {
  filename?: string;
  ocr_status?: string;
  raw_text_length: number;
  safe_preview_synthetic_only?: string | null;
  document_type?: string | null;
  document_date?: string | null;
  ocr_applied: boolean;
  ocr_engine?: string | null;
  ocr_confidence?: number | null;
  requires_human_review: boolean;
  chunks_indexed: number;
  field_status: Record<string, string>;
  extracted_counts: Record<string, number>;
};

export type PatientDetailResponse = ApiPatient & {
  notes: Array<{ id: string; body: string; ai_draft: string | null; status: string; created_at?: string }>;
  documents: Array<{
    id: string;
    filename: string;
    encounter_id?: string | null;
    content_type: string;
    ocr_status: string;
    review_status: string;
    extracted_text?: string | null;
    normalized_text?: string | null;
    structured_candidates?: StructuredClinicalCandidates;
    chunks_indexed?: number;
    created_at: string;
    download_url?: string | null;
  }>;
};
export type AnalyticsResponse = {
  overview: {
    patients: number;
    appointments: number;
    follow_up_due: number;
    today_count: number;
    rag_latency_ms?: number;
    review_rate_pct?: number;
    ocr_documents?: number;
    citation_coverage_pct?: number;
  };
  department_breakdown: Array<{ department: string; count: number; percentage?: number }>;
  alerts: Array<{ type: string; count: number; message: string }>;
};
export type ReportsResponse = Array<{ id: string; name: string; category: string; generated_at: string; metrics: Record<string, string | number> }>;
export type TaskItem = {
  id: string;
  patient_id: string;
  title: string;
  description: string;
  assignee: string;
  priority: string;
  status: string;
  due_at: string | null;
  created_at: string;
};
export type CarePlanItem = {
  id: string;
  patient_id: string;
  title: string;
  summary: string;
  status: string;
  goals: string[];
  created_at: string;
};
export type DepartmentMetricsResponse = {
  departments: Array<{ department: string; count: number }>;
  generated_at: string;
};
export type DocumentUploadResponse = {
  id: string;
  filename: string;
  ocr_status: string;
  extracted_text?: string | null;
  normalized_text?: string | null;
  structured_candidates?: StructuredClinicalCandidates;
  ocr_applied?: boolean;
  ocr_engine?: string | null;
  ocr_confidence?: number | null;
  page_count?: number;
  chunks_indexed?: number;
  ocr_diagnostics?: OcrDiagnostics;
  storage_key?: string;
  download_url?: string;
  review_status?: string;
};
export type OcrStatusResponse = {
  default_engine: string;
  supported_extensions: string[];
  parsers: {
    pdf_pymupdf: boolean;
    pdf_pypdf: boolean;
    docx: boolean;
    image_pillow: boolean;
  };
  engines: {
    printed: { engine: string; available: boolean; language: string };
    handwriting: { engine: string; available: boolean; model: string; device: string };
  };
};

type AuthResponse = { access_token: string; token_type: string; user: AuthUser };
export type DemoAuthResponse = { demo_role: string; access_token?: string; portal_access_token?: string; token_type?: string; user: AuthUser | PortalAuthResponse["user"] };
export type PortalAuthResponse = { access_token: string; token_type: string; user: { id: string; patient_id: string; email: string; full_name: string; role: string } };

const DEMO_MODE_KEY = "careos-demo-mode";
const DEMO_USER_KEY = "careos-demo-user";

function buildDemoUser(accountRole: string): AuthUser {
  const role = accountRole === "patient" ? "patient" : accountRole;
  const canonicalRole = (role in rolePermissions ? role : "receptionist") as Role;
  const fullPerms = role === "patient" ? [] : Array.from(new Set([
    ...(rolePermissions[canonicalRole] || []),
    "dashboard", "patients", "appointments", "messages", "analytics", "contacts", "settings", "reports", "departments", "clinicOps", "notes", "assistant", "documents", "teamAudit", "integrations", "admin", "staff"
  ]));

  const baseUser: AuthUser = {
    id: `demo-${role}`,
    organization_id: "demo-org",
    workspace_id: "demo-workspace",
    department: "General Medicine",
    project: "Demo workspace",
    email: `${role === "patient" ? "patient.demo" : `${role}.demo`}@careos.demo`,
    full_name: role === "patient" ? "Mariam Hassan" : `${role === "doctor" ? "Dr. Rana Samir" : role.charAt(0).toUpperCase() + role.slice(1).replace(/_/g, " ")}`,
    role,
    permissions: fullPerms,
    onboarding_complete: true,
    mfa_enabled: false,
  };

  return baseUser;
}

function getDemoUser(): AuthUser | null {
  const raw = localStorage.getItem(DEMO_USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

function saveDemoSession(user: AuthUser, isPortal = false): void {
  localStorage.setItem(DEMO_MODE_KEY, "true");
  localStorage.setItem(DEMO_USER_KEY, JSON.stringify(user));
  if (isPortal) {
    localStorage.setItem("careos-portal-token", "demo-portal-token");
    localStorage.removeItem("careos-access-token");
    return;
  }
  localStorage.setItem("careos-access-token", "demo-staff-token");
  localStorage.removeItem("careos-portal-token");
}

function getDemoAccountByRole(role: string) {
  return demoAccounts.find((account) => account.role === role) ?? demoAccounts[0];
}

function isDemoRequestFailure(error: unknown): boolean {
  if (error && typeof error === "object" && "status" in error) {
    const status = Number((error as { status?: number }).status);
    if ([500, 502, 503, 504].includes(status)) {
      return true;
    }
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (
      message.includes("failed to fetch") ||
      message.includes("network") ||
      message.includes("offline") ||
      message.includes("load failed") ||
      message.includes("request failed") ||
      message.includes("service unavailable") ||
      message.includes("bad gateway") ||
      message.includes("gateway timeout")
    ) {
      return true;
    }
  }
  return false;
}

function storeStaffToken(token: string): void {
  localStorage.setItem("careos-access-token", token);
  localStorage.removeItem("careos-portal-token");
  localStorage.setItem(DEMO_MODE_KEY, "false");
}

function storePortalToken(token: string): void {
  localStorage.setItem("careos-portal-token", token);
  localStorage.removeItem("careos-access-token");
  localStorage.setItem(DEMO_MODE_KEY, "false");
}

export async function register(email: string, password: string, fullName: string, organizationName: string, department = "", project = ""): Promise<AuthResponse> {
  const result = await request<AuthResponse>("/auth/register", { method: "POST", body: JSON.stringify({ email, password, full_name: fullName, organization_name: organizationName, department, project }) });
  storeStaffToken(result.access_token);
  return result;
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const result = await request<AuthResponse>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
  storeStaffToken(result.access_token);
  return result;
}

export async function demoLogin(role: string, username: string, password: string): Promise<DemoAuthResponse> {
  try {
    const result = await request<DemoAuthResponse>("/auth/demo-login", { method: "POST", body: JSON.stringify({ role, username, password }) });
    if (result.portal_access_token) {
      localStorage.setItem("careos-portal-token", result.portal_access_token);
      localStorage.removeItem("careos-access-token");
    } else if (result.access_token) {
      localStorage.setItem("careos-access-token", result.access_token);
      localStorage.removeItem("careos-portal-token");
    }
    localStorage.setItem(DEMO_MODE_KEY, "false");
    return result;
  } catch (error) {
    if (!isDemoRequestFailure(error)) {
      throw error;
    }

    const account = getDemoAccountByRole(role);
    const normalizedRole = role === "patient" ? "patient" : (account?.role ?? role);
    const isPortalAccount = normalizedRole === "patient";
    const user = buildDemoUser(normalizedRole);

    if (username !== account?.username || password !== account?.password) {
      throw new Error("Demo credentials do not match the offline account list.");
    }

    saveDemoSession(user, isPortalAccount);

    return {
      demo_role: normalizedRole,
      access_token: isPortalAccount ? undefined : "demo-staff-token",
      portal_access_token: isPortalAccount ? "demo-portal-token" : undefined,
      token_type: "demo",
      user: isPortalAccount ? { id: user.id, patient_id: user.id, email: user.email, full_name: user.full_name, role: user.role } : user,
    };
  }
}

export async function loginWithSso(provider = "hospital_sso", email = "", password = ""): Promise<AuthResponse> {
  const result = await request<AuthResponse>("/auth/sso", {
    method: "POST",
    body: JSON.stringify({ provider, email, password }),
  });
  storeStaffToken(result.access_token);
  return result;
}

export async function startHospitalSso(provider = "hospital_sso", email?: string): Promise<SSOStartResponse> {
  return request<SSOStartResponse>("/auth/sso/start", {
    method: "POST",
    body: JSON.stringify({ provider, email, redirect_uri: window.location.origin }),
  });
}

export async function exchangeHospitalSso(code: string, state: string, provider = "hospital_sso"): Promise<AuthResponse> {
  const result = await request<AuthResponse>("/auth/sso/callback", {
    method: "POST",
    body: JSON.stringify({ code, state, provider }),
  });
  storeStaffToken(result.access_token);
  return result;
}

export async function getCurrentUser(): Promise<AuthUser> {
  if (localStorage.getItem(DEMO_MODE_KEY) === "true") {
    const user = getDemoUser();
    const token = localStorage.getItem("careos-access-token");
    if (user && token !== "demo-staff-token") return user;
    if (user) {
      const account = getDemoAccountByRole(user.role);
      const restored = await demoLogin(account.role, account.username, account.password);
      if ("organization_id" in restored.user) return restored.user;
      throw new Error("A patient demo account cannot restore a staff session.");
    }
  }

  try {
    return await request<AuthUser>("/me");
  } catch (error) {
    if (!isDemoRequestFailure(error) && localStorage.getItem(DEMO_MODE_KEY) !== "true") {
      throw error;
    }
    const user = getDemoUser() ?? buildDemoUser("admin");
    saveDemoSession(user, false);
    return user;
  }
}

export async function getSystemStatus(): Promise<SystemStatus> {
  return request<SystemStatus>("/system/status");
}

export async function getOrganization(): Promise<Organization> {
  return request<Organization>("/organization");
}

export async function getOrganizationWorkspace(): Promise<Workspace> {
  return request<Workspace>("/workspace");
}

export async function completeOrganization(name: string, department: string, timezone: string): Promise<void> {
  await request("/organization", { method: "PATCH", body: JSON.stringify({ name, department, timezone }) });
}

export async function createWorkspace(name: string, department: string, timezone: string): Promise<Workspace> {
  return request<Workspace>("/workspace", { method: "POST", body: JSON.stringify({ name, department, timezone }) });
}

export async function logout(): Promise<void> {
  localStorage.removeItem("careos-access-token");
  localStorage.removeItem("careos-portal-token");
  localStorage.removeItem(DEMO_MODE_KEY);
  localStorage.removeItem(DEMO_USER_KEY);
}

export async function portalLogin(email: string, password: string): Promise<PortalAuthResponse> {
  const result = await request<PortalAuthResponse>("/patient-portal/login", { method: "POST", body: JSON.stringify({ email, password }) });
  storePortalToken(result.access_token);
  return result;
}

export async function portalSignUp(payload: {
  full_name: string;
  email: string;
  password: string;
  phone: string;
  national_id?: string;
  date_of_birth?: string;
  gender?: string;
  blood_type?: string;
  emergency_contact?: string;
  chronic_conditions?: string;
  allergies?: string;
  current_medications?: string;
  address?: string;
}): Promise<PortalAuthResponse> {
  const result = await request<PortalAuthResponse>("/patient-portal/signup", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  storePortalToken(result.access_token);
  return result;
}

export function getPortalAccount(): Promise<PortalAuthResponse["user"]> {
  if (localStorage.getItem(DEMO_MODE_KEY) === "true") {
    const user = getDemoUser();
    if (user) {
      const token = localStorage.getItem("careos-portal-token");
      if (token !== "demo-portal-token") {
        return Promise.resolve({ id: user.id, patient_id: user.id, email: user.email, full_name: user.full_name, role: user.role });
      }
      const account = getDemoAccountByRole("patient");
      return demoLogin(account.role, account.username, account.password).then(
        (restored) => {
          if (
            restored.portal_access_token &&
            restored.portal_access_token !== "demo-portal-token" &&
            "patient_id" in restored.user
          ) return restored.user;
          return { id: user.id, patient_id: user.id, email: user.email, full_name: user.full_name, role: user.role };
        },
      );
    }
  }

  return portalRequest<PortalAuthResponse["user"]>("/patient-portal/me").catch((error) => {
    if (!isDemoRequestFailure(error)) {
      throw error;
    }
    const user = getDemoUser() ?? buildDemoUser("patient");
    saveDemoSession(user, true);
    return { id: user.id, patient_id: user.id, email: user.email, full_name: user.full_name, role: user.role };
  });
}

export function getPortalOverview(): Promise<PortalOverview> {
  return portalRequest<PortalOverview>("/patient-portal/overview");
}

export function getPortalClinicians(): Promise<PortalClinicianDirectory> {
  return portalRequest<PortalClinicianDirectory>("/patient-portal/clinicians");
}

export function getPortalAvailability(
  clinicianId: string,
  fromDate: string,
  toDate: string,
): Promise<PortalAvailabilitySlot[]> {
  const params = new URLSearchParams({ from_date: fromDate, to_date: toDate });
  return portalRequest<PortalAvailabilitySlot[]>(
    `/patient-portal/clinicians/${clinicianId}/availability?${params.toString()}`,
  );
}

export function bookPortalAppointment(payload: {
  clinician_id: string;
  starts_at: string;
  reason: string;
}): Promise<ApiAppointment> {
  return portalRequest<ApiAppointment>("/patient-portal/appointments", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function cancelPortalAppointment(
  appointmentId: string,
): Promise<ApiAppointment> {
  return portalRequest<ApiAppointment>(
    `/patient-portal/appointments/${appointmentId}/cancel`,
    { method: "POST" },
  );
}

export function sendPortalMessage(payload: { subject: string; body: string }): Promise<ApiMessage> {
  return portalRequest<ApiMessage>("/patient-portal/messages", { method: "POST", body: JSON.stringify(payload) });
}

export function deletePortalMessage(messageId: string): Promise<{ id: string; deleted: boolean; deleted_at: string }> {
  return portalRequest<{ id: string; deleted: boolean; deleted_at: string }>(
    `/patient-portal/messages/${messageId}`,
    { method: "DELETE" },
  );
}

export async function downloadPortalDocument(documentId: string): Promise<Blob> {
  const response = await fetch(`${import.meta.env.VITE_API_URL || "/api/v1"}/patient-portal/documents/${documentId}/download`, { headers: { Authorization: `Bearer ${localStorage.getItem("careos-portal-token") || ""}` } });
  if (!response.ok) throw new Error("Could not download document");
  return response.blob();
}

export async function exportPortalMessagesPdf(): Promise<Blob> {
  const response = await fetch(`${import.meta.env.VITE_API_URL || "/api/v1"}/patient-portal/messages/export-pdf`, {
    headers: { Authorization: `Bearer ${localStorage.getItem("careos-portal-token") || ""}` },
  });
  if (!response.ok) throw new Error("Could not export messages PDF");
  return response.blob();
}

export async function uploadPortalDocument(file: File): Promise<{ id: string; filename: string; download_url: string }> {
  const content = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(new Error("Could not read document"));
    reader.readAsDataURL(file);
  });
  return portalRequest<{ id: string; filename: string; download_url: string }>("/patient-portal/documents", { method: "POST", body: JSON.stringify({ filename: file.name, content, content_type: file.type || "application/octet-stream" }) });
}

export async function getPortalPrescriptions(): Promise<PrescriptionRecord[]> {
  return portalRequest<PrescriptionRecord[]>("/patient-portal/prescriptions");
}

export async function getTeam(): Promise<AuthUser[]> {
  return request<AuthUser[]>("/team");
}

export type CreateUserInput = {
  full_name: string;
  email: string;
  password: string;
  role: string;
  department?: string;
  project?: string;
};

export async function createTeamUser(data: CreateUserInput): Promise<AuthUser> {
  return request<AuthUser>("/team/users", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function deleteTeamUser(userId: string): Promise<{ deleted: boolean; id: string }> {
  return request<{ deleted: boolean; id: string }>(`/team/users/${userId}`, {
    method: "DELETE",
  });
}

export function getClinicianSchedules(clinicianId: string): Promise<ClinicianSchedule[]> {
  return request<ClinicianSchedule[]>(`/clinicians/${clinicianId}/schedules`);
}

export function createClinicianSchedule(
  clinicianId: string,
  schedule: Omit<ClinicianSchedule, "id" | "clinician_id">,
): Promise<ClinicianSchedule> {
  return request<ClinicianSchedule>(`/clinicians/${clinicianId}/schedules`, {
    method: "POST",
    body: JSON.stringify(schedule),
  });
}

export function deleteClinicianSchedule(
  clinicianId: string,
  scheduleId: string,
): Promise<void> {
  return request<void>(`/clinicians/${clinicianId}/schedules/${scheduleId}`, {
    method: "DELETE",
  });
}

export async function getDashboard(): Promise<DashboardContract> {
  return request<DashboardContract>("/dashboard");
}

export async function getNotifications(): Promise<Array<{ id: string; kind: string; title: string; body: string; read: boolean; created_at: string }>> {
  return request<Array<{ id: string; kind: string; title: string; body: string; read: boolean; created_at: string }>>("/notifications");
}
export const markNotificationRead = (id: string) => request<{ read: boolean }>(`/notifications/${id}/read`, { method: "PATCH" });

export async function enrollMfa(): Promise<{ secret: string; otpauth_uri: string; enabled: boolean }> {
  return request("/auth/mfa/enroll", { method: "POST" });
}

export async function verifyMfa(code: string): Promise<{ enabled: boolean; recovery_codes: string[] }> {
  return request("/auth/mfa/verify", { method: "POST", body: JSON.stringify({ code }) });
}

export async function regenerateMfaRecoveryCodes(): Promise<{ recovery_codes: string[] }> {
  return request("/auth/mfa/recovery-codes", { method: "POST" });
}

export async function getAuditEvents(): Promise<Array<{ action: string; resource: string; created_at: string }>> {
  return request<Array<{ action: string; resource: string; created_at: string }>>("/audit-events");
}

export async function getMessages(): Promise<ApiMessage[]> {
  return request<ApiMessage[]>("/messages");
}

export async function createMessage(payload: { patient_id: string; subject: string; body: string }): Promise<ApiMessage> {
  return request<ApiMessage>("/messages", { method: "POST", body: JSON.stringify(payload) });
}
export const markMessageRead = (id: string) => request<{ read: boolean }>(`/messages/${id}/read`, { method: "PATCH" });
export const deleteMessage = (id: string) => request<{ id: string; deleted: boolean; deleted_at: string }>(`/messages/${id}`, { method: "DELETE" });
export const deletePatientMessages = (patientId: string) => request<{ patient_id: string; deleted_count: number; deleted_at: string }>(`/messages/patient/${patientId}`, { method: "DELETE" });

export async function getPortalPatient(patientId: string): Promise<PortalPatientResponse> {
  return request<PortalPatientResponse>(`/portal/patients/${patientId}`);
}

export async function getAnalytics(): Promise<AnalyticsResponse> {
  return request<AnalyticsResponse>("/analytics");
}

export async function getReports(): Promise<ReportsResponse> {
  return request<ReportsResponse>("/reports");
}

export async function getTasks(): Promise<TaskItem[]> {
  return request<TaskItem[]>("/tasks");
}

export async function createTask(task: { patient_id: string; title: string; description: string; assignee?: string; priority?: string; status?: string; due_at?: string | null }): Promise<TaskItem> {
  return request<TaskItem>("/tasks", { method: "POST", body: JSON.stringify(task) });
}

export async function getCarePlans(): Promise<CarePlanItem[]> {
  return request<CarePlanItem[]>("/care-plans");
}

export async function createCarePlan(plan: { patient_id: string; title: string; summary: string; status?: string; goals?: string[] }): Promise<CarePlanItem> {
  return request<CarePlanItem>("/care-plans", { method: "POST", body: JSON.stringify(plan) });
}

export async function getDepartmentMetrics(): Promise<DepartmentMetricsResponse> {
  return request<DepartmentMetricsResponse>("/department-metrics");
}

export const getPatients = (q = "", page = 1, pageSize = 50) => {
  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
  if (q.trim()) params.set("q", q.trim());
  return request<ApiPatient[]>(`/patients?${params.toString()}`);
};
export const getPatientById = (id: string) => request<PatientDetailResponse>(`/patients/${id}`);
export const createEncounter = (patientId: string, encounterType = "consultation") => request<ApiEncounter>("/encounters", { method: "POST", body: JSON.stringify({ patient_id: patientId, encounter_type: encounterType }) });
export const getEncounter = (id: string) => request<ApiEncounter>(`/encounters/${id}`);
export const getLatestPatientEncounter = (patientId: string) => request<ApiEncounter>(`/patients/${patientId}/encounters/latest`);
export async function uploadEncounterRecording(encounterId: string, blob: Blob, filename = "consultation.webm", language: "ar-EG" | "en-US" = "ar-EG"): Promise<{ id: string; encounter_id: string; patient_id: string; transcript_id: string; transcript_status: string }> {
  const content = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1] || ""); reader.onerror = () => reject(new Error("Could not read recording")); reader.readAsDataURL(blob); });
  return request(`/encounters/${encounterId}/recordings`, { method: "POST", body: JSON.stringify({ content, filename, content_type: blob.type || "audio/webm", language }) });
}
export const getTranscript = (id: string) => request<ApiTranscript>(`/transcripts/${id}`);
export const transcribeRecording = (id: string) => request<{ id: string; status: string; job_status?: string | null; job_wait_seconds?: number | null; worker_status?: "active" | "unresponsive" | "unknown"; transcript_text: string | null; confidence: number | null; provider: string }>(`/recordings/${id}/transcribe`, { method: "POST" });
export const reviewTranscript = (id: string, transcriptText: string) => request<{ id: string; version: number; transcript_text: string; status: string }>(`/transcripts/${id}/review`, { method: "PATCH", body: JSON.stringify({ transcript_text: transcriptText }) });
export const createPatient = (patient: PatientRegistrationInput) => request<ApiPatient>("/patients", { method: "POST", body: JSON.stringify({ ...patient, department: patient.department ?? "", project: patient.project ?? "" }) });
export const getAppointments = (filters: { status?: string; fromAt?: string; toAt?: string; page?: number; pageSize?: number } = {}) => {
  const params = new URLSearchParams({ page: String(filters.page ?? 1), page_size: String(filters.pageSize ?? 100) });
  if (filters.status) params.set("status", filters.status);
  if (filters.fromAt) params.set("from_at", filters.fromAt);
  if (filters.toAt) params.set("to_at", filters.toAt);
  return request<ApiAppointment[]>(`/appointments?${params.toString()}`);
};
export const createAppointment = (appointment: { patient_id: string; starts_at: string; reason: string; status?: string }) => request<ApiAppointment>("/appointments", { method: "POST", body: JSON.stringify(appointment) });
export type WalkInPayload = {
  given_name: string;
  family_name?: string;
  phone: string;
  clinician_id?: string | null;
  reason?: string;
  starts_at?: string | null;
  duration_minutes?: number;
  gender?: string;
  date_of_birth?: string | null;
  condition?: string;
};
export type WalkInResponse = {
  appointment: ApiAppointment;
  patient: {
    id: string;
    medical_record_number: string;
    patient_code: string;
    given_name: string;
    family_name: string;
    phone: string;
  };
  confirmation_code: string;
  queue_number: string;
  is_new_patient: boolean;
};
export const createWalkInAppointment = (payload: WalkInPayload) =>
  request<WalkInResponse>("/appointments/walk-in", {
    method: "POST",
    body: JSON.stringify(payload),
  });
export const updateAppointmentStatus = (id: string, status: string) => request<ApiAppointment>(`/appointments/${id}/status?status=${encodeURIComponent(status)}`, { method: "PATCH" });
export const rescheduleAppointment = (id: string, startsAt: string, reason?: string) => request<ApiAppointment>(`/appointments/${id}`, { method: "PATCH", body: JSON.stringify({ starts_at: startsAt, ...(reason ? { reason } : {}) }) });
export const createClinicalNote = (note: { patient_id: string; encounter_id?: string; body: string; ai_draft?: string | null }) => request<ApiNote>("/clinical-notes", { method: "POST", body: JSON.stringify(note) });
export const updateClinicalNote = (id: string, note: { body: string; ai_draft?: string | null }) => request<ApiNote>(`/clinical-notes/${id}`, { method: "PATCH", body: JSON.stringify(note) });
export const getClinicalNoteVersions = (id: string) => request<Array<{ id: string; version: number; body: string; ai_draft: string | null; status: string; author_id: string; created_at: string }>>(`/clinical-notes/${id}/versions`);
export const generateClinicalSummary = (id: string) => request<ApiNote & { provider: string; summary?: string }>(`/clinical-notes/${id}/summary`, { method: "POST" });
export const signClinicalNote = (id: string) => request<ApiNote>(`/clinical-notes/${id}/sign`, { method: "POST" });
export const generateClinicalNoteDocument = (id: string) =>
  request<{ id: string; filename: string; review_status: string; download_url: string }>(
    `/clinical-notes/${id}/document`,
    { method: "POST" },
  );
export async function uploadPatientDocument(
  patientId: string,
  file: File,
  ocrEngine?: "printed" | "handwriting",
): Promise<DocumentUploadResponse> {
  const content = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(new Error("Could not read document"));
    reader.readAsDataURL(file);
  });
  return request<DocumentUploadResponse>(`/patients/${patientId}/documents`, {
    method: "POST",
    body: JSON.stringify({
      filename: file.name,
      content,
      content_type: file.type || "application/octet-stream",
      ...(ocrEngine ? { ocr_engine: ocrEngine } : {}),
    }),
  });
}
export const getOcrStatus = () => request<OcrStatusResponse>("/ocr/status");
export const extractPatientDocumentText = (
  patientId: string,
  documentId: string,
  ocrEngine?: "printed" | "handwriting",
) =>
  request<DocumentUploadResponse & { ocr_applied?: boolean; ocr_engine?: string | null; page_count?: number }>(
    `/patients/${patientId}/documents/${documentId}/ocr`,
    {
      method: "POST",
      body: JSON.stringify(ocrEngine ? { ocr_engine: ocrEngine } : {}),
    },
  );
export const reviewPatientDocument = (
  patientId: string,
  documentId: string,
  status: "pending" | "approved" | "rejected",
) =>
  request<{
    id: string;
    review_status: string;
    chunks_indexed?: number;
    ocr_diagnostics?: OcrDiagnostics;
  }>(`/patients/${patientId}/documents/${documentId}/review?status=${status}`, {
    method: "PATCH",
  });
export const deletePatientDocument = (patientId: string, documentId: string) =>
  request<{ id: string; deleted: boolean; deleted_at: string; chunks_removed?: number }>(
    `/patients/${patientId}/documents/${documentId}`,
    { method: "DELETE" },
  );
export async function downloadPatientDocument(patientId: string, documentId: string): Promise<Blob> {
  const token = localStorage.getItem("careos-access-token");
  const response = await fetch(
    `${import.meta.env.VITE_API_URL || "/api/v1"}/patients/${patientId}/documents/${documentId}/download`,
    { headers: token ? { Authorization: `Bearer ${token}` } : {} },
  );
  if (!response.ok) {
    if (response.status === 401) clearSession();
    const body = await response.json().catch(() => ({}));
    throw new ApiError(response.status, body.detail || "Could not download document");
  }
  return response.blob();
}

export type PatientPortalAccountInfo = {
  has_account: boolean;
  patient_id: string;
  email: string | null;
  is_active: boolean;
  created_at: string | null;
};

export type ProvisionPortalAccountResponse = {
  status: "created" | "updated";
  patient_id: string;
  email: string;
  temporary_password?: string;
  is_new: boolean;
};

export async function getPatientPortalAccount(patientId: string): Promise<PatientPortalAccountInfo> {
  return request<PatientPortalAccountInfo>(`/patients/${patientId}/portal-account`);
}

export async function provisionPatientPortalAccount(
  patientId: string,
  payload: { email: string; full_name?: string; temporary_password?: string },
): Promise<ProvisionPortalAccountResponse> {
  return request<ProvisionPortalAccountResponse>(`/patients/${patientId}/portal-account`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function inviteTeamMember(email: string, role: string): Promise<{ status: string }> {
  return request<{ status: string }>("/team/invites", {
    method: "POST",
    body: JSON.stringify({ email, role }),
  });
}

export type VitalSignsRecord = {
  id: string;
  patient_id: string;
  recorded_by_id?: string | null;
  systolic_bp?: number | null;
  diastolic_bp?: number | null;
  heart_rate?: number | null;
  respiratory_rate?: number | null;
  oxygen_saturation?: number | null;
  temperature_celsius?: number | null;
  bmi?: number | null;
  consciousness_level: string;
  on_supplemental_oxygen: boolean;
  news2_score: number;
  clinical_risk: "low" | "medium" | "high";
  notes?: string;
  recorded_at: string;
};

export type RecordVitalsInput = {
  systolic_bp?: number;
  diastolic_bp?: number;
  heart_rate?: number;
  respiratory_rate?: number;
  oxygen_saturation?: number;
  temperature_celsius?: number;
  bmi?: number;
  consciousness_level?: string;
  on_supplemental_oxygen?: boolean;
  notes?: string;
};

export type PrescriptionRecord = {
  id: string;
  patient_id: string;
  clinician_id: string;
  medication_name: string;
  rxnorm_code?: string | null;
  dosage: string;
  route: string;
  frequency: string;
  duration_days: number;
  instructions: string;
  status: string;
  allergy_warning?: string | null;
  created_at: string;
};

export type CreatePrescriptionInput = {
  medication_name: string;
  dosage: string;
  route?: string;
  frequency: string;
  duration_days?: number;
  instructions?: string;
  rxnorm_code?: string;
  override_allergy_warning?: boolean;
};

export type BreakGlassInput = {
  reason: string;
  justification: string;
};

export type BreakGlassResponse = {
  status: "granted";
  patient_id: string;
  actor_id: string;
  expires_at: string;
  reason: string;
};

export type LabResultRecord = {
  id: string;
  patient_id: string;
  order_id?: string | null;
  test_name: string;
  loinc_code?: string | null;
  result_value: string;
  unit: string;
  reference_range: string;
  is_panic_critical: boolean;
  interpretation: string;
  verified_by_id?: string | null;
  created_at: string;
};

export type RecordLabInput = {
  test_name: string;
  result_value: string;
  unit?: string;
  reference_range?: string;
  loinc_code?: string;
  is_panic_critical?: boolean;
  interpretation?: string;
};

export async function getPatientVitals(patientId: string): Promise<VitalSignsRecord[]> {
  return request<VitalSignsRecord[]>(`/patients/${patientId}/vitals`);
}

export async function recordPatientVitals(
  patientId: string,
  payload: RecordVitalsInput,
): Promise<{ id: string; patient_id: string; news2_score: number; clinical_risk: string; recorded_at: string }> {
  return request(`/patients/${patientId}/vitals`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getPatientPrescriptions(patientId: string): Promise<PrescriptionRecord[]> {
  return request<PrescriptionRecord[]>(`/patients/${patientId}/prescriptions`);
}

export async function createPatientPrescription(
  patientId: string,
  payload: CreatePrescriptionInput,
): Promise<PrescriptionRecord> {
  return request<PrescriptionRecord>(`/patients/${patientId}/prescriptions`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function activateBreakGlassAccess(
  patientId: string,
  payload: BreakGlassInput,
): Promise<BreakGlassResponse> {
  return request<BreakGlassResponse>(`/patients/${patientId}/break-glass`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getPatientLabs(patientId: string): Promise<LabResultRecord[]> {
  return request<LabResultRecord[]>(`/patients/${patientId}/labs`);
}

export async function recordPatientLab(
  patientId: string,
  payload: RecordLabInput,
): Promise<LabResultRecord> {
  return request<LabResultRecord>(`/patients/${patientId}/labs`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}


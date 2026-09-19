import { portalRequest, request } from "./api/client";

export type AuthUser = {
  id: string;
  organization_id: string;
  workspace_id?: string | null;
  department?: string;
  project?: string;
  email: string;
  full_name: string;
  role: string;
  onboarding_complete: boolean;
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
  id: string; medical_record_number: string; given_name: string; family_name: string;
  department?: string; project?: string;
  date_of_birth: string; gender: string; condition: string; care_status: string;
};
export type ApiAppointment = { id: string; patient_id: string; starts_at: string; reason: string; status: string; reminder_status: string };
export type ApiNote = { id: string; patient_id: string; body: string; ai_draft: string | null; status: string; signed_at: string | null };
export type ApiMessage = {
  id: string;
  patient_id: string;
  subject: string;
  body: string;
  sender_type: string;
  direction: string;
  read: boolean;
  created_at: string;
};
export type PortalPatientResponse = {
  patient: ApiPatient;
  messages: Array<{ id: string; subject: string; body: string; direction: string; sender_type: string; read: boolean; created_at: string }>;
  documents: Array<{ id: string; filename: string; ocr_status: string; extracted_text?: string | null; created_at: string }>;
  latest_status: string;
};
export type PatientDetailResponse = ApiPatient & {
  notes: Array<{ id: string; body: string; ai_draft: string | null; status: string; created_at?: string }>;
  documents: Array<{ id: string; filename: string; ocr_status: string; extracted_text?: string | null }>;
};
export type AnalyticsResponse = {
  overview: { patients: number; appointments: number; follow_up_due: number; today_count: number };
  department_breakdown: Array<{ department: string; count: number }>;
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
  storage_key?: string;
  download_url?: string;
  review_status?: string;
};

type AuthResponse = { access_token: string; token_type: string; user: AuthUser };
export type PortalAuthResponse = { access_token: string; token_type: string; user: { id: string; patient_id: string; email: string; full_name: string; role: string } };

export async function register(email: string, password: string, fullName: string, organizationName: string, department = "", project = ""): Promise<AuthResponse> {
  const result = await request<AuthResponse>("/auth/register", { method: "POST", body: JSON.stringify({ email, password, full_name: fullName, organization_name: organizationName, department, project }) });
  localStorage.setItem("careos-access-token", result.access_token);
  return result;
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const result = await request<AuthResponse>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
  localStorage.setItem("careos-access-token", result.access_token);
  return result;
}

export async function loginWithSso(provider = "hospital_sso", email = "", password = ""): Promise<AuthResponse> {
  const result = await request<AuthResponse>("/auth/sso", {
    method: "POST",
    body: JSON.stringify({ provider, email, password }),
  });
  localStorage.setItem("careos-access-token", result.access_token);
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
  localStorage.setItem("careos-access-token", result.access_token);
  return result;
}

export async function getCurrentUser(): Promise<AuthUser> {
  return request<AuthUser>("/me");
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
}

export async function portalLogin(email: string, password: string): Promise<PortalAuthResponse> {
  const result = await request<PortalAuthResponse>("/patient-portal/login", { method: "POST", body: JSON.stringify({ email, password }) });
  localStorage.setItem("careos-portal-token", result.access_token);
  return result;
}

export function getPortalAccount(): Promise<PortalAuthResponse["user"]> {
  return portalRequest<PortalAuthResponse["user"]>("/patient-portal/me");
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

export async function getTeam(): Promise<AuthUser[]> {
  return request<AuthUser[]>("/team");
}

export async function getDashboard(): Promise<DashboardContract> {
  return request<DashboardContract>("/dashboard");
}

export async function getNotifications(): Promise<Array<{ id: string; kind: string; title: string; body: string; read: boolean; created_at: string }>> {
  return request<Array<{ id: string; kind: string; title: string; body: string; read: boolean; created_at: string }>>("/notifications");
}
export const markNotificationRead = (id: string) => request<{ read: boolean }>(`/notifications/${id}/read`, { method: "PATCH" });

export async function getAuditEvents(): Promise<Array<{ action: string; resource: string; created_at: string }>> {
  return request<Array<{ action: string; resource: string; created_at: string }>>("/audit-events");
}

export async function getMessages(): Promise<ApiMessage[]> {
  return request<ApiMessage[]>("/messages");
}

export async function createMessage(payload: { patient_id: string; subject: string; body: string; sender_type?: string; direction?: string }): Promise<ApiMessage> {
  return request<ApiMessage>("/messages", { method: "POST", body: JSON.stringify(payload) });
}
export const markMessageRead = (id: string) => request<{ read: boolean }>(`/messages/${id}/read`, { method: "PATCH" });

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

export const getPatients = (q = "") => request<ApiPatient[]>(`/patients${q ? `?q=${encodeURIComponent(q)}` : ""}`);
export const getPatientById = (id: string) => request<PatientDetailResponse>(`/patients/${id}`);
export const createPatient = (patient: Omit<ApiPatient, "id">) => request<ApiPatient>("/patients", { method: "POST", body: JSON.stringify({ ...patient, department: patient.department ?? "", project: patient.project ?? "" }) });
export const getAppointments = () => request<ApiAppointment[]>("/appointments");
export const createAppointment = (appointment: { patient_id: string; starts_at: string; reason: string; status?: string }) => request<ApiAppointment>("/appointments", { method: "POST", body: JSON.stringify(appointment) });
export const updateAppointmentStatus = (id: string, status: string) => request<ApiAppointment>(`/appointments/${id}/status?status=${encodeURIComponent(status)}`, { method: "PATCH" });
export const createClinicalNote = (note: { patient_id: string; body: string; ai_draft?: string | null }) => request<ApiNote>("/clinical-notes", { method: "POST", body: JSON.stringify(note) });
export const generateClinicalSummary = (id: string) => request<ApiNote & { provider: string; summary?: string }>(`/clinical-notes/${id}/summary`, { method: "POST" });
export const signClinicalNote = (id: string) => request<ApiNote>(`/clinical-notes/${id}/sign`, { method: "POST" });
export const askAssistant = (patient_id: string, question = patient_id) => request<{ answer: string; response?: string; confidence: number; sources: Array<{ title: string; page?: string }>; provider: string }>("/assistant/query", { method: "POST", body: JSON.stringify({ patient_id, question }) });
export async function uploadPatientDocument(patientId: string, file: File): Promise<DocumentUploadResponse> {
  const content = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(new Error("Could not read document"));
    reader.readAsDataURL(file);
  });
  return request<DocumentUploadResponse>(`/patients/${patientId}/documents`, {
    method: "POST",
    body: JSON.stringify({ filename: file.name, content, content_type: file.type || "application/octet-stream" }),
  });
}
export const reviewPatientDocument = (patientId: string, documentId: string, status: "pending" | "approved" | "rejected") => request<{ id: string; review_status: string }>(`/patients/${patientId}/documents/${documentId}/review?status=${status}`, { method: "PATCH" });

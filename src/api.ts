const API_BASE = import.meta.env.VITE_API_URL || "/api/v1";

export type AuthUser = {
  id: string;
  organization_id: string;
  email: string;
  full_name: string;
  role: string;
  onboarding_complete: boolean;
};

export type ApiPatient = {
  id: string; medical_record_number: string; given_name: string; family_name: string;
  date_of_birth: string; gender: string; condition: string; care_status: string;
};
export type ApiAppointment = { id: string; patient_id: string; starts_at: string; reason: string; status: string; reminder_status: string };
export type ApiNote = { id: string; patient_id: string; body: string; ai_draft: string | null; status: string; signed_at: string | null };

type AuthResponse = { access_token: string; token_type: string; user: AuthUser };

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem("careos-access-token");
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail || "Request failed");
  }
  return response.json() as Promise<T>;
}

export async function register(email: string, password: string, fullName: string, organizationName: string): Promise<AuthResponse> {
  const result = await request<AuthResponse>("/auth/register", { method: "POST", body: JSON.stringify({ email, password, full_name: fullName, organization_name: organizationName }) });
  localStorage.setItem("careos-access-token", result.access_token);
  return result;
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const result = await request<AuthResponse>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
  localStorage.setItem("careos-access-token", result.access_token);
  return result;
}

export async function completeOrganization(name: string, department: string, timezone: string): Promise<void> {
  await request("/organization", { method: "PATCH", body: JSON.stringify({ name, department, timezone }) });
}

export async function logout(): Promise<void> {
  localStorage.removeItem("careos-access-token");
}

export async function getTeam(): Promise<AuthUser[]> {
  return request<AuthUser[]>("/team");
}

export async function getAuditEvents(): Promise<Array<{ action: string; resource: string; created_at: string }>> {
  return request<Array<{ action: string; resource: string; created_at: string }>>("/audit-events");
}

export const getPatients = (q = "") => request<ApiPatient[]>(`/patients${q ? `?q=${encodeURIComponent(q)}` : ""}`);
export const createPatient = (patient: Omit<ApiPatient, "id">) => request<ApiPatient>("/patients", { method: "POST", body: JSON.stringify(patient) });
export const getAppointments = () => request<ApiAppointment[]>("/appointments");
export const createAppointment = (appointment: { patient_id: string; starts_at: string; reason: string; status?: string }) => request<ApiAppointment>("/appointments", { method: "POST", body: JSON.stringify(appointment) });
export const updateAppointmentStatus = (id: string, status: string) => request<ApiAppointment>(`/appointments/${id}/status?status=${encodeURIComponent(status)}`, { method: "PATCH" });
export const createClinicalNote = (note: { patient_id: string; body: string; ai_draft?: string | null }) => request<ApiNote>("/clinical-notes", { method: "POST", body: JSON.stringify(note) });
export const generateClinicalSummary = (id: string) => request<ApiNote & { provider: string }>(`/clinical-notes/${id}/summary`, { method: "POST" });
export const signClinicalNote = (id: string) => request<ApiNote>(`/clinical-notes/${id}/sign`, { method: "POST" });
export const askAssistant = (patient_id: string, question: string) => request<{ answer: string; confidence: number; sources: Array<{ title: string; page?: string }>; provider: string }>("/assistant/query", { method: "POST", body: JSON.stringify({ patient_id, question }) });
export const uploadPatientDocument = (patientId: string, filename: string) => request(`/patients/${patientId}/documents`, { method: "POST", body: JSON.stringify({ filename }) });

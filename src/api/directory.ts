import { request } from "./client";

export interface DirectoryContact {
  id: string;
  category: "staff" | "patient" | "lead";
  full_name: string;
  email: string;
  phone?: string | null;
  role_or_type: string;
  department_or_source: string;
  created_at: string;
}

export interface DirectoryResponse {
  total_count: number;
  staff_count: number;
  patient_count: number;
  lead_count: number;
  contacts: DirectoryContact[];
}

export interface LeadCapturePayload {
  full_name: string;
  email: string;
  phone?: string;
  company?: string;
  source?: string;
  notes?: string;
}

export async function fetchDirectoryContacts(params?: {
  category?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{
  total_count: number;
  staff_count: number;
  patient_count: number;
  lead_count: number;
  contacts: DirectoryContact[];
}> {
  const query = new URLSearchParams();
  if (params?.category && params.category !== "all") query.set("category", params.category);
  if (params?.search) query.set("search", params.search);
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.offset) query.set("offset", String(params.offset));

  const qs = query.toString();
  return request(`/directory/contacts${qs ? `?${qs}` : ""}`);
}

export async function capturePublicLead(payload: LeadCapturePayload): Promise<{ status: string; message: string; id: string }> {
  return request(`/public/leads`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function deleteLead(leadId: string): Promise<{ deleted: boolean }> {
  return request(`/directory/leads/${leadId}`, {
    method: "DELETE",
  });
}

export function getExportContactsUrl(category = "all", search = ""): string {
  const query = new URLSearchParams();
  if (category && category !== "all") query.set("category", category);
  if (search) query.set("search", search);
  const qs = query.toString();
  const base = import.meta.env.VITE_API_URL || "/api/v1";
  return `${base}/directory/contacts/export${qs ? `?${qs}` : ""}`;
}

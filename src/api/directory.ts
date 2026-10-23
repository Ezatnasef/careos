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

const LOCAL_LEADS_KEY = "careos-local-leads";

export const fallbackContacts: DirectoryContact[] = [
  // Medical Staff
  {
    id: "staff-1",
    category: "staff",
    full_name: "Dr. Rana Samir",
    email: "doctor.demo@careos.demo",
    phone: "+20 100 554 1120",
    role_or_type: "physician",
    department_or_source: "General Medicine",
    created_at: "2026-10-15T09:00:00Z",
  },
  {
    id: "staff-2",
    category: "staff",
    full_name: "CareOS Admin",
    email: "admin.demo@careos.demo",
    phone: "+20 100 112 3344",
    role_or_type: "administrator",
    department_or_source: "Hospital Administration",
    created_at: "2026-10-10T08:30:00Z",
  },
  {
    id: "staff-3",
    category: "staff",
    full_name: "Sara Mohamed (RN)",
    email: "nurse.demo@careos.demo",
    phone: "+20 102 998 4411",
    role_or_type: "nurse",
    department_or_source: "Emergency 24/7",
    created_at: "2026-10-16T11:15:00Z",
  },
  {
    id: "staff-4",
    category: "staff",
    full_name: "Reem Mostafa",
    email: "reception.demo@careos.demo",
    phone: "+20 101 445 7788",
    role_or_type: "receptionist",
    department_or_source: "Admissions Desk",
    created_at: "2026-10-17T12:00:00Z",
  },
  // Registered Patients
  {
    id: "pat-1",
    category: "patient",
    full_name: "Mariam Hassan",
    email: "mariam.hassan@patient.careos.eg",
    phone: "+20 100 887 9922",
    role_or_type: "patient",
    department_or_source: "Outpatient Clinic",
    created_at: "2026-10-18T14:20:00Z",
  },
  {
    id: "pat-2",
    category: "patient",
    full_name: "Omar Khaled",
    email: "omar.khaled@patient.careos.eg",
    phone: "+20 111 234 5678",
    role_or_type: "patient",
    department_or_source: "General Medicine",
    created_at: "2026-10-19T10:10:00Z",
  },
  {
    id: "pat-3",
    category: "patient",
    full_name: "Nour El Din",
    email: "nour.eldin@patient.careos.eg",
    phone: "+20 122 345 6789",
    role_or_type: "patient",
    department_or_source: "Cardiology",
    created_at: "2026-10-20T16:45:00Z",
  },
  {
    id: "pat-4",
    category: "patient",
    full_name: "Salma Adel",
    email: "salma.adel@patient.careos.eg",
    phone: "+20 109 876 5432",
    role_or_type: "patient",
    department_or_source: "Pediatrics",
    created_at: "2026-10-21T09:30:00Z",
  },
  // Visitor Leads & Demo Requesters
  {
    id: "lead-1",
    category: "lead",
    full_name: "Dr. Ahmed Sami",
    email: "ahmed.sami@alamal-hospital.org",
    phone: "+20 100 123 4567",
    role_or_type: "demo_lead",
    department_or_source: "Landing Demo Request (Al-Amal Hospital)",
    created_at: "2026-10-22T13:40:00Z",
  },
  {
    id: "lead-2",
    category: "lead",
    full_name: "Dr. Tarek Salem",
    email: "tarek.salem@shorouk-clinics.com",
    phone: "+20 114 555 7789",
    role_or_type: "inquiry",
    department_or_source: "Landing Inquiry (Shorouk Polyclinics)",
    created_at: "2026-10-23T11:05:00Z",
  },
  {
    id: "lead-3",
    category: "lead",
    full_name: "Eng. Mona Fikry",
    email: "m.fikry@cairo-medical.net",
    phone: "+20 106 333 9900",
    role_or_type: "partner",
    department_or_source: "Hospital IT Integration",
    created_at: "2026-10-23T15:20:00Z",
  },
];

function getStoredLocalLeads(): DirectoryContact[] {
  try {
    const raw = localStorage.getItem(LOCAL_LEADS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalLead(lead: DirectoryContact): void {
  const existing = getStoredLocalLeads();
  const filtered = existing.filter((l) => l.email !== lead.email);
  localStorage.setItem(LOCAL_LEADS_KEY, JSON.stringify([lead, ...filtered]));
}

function removeLocalLead(id: string): void {
  const existing = getStoredLocalLeads();
  localStorage.setItem(LOCAL_LEADS_KEY, JSON.stringify(existing.filter((l) => l.id !== id)));
}

export async function fetchDirectoryContacts(params?: {
  category?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<DirectoryResponse> {
  const query = new URLSearchParams();
  if (params?.category && params.category !== "all") query.set("category", params.category);
  if (params?.search) query.set("search", params.search);
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.offset) query.set("offset", String(params.offset));

  const qs = query.toString();
  try {
    const data = await request<DirectoryResponse>(`/directory/contacts${qs ? `?${qs}` : ""}`);
    return data;
  } catch {
    // Offline / Demo fallback
    const localLeads = getStoredLocalLeads();
    const combined = [...localLeads, ...fallbackContacts];

    // Filter duplicates by email
    const uniqueMap = new Map<string, DirectoryContact>();
    for (const c of combined) {
      if (!uniqueMap.has(c.email.toLowerCase())) {
        uniqueMap.set(c.email.toLowerCase(), c);
      }
    }
    let list = Array.from(uniqueMap.values());

    const staffCount = list.filter((c) => c.category === "staff").length;
    const patientCount = list.filter((c) => c.category === "patient").length;
    const leadCount = list.filter((c) => c.category === "lead").length;

    if (params?.category && params.category !== "all") {
      list = list.filter((c) => c.category === params.category);
    }

    if (params?.search) {
      const s = params.search.trim().toLowerCase();
      list = list.filter(
        (c) =>
          c.full_name.toLowerCase().includes(s) ||
          c.email.toLowerCase().includes(s) ||
          (c.phone && c.phone.includes(s)) ||
          c.department_or_source.toLowerCase().includes(s)
      );
    }

    return {
      total_count: staffCount + patientCount + leadCount,
      staff_count: staffCount,
      patient_count: patientCount,
      lead_count: leadCount,
      contacts: list,
    };
  }
}

export async function capturePublicLead(payload: LeadCapturePayload): Promise<{ status: string; message: string; id: string }> {
  try {
    return await request(`/public/leads`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  } catch {
    // Save to local storage for instant feedback
    const localLead: DirectoryContact = {
      id: `local-lead-${Date.now()}`,
      category: "lead",
      full_name: payload.full_name,
      email: payload.email,
      phone: payload.phone || null,
      role_or_type: "lead",
      department_or_source: payload.company ? `Inquiry (${payload.company})` : payload.source || "Landing Demo",
      created_at: new Date().toISOString(),
    };
    saveLocalLead(localLead);
    return { status: "ok", message: "Saved locally", id: localLead.id };
  }
}

export async function deleteLead(leadId: string): Promise<{ deleted: boolean }> {
  try {
    return await request(`/directory/leads/${leadId}`, {
      method: "DELETE",
    });
  } catch {
    removeLocalLead(leadId);
    return { deleted: true };
  }
}

export function getExportContactsUrl(category = "all", search = ""): string {
  const query = new URLSearchParams();
  if (category && category !== "all") query.set("category", category);
  if (search) query.set("search", search);
  const qs = query.toString();
  const base = import.meta.env.VITE_API_URL || "/api/v1";
  return `${base}/directory/contacts/export${qs ? `?${qs}` : ""}`;
}

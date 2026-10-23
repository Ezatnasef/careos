import { request } from "./client";

export type GeneralChatResponse = {
  answer: string;
  sources: Array<{
    id?: string;
    title?: string;
    page?: string;
    category?: string;
    links?: Record<string, string>;
  }>;
  provider: string;
  audio_base64?: string;
  audio_content_type?: string;
};

export type GuestVoiceResponse = GeneralChatResponse & {
  transcript: string;
  speech_provider: string;
  audio_base64?: string;
  audio_content_type?: string;
};

export type GuestChatHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

export function askGeneralChat(message: string): Promise<GeneralChatResponse> {
  return request<GeneralChatResponse>("/assistant/chat", {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}

export function askGuestChat(
  message: string,
  language?: "ar-EG" | "en-US",
  synthesizeSpeech = false,
  conversationHistory: GuestChatHistoryMessage[] = [],
): Promise<GeneralChatResponse> {
  return request<GeneralChatResponse>("/assistant/guest-chat", {
    method: "POST",
    body: JSON.stringify({
      message,
      language,
      synthesize_speech: synthesizeSpeech,
      conversation_history: conversationHistory,
    }),
  });
}

export type TranscribeVoiceResponse = {
  transcript: string;
  provider: string;
};

export function transcribeGuestVoice(
  audioBase64: string,
  language: "ar-EG" | "en-US" = "ar-EG",
): Promise<TranscribeVoiceResponse> {
  return request<TranscribeVoiceResponse>("/assistant/guest-transcribe", {
    method: "POST",
    body: JSON.stringify({
      audio_base64: audioBase64,
      content_type: "audio/webm",
      language,
    }),
  });
}

export function askGuestVoice(
  audioBase64: string,
  language: "ar-EG" | "en-US",
  conversationHistory: GuestChatHistoryMessage[] = [],
): Promise<GuestVoiceResponse> {
  return request<GuestVoiceResponse>("/assistant/guest-voice", {
    method: "POST",
    body: JSON.stringify({
      audio_base64: audioBase64,
      content_type: "audio/webm",
      language,
      conversation_history: conversationHistory,
    }),
  });
}

export type ClinicalRagCitation = {
  chunk_id: string;
  source: string;
  source_type?: string;
  document_id?: string | null;
  page: number;
  relevance_score: number;
  excerpt: string;
};

export type ClinicalRagDiagnostics = {
  diagnostic_mode: string;
  query_mode: string;
  retrieved_chunks_count: number;
  chunks_above_threshold_count: number;
  selected_context_chunks_count: number;
  retrieved_sources: Array<{
    chunk_id: string;
    source: string;
    document_id?: string | null;
    source_type: string;
    page: number;
    score: number;
    above_threshold: boolean;
    selected_for_context: boolean;
  }>;
  citation_mapping: Array<{
    chunk_id: string;
    source: string;
    document_id?: string | null;
    source_type: string;
    maps_to_retrieved_source: boolean;
  }>;
  all_citations_mapped: boolean;
  abstained: boolean;
  abstention_reason?: string | null;
  indexed_chunks_in_scope?: {
    guideline_chunks: number;
    patient_document_chunks: number;
    total_chunks: number;
  };
};

export type ClinicalPatientContext = {
  age?: number | null;
  sex?: string | null;
  pregnant?: boolean | null;
  conditions?: string[];
  medications?: string[];
  allergies?: string[];
  labs?: Record<string, string | number>;
  vitals?: Record<string, string | number>;
  clinical_notes?: string | null;
};

export type ClinicalRagAnswerResponse = {
  question: string;
  answer: string;
  citations: ClinicalRagCitation[];
  chunks_used: number;
  grounded: boolean;
  query_mode: "guideline_only" | "patient_only" | "mixed";
  patient_context_used: boolean;
  patient_factors_applied: string[];
  disclaimer: string;
  diagnostics?: ClinicalRagDiagnostics | null;
};

export type ClinicalRagStatsResponse = {
  total_chunks: number;
  guideline_chunks: number;
  patient_document_chunks: number;
  sources: string[];
};

export function queryClinicalRag(
  question: string,
  options?: {
    patientId?: string;
    topK?: number;
    patientContext?: ClinicalPatientContext;
  },
): Promise<ClinicalRagAnswerResponse> {
  const endpoint = options?.patientId
    ? `/patients/${encodeURIComponent(options.patientId)}/rag/query`
    : "/rag/query";

  return request<ClinicalRagAnswerResponse>(endpoint, {
    method: "POST",
    body: JSON.stringify({
      question,
      top_k: options?.topK ?? 5,
      ...(options?.patientId ? { patient_id: options.patientId } : {}),
      ...(options?.patientContext ? { patient_context: options.patientContext } : {}),
    }),
  });
}

export function getClinicalRagStats(patientId?: string): Promise<ClinicalRagStatsResponse> {
  const query = patientId ? `?patient_id=${encodeURIComponent(patientId)}` : "";
  return request<ClinicalRagStatsResponse>(`/rag/stats${query}`);
}

export type OrchestratorResponse = {
  answer: string;
  intent: "booking" | "followup" | "unknown" | string;
  status: "accepted" | "success" | "error";
  active_agent?: string | null;
  conversation_id?: string | null;
  patient_id?: string | null;
  orchestrator_state?: Record<string, unknown> | null;
  result?: Record<string, unknown> | null;
  error?: string | null;
};

export function askOrchestratorChat(
  message: string,
  options?: {
    patientId?: string | null;
    conversationId?: string | null;
    orchestratorState?: Record<string, unknown> | null;
  },
): Promise<OrchestratorResponse> {
  return request<OrchestratorResponse>("/assistant/orchestrator/chat", {
    method: "POST",
    body: JSON.stringify({
      message,
      patient_id: options?.patientId,
      conversation_id: options?.conversationId,
      orchestrator_state: options?.orchestratorState,
    }),
  });
}

export type VoiceTurnResponse = {
  session_id: string;
  response_text: string;
  thought?: string;
  intent?: string | null;
  audio_base64?: string | null;
  audio_mime_type?: string | null;
};

export async function askVoiceTurn(
  text: string,
  sessionId?: string | null,
  patientId = "demo-patient-001",
): Promise<VoiceTurnResponse> {
  const url = "/voice-api/v1/voice/turns";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Patient-Id": patientId,
    },
    body: JSON.stringify({
      text,
      session_id: sessionId,
    }),
  });
  if (!res.ok) {
    throw new Error(`Voice receptionist returned HTTP ${res.status}`);
  }
  return res.json();
}

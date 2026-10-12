import json
import re
from typing import List, Dict, Any
from backend.config import KNOWLEDGE_FILE, SIGNIN_URL, SIGNUP_URL, PLATFORM_BASE_URL

def normalize_arabic(text: str) -> str:
    """Normalize Arabic characters to improve search matching."""
    text = re.sub(r'[\u064B-\u0652]', '', text)  # remove harakat
    text = re.sub(r'[إأآا]', 'ا', text)
    text = re.sub(r'ة', 'ه', text)
    text = re.sub(r'ى', 'ي', text)
    text = re.sub(r'ـ', '', text)  # remove tatweel
    return text.lower()

class CareOSRAGEngine:
    def __init__(self, knowledge_path=KNOWLEDGE_FILE):
        self.knowledge_path = knowledge_path
        self.chunks = self._load_chunks()

    def _load_chunks(self) -> List[Dict[str, Any]]:
        try:
            with open(self.knowledge_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"Warning: Failed to load knowledge base: {e}")
            return []

    def retrieve(self, query: str, top_k: int = 4) -> List[Dict[str, Any]]:
        if not self.chunks:
            return []

        raw_query = query.lower()
        norm_query = normalize_arabic(query)
        query_tokens = set(re.findall(r'[\w\-]+', norm_query))
        raw_tokens = set(re.findall(r'[\w\-]+', raw_query))

        scored_chunks = []

        for chunk in self.chunks:
            score = 0.0
            title_norm = normalize_arabic(chunk.get("title", ""))
            content_norm = normalize_arabic(chunk.get("content", ""))
            keywords = [normalize_arabic(k) for k in chunk.get("keywords", [])]

            # 1. Exact phrase matches in title or content
            if raw_query in chunk.get("title", "").lower() or norm_query in title_norm:
                score += 15.0

            # 2. Keyword overlap
            for kw in keywords:
                if kw in norm_query or kw in raw_query:
                    score += 8.0
                for token in query_tokens:
                    if len(token) > 2 and token in kw:
                        score += 3.0

            # 3. Token matches in Title
            for token in query_tokens:
                if len(token) > 2:
                    if token in title_norm:
                        score += 4.0
                    if token in content_norm:
                        score += 1.0

            # 4. Special Intent Boosts
            # Patient intent
            if any(w in norm_query for w in ["مريض", "مرضي", "بوابه", "حجز", "تحاليل", "اشعه", "patient", "portal", "tests", "booking"]):
                if chunk.get("category") == "patient_services":
                    score += 10.0

            # Clinician intent
            if any(w in norm_query for w in ["طبيب", "دكتور", "تمريض", "املاء", "صوت", "ملاحظات", "doctor", "clinician", "dictation", "notes"]):
                if chunk.get("category") == "clinician_services":
                    score += 10.0

            # Sign-in / Sign-up intent
            if any(w in norm_query for w in ["دخول", "تسجيل", "حساب", "رابط", "signin", "login", "signup", "register"]):
                if chunk.get("category") == "navigation":
                    score += 12.0

            if score > 0:
                scored_chunks.append((score, chunk))

        # Sort descending by score
        scored_chunks.sort(key=lambda x: x[0], reverse=True)

        # Fallback: if no specific match, always provide core overview + patient services
        if not scored_chunks:
            defaults = [c for c in self.chunks if c.get("category") in ["overview", "patient_services", "navigation"]]
            return defaults[:top_k]

        return [c for _, c in scored_chunks[:top_k]]

    def build_system_prompt(self, user_query: str) -> str:
        relevant_chunks = self.retrieve(user_query, top_k=4)
        
        context_blocks = []
        for i, chunk in enumerate(relevant_chunks, 1):
            context_blocks.append(
                f"[Document {i}: {chunk.get('title')}]\n{chunk.get('content')}"
            )

        context_text = "\n\n---\n\n".join(context_blocks)

        system_prompt = f"""You are the official CareOS Platform Assistant.
CareOS (https://careos-pearl.vercel.app/) is an intelligent clinical operating workspace that unifies clinical workflows, patient records, appointments, and ambient AI assistance.

CRITICAL INSTRUCTIONS:
1. Target Audience: You assist visitors, prospective patients, and healthcare providers (doctors, nurses, clinic managers) before they sign in.
   - For patients: Emphasize the Patient Portal, booking/rescheduling appointments, accessing approved medical documents/lab reports, and secure communication with care teams.
   - For clinicians/staff: Emphasize voice-to-text dictation, AI draft generation with human-in-the-loop review, OCR document intake, and patient care directories.
2. Language Mirroring: Automatically detect the user's language and respond naturally in that exact language and dialect:
   - If user asks in Egyptian Arabic ('عامية مصرية'), reply warmly and professionally in Egyptian Arabic or clear Modern Standard Arabic.
   - If user asks in Modern Standard Arabic, reply in Modern Standard Arabic.
   - If user asks in English, reply in English.
   - If user asks in another language (French, etc.), reply in that language.
3. Linking Policy: Do NOT include sign-in, login, or sign-up links unless the user explicitly asks how to log in, register, or access their account. If the user is asking about features, patient portal, clinicians, appointments, or services, answer their question directly without attaching any links.
   - Only if the user explicitly asks how to log in or register:
     - Sign In: [Sign In to CareOS]({SIGNIN_URL})
     - Create Account: [CareOS Platform]({SIGNUP_URL})
4. Grounding: Answer based strictly on the verified CareOS Platform Knowledge Base below. Do NOT hallucinate features CareOS doesn't have.
5. Medical Safety Guardrail: If the user asks for immediate medical diagnosis or has an emergency, clearly state that you are a platform assistant, not a doctor or emergency service, and urge them to seek urgent medical care.
6. Tone: Highly professional, empathetic, concise, welcoming, and clear. Format responses with clean bullet points and bold headers.

--- CAREOS VERIFIED KNOWLEDGE BASE ---
{context_text}
--------------------------------------
"""
        return system_prompt

# Singleton instance
rag_engine = CareOSRAGEngine()

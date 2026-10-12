import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any, Optional

from backend.config import MODEL, BASE_URL, PORT, HOST, SIGNIN_URL, SIGNUP_URL
from backend.rag_engine import rag_engine
from backend.llm_client import llm_client

app = FastAPI(
    title="CareOS Platform Assistant API",
    description="Intelligent pre-login healthcare platform assistant with RAG",
    version="1.0.0"
)

# Enable CORS for cross-origin integration with frontend applications
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    temperature: Optional[float] = 0.3
    max_tokens: Optional[int] = 1000

class ChatResponse(BaseModel):
    reply: str
    sources: List[Dict[str, Any]]
    model: str
    configured: bool

@app.get("/")
async def api_root():
    return {
        "service": "CareOS Platform Assistant RAG API",
        "status": "online",
        "version": "1.0.0",
        "docs": "/docs",
        "endpoints": {
            "health": "/api/health",
            "chat": "/api/chat",
            "quick_topics": "/api/quick-topics"
        }
    }

@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "CareOS Platform Assistant",
        "model": llm_client.model,
        "base_url": llm_client.base_url,
        "configured": llm_client.is_configured(),
        "total_knowledge_chunks": len(rag_engine.chunks)
    }

@app.get("/api/quick-topics")
async def get_quick_topics():
    return {
        "en": [
            {"id": "what_is_careos", "label": "What is CareOS?", "query": "What is CareOS and why is it important?"},
            {"id": "patient_portal", "label": "Patient Services & Portal", "query": "What services does CareOS provide to patients?"},
            {"id": "clinician_tools", "label": "Tools for Clinicians", "query": "How does CareOS assist doctors and care teams with notes and workflows?"},
            {"id": "signin_access", "label": "How to Sign In", "query": "How do I sign in or create an account?"},
        ],
        "ar": [
            {"id": "what_is_careos_ar", "label": "ما هي منصة CareOS؟", "query": "ما هي منصة CareOS وما أهميتها؟"},
            {"id": "patient_services_ar", "label": "خدمات المرضى وبوابة المريض", "query": "ما هي الخدمات والمعلومات التي تقدمها المنصة للمرضى؟"},
            {"id": "clinician_tools_ar", "label": "مزايا الأطباء والتمريض", "query": "كيف تساعد المنصة الأطباء في كتابة الملاحظات وسير العمل؟"},
            {"id": "signin_access_ar", "label": "تسجيل الدخول والتسجيل", "query": "كيف أقوم بتسجيل الدخول أو بدء الاستخدام؟"},
        ]
    }

@app.post("/api/chat", response_model=ChatResponse)
async def chat_endpoint(request: ChatRequest):
    if not request.messages:
        raise HTTPException(status_code=400, detail="Messages list cannot be empty.")

    raw_messages = [{"role": m.role, "content": m.content} for m in request.messages]
    last_query = next((m["content"] for m in reversed(raw_messages) if m["role"] == "user"), "")

    # Retrieve relevant sources
    relevant_chunks = rag_engine.retrieve(last_query, top_k=3)
    sources = [
        {
            "id": c.get("id"),
            "title": c.get("title"),
            "category": c.get("category"),
            "links": c.get("links", {})
        }
        for c in relevant_chunks
    ]

    # Generate response
    reply = await llm_client.generate_response(
        messages=raw_messages,
        temperature=request.temperature or 0.3,
        max_tokens=request.max_tokens or 1000
    )

    return ChatResponse(
        reply=reply,
        sources=sources,
        model=llm_client.model,
        configured=llm_client.is_configured()
    )

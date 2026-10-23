# CareOS Platform Assistant — Intelligent RAG Service

[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688.svg?style=flat&logo=FastAPI&logoColor=white)](https://fastapi.tiangolo.com)
[![Python 3.10+](https://img.shields.io/badge/Python-3.10+-3776AB.svg?style=flat&logo=python&logoColor=white)](https://python.org)
[![Groq](https://img.shields.io/badge/LLM-Groq%20Free%20OSS-f55036.svg?style=flat)](https://groq.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
## 🛡️ Medical Safety & Disclaimer

This assistant serves strictly as an informational and platform navigation guide. It is programmed not to deliver clinical diagnoses, emergency triage, or prescription alterations. In emergencies, users are instructed to contact their local emergency medical services immediately.

A high-performance, headless **Retrieval-Augmented Generation (RAG)** chatbot service built for [CareOS](https://careos-pearl.vercel.app/) — the clinical intelligence workspace.

This assistant is designed to guide prospective users, patients, and healthcare providers *before* they sign in, explaining the platform's features, patient portal tools, clinical workflows, and how to get started.

---

## 🌟 Key Features

* **Knowledge-First RAG with LLM Fallback:** Answers from verified CareOS knowledge when relevant; if retrieval finds no match, a configured LLM may answer general non-clinical questions while refusing to invent CareOS-specific details.
* **Dual-Audience Intelligence:**
  * **For Patients:** Details the Patient Portal, appointment tracking, accessing approved lab results & physician notes, and secure communication.
  * **For Healthcare Teams:** Explains ambient consultation recording, speech-to-text dictation, AI draft SOAP notes with doctor approval, and document OCR evidence chains.
* **Bilingual & Dialect-Aware:** Automatically detects language and responds naturally in English, Modern Standard Arabic, or Egyptian Arabic with dynamic RTL support.
* **Ultra-Fast Free OSS Inference:** Powered by Groq's high-speed inference engine (`llama-3.3-70b-versatile`, `qwen/qwen3.8-27b`) with sub-2-second responses.
* **Strict Linking Policy:** Answers informational questions directly without unsolicited sign-in links; provides direct deep links (`/signin` and `/`) only when the user explicitly asks how to log in or register.
* **Headless REST API:** Easily integrates into any web application, mobile app, or frontend widget via standardized JSON endpoints.

---

## 📁 Repository Structure

```text
├── backend/
│   ├── __init__.py
│   ├── config.py           # Environment and provider configuration
│   ├── rag_engine.py       # Arabic/English token retrieval & prompt synthesis
│   ├── llm_client.py       # Asynchronous Groq/OpenAI-compatible LLM client
│   └── main.py             # FastAPI REST endpoints & CORS configuration
├── knowledge/
│   ├── careos_platform_readme.md      # CareOS platform specification document
│   ├── careos_platform_information.md # CareOS platform capabilities & workflows
│   └── knowledge_chunks.json          # Curated bilingual CareOS platform feature knowledge
├── .env.example            # Environment variables template
├── .gitignore              # Protects secrets and ignores build artifacts
├── requirements.txt        # Python package dependencies
├── run.py                  # Server entry point
└── test_assistant.py       # Diagnostic and verification test suite
```

---

## 🚀 Quick Start Guide

### 1. Prerequisites
* Python 3.10 or higher
* A free Groq API key (get one instantly at [console.groq.com](https://console.groq.com/keys))

### 2. Clone and Setup Environment

```bash
git clone https://github.com/your-username/careos-platform-assistant.git
cd careos-platform-assistant

# Create virtual environment
python -m venv venv

# Activate virtual environment
# On Windows:
venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate
```

### 3. Install Dependencies

```bash
pip install -r requirements.txt
```

### 4. Configure Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Edit `.env` and paste your Groq API key:

```env
GROQ_API_KEY=gsk_your_actual_groq_api_key_here
GROQ_BASE_URL=https://api.groq.com/openai/v1
GROQ_MODEL=llama-3.3-70b-versatile
PLATFORM_BASE_URL=https://careos-pearl.vercel.app
PORT=8000
HOST=127.0.0.1
```

In the CareOS monorepo, if the assistant's `.env` does not override an LLM provider, it can use the Gemini key and model from `../backend/.env`. Retrieved knowledge is sent to the model when available; when retrieval finds no relevant entry, the model receives an explicit fallback instruction. CareOS-specific claims remain limited to verified knowledge.

### 5. Run Verification Diagnostics

Test knowledge retrieval and model generation:

```bash
python test_assistant.py
```

### 6. Start the API Server

```bash
python run.py
```

---

## 📡 API Reference

### 1. Chat Completion (`POST /api/chat`)

Generates a grounded, bilingual assistant response based on conversation history.

**Request Body:**
```json
{
  "messages": [
    {
      "role": "user",
      "content": "What services does CareOS provide to patients?"
    }
  ],
  "temperature": 0.3,
  "max_tokens": 1000
}
```

**Response (200 OK):**
```json
{
  "reply": "CareOS provides patients with a dedicated Patient Portal where they can view upcoming appointments, access verified lab results and clinical summaries, message their care teams securely, and track personalized care plans.",
  "sources": [
    {
      "id": "patient_services_and_portal",
      "title": "Patient Portal & Services | خدمات المرضى وبوابة المريض",
      "category": "patient_services",
      "links": {
        "signin": "https://careos-pearl.vercel.app/signin"
      }
    }
  ],
  "model": "llama-3.3-70b-versatile",
  "configured": true
}
```

### 2. Health & Model Diagnostics (`GET /api/health`)

Returns the current server health and active model configuration.

**Response:**
```json
{
  "status": "healthy",
  "service": "CareOS Platform Assistant",
  "model": "llama-3.3-70b-versatile",
  "base_url": "https://api.groq.com/openai/v1",
  "configured": true,
  "total_knowledge_chunks": 8
}
```

### 3. Quick Starter Topics (`GET /api/quick-topics`)

Returns recommended starter chips for both English and Arabic users.

---


## 📄 License

This project is licensed under the MIT License.
=======

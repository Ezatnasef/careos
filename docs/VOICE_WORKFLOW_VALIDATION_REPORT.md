# CAREOS Full Workflow Validation Report

## Phase 1 - Environment
- backend/.env: PRESENT
- backend/.env.example: PRESENT
- voice-agent/.env: ABSENT (example exists under voice-agent/voice_agent/.env.example)
- root .env: ABSENT
- .gitignore excludes backend/.env

Status: VERIFIED (envs identified; no secrets printed)

## Phase 2 - Audio
- TTS libraries not found in env; audio files NOT generated
- Scenarios prepared at tests/voice_workflow/scenarios.py

Status: BLOCKED (no TTS available to generate synthetic audio)

## Tests
- Backend regression: 90 passed
- Voice orchestrator: 20 passed


## Summary
PASS: Core regression tests pass. 
BLOCKED: Audio generation, DB-grounded E2E write tests (read-only mode preferred). 
No secrets exposed.

## Updated Findings (further audit)
- voice-agent/.env ABSENT; config loads from parents[2]/.env and parents[1]/.env. Missing required names (for HTTP/orchestrator): ORCHESTRATOR_MODE, ORCHESTRATOR_URL, CAREOS_API_URL (optional but common). LLM vars optional in demo/mock.
- Offline TTS: not available in env; ffmpeg present. No audio fixtures. Egyptian Arabic audio cannot be generated without approved TTS install.
- DB: SQLite present; careos-e2e.db exists. Isolation UNPROVEN unless tests explicitly use it.
- Audio input path: app/api.py supports audio_base64; orchestrator path separate (booking_contract). E2E via actual audio requires supported endpoint config.

## E2E audit (config + audio + db)
- Voice config loads: voice-agent/voice-agent/.env (p1) and voice-agent/.env (p2). Neither exists; HTTP orchestrator mode requires ORCHESTRATOR_MODE, ORCHESTRATOR_URL. CAREOS_API_URL optional.
- No Arabic audio fixtures found; no offline TTS engines detected (ffmpeg only). No valid Arabic audio for input test.
- DB active: careos.db; careos-e2e.db exists but isolation not proven without env override. Write tests remain BLOCKED.
- Audio input path exists in API schema; no safe audio payload available for E2E.


## Smallest safe next step
- Create isolated test DB (e.g., set DATABASE_URL to sqlite+aiosqlite:////mnt/d/CAREOS_INTEGRATION_WORKSPACE/newcareos-main/backend/careos-e2e.db for backend tests) and verify isolation before writes.
- If offline Arabic TTS approval granted, install minimal safe engine (e.g., pyttsx3) in isolated env; else document BLOCKED for audio-input E2E.
- Provide minimal voice-agent/.env with non-secret ORCHESTRATOR_MODE=mock/staging and ORCHESTRATOR_URL only if running HTTP; avoid copying backend secrets.

## TTS Research (local/offline)
Options reviewed locally:
- pyttsx3: offline, engine-dependent (espeak/sapi), no Egyptian Arabic natural voice guaranteed.
- TTS (Coqui): high quality but heavy; not installed.
- edge-tts: online (Edge) but free; not offline and may require internet.
- gtts: online.
- espeak/espeak-ng: not installed; Arabic limited.

Recommendation: BLOCKED for automatic generation unless approved install of pyttsx3/espeak-ng. Smallest safe: prepare text fixtures and request approval before download/install.


## Config variables (names only)
Voice-Agent requires for HTTP orchestrator:
- ORCHESTRATOR_MODE (mock/staging/production) — if HTTP mode
- ORCHESTRATOR_URL (base/orchestrator endpoint base) — if HTTP mode
- ORCHESTRATOR_TIMEOUT_SECONDS (optional)
- ORCHESTRATOR_TOKEN (optional, secret)
- CAREOS_API_URL (optional; aligns with backend)
Loaded from: voice-agent/.env (parents[2]) and voice-agent/voice_agent/.env (parents[1]). voice-agent/.env is not required if values set in environment.

## DB isolation verification
- Check DATABASE_URL: if pointing to careos-e2e.db -> isolated. 
- Run only read-only in production-like db. 
- Never write without confirming file path matches test DB.
- Prefer running tests with test config (env override) or use transactions/fixtures that rollback.

## Next plan (WAIT FOR APPROVAL)
1. Confirm smallest TTS: pyttsx3 + espeak-ng (offline) OR request text-only E2E.
2. Create minimal voice-agent/.env with non-secret names only if HTTP mode needed.
3. Prove DB isolation before any mutation.
4. Generate WAVs for 6 scenarios if approved; else BLOCKED.

## Provider config (as configured)
- Backend .env has TEXT_TO_SPEECH_PROVIDER, TEXT_TO_SPEECH_API_URL (https://mohammedaly22-voicetut-tts.hf.space), SPEECH_TO_TEXT_PROVIDER=groq, AI_PROVIDER=groq present.
- Backend loads via pydantic-settings (repo root .env + backend/.env); TTS/STT/AI mapped in config/integrations.
- Voice-Agent loads its own .env (p1/p2) and uses ORCHESTRATOR_* for HTTP mode; it does not directly inherit backend TTS/STT keys unless passed.

## URL check
- TEXT_TO_SPEECH_API_URL is plain URL (no Markdown brackets). OK.

## Connectivity
- Safe non-mutating check: NOT performed (no approval for external TTS call). Groq keys exist in .env but paid calls not authorized. DB writes disabled.

BLOCKERS: unproven DB isolation; no Arabic audio fixtures; external TTS test requires approval. No code/env changes made.

## VoiceTut payload (from code inspection)
- Endpoint: {api_url}/gradio_api/call/run_b_oneshot (POST JSON)
- Payload.data: [speaker, text, language_label, 32, 2.5, 0.95, True]
  - speaker: default "Mohamed"
  - text: input
  - language_label: "العربية (Egyptian)" for ar, else "English"
  - params: [32, 2.5, 0.95, True] (numeric/flag per implementation)
- Flow: GET landing, POST to submit -> event_id; GET event stream until complete/error; extract audio URL; fetch audio (returns RIFF/WAV or MP3)
- Auth: uses text_to_speech_api_key if present; anonymous retry on specific error.

## Proposed test (non-destructive, requires approval)
- Arabic sentence (Egyptian): "عاوز أحجز ميعاد بكرة الصبح لو سمحت"
- Purpose: verify VoiceTut returns WAV/MP3 audio for Egyptian Arabic. No DB writes, no Groq calls.
- Endpoint: https://mohammedaly22-voicetut-tts.hf.space/gradio_api/call/run_b_oneshot
- Expected: non-empty audio bytes, WAV or MP3 format.
- Cost: External HTTP call to third-party HuggingFace Space; likely free for public space but not guaranteed zero cost. DO NOT execute without approval.

WAITING FOR EXPLICIT APPROVAL BEFORE MAKING EXTERNAL REQUEST.

## VoiceTut smoke test (approved - executed)
- Attempted 2 short requests to configured VoiceTut Space.
- Both returned event_id but ended with event:error data:null.
- No audio artifact created (0 bytes). Request format matches implementation but external service returned error for these payloads.
- Sanitized outcome: EXTERNAL_CALL_ATTEMPTED, RESULT=ERROR (no audio), NO_ARTIFACT_SAVED.
- DB isolation remains unproven; no other external calls made.

BLOCKED: VoiceTut TTS currently not returning audio for tested payloads; cannot generate Arabic audio fixtures via this provider at this time.

## Diagnosis (code-only, no new requests)
- VoiceTut impl at backend/app/integrations.py:388-500. Flow matches executed calls.
- Error observed: event:error with data:null after event_id. Code would raise on error.
- Two attempts = two separate outbound requests (not internal retry). Report wording corrected to reflect actual calls.
- Cause inconclusive from evidence; likely space/model/param issue or unavailable service. Anonymous retry not triggered by "data:null" string.
- No audio artifact created.

Safest next step: STOP external calls. Use offline/mock fixtures or obtain updated VoiceTut params; do not retry.

## Orchestrator HTTP (preflight)
- Endpoint: POST /api/v1/assistant/orchestrator/chat (GeneralChatInput). Returns intent/status/active_agent/state/result/error.
- /assistant/chat preserved.
- Backend not running; DB active is careos.db. careos-e2e.db exists but isolation UNPROVEN.
- DB writes BLOCKED until isolation verified.


## HTTP contract findings
- Orchestrator endpoint: /api/v1/assistant/orchestrator/chat (POST). Uses GeneralChatInput from request body.
- GeneralChatInput (current schema): message, language, synthesize_speech, conversation_history. Does not explicitly declare patient_id/conversation_id/orchestrator_state; endpoint accesses via getattr(request, ...).
- Response includes intent/status/active_agent/conversation_id/patient_id/orchestrator_state/result/error.
- Backend not running; DB isolation unproven -> write ops BLOCKED.


## Orchestrator contracts
- IntentType: booking/followup/unknown (backend/app/ai/orchestrator/contracts.py:8-14)
- active_agent: string or None (booking/followup expected by state/usage)
- Follow-up: tools return 501 in current codebase (stubbed) per earlier integration notes.


## Next step (HTTP execution blocked)
- Start backend with isolated test DB (DATABASE_URL pointing to careos-e2e.db) OR prove isolation; else all write tests remain BLOCKED.
- Without running server and isolated DB, cannot execute HTTP booking/follow-up write matrix. Non-mutating inspection complete.


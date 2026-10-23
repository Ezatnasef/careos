import { useEffect, useRef, useState } from "react";
import { CheckCircle2, FileText, Mic, Save, Square, Upload } from "lucide-react";
import {
  createClinicalNote,
  generateClinicalSummary,
  signClinicalNote,
  updateClinicalNote,
} from "../../api/clinical";
import {
  createEncounter,
  getPatients,
  getTranscript,
  reviewTranscript,
  transcribeRecording,
  uploadEncounterRecording,
  type ApiEncounter,
  type ApiPatient,
  type ApiTranscript,
} from "../../api";
import { PageHeading } from "../../components/PageHeading";
import { PanelHeading } from "../../components/PanelHeading";
import type { Language, TranslationKey } from "../../i18n";

type Translator = (key: TranslationKey) => string;

export function ClinicalNotes({
  t,
  language,
}: {
  t: Translator;
  language: Language;
}) {
  const [encounter, setEncounter] = useState<ApiEncounter | null>(null);
  const [patients, setPatients] = useState<ApiPatient[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>("");
  const [transcript, setTranscript] = useState<ApiTranscript | null>(null);
  const [body, setBody] = useState("");
  const [summary, setSummary] = useState("");
  const [draftSourceBody, setDraftSourceBody] = useState("");
  const [noteId, setNoteId] = useState<string | null>(null);
  const [approved, setApproved] = useState(false);
  const [status, setStatus] = useState<TranslationKey>("recordingReady");
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [processingRecording, setProcessingRecording] = useState(false);
  const [saving, setSaving] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const recognitionRef = useRef<{ stop: () => void; abort?: () => void } | null>(null);
  const chunks = useRef<Blob[]>([]);

  const selectPatient = (patientId: string) => {
    setSelectedPatientId(patientId);
    setEncounter(null);
    setTranscript(null);
    setBody("");
    setSummary("");
    setDraftSourceBody("");
    setNoteId(null);
    setApproved(false);
    setStatus("recordingReady");
    setError(null);
    localStorage.removeItem("careos-active-encounter-id");
  };

  const startSelectedEncounter = async () => {
    if (!selectedPatientId) return;
    setSaving(true);
    setError(null);
    try {
      const enc = await createEncounter(selectedPatientId);
      localStorage.setItem("careos-active-encounter-id", enc.id);
      setEncounter(enc);
    } catch (reason: unknown) {
      setStatus("transcriptReady");
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not initialize patient encounter.",
      );
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    let active = true;
    getPatients("", 1, 50)
      .then((list) => {
        if (!active) return;
        setPatients(list);
        localStorage.removeItem("careos-active-encounter-id");
        if (list.length > 0) {
          setSelectedPatientId(list[0].id);
        } else {
          setError(t("startEncounterRequired"));
        }
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(
            reason instanceof Error
              ? reason.message
              : "Could not load patients.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, [language]);

  const stopAndUpload = () => {
    try {
      recognitionRef.current?.stop();
    } catch {
      // Ignore recognition shutdown errors
    }
    recognitionRef.current = null;
    recorder.current?.stop();
    setRecording(false);
  };

  const startRecording = async () => {
    if (!encounter) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredMimeTypes = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
        "audio/ogg;codecs=opus",
        "audio/ogg",
      ];
      const supportedMime = preferredMimeTypes.find(
        (t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t),
      );
      const next = supportedMime
        ? new MediaRecorder(stream, { mimeType: supportedMime })
        : new MediaRecorder(stream);

      chunks.current = [];
      next.ondataavailable = (event) => {
        if (event.data.size) chunks.current.push(event.data);
      };

      // Real-time browser speech recognition for immediate zero-latency feedback
      type SpeechEvent = {
        results: Array<Array<{ transcript: string }>>;
      };
      type SpeechConstructor = new () => {
        continuous: boolean;
        interimResults: boolean;
        lang: string;
        onresult: (e: SpeechEvent) => void;
        onerror: (e: unknown) => void;
        start: () => void;
        stop: () => void;
      };
      const SpeechApi =
        (window as unknown as { SpeechRecognition?: SpeechConstructor; webkitSpeechRecognition?: SpeechConstructor }).SpeechRecognition ||
        (window as unknown as { SpeechRecognition?: SpeechConstructor; webkitSpeechRecognition?: SpeechConstructor }).webkitSpeechRecognition;

      if (SpeechApi) {
        try {
          const recognizer = new SpeechApi();
          recognizer.continuous = true;
          recognizer.interimResults = true;
          recognizer.lang = language === "ar" ? "ar-EG" : "en-US";
          recognizer.onresult = (ev: SpeechEvent) => {
            let combined = "";
            for (let i = 0; i < ev.results.length; i++) {
              combined += ev.results[i][0].transcript + " ";
            }
            if (combined.trim()) {
              setBody(combined.trim());
            }
          };
          recognizer.onerror = () => {
            // Non-fatal: MediaRecorder continues running
          };
          recognizer.start();
          recognitionRef.current = recognizer;
        } catch {
          // Non-fatal
        }
      }

      next.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunks.current, { type: supportedMime || "audio/webm" });
        setProcessingRecording(true);
        setStatus("uploadingRecording");
        setError(null);
        try {
          const uploaded = await uploadEncounterRecording(
            encounter.id,
            blob,
            "consultation.webm",
            language === "ar" ? "ar-EG" : "en-US",
          );
          const queued = await transcribeRecording(uploaded.id);
          setStatus(queued.job_status === "RETRY" ? "transcriptionRetrying" : "transcriptionQueued");
          let nextTranscript = await getTranscript(uploaded.transcript_id);
          for (
            let attempt = 0;
            attempt < 12 &&
            !["COMPLETED", "FAILED"].includes(nextTranscript.status);
            attempt += 1
          ) {
            if (nextTranscript.worker_status === "unresponsive") {
              setStatus("transcriptionWorkerUnresponsive");
            } else if (nextTranscript.job_status === "RETRY") {
              setStatus("transcriptionRetrying");
            } else if (nextTranscript.job_status === "QUEUED") {
              setStatus("transcriptionQueued");
            } else if (nextTranscript.job_status === "PROCESSING") {
              setStatus("transcribing");
            }
            await new Promise((resolve) => window.setTimeout(resolve, 1000));
            nextTranscript = await getTranscript(uploaded.transcript_id);
          }
          setTranscript(nextTranscript);
          if (nextTranscript.status === "COMPLETED" && nextTranscript.transcript_text?.trim()) {
            const transcriptText = nextTranscript.transcript_text.trim();
            setBody(transcriptText);
            setSummary("");
            setDraftSourceBody("");
            setNoteId(null);
            setApproved(false);
            setStatus("generatingAiDraft");
            await generateDraft(transcriptText, true, nextTranscript);
          } else if (nextTranscript.status === "COMPLETED") {
            setStatus("transcriptionFailed");
            setError(t("transcriptionEmptyResult"));
          } else if (nextTranscript.status === "FAILED") {
            setStatus("transcriptionFailed");
            setError(
              nextTranscript.error_code === "SPEECH_TO_TEXT_NOT_CONFIGURED"
                ? t("transcriptionProviderNotConfigured")
                : t("transcriptionProviderFailed"),
            );
          } else if (nextTranscript.job_status === "RETRY") {
            setStatus("transcriptionRetrying");
          } else if (nextTranscript.job_status === "PROCESSING") {
            setStatus("transcribing");
          } else if (nextTranscript.worker_status === "unresponsive") {
            setStatus("transcriptionWorkerUnresponsive");
          } else {
            setStatus("transcriptionWorkerDelayed");
          }
        } catch (reason) {
          setStatus("transcriptionFailed");
          setError(
            reason instanceof Error
              ? reason.message
              : t("transcriptionProviderFailed"),
          );
        } finally {
          setProcessingRecording(false);
        }
      };

      recorder.current = next;
      next.start();
      setRecording(true);
      setStatus("recording");
      setError(null);
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Microphone permission is required.",
      );
    }
  };

  const saveDraft = async (
    bodyText = body,
    draftText = summary,
    createNew = false,
    transcriptToReview = transcript,
  ) => {
    if (!encounter || !bodyText.trim() || approved) return null;
    setSaving(true);
    setError(null);
    try {
      if (
        transcriptToReview &&
        transcriptToReview.transcript_text !== bodyText.trim()
      ) {
        const reviewed = await reviewTranscript(
          transcriptToReview.id,
          bodyText.trim(),
        );
        setTranscript((current) =>
          current && current.id === reviewed.id
            ? {
                ...current,
                transcript_text: reviewed.transcript_text,
                status: reviewed.status,
              }
            : current,
        );
      }
      const note = noteId && !createNew
        ? await updateClinicalNote(noteId, {
            body: bodyText.trim(),
            ai_draft: draftText.trim() || null,
          })
        : await createClinicalNote({
            patient_id: encounter.patient_id,
            encounter_id: encounter.id,
            body: bodyText.trim(),
            ai_draft: draftText.trim() || null,
          });
      setNoteId(note.id);
      setStatus("draftSaved");
      return note.id;
    } catch (reason: unknown) {
      setError(
        reason instanceof Error ? reason.message : "Could not save draft.",
      );
      return null;
    } finally {
      setSaving(false);
    }
  };
  const generateDraft = async (
    bodyText = body,
    createNew = false,
    transcriptToReview = transcript,
  ) => {
    const id = await saveDraft(bodyText, "", createNew, transcriptToReview);
    if (!id) return;
    setSaving(true);
    setStatus("generatingAiDraft");
    try {
      const note = await generateClinicalSummary(id);
      const generatedDraft = note.summary || note.ai_draft || "";
      setSummary(generatedDraft);
      setDraftSourceBody(bodyText.trim());
      setStatus("aiDraftReady");
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not generate AI draft.",
      );
    } finally {
      setSaving(false);
    }
  };
  const approveDraft = async () => {
    if (!noteId || !summary.trim() || draftSourceBody !== body.trim() || approved) {
      setError(t("aiDraftMustMatchTranscript"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateClinicalNote(noteId, {
        body: body.trim(),
        ai_draft: summary.trim(),
      });
      await signClinicalNote(noteId);
      setApproved(true);
      setStatus("noteApprovedForPatient");
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not approve clinical note.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeading
        eyebrow={t("notes")}
        title={t("notes")}
        detail={
          encounter
            ? `${t("activeEncounter")} · ${encounter.encounter_type}`
            : t("encounterRequired")
        }
      />
      <div className="encounter-selector">
        <span>{t("patient")}</span>
        <select
          value={selectedPatientId}
          onChange={(e) => selectPatient(e.target.value)}
          className="glass-control-btn"
          disabled={recording || processingRecording || saving}
        >
          {!patients.length && <option value="">{t("patientsUnavailable")}</option>}
          {patients.map((p) => (
            <option key={p.id} value={p.id}>
              {p.given_name} {p.family_name} ({p.medical_record_number}) · {p.condition || p.department}
            </option>
          ))}
        </select>
        {encounter ? (
          <span className="status-pill status-stable">
            {t("activeEncounter")} · {encounter.encounter_type}
          </span>
        ) : (
          <button
            type="button"
            className="primary-btn"
            disabled={!selectedPatientId || saving}
            onClick={() => void startSelectedEncounter()}
          >
            {saving ? t("startingEncounter") : t("startEncounter")}
          </button>
        )}
      </div>
      <div className="notes-layout">
        <section className="panel">
          <PanelHeading
            title={t("secureVoiceRecording")}
            detail={t("privateAudioDetail")}
          />
          {encounter ? (
            <>
              <div className="voice-status" role="status">
                <span
                  className={`voice-pulse ${recording ? "is-listening" : ""}`}
                />{" "}
                {t(status)}
              </div>
              <div className="notes-actions">
                <button
                  type="button"
                  className={`outline-btn voice-input-button ${recording ? "is-listening" : ""}`}
                  disabled={processingRecording || saving || approved}
                  onClick={() =>
                    recording ? stopAndUpload() : void startRecording()
                  }
                >
                  {recording ? <Square size={15} /> : <Mic size={15} />}{" "}
                  {recording ? t("stopRecording") : t("startRecording")}
                </button>
                {transcript && (
                  <span className="status confirmed">
                    <Upload size={14} /> {transcript.language} ·{" "}
                    {transcript.confidence
                      ? `${Math.round(transcript.confidence * 100)}%`
                      : t("review")}
                  </span>
                )}
              </div>
            </>
          ) : (
            <div className="empty-state">{t("noActiveEncounter")}</div>
          )}
          {error && (
            <div className="inline-error" role="alert">
              {error}
            </div>
          )}
        </section>
        <section className="panel">
          <PanelHeading
            title={t("transcriptReview")}
            detail={t("transcriptReviewDetail")}
          />
          <label className="transcript-editor-label" htmlFor="clinical-transcript">
            <FileText size={16} /> {t("transcriptNoteLabel")}
          </label>
          <textarea
            id="clinical-transcript"
            className="transcript-editor"
            dir={body ? "auto" : undefined}
            value={body}
            onChange={(event) => {
              setBody(event.target.value);
            }}
            rows={10}
            placeholder={t("transcriptPlaceholder")}
            disabled={approved}
          />
          <div className="notes-actions">
            <button
              className="outline-btn"
              disabled={!body.trim() || saving || approved}
              onClick={() => void saveDraft()}
            >
              <Save size={15} /> {t("saveDraft")}
            </button>
            <button
              className="primary-btn"
              disabled={!body.trim() || saving || approved}
              onClick={() => void generateDraft()}
            >
              {saving ? t("working") : t("generateAiDraft")}
            </button>
          </div>
        </section>
        <section className="panel">
          <PanelHeading
            title={t("aiDraftTitle")}
            detail={t("aiDraftDetail")}
          />
          <textarea
            className="transcript-editor"
            aria-label={t("aiDraftTitle")}
            dir={summary ? "auto" : undefined}
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            rows={8}
            placeholder={t("noAiDraft")}
            disabled={!summary || approved}
          />
          {summary && (
            <span className={`status ${approved ? "confirmed" : "pending"}`}>
              {approved ? t("noteApprovedForPatient") : t("clinicianReviewRequired")}
            </span>
          )}
          {summary && !approved && draftSourceBody !== body.trim() && (
            <div className="inline-error" role="status">
              {t("aiDraftMustMatchTranscript")}
            </div>
          )}
          <div className="notes-actions">
            <button
              type="button"
              className="primary-btn"
              disabled={!noteId || !summary.trim() || saving || approved || draftSourceBody !== body.trim()}
              onClick={() => void approveDraft()}
            >
              <CheckCircle2 size={15} /> {approved ? t("noteApprovedForPatient") : t("approveAndShareWithPatient")}
            </button>
          </div>
        </section>
      </div>
    </>
  );
}

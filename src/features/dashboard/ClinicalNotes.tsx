import { useRef, useState } from "react";
import { FileText, Mic, Save, Square } from "lucide-react";
import { generateClinicalSummary } from "../../api/clinical";
import { PageHeading } from "../../components/PageHeading";
import { PanelHeading } from "../../components/PanelHeading";
import type { TranslationKey } from "../../i18n";

type Translator = (key: TranslationKey) => string;
type SpeechRecognitionInstance = { lang: string; interimResults: boolean; continuous: boolean; onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onerror: (() => void) | null; onend: (() => void) | null; start: () => void; stop: () => void };
type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

type SpeechWindow = Window & { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor };

export function ClinicalNotes({ t }: { t: Translator }) {
  const [body, setBody] = useState("");
  const [summary, setSummary] = useState("");
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const recognition = useRef<SpeechRecognitionInstance | null>(null);

  const toggleVoice = () => {
    if (listening) { recognition.current?.stop(); setListening(false); return; }
    const SpeechRecognition = (window as SpeechWindow).SpeechRecognition || (window as SpeechWindow).webkitSpeechRecognition;
    if (!SpeechRecognition) { setVoiceError("Voice input is not supported in this browser."); return; }
    const nextRecognition = new SpeechRecognition();
    nextRecognition.lang = document.documentElement.dir === "rtl" ? "ar-EG" : "en-US";
    nextRecognition.continuous = true;
    nextRecognition.interimResults = false;
    nextRecognition.onresult = (event) => {
      const transcript = Array.from({ length: event.results.length }, (_, index) => event.results[index][0]?.transcript || "").join(" ");
      setBody((current) => `${current}${current ? " " : ""}${transcript}`.trim());
    };
    nextRecognition.onerror = () => { setVoiceError("Voice input could not be started. Check microphone permissions."); setListening(false); };
    nextRecognition.onend = () => setListening(false);
    recognition.current = nextRecognition;
    setVoiceError("");
    setListening(true);
    nextRecognition.start();
  };

  const summarize = async () => {
    if (!body.trim()) return;
    setLoading(true);
    try { const result = await generateClinicalSummary("demo-note"); setSummary(result.summary || result.ai_draft || "Summary ready for review."); }
    catch { setSummary(t("demoMode")); }
    finally { setLoading(false); }
  };

  return <>
    <PageHeading eyebrow={t("notes")} title={t("notes")} detail={t("notesDetail")} />
    <div className="notes-layout">
      <section className="panel">
        <PanelHeading title={t("clinicalNotes")} detail={t("reviewAi")} />
        <label><FileText size={16} /> {t("noteBody")}
          <textarea value={body} onChange={(event) => setBody(event.target.value)} rows={10} placeholder={t("notePlaceholder")} />
        </label>
        <div className="notes-actions">
          <button type="button" className={`outline-btn voice-input-button ${listening ? "is-listening" : ""}`} onClick={toggleVoice} aria-pressed={listening}>
            {listening ? <Square size={15} /> : <Mic size={15} />} {listening ? "Stop listening" : "Dictate note"}
          </button>
          <button className="primary-btn" disabled={!body.trim() || loading} onClick={summarize}><Save size={15} /> {loading ? t("working") : t("generateSummary")}</button>
        </div>
        {listening && <div className="voice-status" role="status"><span className="voice-pulse" /> Listening... speak naturally to add to the note.</div>}
        {voiceError && <div className="inline-error" role="alert">{voiceError}</div>}
      </section>
      <section className="panel"><PanelHeading title={t("aiSummary")} detail={t("reviewAi")} /><div className="ai-summary-box">{summary || t("summaryEmpty")}</div></section>
    </div>
  </>;
}

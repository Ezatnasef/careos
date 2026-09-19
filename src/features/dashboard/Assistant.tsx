import { useState } from "react";
import { BookOpen, Send, Stethoscope } from "lucide-react";
import { askAssistant } from "../../api/clinical";
import { PageHeading } from "../../components/PageHeading";
import { PanelHeading } from "../../components/PanelHeading";
import type { TranslationKey } from "../../i18n";

type Translator = (key: TranslationKey) => string;
export function Assistant({ t }: { t: Translator }) {
  const [question, setQuestion] = useState(""); const [answer, setAnswer] = useState(""); const [loading, setLoading] = useState(false);
  const ask = async () => { if (!question.trim()) return; setLoading(true); try { const result = await askAssistant(question.trim()); setAnswer(result.answer || result.response || question.trim()); } catch { setAnswer(t("demoMode")); } finally { setLoading(false); } };
  return <><PageHeading eyebrow={t("assistant")} title={t("assistant")} detail={t("assistantReady")} /><div className="assistant-layout"><section className="panel assistant-panel"><PanelHeading title={t("askAssistant")} detail={t("reviewAi")} /><div className="assistant-intro"><Stethoscope size={20} /><p>{t("assistantReady")}</p></div><textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder={t("askAssistant")} rows={5} /><button className="primary-btn" disabled={loading || !question.trim()} onClick={ask}><Send size={15} /> {loading ? t("working") : t("askAssistant")}</button></section><section className="panel assistant-panel"><PanelHeading title={t("sources") || "Sources"} detail={t("citationCoverage")} /><div className="assistant-answer"><BookOpen size={18} />{answer || t("summaryEmpty")}</div></section></div></>;
}

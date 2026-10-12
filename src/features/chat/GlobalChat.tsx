import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MessageCircle, Send, Sparkles, X } from "lucide-react";
import { askGeneralChat, askGuestChat } from "../../api/chat";
import type { Language, TranslationKey } from "../../i18n";

type Translator = (key: TranslationKey) => string;
type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  sources?: Array<{ title?: string }>;
};
type Props = { t: Translator; guest?: boolean; language?: Language };

export function GlobalChat({ t, guest = false, language = "en" }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const endOfMessages = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) endOfMessages.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, open]);

  if (!guest && !localStorage.getItem("careos-access-token")) return null;

  const send = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = draft.trim();
    if (!message || loading) return;
    setDraft("");
    setError("");
    setMessages((current) => [
      ...current,
      { id: `user-${Date.now()}`, role: "user", text: message },
    ]);
    setLoading(true);
    try {
      const response = guest
        ? await askGuestChat(
            message,
            language === "ar" ? "ar-EG" : "en-US",
            false,
            messages.slice(-12).map(({ role, text }) => ({ role, content: text })),
          )
        : await askGeneralChat(message);
      setMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          text: response.answer,
          sources: response.sources,
        },
      ]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("generalChatError"));
    } finally {
      setLoading(false);
    }
  };

  const chat = (
    <div className="global-chat" dir={guest ? (language === "ar" ? "rtl" : "ltr") : undefined}>
      {open && (
        <section className="global-chat-panel" role="dialog" aria-label={guest ? t("platformChatTitle") : t("generalChatTitle")}>
          <header className="global-chat-header">
            <div className="global-chat-identity">
              <span className="global-chat-avatar"><Sparkles size={17} strokeWidth={2} /></span>
              <div>
                <strong>{guest ? t("platformChatTitle") : t("generalChatTitle")}</strong>
                <span>{guest ? t("platformChatPrivacy") : t("generalChatPrivacy")}</span>
              </div>
            </div>
            <button type="button" className="icon-btn" aria-label={t("closeChat")} onClick={() => setOpen(false)}>
              <X size={20} strokeWidth={2.2} />
            </button>
          </header>
          <div className="global-chat-messages" aria-live="polite">
            {messages.length === 0 && <p className="global-chat-welcome">{guest ? t("platformChatWelcome") : t("generalChatWelcome")}</p>}
            {messages.map((message) => (
              <div className={`global-chat-message ${message.role}`} key={message.id}>
                {message.text}
                {message.sources && message.sources.length > 0 && (
                  <div className="global-chat-sources">
                    <strong>{t("platformSourcesLabel")}</strong>
                    <ul>
                      {message.sources.map((source, index) => (
                        <li key={`${source.title ?? "source"}-${index}`}>{source.title}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
            {loading && <div className="global-chat-message assistant">{t("generalChatThinking")}</div>}
            {error && <div className="global-chat-error" role="alert">{error}</div>}
            <div ref={endOfMessages} />
          </div>
          <form className="global-chat-compose" onSubmit={(event) => void send(event)}>
            <input
              aria-label={t("generalChatInput")}
              placeholder={t("generalChatPlaceholder")}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              autoComplete="off"
            />
            <button type="submit" aria-label={t("sendGeneralChat")} disabled={!draft.trim() || loading}>
              <Send size={18} strokeWidth={2.2} />
            </button>
          </form>
        </section>
      )}
      <button
        type="button"
        className={`global-chat-toggle ${open ? "is-open" : ""}`}
        aria-label={open ? t("closeChat") : t("openChat")}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {open ? <X size={20} /> : <MessageCircle size={20} />}
      </button>
    </div>
  );

  if (guest && typeof document !== "undefined") {
    return createPortal(chat, document.body);
  }

  return chat;
}

import { useEffect, useRef, useState } from "react";
import {
  ArrowUpLeft,
  Bot,
  CircleHelp,
  MessageCircle,
  PanelsTopLeft,
  RotateCcw,
  Send,
  UsersRound,
  X,
} from "lucide-react";
import { askGuestChat, askOrchestratorChat } from "../../api/chat";
import { FormattedMessage } from "./FormattedMessage";
import type { Language, TranslationKey } from "../../i18n";
import type { AppView } from "../../app/routes";
import type { Role } from "../workspace/navigation";

type Translator = (key: TranslationKey) => string;
type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  sources?: Array<{ title?: string }>;
  agent?: string;
};
type ChatPreset = {
  title: TranslationKey;
  intro: TranslationKey;
  prompts: [TranslationKey, TranslationKey, TranslationKey];
};
type Props = {
  t: Translator;
  guest?: boolean;
  language?: Language;
  role: Role;
  view: AppView;
};

const rolePresets: Record<Role, ChatPreset> = {
  admin: {
    title: "chatAdminTitle",
    intro: "chatAdminIntro",
    prompts: ["chatAdminPromptOne", "chatAdminPromptTwo", "chatAdminPromptThree"],
  },
  doctor: {
    title: "chatDoctorTitle",
    intro: "chatDoctorIntro",
    prompts: ["chatDoctorPromptOne", "chatDoctorPromptTwo", "chatDoctorPromptThree"],
  },
  nurse: {
    title: "chatNurseTitle",
    intro: "chatNurseIntro",
    prompts: ["chatNursePromptOne", "chatNursePromptTwo", "chatNursePromptThree"],
  },
  receptionist: {
    title: "chatReceptionTitle",
    intro: "chatReceptionIntro",
    prompts: ["chatReceptionPromptOne", "chatReceptionPromptTwo", "chatReceptionPromptThree"],
  },
  hospital_director: {
    title: "chatDirectorTitle",
    intro: "chatDirectorIntro",
    prompts: ["chatDirectorPromptOne", "chatDirectorPromptTwo", "chatDirectorPromptThree"],
  },
  it_admin: {
    title: "chatItAdminTitle",
    intro: "chatItAdminIntro",
    prompts: ["chatItAdminPromptOne", "chatItAdminPromptTwo", "chatItAdminPromptThree"],
  },
  administrative_staff: {
    title: "chatStaffTitle",
    intro: "chatStaffIntro",
    prompts: ["chatStaffPromptOne", "chatStaffPromptTwo", "chatStaffPromptThree"],
  },
  patient: {
    title: "chatPatientTitle",
    intro: "chatPatientIntro",
    prompts: ["chatPatientPromptOne", "chatPatientPromptTwo", "chatPatientPromptThree"],
  },
};

const patientPreset: ChatPreset = rolePresets.patient;
const teamPreset: ChatPreset = {
  title: "chatTeamTitle",
  intro: "chatTeamIntro",
  prompts: ["chatTeamPromptOne", "chatTeamPromptTwo", "chatTeamPromptThree"],
};
const patientWorkspacePreset: ChatPreset = {
  title: "chatPatientWorkspaceTitle",
  intro: "chatPatientWorkspaceIntro",
  prompts: [
    "chatPatientWorkspacePromptOne",
    "chatPatientWorkspacePromptTwo",
    "chatPatientWorkspacePromptThree",
  ],
};
const workspacePreset: ChatPreset = {
  title: "chatWorkspaceTitle",
  intro: "chatWorkspaceIntro",
  prompts: ["chatWorkspacePromptOne", "chatWorkspacePromptTwo", "chatWorkspacePromptThree"],
};

const guestPreset: ChatPreset = {
  title: "platformChatTitle",
  intro: "platformChatWelcome",
  prompts: [
    "chatGuestPromptOne",
    "chatGuestPromptTwo",
    "chatGuestPromptThree",
  ],
};

function getChatPreset(role: Role, guest = false): ChatPreset {
  if (guest) {
    return guestPreset;
  }
  if (role && rolePresets[role]) {
    return rolePresets[role];
  }
  return workspacePreset;
}

export function GlobalChat({
  t,
  guest = false,
  language = "en",
  role,
  view,
}: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [orchestratorState, setOrchestratorState] = useState<Record<string, unknown> | null>(null);
  const endOfMessages = useRef<HTMLDivElement>(null);
  const requestContext = useRef(0);
  const preset = getChatPreset(role, guest);
  const contextKey = `${role}:${view}`;
  const clearConversation = () => {
    if (loading || messages.length === 0) return;
    if (!window.confirm(t("clearChatConfirm"))) return;
    setMessages([]);
    setOrchestratorState(null);
    setError("");
    setDraft("");
  };

  useEffect(() => {
    if (open) endOfMessages.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, open]);

  useEffect(() => {
    requestContext.current += 1;
    setMessages([]);
    setOrchestratorState(null);
    setError("");
    setDraft("");
    setLoading(false);
  }, [contextKey]);

  if (!guest && !localStorage.getItem("careos-access-token")) return null;

  const send = async (text = draft) => {
    const message = text.trim();
    if (!message || loading) return;
    setDraft("");
    setError("");
    setMessages((current) => [
      ...current,
      { id: `user-${Date.now()}`, role: "user", text: message },
    ]);
    setLoading(true);
    const activeContext = requestContext.current;
    try {
      if (guest) {
        const response = await askGuestChat(
          message,
          language === "ar" ? "ar-EG" : "en-US",
          false,
          messages.slice(-12).map(({ role, text }) => ({ role, content: text })),
        );
        if (activeContext !== requestContext.current) return;
        setMessages((current) => [
          ...current,
          {
            id: `assistant-${Date.now()}`,
            role: "assistant",
            text: response.answer,
            sources: response.sources,
          },
        ]);
      } else {
        const response = await askOrchestratorChat(message, {
          orchestratorState,
        });
        if (activeContext !== requestContext.current) return;
        if (response.orchestrator_state) {
          setOrchestratorState(response.orchestrator_state);
        }
        setMessages((current) => [
          ...current,
          {
            id: `assistant-${Date.now()}`,
            role: "assistant",
            text: response.answer,
            agent: response.active_agent || undefined,
          },
        ]);
      }
    } catch (reason) {
      if (activeContext === requestContext.current) {
        setError(reason instanceof Error ? reason.message : t("generalChatError"));
      }
    } finally {
      if (activeContext === requestContext.current) setLoading(false);
    }
  };

  const chat = (
    <div
      className={`global-chat ${open ? "is-open" : ""}`}
      dir={language === "ar" ? "rtl" : "ltr"}
    >
      {open && (
        <section
          className="global-chat-panel"
          role="dialog"
          aria-label={t(preset.title)}
        >
          <header className="global-chat-header">
            <div className="global-chat-identity">
              <span className="global-chat-avatar">
                <Bot size={20} strokeWidth={2.2} />
              </span>
              <div>
                <strong>{t(preset.title)}</strong>
                <span>{guest ? t("platformChatPrivacy") : t("generalChatPrivacy")}</span>
              </div>
            </div>
            <div className="global-chat-actions">
              <button
                type="button"
                className="global-chat-header-action"
                aria-label={t("closeChat")}
                title={t("closeChat")}
                onClick={() => setOpen(false)}
              >
                <X size={19} />
              </button>
              <button
                type="button"
                className="global-chat-header-action"
                aria-label={t("clearChat")}
                title={t("clearChat")}
                disabled={loading || messages.length === 0}
                onClick={clearConversation}
              >
                <RotateCcw size={16} />
              </button>
            </div>
          </header>
          <div className="global-chat-messages" aria-live="polite">
            {messages.length === 0 && (
              <div className="global-chat-empty">
                <span className="global-chat-empty-icon">
                  <MessageCircle size={20} />
                </span>
                <h2>{t(preset.title)}</h2>
                <p className="global-chat-welcome">
                  {t(preset.intro)}
                </p>
                <div className="global-chat-suggestions">
                  {preset.prompts.map((prompt, index) => {
                    const Icon =
                      index === 0
                        ? PanelsTopLeft
                        : index === 1
                          ? UsersRound
                          : CircleHelp;
                    return (
                      <button
                        key={prompt}
                        type="button"
                        disabled={loading}
                        onClick={() => void send(t(prompt))}
                      >
                        <Icon size={16} />
                        <span>{t(prompt)}</span>
                        <ArrowUpLeft size={15} />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {messages.map((message) => (
              <div className={`global-chat-message ${message.role}`} key={message.id}>
                <FormattedMessage text={message.text} />
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
          <form
            className="global-chat-compose"
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            <input
              aria-label={t("generalChatInput")}
              placeholder={t("generalChatPlaceholder")}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              autoComplete="off"
            />
            <button
              type="submit"
              aria-label={t("sendGeneralChat")}
              disabled={!draft.trim() || loading}
            >
              <Send size={18} strokeWidth={2.2} />
            </button>
          </form>
          {guest && (
            <p className="global-chat-footnote">{t("chatPrivacyFootnote")}</p>
          )}
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

  return chat;
}

import { useEffect, useState } from "react";
import { MessageCircle, Send, Trash2, X } from "lucide-react";
import type { ApiMessage, ApiPatient } from "../../api";
import {
  createMessage,
  deleteMessage,
  deletePatientMessages,
  getMessages,
  markMessageRead,
} from "../../api/messages";
import { getPatients } from "../../api/patients";
import { PageHeading } from "../../components/PageHeading";
import { PanelHeading } from "../../components/PanelHeading";
import type { Language, TranslationKey } from "../../i18n";

type Translator = (key: TranslationKey) => string;
type Thread = {
  patientId: string;
  patientName: string;
  messages: ApiMessage[];
};

function sortThreads(threads: Thread[]): Thread[] {
  return [...threads].sort((left, right) => {
    const leftLatest = left.messages.at(-1)?.created_at ?? "";
    const rightLatest = right.messages.at(-1)?.created_at ?? "";
    return rightLatest.localeCompare(leftLatest);
  });
}

function messageTime(createdAt: string, language: Language): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return createdAt;
  return new Intl.DateTimeFormat(language === "ar" ? "ar-EG" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function Messages({
  t,
  language,
}: {
  t: Translator;
  language: Language;
}) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [composerOpen, setComposerOpen] = useState(false);
  const [patientQuery, setPatientQuery] = useState("");
  const [patientOptions, setPatientOptions] = useState<ApiPatient[]>([]);
  const [patientsLoading, setPatientsLoading] = useState(false);
  const [patientsError, setPatientsError] = useState("");
  const [newMessagePatientId, setNewMessagePatientId] = useState("");
  const [newMessageSubject, setNewMessageSubject] = useState("");
  const [newMessageBody, setNewMessageBody] = useState("");
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let active = true;
    getMessages()
      .then((records) => {
        if (!active) return;
        const grouped = new Map<string, ApiMessage[]>();
        for (const message of records) {
          if (!message.patient_id || !message.patient_name?.trim()) {
            throw new Error(t("messagePatientUnavailable"));
          }
          const patientMessages = grouped.get(message.patient_id) ?? [];
          patientMessages.push(message);
          grouped.set(message.patient_id, patientMessages);
        }
        const nextThreads = [...grouped.entries()].map(
          ([patientId, messages]) => {
            const sortedMessages = [...messages].sort((left, right) =>
              left.created_at.localeCompare(right.created_at),
            );
            const patientName = sortedMessages[0]?.patient_name?.trim();
            if (!patientName) {
              throw new Error(t("messagePatientUnavailable"));
            }
            return {
              patientId,
              patientName,
              messages: sortedMessages,
            };
          },
        );
        const sortedThreads = sortThreads(nextThreads);
        setThreads(sortedThreads);
        setSelectedPatientId(sortedThreads[0]?.patientId ?? "");
        setError("");
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(
            reason instanceof Error ? reason.message : t("messagesUnavailable"),
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [language]);

  useEffect(() => {
    if (!composerOpen) return;
    let active = true;
    setPatientsLoading(true);
    setPatientsError("");
    setPatientOptions([]);
    const timeout = window.setTimeout(() => {
      getPatients(patientQuery, 1, 100)
        .then((patients) => {
          if (active) setPatientOptions(patients);
        })
        .catch((reason: unknown) => {
          if (active) {
            setPatientsError(
              reason instanceof Error
                ? reason.message
                : t("patientsUnavailable"),
            );
          }
        })
        .finally(() => {
          if (active) setPatientsLoading(false);
        });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [composerOpen, patientQuery, language]);

  const thread = threads.find(
    (item) => item.patientId === selectedPatientId,
  );
  const latestMessage = thread?.messages.at(-1);

  const appendMessage = (message: ApiMessage, patientName: string) => {
    const linkedMessage = {
      ...message,
      patient_name: message.patient_name?.trim() || patientName,
    };
    setThreads((current) => {
      const existing = current.find(
        (item) => item.patientId === linkedMessage.patient_id,
      );
      const updatedThread: Thread = existing
        ? {
            ...existing,
            messages: [...existing.messages, linkedMessage].sort(
              (left, right) => left.created_at.localeCompare(right.created_at),
            ),
          }
        : {
            patientId: linkedMessage.patient_id,
            patientName,
            messages: [linkedMessage],
          };
      return sortThreads(
        existing
          ? current.map((item) =>
              item.patientId === updatedThread.patientId
                ? updatedThread
                : item,
            )
          : [...current, updatedThread],
      );
    });
    setSelectedPatientId(linkedMessage.patient_id);
  };

  const selectThread = async (nextThread: Thread) => {
    setSelectedPatientId(nextThread.patientId);
    setDraft("");
    const unreadMessages = nextThread.messages.filter(
      (message) => message.sender_type === "patient" && !message.read,
    );
    if (unreadMessages.length === 0) return;
    try {
      await Promise.all(
        unreadMessages.map((message) => markMessageRead(message.id)),
      );
      setThreads((current) =>
        current.map((item) =>
          item.patientId === nextThread.patientId
            ? {
                ...item,
                messages: item.messages.map((message) =>
                  unreadMessages.some((unread) => unread.id === message.id)
                    ? { ...message, read: true }
                    : message,
                ),
              }
            : item,
        ),
      );
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : t("messagesUnavailable"),
      );
    }
  };

  const sendReply = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!thread || !latestMessage || !draft.trim()) return;
    setSending(true);
    try {
      const sent = await createMessage({
        patient_id: thread.patientId,
        subject: latestMessage.subject,
        body: draft.trim(),
      });
      appendMessage(sent, thread.patientName);
      setDraft("");
      setError("");
      window.dispatchEvent(
        new CustomEvent("careos:toast", { detail: t("messageSent") }),
      );
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : t("messageSendFailed"),
      );
    } finally {
      setSending(false);
    }
  };

  const sendNewMessage = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const patient = patientOptions.find(
      (item) => item.id === newMessagePatientId,
    );
    if (!patient || !newMessageSubject.trim() || !newMessageBody.trim()) return;
    setSending(true);
    try {
      const sent = await createMessage({
        patient_id: patient.id,
        subject: newMessageSubject.trim(),
        body: newMessageBody.trim(),
      });
      appendMessage(sent, `${patient.given_name} ${patient.family_name}`);
      setComposerOpen(false);
      setPatientQuery("");
      setNewMessagePatientId("");
      setNewMessageSubject("");
      setNewMessageBody("");
      setError("");
      window.dispatchEvent(
        new CustomEvent("careos:toast", { detail: t("messageSent") }),
      );
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : t("messageSendFailed"),
      );
    } finally {
      setSending(false);
    }
  };

  const removeMessage = async (message: ApiMessage) => {
    if (!window.confirm(t("deleteMessageConfirm"))) return;
    setDeleting(true);
    try {
      await deleteMessage(message.id);
      const remainingInThread =
        thread?.messages.filter((entry) => entry.id !== message.id).length ?? 0;
      setThreads((current) =>
        sortThreads(
          current
            .map((item) => ({
              ...item,
              messages: item.messages.filter((entry) => entry.id !== message.id),
            }))
            .filter((item) => item.messages.length > 0),
        ),
      );
      if (
        selectedPatientId === message.patient_id &&
        remainingInThread === 0
      ) {
        setSelectedPatientId(
          threads.find((item) => item.patientId !== message.patient_id)
            ?.patientId ?? "",
        );
      }
      setError("");
      window.dispatchEvent(
        new CustomEvent("careos:toast", { detail: t("messageDeleted") }),
      );
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : t("messageDeleteFailed"),
      );
    } finally {
      setDeleting(false);
    }
  };

  const removeThread = async () => {
    if (!thread) return;
    if (!window.confirm(t("deleteConversationConfirm"))) return;
    setDeleting(true);
    try {
      await deletePatientMessages(thread.patientId);
      const updated = threads.filter(
        (item) => item.patientId !== thread.patientId,
      );
      setThreads(updated);
      setSelectedPatientId(updated[0]?.patientId ?? "");
      setError("");
      window.dispatchEvent(
        new CustomEvent("careos:toast", {
          detail: t("conversationDeleted"),
        }),
      );
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : t("messageDeleteFailed"),
      );
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <PageHeading
        eyebrow={t("communication")}
        title={t("messagesTitle")}
        detail={t("messagesDetail")}
        action={
          <button
            className="primary-btn"
            onClick={() => {
              setError("");
              setPatientsError("");
              setPatientQuery("");
              setNewMessagePatientId("");
              setNewMessageSubject("");
              setNewMessageBody("");
              setComposerOpen(true);
            }}
          >
            <MessageCircle size={16} /> {t("newMessage")}
          </button>
        }
      />
      {error && (
        <div className="empty-state error-state" role="alert">
          {error}
        </div>
      )}
      {loading ? (
        <div className="empty-state">{t("messagesLoading")}</div>
      ) : (
        <div className="messages-layout">
          <section className="panel thread-list">
            {threads.length === 0 ? (
              <div className="empty-state">{t("noMessages")}</div>
            ) : (
              threads.map((item) => {
                const latest = item.messages.at(-1);
                const hasUnread = item.messages.some(
                  (message) =>
                    message.sender_type === "patient" && !message.read,
                );
                return (
                  <button
                    className={`thread ${selectedPatientId === item.patientId ? "active" : ""}`}
                    key={item.patientId}
                    onClick={() => selectThread(item)}
                  >
                    <div className="avatar avatar-doctor">
                      {item.patientName
                        .split(" ")
                        .map((part) => part[0])
                        .join("")
                        .slice(0, 2)}
                    </div>
                    <div>
                      <strong>{item.patientName}</strong>
                      <b>{latest?.subject || t("patientMessageSubject")}</b>
                      <span>{latest?.body}</span>
                    </div>
                    {hasUnread && <i />}
                  </button>
                );
              })
            )}
          </section>
          <section className="panel message-view">
            {thread && latestMessage ? (
              <>
                <PanelHeading
                  title={thread.patientName}
                  detail={`${t("messageFrom")}: ${latestMessage.sender_name || (latestMessage.sender_type === "patient" ? thread.patientName : t("careTeamName"))} · ${t("messageTo")}: ${latestMessage.recipient_name || (latestMessage.direction === "inbound" ? t("careTeamName") : thread.patientName)}`}
                  action={
                    <button
                      type="button"
                      className="danger-btn small"
                      disabled={deleting}
                      onClick={() => void removeThread()}
                    >
                      <Trash2 size={14} /> {t("deleteConversation")}
                    </button>
                  }
                />
                {thread.messages.map((message) => {
                  const senderName =
                    message.sender_name?.trim() ||
                    (message.sender_type === "patient"
                      ? thread.patientName
                      : t("careTeamName"));
                  const recipientName =
                    message.recipient_name?.trim() ||
                    (message.direction === "inbound"
                      ? t("careTeamName")
                      : thread.patientName);
                  return (
                    <div
                      className={`message-row ${message.sender_type === "patient" ? "received" : "sent"}`}
                      key={message.id}
                    >
                      <div
                        className={`message-bubble ${message.sender_type === "patient" ? "received" : "sent"}`}
                      >
                        {message.body}
                        <small>
                          {t("messageFrom")}: {senderName} · {t("messageTo")}:{" "}
                          {recipientName} · {messageTime(message.created_at, language)}
                        </small>
                      </div>
                      <button
                        type="button"
                        className="icon-btn message-delete-btn"
                        aria-label={t("deleteMessage")}
                        title={t("deleteMessage")}
                        disabled={deleting}
                        onClick={() => void removeMessage(message)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  );
                })}
                <form className="message-compose" onSubmit={sendReply}>
                  <label htmlFor="patient-message-reply">
                    {t("replyToPatient")}
                  </label>
                  <textarea
                    id="patient-message-reply"
                    rows={2}
                    placeholder={t("secureMessagePlaceholder")}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                  />
                  <button
                    type="submit"
                    className="primary-btn small"
                    disabled={!draft.trim() || sending}
                  >
                    <Send size={14} /> {sending ? t("sending") : t("reply")}
                  </button>
                </form>
              </>
            ) : (
              <div className="empty-state">{t("selectConversationDetail")}</div>
            )}
          </section>
        </div>
      )}
      {composerOpen && (
        <div
          className="modal-backdrop"
          onClick={() => setComposerOpen(false)}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-message-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-heading">
              <div>
                <div className="eyebrow">{t("communication")}</div>
                <h2 id="new-message-title">{t("newMessageToPatient")}</h2>
              </div>
              <button
                className="icon-btn"
                aria-label={t("closeDialog")}
                onClick={() => setComposerOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={sendNewMessage}>
              <label>
                {t("searchPatients")}
                <input
                  type="search"
                  value={patientQuery}
                  placeholder={t("patientSearchPlaceholder")}
                  onChange={(event) => {
                    setPatientQuery(event.target.value);
                    setNewMessagePatientId("");
                  }}
                />
              </label>
              <label>
                {t("patient")}
                <select
                  required
                  value={newMessagePatientId}
                  onChange={(event) =>
                    setNewMessagePatientId(event.target.value)
                  }
                  disabled={patientsLoading || patientOptions.length === 0}
                >
                  <option value="">
                    {patientsLoading
                      ? t("loading")
                      : t("selectPatient")}
                  </option>
                  {patientOptions.map((patient) => (
                    <option key={patient.id} value={patient.id}>
                      {patient.given_name} {patient.family_name} ·{" "}
                      {patient.medical_record_number || patient.patient_code}
                    </option>
                  ))}
                </select>
              </label>
              {patientsError && (
                <div className="inline-error" role="alert">
                  {patientsError}
                </div>
              )}
              {!patientsLoading &&
                !patientsError &&
                patientOptions.length === 0 && (
                  <div className="inline-error" role="status">
                    {t("noPatients")}
                  </div>
                )}
              <label>
                {t("messageSubject")}
                <input
                  required
                  maxLength={200}
                  value={newMessageSubject}
                  onChange={(event) =>
                    setNewMessageSubject(event.target.value)
                  }
                />
              </label>
              <label>
                {t("messageBody")}
                <textarea
                  required
                  maxLength={4000}
                  rows={4}
                  value={newMessageBody}
                  onChange={(event) => setNewMessageBody(event.target.value)}
                />
              </label>
              <button
                className="primary-btn full-width"
                type="submit"
                disabled={
                  !newMessagePatientId ||
                  !newMessageSubject.trim() ||
                  !newMessageBody.trim() ||
                  patientsLoading ||
                  sending
                }
              >
                <Send size={16} />{" "}
                {sending ? t("sending") : t("sendMessage")}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

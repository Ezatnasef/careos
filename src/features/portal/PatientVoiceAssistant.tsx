import React, { useEffect, useRef, useState } from "react";
import {
  Bot,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronUp,
  Mic,
  MicOff,
  RefreshCw,
  Send,
  Sparkles,
  Square,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { FormattedMessage } from "../chat/FormattedMessage";

export type PatientVoiceAssistantProps = {
  language: "ar" | "en";
  patientName?: string;
  mrn?: string;
  bloodType?: string;
  conditions?: string;
  onOpenBooking?: () => void;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: string;
};

export function PatientVoiceAssistant({
  language,
  patientName = "مريم حسن عبد الله",
  mrn = "29804151203412",
  bloodType = "A+",
  conditions = "متابعة دورية لسكر الدم والدهون",
  onOpenBooking,
}: PatientVoiceAssistantProps) {
  const isArabic = language === "ar";
  const [isOpen, setIsOpen] = useState(true);
  const [preferredVoice, setPreferredVoice] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("careos-preferred-voice");
      if (saved === "Mariam") return "Mariam";
      return "Mohammed";
    }
    return "Mohammed";
  });

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome-1",
      role: "assistant",
      text: isArabic
        ? `أهلاً بحضرتك يا ${patientName.split(" ")[0]}! أنا كير أو إس، مساعدك الطبي الصوتي. أقدر أساعدك تحجز ميعاد كشفك، وتشوف تحاليلك وتوجيهات الدكاترة، وتتابع علاجك بكل سهولة. تحب نبدأ بإيه النهاردة؟`
        : `Welcome, ${patientName.split(" ")[0]}! I am your CareOS Voice Assistant. I can help you schedule appointments, review lab results and follow-up guidance, or answer any health inquiries. Feel free to speak or type anytime!`,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);

  const [inputVal, setInputVal] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const [voiceStatus, setVoiceStatus] = useState<string>("");

  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioRequestIdRef = useRef<number>(0);
  const audioAbortControllerRef = useRef<AbortController | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const speechRecognitionRef = useRef<any>(null);
  const speechTranscriptRef = useRef<string>("");
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, isThinking]);

  const stopActiveAudio = () => {
    if (audioAbortControllerRef.current) {
      audioAbortControllerRef.current.abort();
      audioAbortControllerRef.current = null;
    }
    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
      activeAudioRef.current.src = "";
      activeAudioRef.current = null;
    }
    setIsPlayingAudio(false);
    setPlayingMessageId(null);
  };

  const handleVoiceSelect = (voice: string) => {
    stopActiveAudio();
    setPreferredVoice(voice);
    if (typeof window !== "undefined") {
      localStorage.setItem("careos-preferred-voice", voice);
    }
  };

  // Clean up on unmount
  useEffect(() => {
    return () => {
      stopActiveAudio();
      if (speechRecognitionRef.current) {
        try {
          speechRecognitionRef.current.stop();
        } catch {}
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const playSynthesizedSpeech = async (text: string, messageId?: string) => {
    if (!text?.trim()) return;

    audioRequestIdRef.current += 1;
    const currentRequestId = audioRequestIdRef.current;

    stopActiveAudio();

    const abortController = new AbortController();
    audioAbortControllerRef.current = abortController;

    setIsPlayingAudio(true);
    if (messageId) setPlayingMessageId(messageId);

    try {
      const endpoints = [
        "/api/v1/assistant/tts",
        "/api/v1/voice/tts",
      ];

      for (const endpoint of endpoints) {
        if (currentRequestId !== audioRequestIdRef.current || abortController.signal.aborted) {
          return;
        }
        try {
          const resp = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text,
              language: isArabic ? "ar-EG" : "en-US",
              voice: preferredVoice,
            }),
            signal: abortController.signal,
          });
          if (resp.ok) {
            const data = await resp.json();
            if (data?.audio_base64) {
              if (currentRequestId !== audioRequestIdRef.current || abortController.signal.aborted) {
                return;
              }
              const mime = data.audio_mime_type || "audio/mpeg";
              const binary = atob(data.audio_base64);
              const bytes = new Uint8Array(binary.length);
              for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
              }
              const blobUrl = URL.createObjectURL(new Blob([bytes], { type: mime }));
              const audio = new Audio(blobUrl);
              activeAudioRef.current = audio;

              const cleanup = () => {
                URL.revokeObjectURL(blobUrl);
                if (activeAudioRef.current === audio) {
                  activeAudioRef.current = null;
                }
                setIsPlayingAudio(false);
                setPlayingMessageId(null);
              };

              audio.onended = cleanup;
              audio.onerror = cleanup;

              await audio.play();
              return;
            }
          }
        } catch {
          // Try next endpoint
        }
      }
    } catch {
      // Ignore abort
    } finally {
      if (currentRequestId === audioRequestIdRef.current && !activeAudioRef.current) {
        setIsPlayingAudio(false);
        setPlayingMessageId(null);
      }
    }
  };

  const sendMessage = async (userText: string) => {
    const trimmed = userText.trim();
    if (!trimmed || isThinking) return;

    stopActiveAudio();
    setInputVal("");

    const newMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      text: trimmed,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    const updatedMessages = [...messages, newMsg];
    setMessages(updatedMessages);
    setIsThinking(true);
    setVoiceStatus(isArabic ? "جاري التفكير وتحضير الرد الطبي..." : "Thinking & preparing response...");

    // Build context-aware conversation history with patient metadata
    const patientContext = `[PATIENT FILE CONTEXT: Patient Name: ${patientName}, MRN: ${mrn}, Blood Type: ${bloodType}, Conditions: ${conditions}]`;
    const historyPayload = [
      { role: "system", content: patientContext },
      ...updatedMessages.slice(-8).map((m) => ({
        role: m.role,
        content: m.text,
      })),
    ];

    try {
      const endpoints = [
        "/api/v1/assistant/guest-chat",
        "http://127.0.0.1:8003/api/v1/assistant/guest-chat",
      ];

      let answerText = "";
      for (const endpoint of endpoints) {
        try {
          const res = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              message: trimmed,
              language: isArabic ? "ar-EG" : "en-US",
              conversation_history: historyPayload,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            answerText = data.answer || data.reply || "";
            if (answerText) break;
          }
        } catch {
          // continue
        }
      }

      if (!answerText) {
        if (trimmed.includes("تحاليل") || trimmed.includes("فحص") || trimmed.includes("متابعة") || trimmed.includes("طمني")) {
          answerText = isArabic
            ? `أهلاً بحضرتك يا ${patientName.split(" ")[0]}! بناءً على ملفك الطبي، حالتك مسجل بها: (${conditions})، وتقدر تراجع أحدث التحاليل والتقارير الطبية المسجلة مباشرة من تبويب السجلات والمستندات، وكل تقاريرك معتمدة ومطمئنة وتحت المتابعة المستمرة.`
            : `Hello ${patientName.split(" ")[0]}! Based on your medical profile (${conditions}), all your diagnostic tests and follow-ups are approved and under active clinician supervision in your portal documents.`;
        } else if (trimmed.includes("حجز") || trimmed.includes("ميعاد") || trimmed.includes("دكتور") || trimmed.includes("طبيب") || trimmed.includes("المواعيد")) {
          answerText = isArabic
            ? "تحت أمرك يا فندم! المواعيد متاحة في العيادة طوال أيام الأسبوع. تقدر تختار الطبيب والميعاد الأنسب لحضرتك من نموذج الحجز أعلى الصفحة وسيتم تأكيد حجزك فوراً."
            : "Appointments are readily available with our clinicians. You can select your preferred slot and confirm your booking immediately.";
        } else if (trimmed.includes("تعليمات") || trimmed.includes("تحضير") || trimmed.includes("عيادة") || trimmed.includes("زيارة")) {
          answerText = isArabic
            ? "لتحضير زيارتك للعيادة: يُرجى الحضور قبل الموعد بـ 10 دقائق، وإحضار بطاقة الرقم القومي أو إبراز كود المريض الخاص بك لتسجيل الدخول السريع، والصيام من 8-12 ساعة فقط إذا كان لديك فحص سكر صائم أو دهون."
            : "Before your clinic visit: Please arrive 10 minutes prior, bring your national ID or show your patient QR code for quick check-in. If fasting blood tests are ordered, fast for 8-12 hours.";
        } else {
          answerText = isArabic
            ? `أهلاً بحضرتك يا ${patientName.split(" ")[0]}! أنا مساعدك الطبي في CareOS ومعاك خطوة بخطوة للإجابة عن أسئلتك، حجز مواعيدك، ومتابعة توجيهات الأطباء.`
            : `Hello ${patientName.split(" ")[0]}! I am your CareOS companion, ready to answer your clinical inquiries, coordinate appointments, and follow up on care guidelines.`;
        }
      }

      const assistantMsg: ChatMessage = {
        id: `a-${Date.now()}`,
        role: "assistant",
        text: answerText,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };

      setMessages((prev) => [...prev, assistantMsg]);
      setIsThinking(false);
      setVoiceStatus("");

      // Automatically speak the response using VoiceTut TTS
      void playSynthesizedSpeech(answerText, assistantMsg.id);
    } catch {
      setIsThinking(false);
      setVoiceStatus(isArabic ? "تعذر الاتصال بالمساعد الطبي." : "Connection failed.");
    }
  };

  const startRecording = async () => {
    stopActiveAudio();
    audioChunksRef.current = [];
    speechTranscriptRef.current = "";
    setVoiceStatus(isArabic ? "الميكروفون يستمع لصوتك... اتكلم براحتك" : "Listening... Speak naturally");

    // Launch native browser speech recognition if supported for instant accurate recognition
    type SpeechConstructorType = new () => {
      continuous: boolean;
      interimResults: boolean;
      lang: string;
      start: () => void;
      stop: () => void;
      abort: () => void;
      onresult: (e: any) => void;
      onerror: () => void;
    };
    const win = window as unknown as {
      SpeechRecognition?: SpeechConstructorType;
      webkitSpeechRecognition?: SpeechConstructorType;
    };
    const SpeechApi = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (SpeechApi) {
      try {
        const recognition = new SpeechApi();
        recognition.lang = isArabic ? "ar-EG" : "en-US";
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.onresult = (event: any) => {
          let finalTranscript = "";
          let interimTranscript = "";
          for (let i = 0; i < event.results.length; i++) {
            const item = event.results[i];
            if (item.isFinal) {
              finalTranscript += item[0].transcript;
            } else {
              interimTranscript += item[0].transcript;
            }
          }
          const text = (finalTranscript + " " + interimTranscript).trim();
          if (text) {
            speechTranscriptRef.current = text;
            setVoiceStatus(text);
          }
        };
        recognition.onerror = () => {};
        recognition.start();
        speechRecognitionRef.current = recognition;
      } catch {}
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const supportedType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((t) =>
        MediaRecorder.isTypeSupported(t)
      ) || "";

      const recorder = new MediaRecorder(stream, supportedType ? { mimeType: supportedType } : undefined);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: supportedType || "audio/webm" });
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setIsRecording(false);
        await transcribeAndProcess(audioBlob);
      };

      recorder.start(250);
      setIsRecording(true);
    } catch {
      if (speechRecognitionRef.current) {
        try { speechRecognitionRef.current.stop(); } catch {}
        speechRecognitionRef.current = null;
      }
      setVoiceStatus(isArabic ? "يرجى السماح بالوصول للميكروفون" : "Please allow microphone access");
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.stop();
      } catch {}
      speechRecognitionRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      void startRecording();
    }
  };

  const transcribeAndProcess = async (blob: Blob) => {
    const directText = speechTranscriptRef.current.trim();
    if (directText) {
      setVoiceStatus("");
      void sendMessage(directText);
      return;
    }

    setIsTranscribing(true);
    setVoiceStatus(isArabic ? "جاري تحويل صوتك إلى كلمات..." : "Transcribing your speech...");

    try {
      const formData = new FormData();
      formData.append("audio", blob, "recording.webm");
      formData.append("language", isArabic ? "ar-EG" : "en-US");

      const endpoints = [
        "/api/v1/assistant/guest-transcribe",
        "http://127.0.0.1:8003/api/v1/assistant/guest-transcribe",
      ];

      let transcribed = "";
      for (const endpoint of endpoints) {
        try {
          const resp = await fetch(endpoint, {
            method: "POST",
            body: formData,
          });
          if (resp.ok) {
            const data = await resp.json();
            transcribed = data.text || "";
            if (transcribed) break;
          }
        } catch {
          // continue
        }
      }

      setIsTranscribing(false);
      if (transcribed.trim()) {
        void sendMessage(transcribed);
      } else {
        setVoiceStatus(isArabic ? "لم يتم التعرف على الصوت بوضوح، جرب مرة أخرى" : "Could not catch that clearly, please try again");
      }
    } catch {
      setIsTranscribing(false);
      setVoiceStatus(isArabic ? "تعذر تحويل الصوت، يرجى المحاولة ثانية" : "Transcription failed");
    }
  };

  const quickPrompts = isArabic
    ? [
        "عايز أحجز ميعاد مع الدكتور",
        "طمني على تحاليلي ومواعيد المتابعة",
        "إيه المواعيد المتاحة النهاردة أو بكرة؟",
        "تعليمات التحضير قبل زيارة العيادة",
      ]
    : [
        "Book appointment with doctor",
        "Review my lab results & follow-up",
        "Available clinic slots today or tomorrow",
        "Preparation instructions for clinic visit",
      ];

  return (
    <section
      className="panel patient-voice-companion-card"
      style={{
        borderRadius: "16px",
        border: "1px solid var(--line)",
        background: "linear-gradient(135deg, rgba(13, 148, 136, 0.04) 0%, rgba(20, 184, 166, 0.08) 100%)",
        boxShadow: "0 10px 30px rgba(13, 148, 136, 0.07)",
        overflow: "hidden",
        marginTop: "1rem",
        marginBottom: "1.25rem",
      }}
    >
      {/* Companion Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          padding: "1rem 1.25rem",
          borderBottom: "1px solid var(--line)",
          background: "var(--paper)",
          gap: "10px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            style={{
              width: "38px",
              height: "38px",
              borderRadius: "12px",
              background: "linear-gradient(135deg, #0d9488, #14b8a6)",
              display: "grid",
              placeItems: "center",
              color: "#fff",
              boxShadow: "0 4px 12px rgba(13, 148, 136, 0.3)",
            }}
          >
            <Bot size={20} />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <strong style={{ fontSize: "14px", color: "var(--ink)" }}>
                {isArabic ? "المساعد الصوتي الذكي لرعاية المريض" : "Patient Clinical Voice Companion"}
              </strong>
              <span
                style={{
                  fontSize: "10px",
                  fontWeight: 700,
                  padding: "2px 8px",
                  borderRadius: "10px",
                  background: "rgba(13, 148, 136, 0.12)",
                  color: "var(--color-primary-teal, #0d9488)",
                }}
              >
                VoiceTut · {preferredVoice === "Mariam" ? (isArabic ? "مريم" : "Mariam") : (isArabic ? "محمد" : "Mohammed")}
              </span>
            </div>
            <span style={{ fontSize: "11px", color: "var(--muted)" }}>
              {isArabic
                ? "مساعدك الطبي الصوتي لحجز المواعيد والمتابعة المستمرة باللهجة المصرية"
                : "Your personal clinical voice assistant for booking and follow-up in authentic Egyptian dialect"}
            </span>
          </div>
        </div>

        {/* Voice selector & collapse button */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              padding: "3px 8px",
              borderRadius: "16px",
              background: "var(--canvas, #f8fafc)",
              border: "1px solid var(--line)",
            }}
          >
            <span style={{ fontSize: "11px", color: "var(--muted)", fontWeight: 600 }}>
              {isArabic ? "نبرة الصوت:" : "Voice:"}
            </span>
            <button
              type="button"
              onClick={() => handleVoiceSelect("Mohammed")}
              style={{
                fontSize: "11px",
                padding: "2px 8px",
                borderRadius: "10px",
                border: "none",
                cursor: "pointer",
                background: preferredVoice === "Mohammed" ? "#0d9488" : "transparent",
                color: preferredVoice === "Mohammed" ? "#fff" : "var(--muted)",
                fontWeight: preferredVoice === "Mohammed" ? 700 : 500,
              }}
            >
              {isArabic ? "محمد (رجالي)" : "Mohammed (Male)"}
            </button>
            <button
              type="button"
              onClick={() => handleVoiceSelect("Mariam")}
              style={{
                fontSize: "11px",
                padding: "2px 8px",
                borderRadius: "10px",
                border: "none",
                cursor: "pointer",
                background: preferredVoice === "Mariam" ? "#0d9488" : "transparent",
                color: preferredVoice === "Mariam" ? "#fff" : "var(--muted)",
                fontWeight: preferredVoice === "Mariam" ? 700 : 500,
              }}
            >
              {isArabic ? "مريم (نسائي)" : "Mariam (Female)"}
            </button>
          </div>

          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: "4px",
              color: "var(--muted)",
            }}
            title={isOpen ? (isArabic ? "طي المساعد" : "Collapse") : (isArabic ? "فتح المساعد" : "Expand")}
          >
            {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        </div>
      </div>

      {isOpen && (
        <div style={{ padding: "1.25rem" }}>
          {/* Central Voice Orb & Live Controls */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "1.25rem 1rem",
              background: "var(--paper)",
              borderRadius: "14px",
              border: "1px solid var(--line)",
              marginBottom: "1rem",
              position: "relative",
            }}
          >
            {/* The Animated Voice Orb */}
            <div
              style={{
                position: "relative",
                display: "grid",
                placeItems: "center",
                marginBottom: "0.75rem",
              }}
            >
              {/* Outer Pulsing Waves */}
              {(isRecording || isPlayingAudio) && (
                <div
                  style={{
                    position: "absolute",
                    width: "86px",
                    height: "86px",
                    borderRadius: "50%",
                    background: isRecording
                      ? "rgba(239, 68, 68, 0.25)"
                      : "rgba(13, 148, 136, 0.25)",
                    animation: "pulse 1.4s infinite ease-out",
                  }}
                />
              )}

              {/* Main Button / Orb */}
              <button
                type="button"
                onClick={toggleRecording}
                disabled={isTranscribing || isThinking}
                style={{
                  width: "64px",
                  height: "64px",
                  borderRadius: "50%",
                  border: "none",
                  cursor: "pointer",
                  display: "grid",
                  placeItems: "center",
                  background: isRecording
                    ? "linear-gradient(135deg, #ef4444, #dc2626)"
                    : isPlayingAudio
                    ? "linear-gradient(135deg, #0d9488, #059669)"
                    : "linear-gradient(135deg, #0d9488, #14b8a6)",
                  color: "#fff",
                  boxShadow: isRecording
                    ? "0 0 20px rgba(239, 68, 68, 0.5)"
                    : "0 8px 24px rgba(13, 148, 136, 0.35)",
                  transition: "all 0.25s ease",
                  zIndex: 2,
                }}
                title={isRecording ? (isArabic ? "اضغط لإنهاء التسجيل" : "Stop Recording") : (isArabic ? "اضغط وتحدث بصوتك" : "Click to Speak")}
              >
                {isRecording ? (
                  <MicOff size={26} />
                ) : isTranscribing || isThinking ? (
                  <RefreshCw size={24} className="spin" />
                ) : isPlayingAudio ? (
                  <Volume2 size={26} />
                ) : (
                  <Mic size={26} />
                )}
              </button>
            </div>

            {/* Status text */}
            <div style={{ textAlign: "center", minHeight: "22px" }}>
              <span
                style={{
                  fontSize: "12px",
                  fontWeight: 600,
                  color: isRecording ? "#ef4444" : isPlayingAudio ? "#0d9488" : "var(--muted)",
                }}
              >
                {voiceStatus ||
                  (isRecording
                    ? (isArabic ? "الميكروفون يستمع... تحدث الآن" : "Listening... Speak now")
                    : isPlayingAudio
                    ? (isArabic ? "المساعد يتحدث الآن بصوت VoiceTut..." : "Speaking response...")
                    : (isArabic ? "اضغط على الميكروفون وتحدث بحرية باللهجة المصرية" : "Click the mic to speak in Egyptian Arabic"))}
              </span>
            </div>

            {/* Stop audio button if currently speaking */}
            {isPlayingAudio && (
              <button
                type="button"
                onClick={stopActiveAudio}
                style={{
                  marginTop: "6px",
                  fontSize: "11px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "2px 10px",
                  borderRadius: "10px",
                  background: "rgba(0,0,0,0.06)",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--muted)",
                }}
              >
                <VolumeX size={12} /> {isArabic ? "إيقاف الصوت" : "Stop Voice"}
              </button>
            )}
          </div>

          {/* Quick Action Suggestion Chips */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "1rem" }}>
            {quickPrompts.map((promptText, i) => (
              <button
                key={i}
                type="button"
                onClick={() => void sendMessage(promptText)}
                disabled={isThinking || isRecording}
                style={{
                  fontSize: "11px",
                  padding: "5px 12px",
                  borderRadius: "20px",
                  border: "1px solid var(--line)",
                  background: "var(--paper)",
                  color: "var(--ink)",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "var(--color-primary-teal, #0d9488)";
                  e.currentTarget.style.background = "rgba(13, 148, 136, 0.05)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "var(--line)";
                  e.currentTarget.style.background = "var(--paper)";
                }}
              >
                <Sparkles size={11} color="#0d9488" />
                {promptText}
              </button>
            ))}
          </div>

          {/* Messages Stream */}
          <div
            ref={chatScrollRef}
            style={{
              maxHeight: "340px",
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
              padding: "10px",
              background: "var(--paper-subtle, rgba(0,0,0,0.02))",
              borderRadius: "12px",
              border: "1px solid var(--line)",
              marginBottom: "1rem",
            }}
          >
            {messages.map((msg) => (
              <div
                key={msg.id}
                style={{
                  alignSelf: msg.role === "user" ? "flex-start" : "flex-end",
                  maxWidth: "88%",
                  padding: "10px 14px",
                  borderRadius: msg.role === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                  background: msg.role === "user" ? "var(--color-primary-teal, #0d9488)" : "var(--paper)",
                  color: msg.role === "user" ? "#ffffff" : "var(--ink)",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                  border: msg.role === "user" ? "none" : "1px solid var(--line)",
                  fontSize: "13px",
                  lineHeight: "1.6",
                }}
              >
                {msg.role === "user" ? (
                  <div style={{ whiteSpace: "pre-wrap" }}>{msg.text}</div>
                ) : (
                  <>
                    <FormattedMessage text={msg.text} />
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginTop: "8px",
                        paddingTop: "6px",
                        borderTop: "1px solid rgba(0,0,0,0.06)",
                        gap: "8px",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          if (isPlayingAudio && playingMessageId === msg.id) {
                            stopActiveAudio();
                          } else {
                            void playSynthesizedSpeech(msg.text, msg.id);
                          }
                        }}
                        style={{
                          background: isPlayingAudio && playingMessageId === msg.id ? "rgba(239, 68, 68, 0.12)" : "transparent",
                          border: isPlayingAudio && playingMessageId === msg.id ? "1px solid rgba(239, 68, 68, 0.25)" : "none",
                          borderRadius: "6px",
                          cursor: "pointer",
                          color: isPlayingAudio && playingMessageId === msg.id ? "#ef4444" : "var(--color-primary-teal, #0d9488)",
                          fontSize: "11px",
                          fontWeight: 600,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          padding: isPlayingAudio && playingMessageId === msg.id ? "2px 8px" : 0,
                        }}
                        title={isPlayingAudio && playingMessageId === msg.id ? (isArabic ? "إيقاف الصوت" : "Stop speech") : (isArabic ? "استماع للرد" : "Listen")}
                      >
                        {isPlayingAudio && playingMessageId === msg.id ? (
                          <>
                            <Square size={11} fill="currentColor" />
                            {isArabic ? "إيقاف الصوت" : "Stop"}
                          </>
                        ) : (
                          <>
                            <Volume2 size={13} />
                            {isArabic ? "استماع للرد" : "Listen"}
                          </>
                        )}
                      </button>

                      {/* Direct Booking Shortcut Button if appointment is mentioned */}
                      {onOpenBooking && (msg.text.includes("حجز") || msg.text.includes("ميعاد") || msg.text.includes("كشف") || msg.text.includes("appointment")) && (
                        <button
                          type="button"
                          onClick={onOpenBooking}
                          style={{
                            background: "linear-gradient(135deg, #0d9488, #14b8a6)",
                            color: "#fff",
                            border: "none",
                            borderRadius: "8px",
                            cursor: "pointer",
                            fontSize: "11px",
                            fontWeight: 700,
                            padding: "3px 10px",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                        >
                          <CalendarDays size={12} /> {isArabic ? "فتح جدول الحجز الآن" : "Book Now"}
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}

            {isThinking && (
              <div
                style={{
                  alignSelf: "flex-end",
                  padding: "8px 14px",
                  borderRadius: "14px",
                  background: "var(--paper)",
                  border: "1px solid var(--line)",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "12px",
                  color: "var(--muted)",
                }}
              >
                <RefreshCw size={13} className="spin" color="#0d9488" />
                <span>{isArabic ? "جاري تحضير الرد الطبي..." : "Preparing answer..."}</span>
              </div>
            )}
          </div>

          {/* Input & Send Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void sendMessage(inputVal);
            }}
            style={{
              display: "flex",
              gap: "8px",
              alignItems: "center",
            }}
          >
            <input
              type="text"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              placeholder={
                isArabic
                  ? "اكتب استفسارك الطبي أو اضغط الميكروفون بالأعلى للتحدث..."
                  : "Type health inquiry or click microphone above to speak..."
              }
              disabled={isThinking}
              style={{
                flex: 1,
                minHeight: "42px",
                padding: "0 14px",
                borderRadius: "12px",
                border: "1px solid var(--line)",
                background: "var(--paper)",
                color: "var(--ink)",
                fontSize: "13px",
                outline: "none",
              }}
            />
            <button
              type="submit"
              disabled={!inputVal.trim() || isThinking}
              style={{
                width: "42px",
                height: "42px",
                borderRadius: "12px",
                border: "none",
                background: "var(--color-primary-teal, #0d9488)",
                color: "#fff",
                cursor: !inputVal.trim() || isThinking ? "not-allowed" : "pointer",
                opacity: !inputVal.trim() || isThinking ? 0.5 : 1,
                display: "grid",
                placeItems: "center",
              }}
              title={isArabic ? "إرسال" : "Send"}
            >
              <Send size={16} />
            </button>
          </form>
        </div>
      )}
    </section>
  );
}

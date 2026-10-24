import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  askGuestChat,
  askGuestVoice,
  transcribeGuestVoice,
  type GeneralChatResponse,
  type GuestChatHistoryMessage,
} from "../../api/chat";
import { GlobalChat } from "../chat/GlobalChat";
import { FormattedMessage } from "../chat/FormattedMessage";
import { demoAccounts, type DemoAccount } from "../auth/LoginRoute";
import { capturePublicLead } from "../../api/directory";
import { GoogleAuthModal, GoogleIcon, type GoogleUserPayload } from "../../components/GoogleAuthButton";
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  BookOpen,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Database,
  FileText,
  HeartPulse,
  Lock,
  Mail,
  Mic,
  MicOff,
  MessageCircle,
  Moon,
  Network,
  Phone,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Sun,
  Trash2,
  UserCheck,
  Users,
  Clock3,
  Square,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import type { Language, TranslationKey } from "../../i18n";

type Theme = "light" | "dark";
type LandingChatMessage = { id: number; role: "user" | "assistant"; text: string };
type Translator = (key: TranslationKey) => string;
type Props = {
  language: Language;
  setLanguage: (language: Language) => void;
  onEnter: (mode?: "signin" | "signup") => void;
  onDemoLogin?: (account: DemoAccount, customName?: string) => void;
  t: Translator;
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

export function Landing({
  language,
  setLanguage,
  onEnter,
  onDemoLogin,
  t,
  theme,
  setTheme,
}: Props) {
  const isArabic = language === "ar";
  const isDark = theme === "dark";
  const voiceLanguage: "ar-EG" | "en-US" = isArabic ? "ar-EG" : "en-US";
  const [page, setPage] = useState<
    "home" | "problem" | "features" | "assistant" | "demo" | "contact"
  >("home");
  const [assistantMode, setAssistantMode] = useState<"chat" | "voice">("chat");
  const [chatInput, setChatInput] = useState("");
  const [voiceInput, setVoiceInput] = useState("");
  const [chatMessages, setChatMessages] = useState<LandingChatMessage[]>([]);
  const [isVoiceOrbActive, setIsVoiceOrbActive] = useState(false);
  const [isVoiceRecording, setIsVoiceRecording] = useState(false);
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [chatError, setChatError] = useState("");
  const [voicePlaybackError, setVoicePlaybackError] = useState("");
  const [isVoiceTtsLoading, setIsVoiceTtsLoading] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState("");
  const voiceRecorder = useRef<MediaRecorder | null>(null);
  const voiceStream = useRef<MediaStream | null>(null);
  const voiceChunks = useRef<Blob[]>([]);
  const voiceStartInProgress = useRef(false);
  const chatMessageId = useRef(0);
  const [demoRequested, setDemoRequested] = useState(false);
  const [selectedDemoRole, setSelectedDemoRole] = useState<string>("doctor");
  const [isTranscribingVoice, setIsTranscribingVoice] = useState(false);
  const [showGoogleModal, setShowGoogleModal] = useState(false);
  const [googleSuccessToast, setGoogleSuccessToast] = useState("");

  const handleGoogleVisitorSuccess = async (user: GoogleUserPayload) => {
    try {
      await capturePublicLead({
        full_name: user.fullName,
        email: user.email,
        source: "Google Landing Lead",
        company: isArabic ? "زائر صفحة الهبوط" : "Landing Page Visitor",
        notes: isArabic
          ? `تسجيل دخول وتجربة عبر Google OAuth - الدور: ${user.role === "patient" ? "مريض" : "طبيب"}`
          : `Visitor verified via Google Sign-In - Role: ${user.role || "doctor"}`,
      });
    } catch {}

    const isPatient = user.role === "patient";
    const targetAccount = isPatient
      ? (demoAccounts.find((a) => a.role === "patient") || demoAccounts[7])
      : (demoAccounts.find((a) => a.role === "doctor") || demoAccounts[1]);

    setGoogleSuccessToast(
      isArabic
        ? isPatient
          ? `أهلاً بك يا ${user.fullName}! تم تسجيلك ونقلك لبوابة المريض...`
          : `أهلاً بك يا ${user.fullName}! تم تسجيلك ونقلك لمساحة الطبيب السريرية...`
        : isPatient
          ? `Welcome ${user.fullName}! Verified successfully, entering Patient Portal...`
          : `Welcome ${user.fullName}! Verified successfully, entering Clinician Workspace...`
    );
    setTimeout(() => {
      setGoogleSuccessToast("");
      if (onDemoLogin) {
        onDemoLogin(targetAccount, user.fullName);
      } else {
        onEnter("signin");
      }
    }, 1600);
  };
  const speechRecognitionRef = useRef<{ stop: () => void; abort?: () => void } | null>(null);
  const [isMobilePreview, setIsMobilePreview] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth <= 900;
  });

  useEffect(() => {
    const handleResize = () => {
      setIsMobilePreview(window.innerWidth <= 900);
    };

    handleResize();
    window.addEventListener("resize", handleResize);

    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const [preferredVoice, setPreferredVoice] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("careos-preferred-voice");
      if (saved === "Mariam") return "Mariam";
      return "Mohammed";
    }
    return "Mohammed";
  });

  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioRequestIdRef = useRef<number>(0);
  const audioAbortControllerRef = useRef<AbortController | null>(null);
  const [playingMessageId, setPlayingMessageId] = useState<number | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);

  const stopVoicePlayback = () => {
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
    setIsVoiceOrbActive(false);
  };

  const handleVoiceSelect = (voice: string) => {
    stopVoicePlayback();
    setPreferredVoice(voice);
    if (typeof window !== "undefined") {
      localStorage.setItem("careos-preferred-voice", voice);
    }
  };

  useEffect(
    () => () => {
      stopVoicePlayback();
      if (voiceRecorder.current?.state === "recording") voiceRecorder.current.stop();
      if (speechRecognitionRef.current) {
        try {
          speechRecognitionRef.current.stop();
        } catch {}
      }
      voiceStream.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  const speakReplyWithGemini = async (text: string | null, messageId?: number) => {
    if (!text?.trim()) return;

    audioRequestIdRef.current += 1;
    const currentRequestId = audioRequestIdRef.current;

    stopVoicePlayback();

    const abortController = new AbortController();
    audioAbortControllerRef.current = abortController;

    setVoicePlaybackError("");
    setIsVoiceTtsLoading(true);
    if (messageId !== undefined) {
      setPlayingMessageId(messageId);
    }

    try {
      type TTSResponsePayload = { audio_base64?: string; audio_mime_type?: string; detail?: string };
      let payload: TTSResponsePayload | null = null;
      let ok = false;

      // Authentic Egyptian VoiceTut neural voices (Mohammed or Mariam)
      const voiceName = isArabic ? preferredVoice : "en-US-GuyNeural";
      const endpoints = [
        "/api/v1/assistant/tts",
        "/api/v1/voice/tts",
      ];

      for (const endpoint of endpoints) {
        if (currentRequestId !== audioRequestIdRef.current || abortController.signal.aborted) {
          return;
        }
        try {
          const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text,
              language: isArabic ? "ar-EG" : "en-US",
              voice: voiceName,
            }),
            signal: abortController.signal,
          });
          const parsed = (await response.json().catch(() => null)) as TTSResponsePayload | null;
          if (response.ok && parsed?.audio_base64) {
            payload = parsed;
            ok = true;
            break;
          }
        } catch {
          // Continue to next endpoint
        }
      }

      if (currentRequestId !== audioRequestIdRef.current || abortController.signal.aborted) {
        return;
      }

      // Play authentic Egyptian neural voice (Mohammed or Mariam):
      if (ok && payload?.audio_base64) {
        const mimeType = payload.audio_mime_type || "audio/mpeg";
        const binary = atob(payload.audio_base64);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) {
          bytes[index] = binary.charCodeAt(index);
        }
        const audioUrl = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
        const audio = new Audio(audioUrl);
        activeAudioRef.current = audio;
        setIsPlayingAudio(true);

        const cleanup = () => {
          URL.revokeObjectURL(audioUrl);
          if (activeAudioRef.current === audio) {
            activeAudioRef.current = null;
          }
          setIsPlayingAudio(false);
          setPlayingMessageId(null);
          setIsVoiceOrbActive(false);
        };

        setIsVoiceOrbActive(true);
        audio.onended = cleanup;
        audio.onerror = cleanup;

        try {
          await audio.play();
          return;
        } catch {
          cleanup();
        }
      }

      throw new Error(payload?.detail || (isArabic ? "تعذّر تشغيل الصوت العصبي" : "Failed to synthesize neural voice"));
    } catch (error) {
      if (currentRequestId !== audioRequestIdRef.current) return;
      const detail = error instanceof Error ? error.message : "TTS error.";
      setVoicePlaybackError(
        `${isArabic ? "تعذّر تشغيل الصوت المصري" : "Voice playback failed"}: ${detail}`,
      );
      setPlayingMessageId(null);
      setIsPlayingAudio(false);
    } finally {
      if (currentRequestId === audioRequestIdRef.current) {
        setIsVoiceTtsLoading(false);
      }
    }
  };

  const sendChat = async (draft: string): Promise<GeneralChatResponse | null> => {
    const message = draft.trim();
    if (!message || isSendingChat) return null;
    chatMessageId.current += 1;
    const userMessageId = chatMessageId.current;
    setChatError("");
    setChatMessages((messages) => [
      ...messages,
      { id: userMessageId, role: "user", text: message },
    ]);
    setIsSendingChat(true);

    try {
      const historyPayload: GuestChatHistoryMessage[] = chatMessages
        .slice(-12)
        .map((m) => ({ role: m.role, content: m.text }));
      const response = await askGuestChat(message, voiceLanguage, false, historyPayload);
      chatMessageId.current += 1;
      setChatMessages((messages) => [
        ...messages,
        { id: chatMessageId.current, role: "assistant", text: response.answer },
      ]);
      void speakReplyWithGemini(response.answer);
      return response;
    } catch (error) {
      setChatError(error instanceof Error ? error.message : t("generalChatError"));
      return null;
    } finally {
      setIsSendingChat(false);
    }
  };

  const clearAssistantChat = () => {
    if (chatMessages.length === 0 || isSendingChat) return;
    setChatMessages([]);
    setChatInput("");
    setVoiceInput("");
    setVoiceStatus("");
    setChatError("");
    setVoicePlaybackError("");
  };

  const transcribeVoiceForReview = async (recording: Blob) => {
    if (!recording.size) {
      setVoiceStatus(isArabic ? "لم يتم التقاط صوت." : "No audio was captured.");
      return;
    }
    setVoiceStatus(isArabic ? "جاري تحويل صوتك إلى كلمات..." : "Transcribing your speech...");
    setIsTranscribingVoice(true);
    try {
      const audioBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result !== "string") {
            reject(new Error("Unable to read audio recording"));
            return;
          }
          resolve(reader.result.slice(reader.result.indexOf(",") + 1));
        };
        reader.onerror = () => reject(new Error("Unable to read audio recording"));
        reader.readAsDataURL(recording);
      });
      const response = await transcribeGuestVoice(audioBase64, voiceLanguage);
      if (response.transcript && response.transcript.trim()) {
        const text = response.transcript.trim();
        setChatInput(text);
        setVoiceInput(text);
        setVoiceStatus(
          isArabic
            ? "تمت كتابة كلماتك بنجاح! راجعها وعدلها في الحقل بالأسفل، ثم اضغط إرسال."
            : "Words transcribed! Review and edit your words below, then press Send."
        );
      } else {
        setVoiceStatus(
          isArabic
            ? "لم نتمكن من التقاط كلمات واضحة، تفضل بالمحاولة مرة أخرى."
            : "No words detected. Please try speaking again."
        );
      }
    } catch (error) {
      setVoiceStatus(error instanceof Error ? error.message : "Transcription failed");
    } finally {
      setIsTranscribingVoice(false);
    }
  };

  const startVoice = async () => {
    if (voiceStartInProgress.current || isSendingChat) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setVoiceStatus(isArabic ? "تسجيل الصوت غير مدعوم في هذا المتصفح." : "Audio recording is not supported in this browser.");
      return;
    }

    voiceStartInProgress.current = true;
    setVoiceStatus("");
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const supportedMimeType = ["audio/webm;codecs=opus", "audio/webm"].find((type) =>
        MediaRecorder.isTypeSupported(type),
      );
      if (!supportedMimeType) throw new Error("This browser cannot record WebM audio");

      const recorder = new MediaRecorder(stream, { mimeType: supportedMimeType });
      voiceStream.current = stream;
      voiceRecorder.current = recorder;
      voiceChunks.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) voiceChunks.current.push(event.data);
      };
      recorder.onerror = () => {
        voiceChunks.current = [];
        stream?.getTracks().forEach((track) => track.stop());
        voiceStream.current = null;
        voiceRecorder.current = null;
        setVoiceStatus(isArabic ? "حدث خطأ أثناء تسجيل الصوت." : "Audio recording failed.");
        setIsVoiceRecording(false);
        setIsVoiceOrbActive(false);
      };
      recorder.onstop = () => {
        const audio = new Blob(voiceChunks.current, { type: "audio/webm" });
        voiceChunks.current = [];
        stream?.getTracks().forEach((track) => track.stop());
        voiceStream.current = null;
        voiceRecorder.current = null;
        setIsVoiceRecording(false);
        setIsVoiceOrbActive(false);
        void transcribeVoiceForReview(audio);
      };
      recorder.start();
      setIsVoiceRecording(true);
      setIsVoiceOrbActive(true);
      setVoiceStatus(isArabic ? "الميكروفون يسجل صوتك الآن... تحدث واضغط مجدداً لإيقاف التسجيل ومراجعة كلماتك" : "Recording your speech... Speak and click again to stop and review your words");
    } catch {
      stream?.getTracks().forEach((track) => track.stop());
      setVoiceStatus(
        isArabic
          ? "تعذر الوصول للميكروفون. تحقق من الإذن وحاول مجددًا."
          : "Could not access the microphone. Check permission and try again.",
      );
      setIsVoiceRecording(false);
      setIsVoiceOrbActive(false);
    } finally {
      voiceStartInProgress.current = false;
    }
  };

  const toggleLiveSpeech = () => {
    if (isVoiceRecording) {
      if (speechRecognitionRef.current) {
        try {
          speechRecognitionRef.current.stop();
        } catch {}
        speechRecognitionRef.current = null;
      }
      if (voiceRecorder.current?.state === "recording") {
        voiceRecorder.current.stop();
      }
      setIsVoiceRecording(false);
      setIsVoiceOrbActive(false);
      return;
    }

    type SpeechConstructorType = new () => {
      continuous: boolean;
      interimResults: boolean;
      lang: string;
      onstart?: () => void;
      onresult: (e: any) => void;
      onerror: (e: any) => void;
      onend?: () => void;
      start: () => void;
      stop: () => void;
    };
    const win = window as unknown as {
      webkitSpeechRecognition?: SpeechConstructorType;
      SpeechRecognition?: SpeechConstructorType;
    };
    const SpeechApi = win.SpeechRecognition || win.webkitSpeechRecognition;

    if (SpeechApi) {
      try {
        const recognition = new SpeechApi();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = voiceLanguage;
        recognition.onstart = () => {
          setIsVoiceRecording(true);
          setIsVoiceOrbActive(true);
          setVoiceStatus(isArabic ? "الميكروفون يستمع... تحدث الآن لتكتب كلماتك مباشرة" : "Listening... Speak now and your words will appear live");
        };
        recognition.onresult = (ev: any) => {
          let transcript = "";
          for (let i = 0; i < ev.results.length; i++) {
            transcript += ev.results[i][0].transcript + " ";
          }
          if (transcript.trim()) {
            setChatInput(transcript.trim());
            setVoiceInput(transcript.trim());
          }
        };
        recognition.onerror = () => {
          setIsVoiceRecording(false);
          setIsVoiceOrbActive(false);
        };
        recognition.onend = () => {
          setIsVoiceRecording(false);
          setIsVoiceOrbActive(false);
          setVoiceStatus(
            isArabic
              ? "تمت كتابة كلماتك بنجاح! راجع وعدل كلماتك في صندوق الرسالة، ثم اضغط إرسال."
              : "Speech written! Review and edit your words in the input box, then press Send."
          );
        };
        recognition.start();
        speechRecognitionRef.current = recognition;
        return;
      } catch {
        // Fall back to MediaRecorder
      }
    }

    void startVoice();
  };

  const toggleVoice = () => {
    toggleLiveSpeech();
  };

  const currentVoiceStatusText =
    voiceStatus ||
    (isVoiceRecording
      ? isArabic
        ? "جارٍ تسجيل الصوت... تحدث الآن"
        : "Recording speech... Speak now"
      : isArabic
        ? "مستعد للاستماع. اضغط للتحدث ومراجعة كلماتك."
        : "Ready to listen. Click to speak and review your words.");

  const homeDemoRoles: Array<{
    role: "doctor" | "admin" | "patient" | "nurse";
    account: DemoAccount;
    titleEn: string;
    titleAr: string;
    badgeEn: string;
    badgeAr: string;
    detailEn: string;
    detailAr: string;
    icon: ReactNode;
  }> = [
    {
      role: "doctor",
      account: demoAccounts.find((a) => a.role === "doctor") || demoAccounts[1],
      titleEn: "Physician & Doctor",
      titleAr: "بوابة الأطباء (Doctor)",
      badgeEn: "Clinical Care",
      badgeAr: "العيادة والملاحظات",
      detailEn: "Consultations, AI note drafts, active patient files, and scheduled appointments.",
      detailAr: "إدارة الاستشارات، مسودات الملاحظات السريرية، ملفات المرضى، وجدول المواعيد.",
      icon: <Stethoscope size={24} />,
    },
    {
      role: "admin",
      account: demoAccounts.find((a) => a.role === "admin") || demoAccounts[0],
      titleEn: "System Administrator",
      titleAr: "إدارة المنظومة (Admin)",
      badgeEn: "Operations & Governance",
      badgeAr: "الإدارة والتحكم",
      detailEn: "Clinic settings, audit logs, staff delegation, department management, and security.",
      detailAr: "إعدادات المنشأة، سجلات التدقيق، إدارة الطاقم والأقسام، وصلاحيات الأمان.",
      icon: <ShieldCheck size={24} />,
    },
    {
      role: "patient",
      account: demoAccounts.find((a) => a.role === "patient") || demoAccounts[7],
      titleEn: "Patient Portal",
      titleAr: "بوابة المريض (Patient)",
      badgeEn: "Personal Health",
      badgeAr: "ملفي الصحي",
      detailEn: "View upcoming clinic visits, approved lab reports, medical history, and care plans.",
      detailAr: "استعراض المواعيد القادمة، نتائج التحاليل المعتمدة، الملف الطبي، والتواصل مع الطبيب.",
      icon: <UserCheck size={24} />,
    },
    {
      role: "nurse",
      account: demoAccounts.find((a) => a.role === "nurse") || demoAccounts[2],
      titleEn: "Nursing & Reception Staff",
      titleAr: "طاقم التمريض والاستقبال",
      badgeEn: "Care Workflow",
      badgeAr: "سير العمليات والفرز",
      detailEn: "Patient triage queue, check-in, vital signs, care plans, and daily clinic flow.",
      detailAr: "قوائم الفرز، تسجيل حضور المرضى، العلامات الحيوية، وتنسيق تدفق العيادة اليومي.",
      icon: <Activity size={24} />,
    },
  ];

  const copy = isArabic
    ? {
        title: "رعاية تفكر معك.",
        detail:
          "CareOS مساحة عمل SaaS موجهة للفرق الطبية: تلخيص فوري للملاحظات، اقتراحات مبنية على مصادر واضحة، وجدولة أذكى، مع بقاء القرار النهائي للطبيب.",
        primary: "احجز عرض تجريبي",
        secondary: "شاهد كيف يعمل",
      }
    : {
        title: "Care that thinks with you.",
        detail:
          "CareOS is a clinician workflow workspace: draft summarization, smarter scheduling, clear review queues, and the physician stays in control at the end of every workflow.",
        primary: "Book a demo",
        secondary: "See how it works",
      };
  const features = isArabic
    ? [
        {
          icon: <BookOpen />,
          title: "تلخيص AI",
          detail: "حوّل الملاحظة الحرة إلى مسودة منظمة قبل الاعتماد.",
        },
        {
          icon: <Database />,
          title: "دعم صياغة سريرية",
          detail: "جهّز مسودات منظمة ومراجعات بشرية دون إجراءات آلية.",
        },
        {
          icon: <CalendarDays />,
          title: "إدارة مواعيد ذكية",
          detail: "نسّق اليوميّة وذكّر الفريق من نفس الواجهة.",
        },
        {
          icon: <ShieldCheck />,
          title: "حوكمة وأمان مؤسسي",
          detail: "صلاحيات واضحة وسجل تدقيق يساعد فريقك على العمل بثقة.",
        },
        {
          icon: <FileText />,
          title: "ملف مريض منظم",
          detail: "اجمع المستندات والملاحظات في سياق واضح يسهل الرجوع إليه.",
        },
        {
          icon: <Mic />,
          title: "إدخال صوتي",
          detail: "دوّن الملاحظات أثناء التحدث وتابعها مباشرة داخل السجل الطبي.",
        },
        {
          icon: <MessageCircle />,
          title: "سير مراجعة طبيب",
          detail: "احتفظ بالأسئلة والمسودات وموافقة الطبيب داخل سير العمل السريري بدلًا من إجراءات تلقائية.",
        },
      ]
    : [
        {
          icon: <BookOpen />,
          title: "AI summarization",
          detail:
            "Turn a free-form note into an editable draft before sign-off.",
        },
        {
          icon: <Database />,
          title: "Clinical drafting support",
          detail:
            "Prepare structured drafts and review queues without autonomous actions.",
        },
        {
          icon: <CalendarDays />,
          title: "Smart scheduling",
          detail: "Keep appointments and follow-ups moving from one place.",
        },
        {
          icon: <ShieldCheck />,
          title: "Governed operations",
          detail: "Clear permissions and an audit trail for accountable care teams.",
        },
        {
          icon: <FileText />,
          title: "Organized patient records",
          detail: "Keep documents and notes together in a context your team can trust.",
        },
        {
          icon: <Mic />,
          title: "Voice capture",
          detail: "Dictate notes in real time and turn them into structured clinical context.",
        },
        {
          icon: <MessageCircle />,
          title: "Clinician review workflow",
          detail: "Keep questions, drafts, and sign-off steps inside the clinical workflow instead of autonomous actions.",
        },
      ];
  const nav = (next: typeof page) => setPage(next);
  return (
    <div
      className={`landing-page ${theme === "dark" ? "dark-mode-landing" : ""} ${
        isMobilePreview ? "force-mobile" : ""
      }`}
      dir={isArabic ? "rtl" : "ltr"}
    >
      <header className="landing-nav landing-enter-nav">
        <button
          type="button"
          className="brand landing-brand landing-logo-home"
          onClick={() => nav("home")}
        >
          <div className="brand-mark">
            <HeartPulse size={19} />
          </div>
          <span>
            care<span>os</span>
          </span>
        </button>
        <nav className="landing-links">
          <button className={`nav-link-button ${page === "problem" ? "active" : ""}`} onClick={() => nav("problem")}>
            {isArabic ? "لماذا CareOS؟" : "Why CareOS"}
          </button>
          <button className={`nav-link-button ${page === "features" ? "active" : ""}`} onClick={() => nav("features")}>
            {isArabic ? "الميزات والقدرات" : "Features"}
          </button>
          <button className={`nav-link-button ${page === "assistant" ? "active" : ""}`} onClick={() => nav("assistant")}>
            {isArabic ? "المساعد الطبي الذكي" : "AI Assistant"}
          </button>
          <button className={`nav-link-button ${page === "demo" ? "active" : ""}`} onClick={() => nav("demo")}>
            {isArabic ? "تغطية المنشأة والأمان" : "Ecosystem & Security"}
          </button>
          <button className={`nav-link-button ${page === "contact" ? "active" : ""}`} onClick={() => nav("contact")}>
            {isArabic ? "تواصل معنا" : "Contact"}
          </button>
        </nav>
        <div className="landing-nav-actions">
          <button
            className="landing-control-btn landing-icon-btn landing-mobile-control"
            onClick={() => setLanguage(isArabic ? "en" : "ar")}
            aria-label={isArabic ? "Switch to English" : "Switch to Arabic"}
            title={isArabic ? "Switch to English" : "Switch to Arabic"}
          >
            {isArabic ? "EN" : "AR"}
          </button>
          <button
            className="landing-control-btn landing-icon-btn landing-mobile-control"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label={
              theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
            }
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
          </button>
          <div className="landing-auth-links" dir={isArabic ? "rtl" : "ltr"}>
            <button
              type="button"
              className="landing-pill-google-btn"
              onClick={() => setShowGoogleModal(true)}
              title={isArabic ? "دخول الزوار بحساب Google" : "Visitor Google Sign-In"}
            >
              <GoogleIcon size={14} />
              <span className="landing-pill-google-text">{isArabic ? "دخول Google" : "Google Sign-In"}</span>
            </button>
            <span className="landing-pill-divider" aria-hidden="true" />
            <button
              type="button"
              className="landing-pill-signin-btn"
              onClick={() => onEnter("signin")}
            >
              {isArabic ? "تسجيل الدخول" : "Sign In"}
            </button>
          </div>
          <button
            className="landing-primary landing-control-btn landing-control-btn-primary"
            onClick={() => onEnter("signup")}
          >
            {isArabic ? "ابدأ الآن مجاناً" : "Get Started"}{" "}
            {isArabic ? <ArrowLeft size={15} /> : <ArrowRight size={15} />}
          </button>
        </div>
      </header>

      <nav className="mobile-page-tabs" aria-label="Mobile section tabs">
        {[
          { key: "problem", label: isArabic ? "لماذا CareOS؟" : "Why CareOS" },
          { key: "features", label: isArabic ? "الميزات والقدرات" : "Features" },
          { key: "assistant", label: isArabic ? "المساعد الطبي" : "AI Assistant" },
          { key: "demo", label: isArabic ? "معاينة حية" : "Live Demo" },
          { key: "contact", label: isArabic ? "تواصل معنا" : "Contact" },
        ].map((item) => (
          <button
            key={item.key}
            type="button"
            className={`mobile-page-tab ${page === item.key ? "active" : ""}`}
            onClick={() => nav(item.key as typeof page)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {page === "home" ? (
        <main>
          <section className="landing-hero">
            <div className="landing-copy landing-hero-copy">
              <div className="hero-announcement-pill hero-reveal">
                <span className="announcement-pill-badge">
                  <span>{isArabic ? "منصة الجيل القادم" : "Next-Gen Platform"}</span>
                </span>
                <span className="announcement-pill-text">
                  {isArabic ? "ذكاء سريري متقدم مدعوم بالحوكمة والـ HIPAA" : "Clinical AI Workspace with Enterprise Governance"}
                </span>
                {isArabic ? (
                  <ArrowLeft size={13} className="announcement-pill-arrow" />
                ) : (
                  <ArrowRight size={13} className="announcement-pill-arrow" />
                )}
              </div>
              <h1 className="hero-reveal hero-title">{copy.title}</h1>
              <p className="hero-reveal hero-detail">{copy.detail}</p>
              <div className="landing-actions hero-reveal hero-actions">
                <button
                  className="primary-btn landing-primary"
                  onClick={() => nav("contact")}
                >
                  {copy.primary}{" "}
                  {isArabic ? <ArrowLeft size={17} /> : <ArrowRight size={17} />}
                </button>
                <button
                  type="button"
                  onClick={() => setShowGoogleModal(true)}
                  className="landing-hero-google-btn"
                >
                  <GoogleIcon size={16} />
                  <span>{isArabic ? "جرّب النظام بحساب Google (للزوار)" : "Try Demo with Google"}</span>
                </button>
                <button
                  className="landing-secondary"
                  onClick={() => nav("features")}
                >
                  {copy.secondary}{" "}
                  {isArabic ? <ChevronLeft size={15} /> : <ChevronRight size={15} />}
                </button>
              </div>
              <div className="hero-badges hero-reveal">
                <span className="hero-badge">
                  {isArabic ? "عربي / إنجليزي" : "Arabic / English"}
                </span>
                <span className="hero-badge">
                  {isArabic ? "مراجعة طبية 100%" : "100% physician review"}
                </span>
                <span className="hero-badge">
                  {isArabic ? "مسودات مراجعة طبية" : "Clinician-reviewed drafts"}
                </span>
              </div>
            </div>
            <div className="landing-visual landing-float-card">
              <div className="visual-orb visual-orb-a" />
              <div className="visual-orb visual-orb-b" />
              <div className="visual-scan" />
              <div className="visual-header">
                <span>
                  <span className="live-dot" /> CareOS clinical workspace
                </span>
                <span>{isArabic ? "معاينة حية" : "Live preview"}</span>
              </div>
              <div className="visual-title">
                <div>
                  <small>
                    {isArabic ? "اليوم، 21 أكتوبر" : "Today, 21 October"}
                  </small>
                  <h2>
                    {isArabic ? "صباح الخير، د. رنا" : "Good morning, Dr. Rana"}
                  </h2>
                </div>
                <div className="visual-avatar" title={isArabic ? "د. رنا - استشاري" : "Dr. Rana - Consultant"}>
                  <Stethoscope size={18} />
                  <span className="visual-avatar-badge" />
                </div>
              </div>
              <div className="visual-metrics">
                <div>
                  <Users size={16} />
                  <b>248</b>
                  <span>{isArabic ? "مريض" : "Patients"}</span>
                </div>
                <div>
                  <CalendarDays size={16} />
                  <b>08</b>
                  <span>{isArabic ? "زيارة اليوم" : "Visits today"}</span>
                </div>
                <div>
                  <Clock3 size={16} />
                  <b>05</b>
                  <span>{isArabic ? "متابعة" : "Follow-ups"}</span>
                </div>
              </div>
              <div className="visual-panel">
                <div className="visual-panel-heading">
                  <b>{isArabic ? "تدفق اليوم" : "Today's care flow"}</b>
                  <span>{isArabic ? "تفاصيل" : "View details"}</span>
                </div>
                <div className="visual-row">
                  <span>09:00</span>
                  <strong>{isArabic ? "مريم حسن" : "Mariam Hassan"}</strong>
                  <em>{isArabic ? "متابعة دورية" : "Follow-up"}</em>
                  <i>{isArabic ? "مؤكد" : "Confirmed"}</i>
                </div>
                <div className="visual-row">
                  <span>10:30</span>
                  <strong>{isArabic ? "عمر خالد" : "Omar Khaled"}</strong>
                  <em>{isArabic ? "مراجعة سكر" : "Diabetes review"}</em>
                  <i>{isArabic ? "وصل العيادة" : "Arrived"}</i>
                </div>
                <div className="visual-row">
                  <span>12:00</span>
                  <strong>{isArabic ? "نور الدين سامي" : "Nour El Din"}</strong>
                  <em>{isArabic ? "إحالة قلب" : "Cardiology referral"}</em>
                  <i>{isArabic ? "قيد الانتظار" : "Pending"}</i>
                </div>
              </div>

              <div className="visual-scribe-widget">
                <div className="scribe-widget-icon">
                  <span className="pulse-ring" />
                  <Mic size={15} />
                </div>
                <div className="scribe-widget-info">
                  <div className="scribe-widget-title-row">
                    <strong>{isArabic ? "المساعد الصوتي السريري" : "Ambient Clinical Scribe"}</strong>
                    <span className="scribe-widget-live-pill">
                      <span className="live-dot" />
                      {isArabic ? "نشط" : "Active"}
                    </span>
                  </div>
                  <span className="scribe-widget-desc">
                    {isArabic ? "صياغة المسودة وتلخيص العلامات الحيوية لحظياً" : "Active • Ambient dictation & vitals summary"}
                  </span>
                </div>
              </div>

              <div className="visual-footer">
                <span>
                  <BookOpen size={13} />{" "}
                  {isArabic ? "مرتبط بالمصدر" : "Evidence linked"}
                </span>
                <span>
                  <ShieldCheck size={13} />{" "}
                  {isArabic ? "مراجعة بشرية" : "Human review"}
                </span>
              </div>
            </div>
          </section>
          <section className="landing-home-grid">
            <div className="landing-home-card">
              <div className="home-card-icon-wrap">
                <FileText size={20} />
              </div>
              <h3>
                {isArabic
                  ? "ملاحظات أسرع، قرارات أكثر وضوحًا"
                  : "Faster notes, clearer decisions"}
              </h3>
              <p>
                {isArabic
                  ? "تجميع الملاحظات، المواعيد، والاقتراحات في واجهة واحدة موحدة تختصر وقت التوثيق."
                  : "Bring notes, schedules, and recommendations into one unified workflow."}
              </p>
            </div>
            <div className="landing-home-card">
              <div className="home-card-icon-wrap">
                <Activity size={20} />
              </div>
              <h3>
                {isArabic
                  ? "كل اقتراح مرتبط بمصدر واضح"
                  : "Every suggestion is traceable"}
              </h3>
              <p>
                {isArabic
                  ? "يظهر المصدر ومستوى الثقة حتى يراجع الطبيب القرار السريري بدقة تامة."
                  : "Show source and confidence so physicians review recommendations with clarity."}
              </p>
            </div>
            <div className="landing-home-card">
              <div className="home-card-icon-wrap">
                <ShieldCheck size={20} />
              </div>
              <h3>
                {isArabic
                  ? "أمان للمريض، راحة للطبيب"
                  : "Safer care, calmer operations"}
              </h3>
              <p>
                {isArabic
                  ? "تجربة مؤسسية معتمدة لحوكمة وأمان بيانات الرعاية الصحية والمستشفيات."
                  : "A governed experience engineered for real healthcare teams and operations."}
              </p>
            </div>
          </section>

          <section className="landing-impact-strip">
            <div className="impact-metric-item">
              <span className="impact-metric-num">70%</span>
              <span className="impact-metric-label">
                {isArabic ? "توفير في وقت التوثيق السريري" : "Less documentation time"}
              </span>
            </div>
            <div className="impact-metric-divider" />
            <div className="impact-metric-item">
              <span className="impact-metric-num">100%</span>
              <span className="impact-metric-label">
                {isArabic ? "إشراف ومراجعة بشرية من الطبيب" : "Human-in-the-loop review"}
              </span>
            </div>
            <div className="impact-metric-divider" />
            <div className="impact-metric-item">
              <span className="impact-metric-num">&lt; 1.2s</span>
              <span className="impact-metric-label">
                {isArabic ? "سرعة استخراج تحاليل الـ OCR" : "Instant lab OCR extraction"}
              </span>
            </div>
            <div className="impact-metric-divider" />
            <div className="impact-metric-item">
              <span className="impact-metric-num">HL7 / FHIR</span>
              <span className="impact-metric-label">
                {isArabic ? "جاهزية الربط والتكامل المفتوح" : "Standard interoperability"}
              </span>
            </div>
          </section>
        </main>
      ) : (
        <main className="landing-subpage-shell">
          <div className="landing-subpage">
            <button
              className="back-link"
              onClick={() => nav("home")}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 16px",
                borderRadius: "20px",
                background: "var(--canvas, #f0f7f5)",
                border: "1px solid var(--line, #e2e8f0)",
                color: "var(--ink, #0f172a)",
                fontWeight: 600,
                fontSize: "13px",
                cursor: "pointer",
                marginBottom: "1rem",
              }}
            >
              <ChevronRight size={16} style={{ transform: isArabic ? "none" : "rotate(180deg)" }} />
              <span>{isArabic ? "العودة إلى الصفحة الرئيسية" : "Back to Home"}</span>
            </button>
            <div className="landing-section-heading">
              <h2>
                {page === "problem"
                  ? isArabic
                    ? "لماذا CareOS؟ الفجوة السريرية والحل المتكامل"
                    : "Why CareOS? Bridging the Clinical Gap"
                  : page === "features"
                    ? isArabic
                      ? "الميزات والقدرات السريرية المتقدمة"
                      : "Advanced Clinical Capabilities"
                    : page === "assistant"
                      ? isArabic
                        ? (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", justifyContent: "center" }}>
                            <span>المساعد الطبي الذكي</span>
                            <span dir="ltr" style={{ unicodeBidi: "isolate", color: "var(--teal, #0d9488)" }}>
                              (CareOS AI)
                            </span>
                          </span>
                        )
                        : "CareOS Clinical AI Assistant"
                      : page === "demo"
                      ? isArabic
                        ? "التغطية الشاملة والحوكمة الطبية"
                        : "Hospital Ecosystem & Clinical Governance"
                      : isArabic
                        ? "تواصل معنا واحجز عرضاً تجريبياً لمستشفاك"
                        : "Request a Hospital Demo"}
              </h2>
            </div>
            {page === "assistant" ? (
              <section className="landing-assistant-preview">
                <div className="assistant-demo-shell">
                  <div
                    className="assistant-demo-toggle"
                    aria-label={isArabic ? "اختيار طريقة المحادثة" : "Conversation mode selector"}
                    style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", flexWrap: "wrap", marginBottom: "1rem" }}
                  >
                    <div style={{ display: "inline-flex", background: isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.05)", border: isDark ? "1px solid rgba(255, 255, 255, 0.12)" : "none", padding: "4px", borderRadius: "24px" }}>
                      <button
                        type="button"
                        className={assistantMode === "chat" ? "active" : ""}
                        aria-pressed={assistantMode === "chat"}
                        onClick={() => {
                          if (voiceRecorder.current?.state === "recording") {
                            voiceRecorder.current.stop();
                          }
                          setIsVoiceOrbActive(false);
                          setAssistantMode("chat");
                        }}
                      >
                        {isArabic ? "دردشة" : "Chat"}
                      </button>
                      <button
                        type="button"
                        className={assistantMode === "voice" ? "active" : ""}
                        aria-pressed={assistantMode === "voice"}
                        onClick={() => {
                          setAssistantMode("voice");
                          void startVoice();
                        }}
                      >
                        {isArabic ? "صوت" : "Voice"}
                      </button>
                    </div>

                    {assistantMode === "chat" && chatMessages.length > 0 && (
                      <button
                        type="button"
                        onClick={clearAssistantChat}
                        disabled={isSendingChat}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          fontSize: "12px",
                          padding: "6px 14px",
                          borderRadius: "20px",
                          cursor: isSendingChat ? "not-allowed" : "pointer",
                          opacity: isSendingChat ? 0.6 : 1,
                          background: isDark ? "rgba(239, 68, 68, 0.15)" : "rgba(239, 68, 68, 0.08)",
                          color: isDark ? "#fca5a5" : "#b91c1c",
                          border: isDark ? "1px solid rgba(239, 68, 68, 0.3)" : "1px solid rgba(239, 68, 68, 0.2)",
                          fontWeight: 600,
                          transition: "all 0.15s ease",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = isDark ? "rgba(239, 68, 68, 0.25)" : "rgba(239, 68, 68, 0.15)";
                          e.currentTarget.style.borderColor = isDark ? "#f87171" : "#ef4444";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = isDark ? "rgba(239, 68, 68, 0.15)" : "rgba(239, 68, 68, 0.08)";
                          e.currentTarget.style.borderColor = isDark ? "rgba(239, 68, 68, 0.3)" : "rgba(239, 68, 68, 0.2)";
                        }}
                        title={isArabic ? "مسح المحادثة وبدء محادثة جديدة" : t("clearChat")}
                      >
                        <Trash2 size={13} />
                        <span>{t("clearChat")}</span>
                      </button>
                    )}

                    {isArabic && (
                      <div
                        className="assistant-voice-pills"
                        style={{
                          display: "inline-flex",
                          gap: "8px",
                          alignItems: "center",
                          background: isDark ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 0, 0, 0.04)",
                          border: isDark ? "1px solid rgba(255, 255, 255, 0.12)" : "1px solid rgba(0, 0, 0, 0.06)",
                          padding: "4px 12px",
                          borderRadius: "20px",
                        }}
                      >
                        <span style={{ fontSize: "11px", color: isDark ? "#cbd5e1" : "var(--muted, #64748b)", fontWeight: 600 }}>نبرة الصوت:</span>
                        <button
                          type="button"
                          className={preferredVoice === "Mohammed" ? "active" : ""}
                          onClick={() => handleVoiceSelect("Mohammed")}
                          style={{
                            fontSize: "11px",
                            padding: "3px 12px",
                            borderRadius: "12px",
                            cursor: "pointer",
                            background: preferredVoice === "Mohammed" ? "var(--color-primary-teal, #0d9488)" : "transparent",
                            color: preferredVoice === "Mohammed" ? "#ffffff" : (isDark ? "#cbd5e1" : "inherit"),
                            border: preferredVoice === "Mohammed" ? "1px solid var(--color-primary-teal, #0d9488)" : (isDark ? "1px solid rgba(255, 255, 255, 0.18)" : "1px solid var(--border-subtle, #cbd5e1)"),
                            fontWeight: preferredVoice === "Mohammed" ? 700 : 500,
                          }}
                        >
                          محمد (رجالي)
                        </button>
                        <button
                          type="button"
                          className={preferredVoice === "Mariam" ? "active" : ""}
                          onClick={() => handleVoiceSelect("Mariam")}
                          style={{
                            fontSize: "11px",
                            padding: "3px 12px",
                            borderRadius: "12px",
                            cursor: "pointer",
                            background: preferredVoice === "Mariam" ? "var(--color-primary-teal, #0d9488)" : "transparent",
                            color: preferredVoice === "Mariam" ? "#ffffff" : (isDark ? "#cbd5e1" : "inherit"),
                            border: preferredVoice === "Mariam" ? "1px solid var(--color-primary-teal, #0d9488)" : (isDark ? "1px solid rgba(255, 255, 255, 0.18)" : "1px solid var(--border-subtle, #cbd5e1)"),
                            fontWeight: preferredVoice === "Mariam" ? 700 : 500,
                          }}
                        >
                          مريم (نسائي)
                        </button>
                      </div>
                    )}
                  </div>

                  <div className={`assistant-demo-card ${assistantMode === "voice" ? "voice-mode" : ""}`}>
                    {assistantMode === "chat" ? (
                      <>
                        {chatMessages.length > 0 && (
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              padding: "2px 6px 12px",
                              marginBottom: "4px",
                              borderBottom: isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid rgba(0, 0, 0, 0.06)",
                            }}
                          >
                            <span style={{ fontSize: "12px", color: isDark ? "#94a3b8" : "#64748b", fontWeight: 600 }}>
                              {isArabic
                                ? `المحادثة النشطة (${chatMessages.length} ${chatMessages.length === 1 ? "رسالة" : "رسائل"})`
                                : `Active conversation (${chatMessages.length} ${chatMessages.length === 1 ? "message" : "messages"})`}
                            </span>
                            <button
                              type="button"
                              onClick={clearAssistantChat}
                              disabled={isSendingChat}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "5px",
                                fontSize: "11px",
                                padding: "4px 10px",
                                borderRadius: "14px",
                                cursor: isSendingChat ? "not-allowed" : "pointer",
                                opacity: isSendingChat ? 0.6 : 1,
                                background: isDark ? "rgba(239, 68, 68, 0.15)" : "rgba(239, 68, 68, 0.08)",
                                color: isDark ? "#fca5a5" : "#b91c1c",
                                border: isDark ? "1px solid rgba(239, 68, 68, 0.3)" : "1px solid rgba(239, 68, 68, 0.2)",
                                fontWeight: 600,
                                transition: "all 0.15s ease",
                              }}
                              title={isArabic ? "مسح المحادثة وبدء محادثة جديدة" : t("clearChat")}
                            >
                              <RotateCcw size={12} />
                              <span>{t("clearChat")}</span>
                            </button>
                          </div>
                        )}
                        <div className="assistant-demo-messages" aria-live="polite">
                          {chatMessages.length === 0 && (
                            <>
                              <div className="assistant-demo-message assistant-demo-message-left assistant-demo-welcome">
                                {isArabic
                                  ? "أهلاً بك، كيف يمكنني مساعدتك في استكشاف منصة CareOS اليوم؟"
                                  : "Welcome! How can I assist you in exploring CareOS today?"}
                              </div>

                              <div style={{ margin: "16px 0 8px" }}>
                                <span style={{ fontSize: "11px", color: isDark ? "#94a3b8" : "var(--muted, #64748b)", fontWeight: 600, display: "block", marginBottom: "8px" }}>
                                  {isArabic ? "أسئلة مقترحة للاستكشاف:" : "Suggested inquiries:"}
                                </span>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                                  {[
                                    isArabic
                                      ? "ما هي أهم المميزات والخدمات التي تقدمها منصة CareOS؟"
                                      : "What are the core capabilities and features of CareOS?",
                                    isArabic
                                      ? "كيف يساعد النظام الكادر الطبي والمرضى في تنظيم الرعاية؟"
                                      : "How does the platform assist medical staff and patients?",
                                    isArabic
                                      ? "كيف تضمن منصة CareOS أمان وسرية بيانات المرضى؟"
                                      : "How does CareOS protect patient data security and privacy?",
                                  ].map((promptText, i) => (
                                    <button
                                      key={i}
                                      type="button"
                                      style={{
                                        background: isDark ? "rgba(45, 212, 191, 0.12)" : "rgba(20, 93, 88, 0.05)",
                                        border: isDark ? "1px solid rgba(45, 212, 191, 0.3)" : "1px solid rgba(20, 93, 88, 0.22)",
                                        color: isDark ? "#f1f5f9" : "var(--ink, #134e4a)",
                                        padding: "8px 14px",
                                        borderRadius: "20px",
                                        fontSize: "12px",
                                        fontWeight: 600,
                                        cursor: "pointer",
                                        transition: "all 0.15s ease",
                                        textAlign: isArabic ? "right" : "left",
                                      }}
                                      onMouseEnter={(e) => {
                                        e.currentTarget.style.background = isDark ? "rgba(45, 212, 191, 0.24)" : "rgba(20, 93, 88, 0.12)";
                                        e.currentTarget.style.borderColor = isDark ? "#2dd4bf" : "var(--teal, #0d9488)";
                                        if (isDark) e.currentTarget.style.color = "#ffffff";
                                      }}
                                      onMouseLeave={(e) => {
                                        e.currentTarget.style.background = isDark ? "rgba(45, 212, 191, 0.12)" : "rgba(20, 93, 88, 0.05)";
                                        e.currentTarget.style.borderColor = isDark ? "rgba(45, 212, 191, 0.3)" : "rgba(20, 93, 88, 0.22)";
                                        e.currentTarget.style.color = isDark ? "#f1f5f9" : "var(--ink, #134e4a)";
                                      }}
                                      onClick={() => {
                                        void sendChat(promptText);
                                      }}
                                    >
                                      {promptText}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </>
                          )}
                          {chatMessages.map((message) => (
                            <div
                              className={`assistant-demo-message ${message.role === "user" ? "assistant-demo-message-right" : "assistant-demo-message-left"}`}
                              key={message.id}
                            >
                              <FormattedMessage text={message.text} />
                              {message.role === "assistant" && (
                                <button
                                  type="button"
                                  className="assistant-demo-listen-btn"
                                  onClick={() => {
                                    if (playingMessageId === message.id) {
                                      stopVoicePlayback();
                                    } else {
                                      void speakReplyWithGemini(message.text, message.id);
                                    }
                                  }}
                                  disabled={isVoiceTtsLoading && playingMessageId !== message.id}
                                  title={
                                    playingMessageId === message.id
                                      ? (isArabic ? "إيقاف الصوت" : "Stop audio")
                                      : (isArabic ? "استمع إلى الرد بالصوت" : "Listen to answer aloud")
                                  }
                                  style={
                                    playingMessageId === message.id
                                      ? {
                                          background: "rgba(239, 68, 68, 0.15)",
                                          color: "#ef4444",
                                          borderColor: "rgba(239, 68, 68, 0.35)",
                                        }
                                      : undefined
                                  }
                                >
                                  {playingMessageId === message.id ? (
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
                              )}
                            </div>
                          ))}
                          {isSendingChat && (
                            <div className="assistant-demo-typing" aria-label={isArabic ? "جاري الرد" : "Assistant is responding"}>
                              <span />
                              <span />
                              <span />
                            </div>
                          )}
                          {chatError && <div className="assistant-demo-error" role="alert">{chatError}</div>}
                          {voicePlaybackError && <div className="assistant-demo-error" role="alert">{voicePlaybackError}</div>}
                        </div>

                        {(voiceStatus || isVoiceRecording || isTranscribingVoice) && (
                          <div
                            className="assistant-voice-review-hint"
                            style={{
                              color: isDark
                                ? voiceStatus.includes("تعذر") || voiceStatus.includes("خطأ") || voiceStatus.includes("failed")
                                  ? "#fca5a5"
                                  : "#5eead4"
                                : undefined,
                            }}
                          >
                            {isVoiceRecording ? (
                              <>
                                <span className="live-dot" style={{ backgroundColor: "#ef4444" }} />
                                <span>{isArabic ? "الميكروفون يستمع... تحدث الآن لتكتب كلماتك" : "Listening... Speak now to transcribe"}</span>
                              </>
                            ) : isTranscribingVoice ? (
                              <>
                                <RefreshCw size={12} className="spin" color={isDark ? "#5eead4" : "var(--teal, #0d9488)"} />
                                <span>{isArabic ? "جاري تحويل صوتك إلى كلمات..." : "Transcribing your speech..."}</span>
                              </>
                            ) : (
                              <>
                                {voiceStatus.includes("تعذر") || voiceStatus.includes("خطأ") || voiceStatus.includes("failed") ? (
                                  <AlertCircle size={13} color={isDark ? "#f87171" : "#ef4444"} />
                                ) : (
                                  <CheckCircle2 size={13} color={isDark ? "#5eead4" : "var(--teal, #0d9488)"} />
                                )}
                                <span style={{ color: isDark ? (voiceStatus.includes("تعذر") || voiceStatus.includes("خطأ") || voiceStatus.includes("failed") ? "#fca5a5" : "#e2e8f0") : undefined }}>
                                  {voiceStatus}
                                </span>
                              </>
                            )}
                          </div>
                        )}

                        <form
                          className="assistant-demo-input"
                          onSubmit={(event) => {
                            event.preventDefault();
                            void sendChat(chatInput);
                            setChatInput("");
                            setVoiceStatus("");
                          }}
                        >
                          <input
                            aria-label={isArabic ? "اكتب أو تحدث للمساعد" : "Type or speak to assistant"}
                            value={chatInput}
                            onChange={(event) => setChatInput(event.target.value)}
                            placeholder={isArabic ? "اكتب أو اضغط على الميكروفون للتحدث..." : "Type or click microphone to speak..."}
                          />
                          <button
                            className={`assistant-demo-mic ${isVoiceRecording ? "recording" : ""}`}
                            type="button"
                            onClick={toggleLiveSpeech}
                            title={
                              isVoiceRecording
                                ? isArabic
                                  ? "إيقاف التسجيل ومراجعة كلماتك"
                                  : "Stop and review your words"
                                : isArabic
                                  ? "تحدث لتسجيل كلماتك ومراجعتها"
                                  : "Speak to transcribe words"
                            }
                            aria-label={isArabic ? "الميكروفون" : "Microphone"}
                          >
                            {isVoiceRecording ? <MicOff size={18} /> : <Mic size={18} />}
                          </button>
                          <button
                            className="assistant-demo-send"
                            type="submit"
                            aria-label={isArabic ? "إرسال الرسالة" : "Send message"}
                            disabled={!chatInput.trim() || isSendingChat}
                          >
                            <ArrowRight size={17} />
                          </button>
                        </form>
                      </>
                    ) : (
                      <div className="assistant-voice-scene">
                        <button
                          className={`assistant-voice-orb ${isVoiceOrbActive ? "active" : ""}`}
                          type="button"
                          data-testid="assistant-voice-orb"
                          onClick={toggleVoice}
                          aria-label={
                            isArabic
                              ? isVoiceOrbActive
                                ? "إيقاف المساعد الصوتي"
                                : "تشغيل المساعد الصوتي"
                              : isVoiceOrbActive
                                ? "Pause voice assistant"
                                : "Start voice assistant"
                          }
                        />
                        <span
                          className="assistant-voice-status"
                          role="status"
                          aria-live="polite"
                          data-testid="assistant-voice-status"
                          style={{
                            color: isDark
                              ? currentVoiceStatusText.includes("تعذر") || currentVoiceStatusText.includes("permission")
                                ? "#fca5a5"
                                : "#5eead4"
                              : "var(--teal, #0d9488)",
                            fontSize: "13.5px",
                            fontWeight: 500,
                            marginTop: "14px",
                            textAlign: "center",
                          }}
                        >
                          {currentVoiceStatusText}
                        </span>
                        {currentVoiceStatusText &&
                          (currentVoiceStatusText.includes("تعذر") ||
                            currentVoiceStatusText.includes("permission") ||
                            currentVoiceStatusText.includes("غير متاح")) && (
                            <button
                              type="button"
                              onClick={() => {
                                setVoiceStatus("");
                                void toggleVoice();
                              }}
                              style={{
                                marginTop: "10px",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "6px",
                                padding: "7px 16px",
                                borderRadius: "16px",
                                fontSize: "12px",
                                fontWeight: 600,
                                background: isDark ? "rgba(45, 212, 191, 0.16)" : "rgba(20, 93, 88, 0.08)",
                                border: isDark ? "1px solid rgba(94, 234, 212, 0.4)" : "1px solid rgba(20, 93, 88, 0.25)",
                                color: isDark ? "#5eead4" : "var(--teal, #0d9488)",
                                cursor: "pointer",
                                transition: "all 0.15s ease",
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = isDark ? "rgba(45, 212, 191, 0.28)" : "rgba(20, 93, 88, 0.14)";
                                if (isDark) e.currentTarget.style.color = "#ffffff";
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = isDark ? "rgba(45, 212, 191, 0.16)" : "rgba(20, 93, 88, 0.08)";
                                e.currentTarget.style.color = isDark ? "#5eead4" : "var(--teal, #0d9488)";
                              }}
                            >
                              <RefreshCw size={13} />
                              {isArabic ? "إعادة محاولة الميكروفون" : "Retry microphone"}
                            </button>
                          )}
                      </div>
                    )}
                    {assistantMode === "voice" && (
                      <form
                        className="assistant-voice-bar"
                        onSubmit={(event) => {
                          event.preventDefault();
                          const message = voiceInput.trim();
                          if (!message || isSendingChat) return;
                          setVoiceInput("");
                          setVoiceStatus("");
                          void sendChat(message);
                        }}
                      >
                        <input
                          aria-label={isArabic ? "راجع وعدل كلماتك" : "Review and edit words"}
                          placeholder={isArabic ? "راجع وعدل كلماتك هنا ثم أرسل..." : "Review & edit words here, then send..."}
                          value={voiceInput}
                          onChange={(event) => setVoiceInput(event.target.value)}
                        />
                        <button
                          className="assistant-voice-mic"
                          type="button"
                          data-testid="assistant-voice-mic"
                          aria-label={isArabic ? "تبديل الميكروفون" : "Toggle microphone"}
                          title={isArabic ? "تحدث وسجل كلماتك" : "Speak to transcribe"}
                          aria-pressed={isVoiceRecording}
                          onClick={toggleVoice}
                          disabled={isSendingChat && !isVoiceRecording}
                        >
                          {isVoiceRecording ? <Mic size={20} /> : <MicOff size={20} />}
                        </button>
                        <button
                          className="assistant-demo-send"
                          type="submit"
                          aria-label={isArabic ? "إرسال" : "Send"}
                          disabled={!voiceInput.trim() || isSendingChat}
                          style={{ width: "38px", height: "38px" }}
                        >
                          <ArrowRight size={16} />
                        </button>
                        <button
                          className="assistant-voice-close"
                          type="button"
                          aria-label={isArabic ? "إغلاق الصوت والعودة للدردشة" : "Close voice and return to chat"}
                          title={isArabic ? "إغلاق الصوت" : "Close voice"}
                          onClick={() => {
                            if (voiceRecorder.current?.state === "recording") {
                              voiceRecorder.current.stop();
                            }
                            setIsVoiceOrbActive(false);
                            setAssistantMode("chat");
                          }}
                        >
                          <X size={22} />
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              </section>
            ) : page === "problem" ? (
              <div className="section-stack">
                <div className="section-pill">
                  {isArabic
                    ? "مقارنة سريرية شاملة"
                    : "Clinical Systems Comparison"}
                </div>
                
                <div className="problem-comparison-grid">
                  <div className="problem-compare-card before">
                    <div className="compare-badge before">
                      <AlertCircle size={14} />
                      {isArabic ? "الأنظمة التقليدية والملفات القديمة" : "Traditional Legacy Systems"}
                    </div>
                    <h3>{isArabic ? "استنزاف الوقت وتشتت البيانات" : "Data fragmentation & time drain"}</h3>
                    <p className="compare-lead">
                      {isArabic
                        ? "تقضي الطواقم الطبية أكثر من 40% من يوم العمل في التدوين اليدوي والبحث بين ملفات متناثرة."
                        : "Clinical teams lose over 40% of their workday dealing with manual paperwork and siloed tools."}
                    </p>
                    <ul className="compare-list">
                      <li>
                        <AlertCircle size={16} />
                        <span>{isArabic ? "ساعات طويلة مهدورة في إعادة كتابة الملاحظات الطبية يدوياً" : "Hours wasted rewriting clinical notes and reports manually"}</span>
                      </li>
                      <li>
                        <AlertCircle size={16} />
                        <span>{isArabic ? "انعزال بيانات المريض بين الاستقبال والتمريض والمعمل والعيادة" : "Siloed patient history across reception, triage, and pharmacy"}</span>
                      </li>
                      <li>
                        <AlertCircle size={16} />
                        <span>{isArabic ? "غياب التنبيهات الفورية للتفاعلات الدوائية والتاريخ المرضي الحرج" : "No live safety alerts for drug contraindications or vital alerts"}</span>
                      </li>
                      <li>
                        <AlertCircle size={16} />
                        <span>{isArabic ? "إجهاد إداري مستمر واحتراق وظيفي للأطباء والتمريض" : "High cognitive burden and administrative burnout for doctors"}</span>
                      </li>
                    </ul>
                  </div>

                  <div className="problem-compare-card after">
                    <div className="compare-badge after">
                      <Sparkles size={14} />
                      {isArabic ? "منظومة CareOS الذكية" : "With CareOS Intelligence"}
                    </div>
                    <h3>{isArabic ? "رعاية سريعة، ملف موحد، ودعم قرار فوري" : "Fast care, unified record & instant AI assistance"}</h3>
                    <p className="compare-lead">
                      {isArabic
                        ? "مساحة عمل سريرية واحدة تدمج الإدخال الصوتي، الذكاء الاصطناعي، والحوكمة المؤسسية التامة."
                        : "A governed clinical intelligence workspace integrating voice dictation, decision support, and unified charts."}
                    </p>
                    <ul className="compare-list">
                      <li>
                        <CheckCircle2 size={16} />
                        <span>{isArabic ? "صياغة وتلخيص فوري للملاحظات الطبية بنقرة زر أو إملاء صوتي" : "Instant structured clinical note drafts via voice or 1-click summary"}</span>
                      </li>
                      <li>
                        <CheckCircle2 size={16} />
                        <span>{isArabic ? "سجل طبي إلكتروني موحد يربط كافة الأقسام والطاقم لحظياً" : "Unified real-time patient charts shared safely across departments"}</span>
                      </li>
                      <li>
                        <CheckCircle2 size={16} />
                        <span>{isArabic ? "دعم قرار سريري موثق بمراجع طبية مع بقاء التحكم والاعتماد بيد الطبيب" : "Traceable clinical guidelines with physician review queues"}</span>
                      </li>
                      <li>
                        <CheckCircle2 size={16} />
                        <span>{isArabic ? "حوكمة كاملة، أمان للبيانات، وسجل تدقيق تفصيلي لكل إجراء" : "Enterprise HIPAA-ready governance with full audit logs"}</span>
                      </li>
                    </ul>
                  </div>
                </div>

                <div className="problem-metrics-bar">
                  <div className="metric-highlight-card">
                    <b>40%+</b>
                    <span>{isArabic ? "توفير في وقت التدوين والتوثيق اليومي" : "Reduction in daily documentation time"}</span>
                  </div>
                  <div className="metric-highlight-card">
                    <b>100%</b>
                    <span>{isArabic ? "قرارات مبنية على مصادر طبية ومراجعة بشرية" : "Clinician-governed, traceable evidence"}</span>
                  </div>
                  <div className="metric-highlight-card">
                    <b>0</b>
                    <span>{isArabic ? "إجراءات تلقائية منفردة دون اعتماد الطبيب" : "Autonomous actions without physician sign-off"}</span>
                  </div>
                </div>
              </div>
            ) : page === "features" ? (
              <div className="feature-grid landing-feature-grid">
                {features.map((feature) => (
                  <article className="landing-feature" key={feature.title}>
                    <div className="feature-icon">{feature.icon}</div>
                    <h3>{feature.title}</h3>
                    <p>{feature.detail}</p>
                  </article>
                ))}
              </div>
            ) : page === "demo" ? (
              <div className="section-stack">
                <div className="section-pill">
                  {isArabic
                    ? "منظومة المستشفى المتكاملة"
                    : "Hospital Ecosystem & Governance"}
                </div>
                
                {/* 1. التغطية الشاملة لمنشأتك */}
                <div className="landing-ecosystem-header">
                  <h3>
                    {isArabic
                      ? "التغطية الشاملة لمنشأتك الطبية"
                      : "Comprehensive Healthcare Ecosystem"}
                  </h3>
                  <p>
                    {isArabic
                      ? "ربط كافة أركان المركز الطبي أو المستشفى تحت مظلة تشغيلية وسريرية رقمية موحدة."
                      : "Connecting every department across your healthcare facility in one unified, intelligent clinical workflow."}
                  </p>
                </div>

                <div className="landing-ecosystem-grid">
                  <article className="landing-ecosystem-card">
                    <div className="landing-ecosystem-card-icon">
                      <Stethoscope size={24} />
                    </div>
                    <span className="landing-ecosystem-card-badge">
                      {isArabic ? "الرعاية السريرية" : "Clinical Care"}
                    </span>
                    <h4>{isArabic ? "العيادات التخصصية" : "Specialized Outpatient Clinics"}</h4>
                    <p>
                      {isArabic
                        ? "متابعة الاستشارات الطبية، توثيق الكشف السريري، واستعراض الملف الطبي الشامل وتاريخ المريض بدقة وسرعة."
                        : "Comprehensive consultation tracking, structured clinical notes, and instant access to longitudinal patient histories."}
                    </p>
                  </article>

                  <article className="landing-ecosystem-card">
                    <div className="landing-ecosystem-card-icon">
                      <Activity size={24} />
                    </div>
                    <span className="landing-ecosystem-card-badge">
                      {isArabic ? "الرعاية الحرجة" : "Emergency Care"}
                    </span>
                    <h4>{isArabic ? "طوارئ 24/7 والفرز السريع" : "24/7 Emergency & Rapid Triage"}</h4>
                    <p>
                      {isArabic
                        ? "إدارة الحالات الحرجة، قياس وتسجيل المؤشرات الحيوية لحظياً، وتحديد أولويات الرعاية السريعة لإنقاذ حياة المرضى."
                        : "Real-time critical triage, vital signs streaming, and automated escalation to accelerate emergency department throughput."}
                    </p>
                  </article>

                  <article className="landing-ecosystem-card">
                    <div className="landing-ecosystem-card-icon">
                      <FileText size={24} />
                    </div>
                    <span className="landing-ecosystem-card-badge">
                      {isArabic ? "التشخيص الذكي" : "Diagnostic AI"}
                    </span>
                    <h4>{isArabic ? "المعمل والأشعة (Smart OCR)" : "Diagnostics, Lab & Radiology OCR"}</h4>
                    <p>
                      {isArabic
                        ? "قراءة التحاليل والتقارير الطبية واستخراج الأرقام والقيم الحيوية آلياً بالذكاء الاصطناعي ودمجها مباشرة في السجل الموحد."
                        : "Automated OCR extraction of lab panels and diagnostic findings into structured, searchable patient records."}
                    </p>
                  </article>

                  <article className="landing-ecosystem-card">
                    <div className="landing-ecosystem-card-icon">
                      <BarChart3 size={24} />
                    </div>
                    <span className="landing-ecosystem-card-badge">
                      {isArabic ? "القيادة التشغيلية" : "Operations"}
                    </span>
                    <h4>{isArabic ? "الإدارة واللوحة التنفيذية" : "Executive Management & Analytics"}</h4>
                    <p>
                      {isArabic
                        ? "تتبع معدلات إشغال الأسرّة، أداء الطواقم الطبية، والتقارير المالية والتشغيلية المتقدمة لاتخاذ قرارات قيادية حاسمة."
                        : "Real-time visibility into bed occupancy, staff productivity, departmental utilization, and financial insights."}
                    </p>
                  </article>
                </div>

                {/* 2. الأمان، الخصوصية والحوكمة الطبية */}
                <div className="landing-ecosystem-header" style={{ marginTop: "16px" }}>
                  <h3>
                    {isArabic
                      ? "الأمان، الخصوصية والحوكمة الطبية"
                      : "Security, Privacy & Clinical Governance"}
                  </h3>
                  <p>
                    {isArabic
                      ? "بنية تحتية مصممة وفق أرفع المعايير الطبية لضمان سلامة السجلات وثقة المنظومة المؤسسية."
                      : "Enterprise infrastructure engineered to the highest healthcare standards for data protection and accountable care."}
                  </p>
                </div>

                <div className="landing-ecosystem-grid landing-security-grid">
                  <article className="landing-ecosystem-card">
                    <div className="landing-ecosystem-card-icon">
                      <Lock size={24} />
                    </div>
                    <span className="landing-ecosystem-card-badge">
                      HIPAA Compliant
                    </span>
                    <h4>{isArabic ? "حماية وتشفير بيانات المرضى" : "Encrypted Patient Data Protection"}</h4>
                    <p>
                      {isArabic
                        ? "تشفير شامل للسجلات الطبية أثناء الحفظ والنقل وفق أعلى معايير أمان السجلات الصحية الدولية."
                        : "End-to-end encryption for health records at rest and in transit adhering to strict healthcare compliance mandates."}
                    </p>
                  </article>

                  <article className="landing-ecosystem-card">
                    <div className="landing-ecosystem-card-icon">
                      <UserCheck size={24} />
                    </div>
                    <span className="landing-ecosystem-card-badge">
                      Human-in-the-Loop
                    </span>
                    <h4>{isArabic ? "مبدأ الحوكمة البشرية" : "Human-in-the-Loop Governance"}</h4>
                    <p>
                      {isArabic
                        ? "يقدم الذكاء الاصطناعي مسودات واقتراحات استرشادية فقط، ولا يُصدر أي قرار علاجي أو دوائي بدون اعتماد وتوقيع الطبيب."
                        : "AI provides assistive suggestions and drafts only; zero automated clinical actions occur without explicit physician approval."}
                    </p>
                  </article>

                  <article className="landing-ecosystem-card">
                    <div className="landing-ecosystem-card-icon">
                      <ShieldCheck size={24} />
                    </div>
                    <span className="landing-ecosystem-card-badge">
                      Audit Trail
                    </span>
                    <h4>{isArabic ? "سجل التدقيق الشامل" : "Immutable Audit Logging"}</h4>
                    <p>
                      {isArabic
                        ? "تسجيل زمني دقيق لكل عملية اطلاع أو تعديل أو استرجاع لملف المريض، موثقاً بهوية المستخدم وموقعه وصلاحياته."
                        : "Granular, tamper-proof logs capturing every record view, export, and edit with timestamps and identity verification."}
                    </p>
                  </article>

                  <article className="landing-ecosystem-card">
                    <div className="landing-ecosystem-card-icon">
                      <Network size={24} />
                    </div>
                    <span className="landing-ecosystem-card-badge">
                      HL7 / FHIR Ready
                    </span>
                    <h4>{isArabic ? "التوافق السريري المفتوح" : "Clinical Interoperability"}</h4>
                    <p>
                      {isArabic
                        ? "جاهزية تامة للربط المعياري مع الأجهزة الطبية، أنظمة المعامل الخارجية، ومنصات التأمين الصحي بكل مرونة."
                        : "Seamless integration capabilities with third-party hospital information systems, lab devices, and PACS standards."}
                    </p>
                  </article>
                </div>
              </div>
            ) : page === "contact" ? (
              <div className="section-stack">
                <div className="section-pill">
                  {isArabic
                    ? "طلب استشارة وعرض تجريبي"
                    : "Hospital Demo Request"}
                </div>
                
                <div className="contact-enhanced-grid">
                  <div className="contact-card-box">
                    <h3 className="contact-form-title">
                      {isArabic ? "احجز عرضاً مخصصاً لمنشأتك الطبية" : "Schedule a tailored hospital demo"}
                    </h3>
                    <p className="contact-form-desc">
                      {isArabic
                        ? "سيتواصل معك خبراؤنا السريريون خلال 24 ساعة لتقديم عرض حي يناسب حجم مستشفاك وطبيعة أقسامك."
                        : "Our clinical specialists will reach out within 24 hours to arrange a live session aligned with your hospital scale."}
                    </p>

                    <form
                      onSubmit={async (event) => {
                        event.preventDefault();
                        const form = event.currentTarget;
                        const fullName = (form.elements.namedItem("fullName") as HTMLInputElement)?.value || "";
                        const company = (form.elements.namedItem("company") as HTMLInputElement)?.value || "";
                        const email = (form.elements.namedItem("email") as HTMLInputElement)?.value || "";
                        const phone = (form.elements.namedItem("phone") as HTMLInputElement)?.value || "";
                        const scale = (form.elements.namedItem("scale") as HTMLSelectElement)?.value || "";
                        const notes = (form.elements.namedItem("notes") as HTMLTextAreaElement)?.value || "";

                        setDemoRequested(true);
                        try {
                          await capturePublicLead({
                            full_name: fullName,
                            email,
                            phone,
                            company,
                            source: "landing_demo_request",
                            notes: `Scale: ${scale}${notes ? ` | Notes: ${notes}` : ""}`,
                          });
                        } catch {
                          // Offline or local demo fallback
                        }
                      }}
                    >
                      <div className="contact-fields-grid">
                        <div className="contact-field-group">
                          <label>{isArabic ? "الاسم الكامل / المسمى الوظيفي" : "Full Name & Clinical Role"}</label>
                          <input
                            name="fullName"
                            type="text"
                            required
                            placeholder={isArabic ? "د. أحمد سامي - مدير طبي" : "Dr. Ahmed Sami - Medical Director"}
                          />
                        </div>

                        <div className="contact-field-group">
                          <label>{isArabic ? "اسم المستشفى أو المركز الطبي" : "Hospital / Clinic Name"}</label>
                          <input
                            name="company"
                            type="text"
                            required
                            placeholder={isArabic ? "مستشفى الأمل التخصصي" : "Al-Amal Specialized Hospital"}
                          />
                        </div>

                        <div className="contact-field-group">
                          <label>{isArabic ? "البريد الإلكتروني المهني" : "Work Email"}</label>
                          <input
                            name="email"
                            type="email"
                            required
                            placeholder="doctor@hospital.org"
                          />
                        </div>

                        <div className="contact-field-group">
                          <label>{isArabic ? "رقم الهاتف / الواتساب" : "Phone / WhatsApp"}</label>
                          <input
                            name="phone"
                            type="tel"
                            required
                            placeholder="+20 100 123 4567"
                          />
                        </div>

                        <div className="contact-field-group full-width">
                          <label>{isArabic ? "حجم المنشأة الطبية" : "Hospital Scale & Departments"}</label>
                          <select name="scale" defaultValue="polyclinic">
                            <option value="clinic">{isArabic ? "عيادة مستقلة (1 - 3 أطباء)" : "Private Clinic (1-3 Doctors)"}</option>
                            <option value="polyclinic">{isArabic ? "مجمع عيادات تخصصية (4 - 15 عيادة)" : "Polyclinic Complex (4-15 Clinics)"}</option>
                            <option value="hospital-mid">{isArabic ? "مستشفى عام (50 - 150 سرير)" : "General Hospital (50-150 Beds)"}</option>
                            <option value="hospital-large">{isArabic ? "مستشفى تخصصي أو شبكة طبية (أكثر من 150 سرير)" : "Large Hospital Network (150+ Beds)"}</option>
                          </select>
                        </div>

                        <div className="contact-field-group full-width">
                          <label>{isArabic ? "ملاحظات أو احتياجات خاصة (اختياري)" : "Specific Notes or Requirements (Optional)"}</label>
                          <textarea
                            name="notes"
                            rows={3}
                            placeholder={isArabic ? "مثال: الربط مع أجهزة المعمل، التوثيق الصوتي بالطوارئ..." : "E.g., Lab integration, emergency voice dictation..."}
                          />
                        </div>
                      </div>

                      <button className="contact-submit-btn" type="submit">
                        {demoRequested ? <CheckCircle2 size={16} /> : <Sparkles size={16} />}
                        {demoRequested
                          ? isArabic
                            ? "تم استلام طلبك بنجاح"
                            : "Request Received"
                          : isArabic
                            ? "إرسال طلب العرض التجريبي"
                            : "Submit Hospital Demo Request"}
                      </button>
                    </form>

                    {demoRequested && (
                      <div className="contact-success" role="status" style={{ marginTop: "14px" }}>
                        <ShieldCheck size={18} />
                        <div>
                          <strong>{isArabic ? "شكراً لتواصلك مع CareOS!" : "Thank you for contacting CareOS!"}</strong>
                          <p style={{ margin: "4px 0 0", fontSize: "12px", opacity: 0.9 }}>
                            {isArabic
                              ? "تم حفظ بيانات منشأتك وسيتواصل معك مستشار النظم الطبية لمناقشة موعد العرض الحي."
                              : "Your details have been saved. Our clinical advisor will be in touch shortly to confirm your demo schedule."}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="contact-info-side">
                    <div className="contact-info-card">
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                        <Building2 size={20} className="contact-card-icon" color="#0e8774" />
                        <h4>{isArabic ? "ما الذي يشمله العرض التجريبي؟" : "What is included in the demo?"}</h4>
                      </div>
                      <p>
                        {isArabic
                          ? "جلسة تفاعلية مباشرة مدتها 30 دقيقة يتم خلالها استعراض تدفق العمل من لحظة دخول المريض حتى مغادرته، وتجربة المساعد الصوتي السريري مع فريقك الطبي."
                          : "A 30-minute interactive session walking through patient triage to discharge, testing clinical voice dictation, and reviewing role-based security."}
                      </p>
                    </div>

                    <div className="contact-info-card">
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                        <Mail size={18} className="contact-card-icon" color="#0e8774" />
                        <h4>{isArabic ? "قنوات التواصل المباشر" : "Direct Channels"}</h4>
                      </div>
                      <p style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "8px" }}>
                        <span><b>{isArabic ? "البريد الإلكتروني:" : "Email:"}</b> partnerships@careos.health</span>
                        <span><b>{isArabic ? "هاتف / واتساب:" : "Hotline:"}</b> +20 100 000 0000</span>
                        <span><b>{isArabic ? "المقر:" : "Location:"}</b> {isArabic ? "القاهرة، جمهورية مصر العربية" : "Cairo, Egypt"}</span>
                      </p>
                    </div>

                    <div className="contact-info-card contact-cta-card">
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                        <ShieldCheck size={20} className="contact-card-icon" color="#0e8774" />
                        <h4>{isArabic ? "استكشف منظومة المنشأة والحوكمة" : "Explore Ecosystem & Governance"}</h4>
                      </div>
                      <p style={{ marginBottom: "12px" }}>
                        {isArabic
                          ? "تعرّف على كيفية ربط العيادات، الطوارئ، والمعامل تحت منصة موحدة متوافقة مع معايير HIPAA الدولية."
                          : "Discover how CareOS connects clinics, emergency departments, and smart labs under certified HIPAA security standards."}
                      </p>
                      <button
                        type="button"
                        className="contact-cta-btn"
                        onClick={() => nav("demo")}
                      >
                        {isArabic ? "استعراض تغطية المنظومة والأمان" : "View Hospital Ecosystem & Security"}{" "}
                        {isArabic ? <ArrowLeft size={14} /> : <ArrowRight size={14} />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="info-grid">
                <div className="info-panel">
                  <small>{isArabic ? "CareOS" : "CareOS"}</small>
                  <h4>{page === "contact" ? copy.primary : copy.title}</h4>
                  <p>{copy.detail}</p>
                  <button
                    className="primary-btn landing-primary"
                    onClick={() => onEnter()}
                  >
                    {t("enterPlatform")} <ArrowRight size={15} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </main>
      )}
      {googleSuccessToast && (
        <div
          style={{
            position: "fixed",
            bottom: "24px",
            insetInlineStart: "24px",
            zIndex: 999999,
            background: "#0f172a",
            color: "#ffffff",
            padding: "12px 20px",
            borderRadius: "12px",
            boxShadow: "0 10px 25px rgba(0,0,0,0.25)",
            fontSize: "14px",
            fontWeight: 600,
            display: "inline-flex",
            alignItems: "center",
            gap: "10px",
          }}
        >
          <CheckCircle2 size={18} color="#10b981" />
          <span>{googleSuccessToast}</span>
        </div>
      )}

      <GoogleAuthModal
        isOpen={showGoogleModal}
        onClose={() => setShowGoogleModal(false)}
        onSuccess={handleGoogleVisitorSuccess}
        target="visitor"
        language={language}
        theme={theme}
      />
      <GlobalChat t={t} guest language={language} role="patient" view="dashboard" />
    </div>
  );
}

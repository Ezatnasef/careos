import { useEffect, useState } from "react";
import {
  Activity,
  AlertCircle,
  ArrowUpRight,
  ArrowRight,
  Bell,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
  FileText,
  HeartPulse,
  Home,
  LayoutDashboard,
  Menu,
  MessageSquareText,
  Mic,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Stethoscope,
  Users,
  X,
  BarChart3,
  Building2,
  FileBarChart,
  MessageCircle,
  UserRound,
  LogOut,
  Send,
  SlidersHorizontal,
  Moon,
  Sun,
  BookOpen,
  Database,
  LockKeyhole,
  Eye,
  EyeOff,
} from "lucide-react";
import {
  appointments,
  getPatient,
  patients,
  type Appointment,
  type Patient,
} from "./data";
import { translations, type Language, type TranslationKey } from "./i18n";
import { askAssistant, completeOrganization, createAppointment as apiCreateAppointment, createClinicalNote, createPatient as apiCreatePatient, generateClinicalSummary, getAppointments as apiGetAppointments, getPatients as apiGetPatients, login as apiLogin, loginWithSso as apiLoginWithSso, logout as apiLogout, register as apiRegister, signClinicalNote } from "./api";

type View =
  | "dashboard"
  | "patients"
  | "assistant"
  | "notes"
  | "appointments"
  | "portal"
  | "analytics"
  | "messages"
  | "departments"
  | "reports"
  | "settings"
  | "integrations"
  | "teamAudit";
type Theme = "light" | "dark";
type Translator = (key: TranslationKey) => string;

type NavItem = {
  id: View;
  label: TranslationKey;
  icon: typeof LayoutDashboard;
};
const navItems: NavItem[] = [
  { id: "dashboard", label: "overview", icon: LayoutDashboard },
  { id: "patients", label: "patients", icon: Users },
  { id: "assistant", label: "assistant", icon: Stethoscope },
  { id: "notes", label: "notes", icon: FileText },
  { id: "appointments", label: "appointments", icon: CalendarDays },
  { id: "messages", label: "messages", icon: MessageCircle },
  { id: "portal", label: "patientPortal", icon: UserRound },
  { id: "analytics", label: "analytics", icon: BarChart3 },
  { id: "departments", label: "departments", icon: Building2 },
  { id: "reports", label: "reports", icon: FileBarChart },
  { id: "teamAudit", label: "teamAudit", icon: ShieldCheck },
];
const clinicalViews = new Set<View>(["dashboard", "patients", "assistant", "notes", "appointments"]);
const operationsViews = new Set<View>(["messages", "portal"]);

type LandingPage = "landing" | "problem" | "features" | "demo" | "contact";

function Landing({ language, setLanguage, onEnter, t, theme, setTheme }: { language: Language; setLanguage: (language: Language) => void; onEnter: (mode?: "signin" | "signup") => void; t: Translator; theme: Theme; setTheme: (theme: Theme) => void; }) {
  const isArabic = language === "ar";
  const [demoRequested, setDemoRequested] = useState(false);
  const [currentPage, setCurrentPage] = useState<LandingPage>("landing");

  useEffect(() => {
    const revealItems = document.querySelectorAll<HTMLElement>(".reveal-on-scroll");

    if (!revealItems.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      {
        threshold: 0.15,
        rootMargin: "0px 0px -8% 0px",
      },
    );

    revealItems.forEach((item) => observer.observe(item));

    return () => observer.disconnect();
  }, [currentPage]);

  const copy = isArabic
    ? {
        title: "خفف العبء الإداري عن الأطباء من غير ما تستبدل حكمهم.",
        detail:
          "CareOS مساحة عمل SaaS موجهة للفرق الطبية: تلخيص فوري للملاحظات، اقتراحات مبنية على مصادر واضحة، وجدولة أذكى، مع بقاء القرار النهائي للطبيب.",
        primary: "احجز عرض تجريبي",
        secondary: "شاهد كيف يعمل",
        trustStats: ["دعم عربي / إنجليزي", "مراجعة الطبيب 100%", "مصادر شفافة لكل اقتراح"],
        problemTitle: "أين يضيع الوقت؟",
        problemDetail:
          "الضغط الحقيقي ليس في التشخيص فقط، بل في الكتابة، البحث، التنسيق، وإعادة شرح نفس التفاصيل أكثر من مرة.",
        featureTitle: "أربع أدوات في واجهة واحدة",
        featureDetail:
          "من التلخيص إلى الجدولة، CareOS يلمّ شغل العيادة في نقطة واحدة واضحة وسريعة.",
        workflowTitle: "من الملاحظة إلى الاعتماد",
        workflowDetail:
          "الذكاء الاصطناعي يجهّز المسودة، لكن الطبيب هو من يراجع ويعتمد في النهاية.",
        differentTitle: "ما الذي يجعلنا مختلفين؟",
        differentDetail:
          "الفرق ليس في وجود AI فقط، بل في الشفافية: مصدر كل اقتراح ظاهر، ومؤشر الثقة واضح، والمسار مصمم لدعم القرار لا لاستبداله.",
        partnersTitle: "شركاؤنا في التطوير",
        partnersDetail:
          "لو ما زلت في مرحلة الإطلاق، اعرض الفريق السريري والمستشفيات الشريكة بدل شهادات مبالغ فيها.",
        securityTitle: "الأمان والامتثال",
        securityDetail:
          "نشفّر بيانات المرضى، نقلل ظهور البيانات الحساسة في الواجهة، ونفصل بين العرض التجريبي والبيانات الفعلية.",
        contactTitle: "ابدأ المحادثة",
        contactDetail: "املأ البيانات وسنرتب لك عرضًا تجريبيًا خلال وقت قصير.",
      }
    : {
        title: "Reduce clinical admin without replacing clinical judgment.",
        detail:
          "CareOS is a SaaS workspace for clinical teams: instant note summarization, source-linked suggestions, smarter scheduling, and the physician stays in control at the end of every workflow.",
        primary: "Book a demo",
        secondary: "See how it works",
        trustStats: ["Arabic / English", "100% physician review", "Source-linked suggestions"],
        problemTitle: "Where does the time go?",
        problemDetail:
          "The real drag is not diagnosis alone. It is documentation, searching guidance, coordination, and repeating the same story across tools.",
        featureTitle: "Four tools in one clinical workspace",
        featureDetail:
          "From summarization to scheduling, CareOS keeps the clinic flow in one clear and fast place.",
        workflowTitle: "From note to sign-off",
        workflowDetail:
          "The AI drafts first, but the doctor reviews and approves every final decision.",
        differentTitle: "What makes us different?",
        differentDetail:
          "It is not AI for the sake of AI. The source behind every suggestion is visible, the confidence is explicit, and the workflow is designed to support judgment, not replace it.",
        partnersTitle: "Built with partners",
        partnersDetail:
          "If you are still pre-launch, show your clinical advisors and partner hospitals instead of inflated testimonials.",
        securityTitle: "Security and compliance",
        securityDetail:
          "We encrypt patient data, reduce sensitive data exposure in the UI, and keep the demo environment separate from live data.",
        contactTitle: "Start the conversation",
        contactDetail: "Leave your details and we will arrange a demo shortly.",
      };

  const features = isArabic
    ? [
        { step: "01", icon: <FileText />, title: "تلخيص AI", detail: "حوّل الملاحظة الحرة إلى مسودة منظمة قبل الاعتماد." },
        { step: "02", icon: <BookOpen />, title: "اقتراحات RAG", detail: "اعرض المصدر والثقة بجانب كل توصية حتى تكون المراجعة أسرع." },
        { step: "03", icon: <CalendarDays />, title: "إدارة مواعيد ذكية", detail: "نسّق اليوميّة وذكّر الفريق من نفس الواجهة." },
        { step: "04", icon: <Database />, title: "رقمنة المستندات", detail: "أدخل المستندات والملفات إلى مسار منظم بدل التخزين العشوائي." },
      ]
    : [
        { step: "01", icon: <FileText />, title: "AI summarization", detail: "Turn a free-form note into an editable draft before sign-off." },
        { step: "02", icon: <BookOpen />, title: "RAG suggestions", detail: "Show the source and confidence next to every recommendation." },
        { step: "03", icon: <CalendarDays />, title: "Smart scheduling", detail: "Keep appointments and follow-ups moving from one place." },
        { step: "04", icon: <Database />, title: "Document digitization", detail: "Bring uploads and scanned documents into a structured flow." },
      ];

  const workflowSteps = isArabic
    ? [
        "يكتب الطبيب الملاحظة أو يبدأ من قالب مختصر.",
        "CareOS يخرج ملخصًا فوريًا مع مصادر واضحة واقتراحات قابلة للمراجعة.",
        "الطبيب يراجع، يعدّل، ثم يعتمد القرار النهائي.",
      ]
    : [
        "The doctor writes a note or starts from a short template.",
        "CareOS drafts a summary with visible sources and reviewable suggestions.",
        "The doctor reviews, edits, and approves the final decision.",
      ];

  const differentRows = isArabic
    ? [
        ["المصدر", "موجود على الشاشة لكل اقتراح"],
        ["مؤشر الثقة", "واضح قبل الاعتماد"],
        ["المسؤولية", "الطبيب يراجع ويعتمد"],
      ]
    : [
        ["Source", "Visible on every suggestion"],
        ["Confidence", "Explicit before approval"],
        ["Ownership", "The doctor reviews and signs off"],
      ];

  const navTo = (page: LandingPage) => setCurrentPage(page);
  const goHome = () => setCurrentPage("landing");

  const renderSectionPage = (title: string, description: string, body: React.ReactNode) => (
    <div className={`landing-page ${theme === "dark" ? "dark-mode-landing" : ""}`} dir={language === "ar" ? "rtl" : "ltr"}>
      <header className="landing-nav landing-enter-nav">
        <button type="button" className="brand landing-brand landing-logo-home" onClick={goHome} aria-label={isArabic ? "العودة للصفحة الرئيسية" : "Return to homepage"}>
          <div className="brand-mark">
            <HeartPulse size={19} />
          </div>
          <span>
            care<span>os</span>
          </span>
        </button>
        <nav className="landing-links">
          <button type="button" className="nav-link-button" onClick={() => navTo("problem")}>{isArabic ? "المشكلة" : "Problem"}</button>
          <button type="button" className="nav-link-button" onClick={() => navTo("features")}>{isArabic ? "المميزات" : "Features"}</button>
          <button type="button" className="nav-link-button" onClick={() => navTo("demo")}>{isArabic ? "اللقطة" : "Demo"}</button>
          <button type="button" className="nav-link-button" onClick={() => navTo("contact")}>{isArabic ? "تواصل" : "Contact"}</button>
        </nav>
        <div className="landing-nav-actions">
          <button
            type="button"
            className="landing-control-btn landing-icon-btn"
            onClick={() => setLanguage(language === "en" ? "ar" : "en")}
            aria-label={language === "en" ? "Switch to Arabic" : "Switch to English"}
          >
            {language === "en" ? "AR" : "EN"}
          </button>
          <button
            type="button"
            className="landing-control-btn landing-icon-btn"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label={theme === "dark" ? (isArabic ? "التبديل إلى الوضع الفاتح" : "Switch to light mode") : (isArabic ? "التبديل إلى الوضع الداكن" : "Switch to dark mode")}
          >
            {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
          </button>
          <div className="landing-auth-links">
            <button type="button" className="landing-auth-link landing-auth-link-login" onClick={() => onEnter("signin")}>{isArabic ? "تسجيل الدخول" : "LOGIN"}</button>
            <span className="landing-auth-divider">|</span>
            <button type="button" className="landing-auth-link landing-auth-link-signup" onClick={() => onEnter("signup")}>{isArabic ? "إنشاء حساب" : "SIGN UP"}</button>
          </div>
          <button type="button" className="landing-primary landing-control-btn landing-control-btn-primary" onClick={() => onEnter()}>{t("enterPlatform")} <ArrowRight size={15} /></button>
        </div>
      </header>
      <main className="landing-subpage-shell">
        <div className="landing-subpage">
          <button className="back-link" onClick={() => navTo("landing")}>
            <ChevronLeft size={14} /> {isArabic ? "العودة" : "Back"}
          </button>
          <div className="landing-section-heading reveal-on-scroll">
            <h2>{description}</h2>
          </div>
          {body}
        </div>
      </main>
    </div>
  );

  if (currentPage === "problem") {
    return renderSectionPage(
      isArabic ? "المشكلة" : "THE PROBLEM",
      copy.problemTitle,
      <div className="section-stack">
        <div className="section-pill reveal-on-scroll">{isArabic ? "التحدي الرئيسي: الكفاءة" : "Core challenge: clinical efficiency"}</div>
        <div className="problem-grid problem-grid-single">
          <article className="problem-card reveal-on-scroll"><span>01</span><h3>{isArabic ? "التوثيق يستهلك الوقت" : "Documentation eats the day"}</h3><p>{isArabic ? "الهدف هو تقليل إعادة الكتابة وتحرير وقت الطبيب." : "The goal is to reduce rewrites and give the doctor back time."}</p></article>
          <article className="problem-card reveal-on-scroll"><span>02</span><h3>{isArabic ? "البروتوكولات تتكرر في أماكن متعددة" : "Guidance is scattered"}</h3><p>{isArabic ? "البحث عن المصدر الصحيح يبطئ القرارات ويزيد الاحتكاك." : "Hunting for the right source slows decisions and adds friction."}</p></article>
          <article className="problem-card reveal-on-scroll"><span>03</span><h3>{isArabic ? "المتابعة تفلت بين الأدوات" : "Follow-up slips between tools"}</h3><p>{isArabic ? "الجدولة، الرسائل، والملاحظات تحتاج مساحة موحدة." : "Scheduling, messages, and notes need one shared workspace."}</p></article>
        </div>
        <div className="info-grid reveal-on-scroll">
          <div className="info-panel">
            <small>{isArabic ? "مؤشر الأداء" : "Operational signal"}</small>
            <h4>{isArabic ? "أوقات أطول من المتوقع" : "Time lost in separate tools"}</h4>
            <p>{isArabic ? "الفرق بين ملاحظة المريض، البحث، والجدولة يستهلك دقائق ثم ساعات كل يوم." : "The gap between patient notes, guidance lookup, and scheduling turns into minutes lost, then hours every day."}</p>
          </div>
          <div className="info-panel">
            <small>{isArabic ? "النتيجة" : "Result"}</small>
            <h4>{isArabic ? "إجهاد إداري مرتفع" : "Higher administrative burden"}</h4>
            <p>{isArabic ? "الطبيبة تتحول إلى منسّقة ومحرّرة بدلاً من أن تكون منشغلة بتقييم المريض." : "Clinicians end up acting like coordinators and editors instead of focusing on patient decisions."}</p>
          </div>
        </div>
      </div>,
    );
  }

  if (currentPage === "features") {
    return renderSectionPage(
      isArabic ? "الحل" : "THE SOLUTION",
      copy.featureTitle,
      <div className="section-stack">
        <div className="section-pill reveal-on-scroll">{isArabic ? "المنصة تبني سير العمل الطبي" : "Built around real clinical workflow"}</div>
        <div className="feature-grid landing-feature-grid">
          {features.map((feature) => (
            <Feature key={feature.step} step={feature.step} icon={feature.icon} title={feature.title} detail={feature.detail} />
          ))}
        </div>
        <div className="info-grid reveal-on-scroll">
          <div className="info-panel">
            <small>{isArabic ? "الوظيفة" : "Clinical function"}</small>
            <h4>{isArabic ? "تجميع كل الأدوات في واجهة واحدة" : "One place for the care workflow"}</h4>
            <p>{isArabic ? "من الملاحظة إلى القبول، كل خطوة تدعمها نفس السياق دون تغيير التطبيق أو تشتت الفريق." : "From note to sign-off, each step sits in the same context so the care team does not bounce across tools."}</p>
          </div>
          <div className="info-panel">
            <small>{isArabic ? "القيمة" : "Value"}</small>
            <h4>{isArabic ? "أسرع مراجعة، قرارات أكثر ثقة" : "Faster review, more confident decisions"}</h4>
            <p>{isArabic ? "يعرض النظام المصدر، الثقة، والسياق لتقليل الحاجة للتنقل بين المستندات والخطوات." : "The system exposes context, confidence, and source so physicians review faster without losing control."}</p>
          </div>
        </div>
      </div>,
    );
  }

  if (currentPage === "demo") {
    return renderSectionPage(
      isArabic ? "لقطة المنتج" : "PRODUCT DEMO",
      isArabic ? "واجهة العمل اليوميّة" : "Clinical workspace overview",
      <div className="section-stack">
        <div className="section-pill reveal-on-scroll">{isArabic ? "من الملاحظة إلى القرار" : "From note to decision"}</div>
        <div className="demo-page-card">
          <div className="landing-visual landing-float-card">
            <div className="visual-orb visual-orb-a" />
            <div className="visual-orb visual-orb-b" />
            <div className="visual-scan" />
            <div className="visual-header">
              <span><span className="live-dot" /> CareOS clinical workspace</span>
              <span>{isArabic ? "معاينة حية" : "Live preview"}</span>
            </div>
            <div className="visual-title">
              <div>
                <small>{isArabic ? "اليوم، 21 أكتوبر" : "Today, 21 October"}</small>
                <h2>{isArabic ? "صباح الخير، د. رنا" : "Good morning, Dr. Rana"}</h2>
              </div>
              <div className="visual-avatar">DR</div>
            </div>
            <div className="visual-metrics">
              <div><Users size={16} /><b>248</b><span>{isArabic ? "مريض" : "Patients"}</span></div>
              <div><CalendarDays size={16} /><b>08</b><span>{isArabic ? "زيارة اليوم" : "Visits today"}</span></div>
              <div><Clock3 size={16} /><b>05</b><span>{isArabic ? "متابعة" : "Follow-ups"}</span></div>
            </div>
            <div className="visual-panel">
              <div className="visual-panel-heading"><b>{isArabic ? "تدفق اليوم" : "Today's care flow"}</b><span>{isArabic ? "تفاصيل" : "View details"}</span></div>
              <div className="visual-row"><span>09:00</span><strong>Mariam Hassan</strong><em>{isArabic ? "متابعة" : "Follow-up"}</em><i>{isArabic ? "مؤكد" : "Confirmed"}</i></div>
              <div className="visual-row"><span>10:30</span><strong>Omar Khaled</strong><em>{isArabic ? "مراجعة سكر" : "Diabetes review"}</em><i>{isArabic ? "وصل" : "Arrived"}</i></div>
              <div className="visual-row"><span>12:00</span><strong>Nour El Din</strong><em>{isArabic ? "إحالة قلب" : "Cardiology referral"}</em><i>{isArabic ? "قيد الانتظار" : "Pending"}</i></div>
            </div>
            <div className="visual-footer"><span><BookOpen size={13} /> {isArabic ? "مرتبط بالمصدر" : "Evidence linked"}</span><span><ShieldCheck size={13} /> {isArabic ? "مراجعة بشرية" : "Human review"}</span></div>
          </div>
        </div>
        <div className="info-grid reveal-on-scroll">
          <div className="info-panel">
            <small>{isArabic ? "الحالة" : "Use case"}</small>
            <h4>{isArabic ? "أداء يوميّ منظم" : "An organized clinical day"}</h4>
            <p>{isArabic ? "تظهر المواعيد، الملاحظات، والتوثيق في نفس الواجهة لتقليل تبديل التطبيقات والارتباك." : "Appointments, notes, and documentation appear in one place to reduce context switching and operational noise."}</p>
          </div>
          <div className="info-panel">
            <small>{isArabic ? "التحكم" : "Control"}</small>
            <h4>{isArabic ? "جلسة مراجعة بشرية عند كل نقطة" : "Human review at each critical milestone"}</h4>
            <p>{isArabic ? "الذكاء الاصطناعي يسهّل المسار، لكن الطبيب يراجع كل قرار قبل الاعتماد." : "AI accelerates the path, while the physician validates the final decision before sign-off."}</p>
          </div>
        </div>
      </div>,
    );
  }

  if (currentPage === "contact") {
    return renderSectionPage(
      isArabic ? "تواصل" : "CONTACT",
      copy.contactTitle,
      <div className="section-stack">
        <div className="section-pill reveal-on-scroll">{isArabic ? "استقبال سريع — عرض تجريبي في 48 ساعة" : "Fast response — demo in 48 hours"}</div>
        <div className="contact-wrap">
          <form className="contact-form" onSubmit={(event) => { event.preventDefault(); setDemoRequested(true); }}>
            <input type="text" placeholder={isArabic ? "الاسم" : "Name"} />
            <input type="text" placeholder={isArabic ? "اسم المستشفى" : "Hospital name"} />
            <input type="email" placeholder={isArabic ? "البريد الإلكتروني" : "Email"} />
            <button className="primary-btn landing-primary" type="submit">{demoRequested ? (isArabic ? "تم الإرسال" : "Sent") : copy.primary} <ArrowRight size={16} /></button>
          </form>
          {demoRequested && <div className="contact-success" role="status"><ShieldCheck size={15} /> {t("demoRequestSent")}</div>}
          <div className="contact-note">
            {isArabic ? "أو" : "Or"} <button className="text-link" onClick={() => onEnter()}>{isArabic ? "افتح مساحة العمل التجريبية" : "open the demo workspace"}</button>
          </div>
        </div>
        <div className="info-grid reveal-on-scroll">
          <div className="info-panel">
            <small>{isArabic ? "مستوى الدعم" : "Support"}</small>
            <h4>{isArabic ? "مراجعة أولية + عرض تجريبي مخصص" : "Discovery call and tailored walkthrough"}</h4>
            <p>{isArabic ? "نعمل مع فريقك على فهم احتياج المستشفى، الطبيب، والجدولة قبل تقديم العرض." : "We review the hospital workflow, clinical needs, and scheduling pain points before the walkthrough."}</p>
          </div>
          <div className="info-panel">
            <small>{isArabic ? "الخطوة التالية" : "Next step"}</small>
            <h4>{isArabic ? "تحضير رحلة التعريف والتجريب" : "Prepare the pilot and onboarding plan"}</h4>
            <p>{isArabic ? "بعد الموافقة، نجهّز نموذج التجربة، الفريق، ومؤشرات النجاح في أول 30 يومًا." : "After approval, we define the pilot scope, team workflow, and success measures for the first 30 days."}</p>
          </div>
        </div>
      </div>,
    );
  }

  return (
    <div className={`landing-page ${theme === "dark" ? "dark-mode-landing" : ""}`} dir={language === "ar" ? "rtl" : "ltr"}>
      <header className="landing-nav landing-enter-nav">
        <button type="button" className="brand landing-brand landing-logo-home" onClick={goHome} aria-label={isArabic ? "العودة للصفحة الرئيسية" : "Return to homepage"}>
          <div className="brand-mark">
            <HeartPulse size={19} />
          </div>
          <span>
            care<span>os</span>
          </span>
        </button>
        <nav className="landing-links">
          <button type="button" className="nav-link-button" onClick={() => navTo("problem")}>{isArabic ? "المشكلة" : "Problem"}</button>
          <button type="button" className="nav-link-button" onClick={() => navTo("features")}>{isArabic ? "المميزات" : "Features"}</button>
          <button type="button" className="nav-link-button" onClick={() => navTo("demo")}>{isArabic ? "اللقطة" : "Demo"}</button>
          <button type="button" className="nav-link-button" onClick={() => navTo("contact")}>{isArabic ? "تواصل" : "Contact"}</button>
        </nav>
        <div className="landing-nav-actions">
          <button
            type="button"
            className="landing-control-btn landing-icon-btn"
            onClick={() => setLanguage(language === "en" ? "ar" : "en")}
            aria-label={language === "en" ? "Switch to Arabic" : "Switch to English"}
          >
            {language === "en" ? "AR" : "EN"}
          </button>
          <button
            type="button"
            className="landing-control-btn landing-icon-btn"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label={theme === "dark" ? (isArabic ? "التبديل إلى الوضع الفاتح" : "Switch to light mode") : (isArabic ? "التبديل إلى الوضع الداكن" : "Switch to dark mode")}
          >
            {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
          </button>
          <div className="landing-auth-links">
            <button type="button" className="landing-auth-link landing-auth-link-login" onClick={() => onEnter("signin")}>{isArabic ? "تسجيل الدخول" : "LOGIN"}</button>
            <span className="landing-auth-divider">|</span>
            <button type="button" className="landing-auth-link landing-auth-link-signup" onClick={() => onEnter("signup")}>{isArabic ? "إنشاء حساب" : "SIGN UP"}</button>
          </div>
          <button type="button" className="landing-primary landing-control-btn landing-control-btn-primary" onClick={() => onEnter()}>{t("enterPlatform")} <ArrowRight size={15} /></button>
        </div>
      </header>
      <main>
        <section className="landing-hero">
          <div className="landing-copy landing-hero-copy">
            <h1 className="hero-reveal hero-title">{copy.title}</h1>
            <p className="hero-reveal hero-detail">{copy.detail}</p>
            <div className="landing-actions hero-reveal hero-actions">
              <button type="button" className="primary-btn landing-primary" onClick={() => navTo("contact")}>{copy.primary} <ArrowRight size={17} /></button>
              <button type="button" className="landing-secondary" onClick={() => navTo("features")}>{copy.secondary} <ChevronRight size={15} /></button>
            </div>
            <div className="hero-badges hero-reveal">
              {copy.trustStats.map((stat) => (
                <span key={stat} className="hero-badge">{stat}</span>
              ))}
            </div>
          </div>
          <div className="landing-visual landing-float-card" id="demo">
            <div className="visual-orb visual-orb-a" />
            <div className="visual-orb visual-orb-b" />
            <div className="visual-scan" />
            <div className="visual-header">
              <span><span className="live-dot" /> CareOS clinical workspace</span>
              <span>{isArabic ? "معاينة حية" : "Live preview"}</span>
            </div>
            <div className="visual-title">
              <div>
                <small>{isArabic ? "اليوم، 21 أكتوبر" : "Today, 21 October"}</small>
                <h2>{isArabic ? "صباح الخير، د. رنا" : "Good morning, Dr. Rana"}</h2>
              </div>
              <div className="visual-avatar">DR</div>
            </div>
            <div className="visual-metrics">
              <div><Users size={16} /><b>248</b><span>{isArabic ? "مريض" : "Patients"}</span></div>
              <div><CalendarDays size={16} /><b>08</b><span>{isArabic ? "زيارة اليوم" : "Visits today"}</span></div>
              <div><Clock3 size={16} /><b>05</b><span>{isArabic ? "متابعة" : "Follow-ups"}</span></div>
            </div>
            <div className="visual-panel">
              <div className="visual-panel-heading"><b>{isArabic ? "تدفق اليوم" : "Today's care flow"}</b><span>{isArabic ? "تفاصيل" : "View details"}</span></div>
              <div className="visual-row"><span>09:00</span><strong>Mariam Hassan</strong><em>{isArabic ? "متابعة" : "Follow-up"}</em><i>{isArabic ? "مؤكد" : "Confirmed"}</i></div>
              <div className="visual-row"><span>10:30</span><strong>Omar Khaled</strong><em>{isArabic ? "مراجعة سكر" : "Diabetes review"}</em><i>{isArabic ? "وصل" : "Arrived"}</i></div>
              <div className="visual-row"><span>12:00</span><strong>Nour El Din</strong><em>{isArabic ? "إحالة قلب" : "Cardiology referral"}</em><i>{isArabic ? "قيد الانتظار" : "Pending"}</i></div>
            </div>
            <div className="visual-footer"><span><BookOpen size={13} /> {isArabic ? "مرتبط بالمصدر" : "Evidence linked"}</span><span><ShieldCheck size={13} /> {isArabic ? "مراجعة بشرية" : "Human review"}</span></div>
          </div>
        </section>

        <section className="landing-home-grid">
          <div className="landing-home-card reveal-on-scroll">
            <h3>{isArabic ? "ملاحظات أسرع، قرارات أكثر وضوحًا" : "Faster notes, clearer decisions"}</h3>
            <p>{isArabic ? "تجميع الملاحظات، المواعيد، والاقتراحات في واجهة واحدة مع مراجعة بشرية ثابتة." : "Bring notes, schedules, and recommendations into one workflow with human oversight at every step."}</p>
          </div>
          <div className="landing-home-card reveal-on-scroll">
            <h3>{isArabic ? "كل اقتراح مرتبط بمصدر واضح" : "Every suggestion is traceable"}</h3>
            <p>{isArabic ? "يلخص النظام المعلومات ويظهر المصدر والثقة حتى يراجع الطبيب القرار بدقة وبدون ارتباك." : "The system summarizes information and shows the source and confidence, so the physician can review with clarity."}</p>
          </div>
          <div className="landing-home-card reveal-on-scroll">
            <h3>{isArabic ? "أمان للمريض، راحة للطبيب" : "Safer care, calmer operations"}</h3>
            <p>{isArabic ? "المظهر، التحكم، وتدفق العمل مصمم ليصبح أداة مؤسسية لا أداة غامضة." : "The experience is built to feel clinical, governed, and sustainable for real healthcare operations."}</p>
          </div>
        </section>
      </main>
    </div>
  );
}

function Feature({ step, icon, title, detail }: { step: string; icon: React.ReactNode; title: string; detail: string }) { return <article className="landing-feature"><div className="feature-topline"><span className="feature-step">{step}</span><span className="feature-rule" /></div><div className="feature-icon">{icon}</div><h3>{title}</h3><p>{detail}</p><span className="feature-arrow"><ArrowRight size={15} /></span></article> }

function App() {
  const [showLanding, setShowLanding] = useState(() => window.location.hash !== "#app");
  const [view, setView] = useState<View>("dashboard");
  const [mobileNav, setMobileNav] = useState(false);
  const [language, setLanguage] = useState<Language>(
    () => (localStorage.getItem("careos-language") as Language) || "en",
  );
  const [loggedIn, setLoggedIn] = useState(false);
  const [onboardingComplete, setOnboardingComplete] = useState(() => localStorage.getItem("careos-onboarding-complete") === "true");
  const [showNotifications, setShowNotifications] = useState(false);
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem("careos-theme") as Theme) || "light",
  );
  const [loginMode, setLoginMode] = useState<"signin" | "signup">("signin");
  const [loginAccessMethod, setLoginAccessMethod] = useState<"email" | "sso">("email");
  const [helpOpen, setHelpOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [doctorName, setDoctorName] = useState(() => localStorage.getItem("careos-doctor-name") || "Dr. Rana Samir");
  const t: Translator = (key) =>
    translations[language][key] ?? translations.en[key];
  const direction = language === "ar" ? "rtl" : "ltr";
  const changeLanguage = (next: Language) => {
    setLanguage(next);
    localStorage.setItem("careos-language", next);
  };
  const changeTheme = (next: Theme) => {
    setTheme(next);
    localStorage.setItem("careos-theme", next);
  };
  const changeDoctorName = (next: string) => { setDoctorName(next); localStorage.setItem("careos-doctor-name", next); };
  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2800);
  };
  useEffect(() => {
    const handler = (event: Event) =>
      notify((event as CustomEvent<string>).detail);
    window.addEventListener("careos:toast", handler);
    return () => window.removeEventListener("careos:toast", handler);
  }, []);

  if (showLanding) return <Landing language={language} setLanguage={changeLanguage} onEnter={(mode = "signin") => { setLoginMode(mode); window.location.hash = "app"; setShowLanding(false); }} t={t} theme={theme} setTheme={changeTheme} />;

  if (!loggedIn)
    return (
      <Login
        initialMode={loginMode}
        initialAccessMethod={loginAccessMethod}
        onBackHome={() => {
          setShowLanding(true);
          window.location.hash = "";
        }}
        onLogin={async ({ mode, email, password, fullName, organizationName, authMethod = "email" }) => {
          try {
            const isSso = authMethod === "sso";
            setLoginAccessMethod(isSso ? "sso" : "email");

            const result = isSso
              ? await apiLoginWithSso(email, password)
              : mode === "signup"
                ? await apiRegister(email, password, fullName, organizationName)
                : await apiLogin(email, password);

            const organizationReady = Boolean(result.user.onboarding_complete);
            setDoctorName(result.user.full_name);
            setLoggedIn(true);
            setOnboardingComplete(organizationReady);

            if (organizationReady) {
              localStorage.setItem("careos-onboarding-complete", "true");
              notify(language === "ar" ? "تم تسجيل الدخول بنجاح." : "Signed in successfully.");
            } else {
              localStorage.removeItem("careos-onboarding-complete");
              notify(language === "ar" ? "أكمل إعداد مساحة العمل." : "Complete your workspace setup.");
            }
          } catch (error) {
            if (import.meta.env.DEV && (error instanceof TypeError || (error instanceof Error && error.message === "Request failed"))) {
              setLoggedIn(true);
              setLoginAccessMethod(authMethod === "sso" ? "sso" : "email");
              setOnboardingComplete(false);
              localStorage.removeItem("careos-onboarding-complete");
              notify(t("demoMode"));
            } else {
              notify(error instanceof Error ? error.message : (language === "ar" ? "تعذر الاتصال بالخادم." : "Could not connect to the server."));
            }
          }
        }}
        language={language}
        setLanguage={changeLanguage}
        t={t}
      />
    );

  if (!onboardingComplete)
    return <Onboarding
      language={language}
      setLanguage={changeLanguage}
      complete={async (name) => {
        try {
          await completeOrganization(name, "Clinical care", "Africa/Cairo");
          localStorage.setItem("careos-onboarding-complete", "true");
          setOnboardingComplete(true);
        } catch (error) {
          if (import.meta.env.DEV && error instanceof Error && error.message === "Request failed") {
            localStorage.setItem("careos-onboarding-complete", "true");
            setOnboardingComplete(true);
            notify(t("demoMode"));
          } else {
            notify(error instanceof Error ? error.message : "Could not save workspace setup.");
          }
        }
      }}
      t={t}
      onBack={() => {
        setLoggedIn(false);
        setOnboardingComplete(false);
        setLoginAccessMethod("sso");
        localStorage.removeItem("careos-onboarding-complete");
      }}
    />;

  return (
    <div
      className={`app-shell ${theme === "dark" ? "dark-mode" : ""}`}
      dir={direction}
    >
      <Sidebar
        view={view}
        setView={setView}
        mobileNav={mobileNav}
        setMobileNav={setMobileNav}
        language={language}
        doctorName={doctorName}
        t={t}
      />
      {mobileNav && (
        <button
          className="mobile-overlay"
          onClick={() => setMobileNav(false)}
          aria-label={t("closeNavigation")}
        />
      )}
      <main className="main-content">
        <Header
          view={view}
          language={language}
          setLanguage={changeLanguage}
          setMobileNav={setMobileNav}
          showNotifications={showNotifications}
          setShowNotifications={setShowNotifications}
          theme={theme}
          setTheme={changeTheme}
          onHelp={() => setHelpOpen(true)}
          t={t}
        />
        <div className="page-content">
          {view === "dashboard" && <Dashboard onNavigate={setView} doctorName={doctorName} t={t} />}
          {view === "patients" && <Patients t={t} />}
          {view === "assistant" && <Assistant t={t} />}
          {view === "notes" && <ClinicalNotes t={t} />}
          {view === "appointments" && <Appointments t={t} language={language} />}
          {view === "messages" && <Messages t={t} />}
          {view === "portal" && <PatientPortal t={t} />}
          {view === "analytics" && <Analytics t={t} />}
          {view === "departments" && <Departments t={t} />}
          {view === "reports" && <Reports t={t} />}
          {view === "teamAudit" && <TeamAudit t={t} language={language} />}
          {view === "settings" && (
            <SettingsPage
              language={language}
              setLanguage={changeLanguage}
              theme={theme}
              setTheme={changeTheme}
              doctorName={doctorName}
              setDoctorName={changeDoctorName}
              onLogout={async () => { await apiLogout(); setLoggedIn(false); setOnboardingComplete(false); }}
              t={t}
            />
          )}
          {view === "integrations" && <IntegrationHub />}
        </div>
      </main>
      {helpOpen && <HelpModal close={() => setHelpOpen(false)} t={t} />}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

function Onboarding({ language, setLanguage, complete, t, onBack }: { language: Language; setLanguage: (language: Language) => void; complete: (organizationName: string) => void; t: Translator; onBack?: () => void }) {
  const [organizationName, setOrganizationName] = useState("");
  return <div className="onboarding-screen" dir={language === "ar" ? "rtl" : "ltr"}>
    <div className="onboarding-card">
      <div className="brand"><div className="brand-mark"><HeartPulse size={19} /></div><span>care<span>os</span></span></div>
      <div className="onboarding-progress"><span style={{ width: `33.333%` }} /></div>
      <div className="eyebrow">{t("onboardingStepOne")}</div>
      <h1>{t("onboardingWelcome")}</h1>
      <p>{t("onboardingWelcomeDetail")}</p>
      <label>{t("organizationName")}<input value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} placeholder={t("organizationPlaceholder")} /></label>
      <div className="onboarding-actions">
        {onBack && <button className="outline-btn onboarding-back-button" onClick={onBack}>{t("back")}</button>}
        <button className="outline-btn" onClick={() => setLanguage(language === "en" ? "ar" : "en")}>{language === "en" ? "العربية" : "English"}</button>
        <button className="primary-btn" disabled={organizationName.trim().length < 2} onClick={() => complete(organizationName)}>{t("continue")} <ArrowUpRight size={15} /></button>
      </div>
    </div>
  </div>;
}

function TeamAudit({ t, language }: { t: Translator; language: Language }) {
  const [tab, setTab] = useState<"team" | "audit">("team");
  const members = [{ name: "Dr. Rana Samir", email: "dr.rana@citycare.org", role: t("administratorRole"), status: t("active") }, { name: "Mariam Hassan", email: "mariam@citycare.org", role: t("careCoordinatorRole"), status: t("invited") }, { name: "Omar Khaled", email: "omar@citycare.org", role: t("physicianRole"), status: t("active") }];
  const events = [{ action: t("signedInEvent"), resource: t("workspaceResource"), time: t("justNow") }, { action: t("invitedEvent"), resource: "mariam@citycare.org", time: t("today") }, { action: t("organizationEvent"), resource: "CityCare", time: t("today") }];
  return <><PageHeading eyebrow={t("teamAuditEyebrow")} title={t("teamAuditTitle")} detail={t("teamAuditDetail")} action={<button className="primary-btn"><Plus size={16} /> {t("inviteMember")}</button>} /><section className="panel team-audit-panel"><div className="tabs team-audit-tabs"><button className={tab === "team" ? "active" : ""} onClick={() => setTab("team")}>{t("teamMembers")}</button><button className={tab === "audit" ? "active" : ""} onClick={() => setTab("audit")}>{t("auditLog")}</button></div>{tab === "team" ? <div className="team-list">{members.map(member => <div className="team-row" key={member.email}><div className="avatar avatar-doctor">{member.name.split(" ").map(part => part[0]).join("").slice(0, 2)}</div><div className="team-person"><strong>{member.name}</strong><span>{member.email}</span></div><span>{member.role}</span><span className="status confirmed">{member.status}</span><button className="round-btn" aria-label={language === "ar" ? "المزيد" : "More actions"}><MoreHorizontal size={16} /></button></div>)}</div> : <div className="audit-list">{events.map(event => <div className="audit-row" key={`${event.action}-${event.resource}`}><div className="audit-icon"><ShieldCheck size={15} /></div><div><strong>{event.action}</strong><span>{event.resource}</span></div><time>{event.time}</time></div>)}</div>}</section></>;
}

function Sidebar({
  view,
  setView,
  mobileNav,
  setMobileNav,
  language,
  doctorName,
  t,
}: {
  view: View;
  setView: (view: View) => void;
  mobileNav: boolean;
  setMobileNav: (open: boolean) => void;
  language: Language;
  doctorName: string;
  t: Translator;
}) {
  return (
    <aside className={`sidebar ${mobileNav ? "is-open" : ""}`}>
      <div className="brand">
        <div className="brand-mark">
          <HeartPulse size={19} />
        </div>
        <span>
          care<span>os</span>
        </span>
      </div>
      <div className="workspace-label">
        {language === "ar" ? "مساحة العمل السريرية" : "CLINICAL WORKSPACE"}
      </div>
      <nav>
        <div className="nav-section-label">{language === "ar" ? "مساحة الطبيب" : "CLINICAL WORKSPACE"}</div>
        {navItems.filter(({ id }) => clinicalViews.has(id)).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`nav-item ${view === id ? "active" : ""}`}
            onClick={() => {
              setView(id);
              setMobileNav(false);
            }}
          >
            <Icon size={18} strokeWidth={1.8} />
            <span>{t(label)}</span>
            {id === "assistant" && <span className="new-dot" />}
          </button>
        ))}
        <div className="nav-section-label">{language === "ar" ? "العمليات" : "OPERATIONS"}</div>
        {navItems.filter(({ id }) => operationsViews.has(id)).map(({ id, label, icon: Icon }) => (
          <button key={id} className={`nav-item ${view === id ? "active" : ""}`} onClick={() => { setView(id); setMobileNav(false) }}>
            <Icon size={18} strokeWidth={1.8} /><span>{t(label)}</span>
          </button>
        ))}
        <div className="nav-section-label">{language === "ar" ? "الإدارة" : "ADMINISTRATION"}</div>
        {navItems.filter(({ id }) => !clinicalViews.has(id) && !operationsViews.has(id)).map(({ id, label, icon: Icon }) => (
          <button key={id} className={`nav-item ${view === id ? "active" : ""}`} onClick={() => { setView(id); setMobileNav(false) }}>
            <Icon size={18} strokeWidth={1.8} /><span>{t(label)}</span>
          </button>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <button className={`nav-item ${view === "integrations" ? "active" : ""}`} onClick={() => setView("integrations")}>
          <Database size={18} />
          <span>{language === "ar" ? "التكاملات" : "Integrations"}</span>
        </button>
        <button
          className={`nav-item ${view === "settings" ? "active" : ""}`}
          onClick={() => setView("settings")}
        >
          <Settings size={18} />
          <span>{t("settings")}</span>
        </button>
        <div className="security-note">
          <ShieldCheck size={17} />
          <div>
            <strong>{t("secure")}</strong>
            <span>{t("secureDetail")}</span>
          </div>
        </div>
        <button className="profile-card">
          <div className="avatar avatar-doctor">DR</div>
          <div className="profile-copy">
            <strong>{doctorName}</strong>
            <span>{t("specialty")}</span>
          </div>
          <MoreHorizontal size={16} />
        </button>
      </div>
    </aside>
  );
}

function IntegrationHub() {
  const integrations = [
    { name: "Clinical summary", adapter: "ClinicalSummaryProvider", state: "Sandbox ready", next: "Configure an approved server-side LLM and evaluation dataset." },
    { name: "Clinical RAG", adapter: "RagProvider", state: "Sandbox ready", next: "Connect pgvector/Qdrant and an approved protocol library with page citations." },
    { name: "Document OCR", adapter: "OcrProvider", state: "Sandbox ready", next: "Connect Tesseract or an approved OCR vendor plus object storage." },
    { name: "Patient reminders", adapter: "NotificationProvider", state: "Queue ready", next: "Connect SMS/WhatsApp/email provider and background worker; obtain patient consent." },
    { name: "Hospital EHR/HIS", adapter: "EhrConnector", state: "Contract pending", next: "Agree FHIR/HL7 contract, credentials, field mapping, and audit requirements with the hospital." },
  ];
  return <><PageHeading eyebrow="DELIVERY FOUNDATION" title="Integration hub" detail="Safe handoff points for services that are not yet connected. No production credentials are stored here." /><section className="panel"><PanelHeading title="Provider adapters" detail="Backend adapters live in backend/app/integrations.py" />{integrations.map((item) => <div className="data-row" key={item.adapter}><div><strong>{item.name}</strong><span>{item.adapter}</span></div><span className="status pending">{item.state}</span><span style={{ maxWidth: 360 }}>{item.next}</span></div>)}</section><section className="panel" style={{ marginTop: 20 }}><PanelHeading title="Connection checklist" detail="Required before turning on real patient data" /><div className="record-item"><div className="record-date"><ShieldCheck size={18} /></div><div><strong>Secrets and approval</strong><p>Store provider credentials in deployment secrets; never use VITE_* variables for secrets or PHI.</p></div></div><div className="record-item"><div className="record-date"><FileText size={18} /></div><div><strong>Validation and audit</strong><p>Enable a provider only after clinical review, test coverage, consent, and audit events are in place.</p></div></div></section></>;
}

function Header({
  view,
  language,
  setLanguage,
  setMobileNav,
  showNotifications,
  setShowNotifications,
  theme,
  setTheme,
  onHelp,
  t,
}: {
  view: View;
  language: Language;
  setLanguage: (language: Language) => void;
  setMobileNav: (open: boolean) => void;
  showNotifications: boolean;
  setShowNotifications: (show: boolean) => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  onHelp: () => void;
  t: Translator;
}) {
  const current = navItems.find((item) => item.id === view) ?? navItems[0];
  return (
    <header className="topbar">
      <button
        className="icon-btn menu-btn"
        onClick={() => setMobileNav(true)}
        aria-label={t("openNavigation")}
      >
        <Menu size={20} />
      </button>
      <div className="breadcrumb">
        <span>{t("workspace")}</span>
        <ChevronRight size={14} />
        <strong>{t(current.label)}</strong>
      </div>
      <div className="top-actions">
        <button
          type="button"
          className="glass-control-btn glass-icon-btn"
          aria-label={theme === "light" ? t("darkMode") : t("lightMode")}
          onClick={() => setTheme(theme === "light" ? "dark" : "light")}
        >
          {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
        </button>
        <button
          type="button"
          className="glass-control-btn glass-icon-btn"
          onClick={() => setLanguage(language === "en" ? "ar" : "en")}
          aria-label={language === "en" ? "Switch to Arabic" : "Switch to English"}
        >
          {language === "en" ? "AR" : "EN"}
        </button>
        <button type="button" className="icon-btn" aria-label={t("help")} onClick={onHelp}>
          <CircleHelp size={19} />
        </button>
        <div className="notification-wrap">
          <button
            className="icon-btn notification"
            aria-label={t("notificationLabel")}
            onClick={() => setShowNotifications(!showNotifications)}
          >
            <Bell size={19} />
            <i />
          </button>
          {showNotifications && (
            <div className="notification-popover">
              <strong>{t("notifications")}</strong>
              <p>{t("newLabNotification")}</p>
              <p>{t("appointmentNotification")}</p>
            </div>
          )}
        </div>
        <div className="top-avatar">DR</div>
      </div>
    </header>
  );
}

function PageHeading({
  eyebrow,
  title,
  detail,
  action,
}: {
  eyebrow: string;
  title: string;
  detail: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{detail}</p>
      </div>
      {action}
    </div>
  );
}

function Dashboard({
  onNavigate,
  doctorName,
  t,
}: {
  onNavigate: (view: View) => void;
  doctorName: string;
  t: Translator;
}) {
  return (
    <>
      <PageHeading
        eyebrow={t("todayDate")}
        title={`${t("morning")}, ${doctorName}`}
        detail={t("todayOverview")}
        action={
          <button
            className="primary-btn"
            onClick={() => onNavigate("appointments")}
          >
            <Plus size={17} /> {t("newAppointment")}
          </button>
        }
      />
      <section className="stat-grid">
        <Stat
          icon={<Users />}
          label={t("totalPatients")}
          value="248"
          delta={t("thisMonth")}
          tone="blue"
        />
        <Stat
          icon={<CalendarDays />}
          label={t("todaysVisits")}
          value="08"
          delta={t("remaining")}
          tone="orange"
        />
        <Stat
          icon={<Clock3 />}
          label={t("pendingFollowups")}
          value="05"
          delta={t("requiresReview")}
          tone="rose"
        />
        <Stat
          icon={<Activity />}
          label={t("careCompletion")}
          value="94%"
          delta={t("thisWeek")}
          tone="green"
        />
      </section>
      <div className="dashboard-grid">
        <section className="panel appointments-panel">
          <PanelHeading
            title={t("todaysAppointments")}
            detail={`${t("scheduledVisits")} · 8`}
            action={
              <button
                className="text-btn"
                onClick={() => onNavigate("appointments")}
              >
                {t("viewCalendar")} <ArrowUpRight size={15} />
              </button>
            }
          />
          <div className="appointment-list">
            {appointments.map((appointment) => (
                <AppointmentRow
                key={appointment.time}
                appointment={appointment}
                t={t}
              />
            ))}
          </div>
        </section>
        <section className="panel followups-panel">
          <PanelHeading
            title={t("pendingFollowups")}
            detail={t("patientsAttention")}
            action={
              <button className="round-btn" aria-label={t("moreActions")} onClick={() => window.dispatchEvent(new CustomEvent("careos:toast", { detail: t("actionComplete") }))}>
                <MoreHorizontal size={18} />
              </button>
            }
          />
          <div className="followup-list">
            {patients.slice(0, 3).map((patient) => (
              <div className="followup" key={patient.id}>
                <PatientAvatar patient={patient} />
                <div className="followup-main">
                  <strong>{patient.name}</strong>
                  <span>{patient.id}</span>
                </div>
                <button className="round-btn" aria-label={t("openPatient")} onClick={() => onNavigate("patients")}>
                  <ChevronRight size={16} />
                </button>
              </div>
            ))}
          </div>
          <button
            className="outline-btn full-width"
            onClick={() => onNavigate("patients")}
          >
            {t("reviewPatients")}
          </button>
        </section>
      </div>
      <section className="dashboard-lower-grid">
        <section className="panel operations-panel">
          <PanelHeading
            title={t("operations")}
            detail={t("careTeamOverview")}
            action={
              <button className="round-btn" aria-label={t("moreActions")} onClick={() => window.dispatchEvent(new CustomEvent("careos:toast", { detail: t("actionComplete") }))}>
                <MoreHorizontal size={18} />
              </button>
            }
          />
          <div className="operations-list">
            <div className="operation-row">
              <span className="operation-label">{t("ragLatency")}</span>
              <span className="operation-value">1.8s</span>
              <span className="operation-target">{t("latencyTarget")}</span>
            </div>
            <div className="operation-row">
              <span className="operation-label">{t("summaryReviewRate")}</span>
              <span className="operation-value">82%</span>
              <span className="operation-target">{t("draftsReviewed")}</span>
            </div>
            <div className="operation-row">
              <span className="operation-label">{t("ocrDocuments")}</span>
              <span className="operation-value">14</span>
              <span className="operation-target">{t("syntheticDailyTarget")}</span>
            </div>
            <div className="operation-row">
              <span className="operation-label">{t("citationCoverage")}</span>
              <span className="operation-value">96%</span>
              <span className="operation-target">{t("sourcesAttached")}</span>
            </div>
          </div>
        </section>
        <section className="panel team-panel">
          <PanelHeading
            title={t("careTeam")}
            detail={t("careTeamOverview")}
            action={
              <button className="text-btn" onClick={() => onNavigate("teamAudit")}>
                {t("teamAudit")} <ArrowUpRight size={15} />
              </button>
            }
          />
          <div className="dashboard-team-list">
            {patients.slice(0, 3).map((patient) => (
              <div className="dashboard-team-row" key={patient.id}>
                <PatientAvatar patient={patient} />
                <div className="dashboard-team-person">
                  <strong>{patient.name}</strong>
                  <span>{patient.condition}</span>
                </div>
                <span className={`status ${patient.status.toLowerCase().replace(/\s+/g, "-")}`}>{patient.status}</span>
              </div>
            ))}
          </div>
          <div className="team-update">
            <div className="team-update-icon"><MessageSquareText size={15} /></div>
            <span>{t("secureUpdate")}</span>
          </div>
        </section>
      </section>
      <section className="insight-strip">
        <div className="insight-icon">
          <Stethoscope size={20} />
        </div>
        <div>
          <strong>{t("assistantReady")}</strong>
          <p>{t("assistantReadyDetail")}</p>
        </div>
        <button className="text-btn" onClick={() => onNavigate("assistant")}>
          {t("openAssistant")} <ArrowUpRight size={15} />
        </button>
      </section>
    </>
  );
}

function Stat({
  icon,
  label,
  value,
  delta,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  delta: string;
  tone: string;
}) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${tone}`}>{icon}</div>
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
      <span className={`stat-delta ${tone}`}>
        <ArrowUpRight size={13} /> {delta}
      </span>
    </div>
  );
}
function PanelHeading({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="panel-heading">
      <div>
        <h2>{title}</h2>
        <p>{detail}</p>
      </div>
      {action}
    </div>
  );
}
function PatientAvatar({ patient }: { patient: Patient }) {
  return (
    <div className="patient-avatar" style={{ background: patient.color }}>
      {patient.initials}
    </div>
  );
}
function AppointmentRow({ appointment, t }: { appointment: Appointment; t: Translator }) {
  const patient = getPatient(appointment.patientId);
  const typeLabels: Record<Appointment["type"], TranslationKey> = {
    "Follow-up consultation": "followUpConsultation",
    "Diabetes review": "diabetesReview",
    "Cardiology referral": "cardiologyReferral",
    "Medication review": "medicationReview",
  };
  const statusLabels: Record<Appointment["status"], TranslationKey> = {
    Confirmed: "confirmed",
    Arrived: "arrived",
    Pending: "pending",
    Cancelled: "cancelled",
  };
  return (
    <div className="appointment-row">
      <span className="appointment-time">{appointment.time}</span>
      <PatientAvatar patient={patient} />
      <div className="appointment-person">
        <strong>{patient.name}</strong>
        <span>{t(typeLabels[appointment.type])}</span>
      </div>
      <span className={`status ${appointment.status.toLowerCase()}`}>
        {t(statusLabels[appointment.status])}
      </span>
      <button className="round-btn" aria-label={t("moreActions")} onClick={() => window.dispatchEvent(new CustomEvent("careos:toast", { detail: t("actionComplete") }))}>
        <MoreHorizontal size={17} />
      </button>
    </div>
  );
}

function Patients({ t }: { t: Translator }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Patient | null>(null);
  const [livePatients, setLivePatients] = useState<Patient[] | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  useEffect(() => {
    let active = true;
    apiGetPatients(query).then((records) => {
      if (!active) return;
      setLivePatients(records.map((patient) => {
        const birth = new Date(patient.date_of_birth);
        const age = Math.max(0, new Date().getFullYear() - birth.getFullYear());
        const condition = patient.condition || "Hypertension";
        return { name: `${patient.given_name} ${patient.family_name}`, id: patient.medical_record_number, age, gender: patient.gender === "Male" ? "Male" : "Female", condition: (["Hypertension", "Type 2 Diabetes", "Cardiac review", "Migraine"].includes(condition) ? condition : "Hypertension") as Patient["condition"], status: patient.care_status === "needs_attention" ? "Needs attention" : patient.care_status === "follow_up_due" ? "Follow-up due" : "Stable", color: "#8db4ad", initials: `${patient.given_name[0] || "P"}${patient.family_name[0] || ""}` };
      }));
    }).catch(() => { if (active) setLivePatients(null); });
    return () => { active = false; };
  }, [query]);
  const sourcePatients = livePatients ?? patients;
  const filtered = sourcePatients.filter((patient) =>
    `${patient.name} ${patient.id}`.toLowerCase().includes(query.toLowerCase()),
  );
  const conditionLabels: Record<Patient["condition"], TranslationKey> = { Hypertension: "hypertension", "Type 2 Diabetes": "typeTwoDiabetes", "Cardiac review": "cardiacReview", Migraine: "migraine" };
  const genderLabels: Record<Patient["gender"], TranslationKey> = { Female: "female", Male: "male" };
  if (selected)
    return (
      <PatientDetails
        patient={selected}
        onBack={() => setSelected(null)}
        t={t}
      />
    );
  return (
    <>
      <PageHeading
        eyebrow={t("careDirectory")}
        title={t("patients")}
        detail={t("searchManage")}
        action={
          <button className="primary-btn" onClick={() => setShowCreate(true)}>
            <Plus size={17} /> {t("addPatient")}
          </button>
        }
      />
      <div className="toolbar">
        <div className="search-box">
          <Search size={17} />
          <input
            placeholder={t("searchPatients")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <button className="filter-btn">
          {t("allPatients")} <ChevronRight size={15} />
        </button>
      </div>
      <section className="panel table-panel">
        <div className="table-header">
          <span>{t("patient")}</span>
          <span>{t("condition")}</span>
          <span>{t("lastVisit")}</span>
          <span>{t("careStatus")}</span>
          <span />
        </div>
        {filtered.map((patient) => (
          <button
            className="patient-table-row"
            key={patient.id}
            onClick={() => setSelected(patient)}
          >
            <div className="patient-cell">
              <PatientAvatar patient={patient} />
              <div>
                <strong>{patient.name}</strong>
                <span>
                  {patient.id} · {patient.age} {t("years")} · {t(genderLabels[patient.gender])}
                </span>
              </div>
            </div>
            <span>{t(conditionLabels[patient.condition])}</span>
            <span>{t("todayAt")}</span>
            <span
              className={`status ${patient.status === "Stable" ? "confirmed" : "attention"}`}
            >
              {t(patient.status === "Stable" ? "stable" : patient.status === "Follow-up due" ? "followUpDue" : "needsAttention")}
            </span>
            <ChevronRight size={17} />
          </button>
        ))}
        {filtered.length === 0 && (
          <div className="empty-state">{t("noPatients")}</div>
        )}
      </section>
      {showCreate && <PatientModal t={t} close={() => { setShowCreate(false); setQuery(""); }} onCreated={(patient) => { setLivePatients((current) => current ? [patient, ...current] : [patient]); setShowCreate(false); }} />}
    </>
  );
}

function PatientModal({ t, close, onCreated }: { t: Translator; close: () => void; onCreated: (patient: Patient) => void }) {
  const [name, setName] = useState(""); const [mrn, setMrn] = useState(""); const [birth, setBirth] = useState("1990-01-01"); const [gender, setGender] = useState("Female"); const [condition, setCondition] = useState(""); const [saving, setSaving] = useState(false);
  const save = async () => {
    const parts = name.trim().split(/\s+/); if (!name.trim() || !mrn.trim()) return;
    setSaving(true);
    try {
      const created = await apiCreatePatient({ medical_record_number: mrn, given_name: parts[0], family_name: parts.slice(1).join(" ") || "Patient", date_of_birth: birth, gender, condition, care_status: "stable" });
      onCreated({ name: `${created.given_name} ${created.family_name}`, id: created.medical_record_number, age: new Date().getFullYear() - new Date(created.date_of_birth).getFullYear(), gender: created.gender === "Male" ? "Male" : "Female", condition: (["Hypertension", "Type 2 Diabetes", "Cardiac review", "Migraine"].includes(created.condition) ? created.condition : "Hypertension") as Patient["condition"], status: "Stable", color: "#8db4ad", initials: `${created.given_name[0]}${created.family_name[0]}` });
      window.dispatchEvent(new CustomEvent("careos:toast", { detail: "Patient created." }));
    } catch (error) { window.dispatchEvent(new CustomEvent("careos:toast", { detail: error instanceof Error ? error.message : "Could not create patient" })); } finally { setSaving(false); }
  };
  return <div className="modal-backdrop" onClick={close}><div className="modal" onClick={(event) => event.stopPropagation()}><div className="modal-heading"><h2>{t("addPatient")}</h2><button className="icon-btn" onClick={close}><X size={18} /></button></div><label>{t("fullName")}<input value={name} onChange={(event) => setName(event.target.value)} /></label><label>Medical record number<input value={mrn} onChange={(event) => setMrn(event.target.value)} /></label><div className="form-row"><label>Date of birth<input type="date" value={birth} onChange={(event) => setBirth(event.target.value)} /></label><label>Gender<select value={gender} onChange={(event) => setGender(event.target.value)}><option>Female</option><option>Male</option></select></label></div><label>{t("condition")}<input value={condition} onChange={(event) => setCondition(event.target.value)} /></label><button className="primary-btn full-width" disabled={!name.trim() || !mrn.trim() || saving} onClick={save}><Check size={16} /> {saving ? t("working") : t("addPatient")}</button></div></div>;
}

function PatientDetails({
  patient,
  onBack,
  t,
}: {
  patient: Patient;
  onBack: () => void;
  t: Translator;
}) {
  const [tab, setTab] = useState<TranslationKey>("medicalRecords");
  const tabs: TranslationKey[] = [
    "medicalRecords",
    "vitals",
    "labResults",
    "medications",
  ];
  return (
    <>
      <button className="back-link" onClick={onBack}>
        <ChevronRight size={16} className="back-icon" /> {t("backPatients")}
      </button>
      <div className="detail-heading">
        <PatientAvatar patient={patient} />
        <div>
          <div className="eyebrow">
            {t("patientProfile")} · {patient.id}
          </div>
          <h1>{patient.name}</h1>
          <p>
            {patient.age} {t("yearsOld")} · {t(patient.gender === "Female" ? "female" : "male")} · {t(({ Hypertension: "hypertension", "Type 2 Diabetes": "typeTwoDiabetes", "Cardiac review": "cardiacReview", Migraine: "migraine" } as Record<Patient["condition"], TranslationKey>)[patient.condition])}
          </p>
        </div>
        <button className="primary-btn">
          <MessageSquareText size={16} /> {t("startVisit")}
        </button>
      </div>
      <div className="tabs">
        {tabs.map((item) => (
          <button
            className={tab === item ? "active" : ""}
            onClick={() => setTab(item)}
            key={item}
          >
            {t(item)}
          </button>
        ))}
      </div>
      <section className="detail-grid">
        <div className="panel record-panel">
          <PanelHeading
            title={t(tab)}
            detail={t("updatedTodayBy")}
          />
          <div className="record-item">
            <div className="record-date">
              21 <small>OCT</small>
            </div>
            <div>
              <strong>{t("followUpConsultation")}</strong>
              <p>{t("recordFollowup")}</p>
              <span className="record-tag">{t("internalMedicine")}</span>
            </div>
          </div>
          <div className="record-item">
            <div className="record-date">
              02 <small>SEP</small>
            </div>
            <div>
              <strong>{t("initialConsultation")}</strong>
              <p>{t("recordInitial")}</p>
              <span className="record-tag">{t("consultationNote")}</span>
            </div>
          </div>
        </div>
        <aside className="panel patient-summary">
          <h2>{t("patientSummary")}</h2>
          <div className="summary-line">
            <span>{t("bloodType")}</span>
            <strong>{t("bloodTypeValue")}</strong>
          </div>
          <div className="summary-line">
            <span>{t("allergies")}</span>
            <strong className="warning-text">{t("penicillin")}</strong>
          </div>
          <div className="summary-line">
            <span>{t("primaryPhysician")}</span>
            <strong>Dr. Rana Samir</strong>
          </div>
          <div className="summary-line">
            <span>{t("nextAppointment")}</span>
            <strong>{t("nextAppointmentValue")}</strong>
          </div>
          <div className="ai-disclaimer compact">
            <ShieldCheck size={15} />
            <span>{t("decisionDetail")}</span>
          </div>
        </aside>
      </section>
    </>
  );
}

function Assistant({ t }: { t: Translator }) {
  const [question, setQuestion] = useState("");
  const [asked, setAsked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<"helpful" | "notHelpful" | null>(null);
  const [patientId, setPatientId] = useState<string | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);
  const [answerProvider, setAnswerProvider] = useState("sandbox");
  useEffect(() => { apiGetPatients().then((records) => setPatientId(records[0]?.id ?? null)).catch(() => setPatientId(null)); }, []);
  const patient = patients[0];
  return (
    <>
      <PageHeading
        eyebrow={t("decisionSupport")}
        title={t("assistant")}
        detail={t("groundedAnswers")}
        action={
          <div className="secure-badge">
            <ShieldCheck size={15} /> {t("privateWorkspace")}
          </div>
        }
      />
      <div className="assistant-layout">
        <section className="panel assistant-panel">
          <div className="assistant-intro">
            <div className="assistant-orb">
              <Stethoscope size={25} />
            </div>
            <div>
              <h2>{t("helpCare")}</h2>
              <p>{t("assistantDetail")}</p>
            </div>
          </div>
          <div className="patient-select">
            <label>{t("patientContext")}</label>
            <button aria-label={t("bold")} onClick={() => window.dispatchEvent(new CustomEvent("careos:toast", { detail: t("formattingDemo") }))}>
              <PatientAvatar patient={patient} />
              <div>
                <strong>{patient.name}</strong>
                <span>
                  {patient.id} · {patient.condition}
                </span>
              </div>
              <ChevronRight size={17} />
            </button>
          </div>
          <div className="question-box">
            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder={t("askQuestion")}
            />
            <div className="question-actions">
              <button className="icon-btn">
                <Mic size={18} />
              </button>
              <span>{t("verifiedSources")}</span>
              <button
                className="primary-btn small"
                onClick={async () => { setLoading(true); setAsked(false); setFeedback(null); try { if (!patientId) throw new Error("API unavailable"); const result = await askAssistant(patientId, question); setAnswer(result.answer); setAnswerProvider(result.provider); } catch { setAnswer(t("assistantResponse")); setAnswerProvider("demo"); } finally { setLoading(false); setAsked(true); } }}
                disabled={!question.trim()}
              >
                <Stethoscope size={15} /> {loading ? t("working") : t("askAssistant")}
              </button>
            </div>
          </div>
          {!asked && !loading && <div className="assistant-empty"><BookOpen size={22} /><strong>{t("askAboutPatient")}</strong><span>{t("evidenceResponse")}</span></div>}
          {loading && <div className="assistant-empty"><span className="loading-bar" /><strong>{t("reviewingContext")}</strong><span>{t("checkingSources")}</span></div>}
          {asked && (
            <div className="assistant-answer">
              <div className="answer-heading">
                <div className="answer-icon">
                  <Stethoscope size={16} />
                </div>
                <div>
                  <strong>{t("assistant")}</strong>
                  <span>{answerProvider === "sandbox" ? "Sandbox provider · sources pending configuration" : t("generatedSources")}</span>
                </div>
                <button className="icon-btn">
                  <X size={17} />
                </button>
              </div>
              <p>{answer || t("assistantResponse")}</p>
              <div className="sources">
                <strong>{t("sourcesUsed")}</strong>
                <div className="source-item">
                  <span className="source-number">01</span>
                  <div>
                    <b>{t("hypertensionProtocol")}</b>
                    <small>{t("ministryPage")}</small>
                  </div>
                </div>
                <div className="assistant-confidence"><span>{t("confidence")}</span><strong>{t("highConfidence")}</strong></div>
                <div className="answer-feedback"><span>{t("useful")}</span><button className={feedback === "helpful" ? "selected" : ""} onClick={() => setFeedback("helpful")}>{t("helpful")}</button><button className={feedback === "notHelpful" ? "selected" : ""} onClick={() => setFeedback("notHelpful")}>{t("notHelpful")}</button><button onClick={() => navigator.clipboard?.writeText(t("assistantResponse"))}>{t("copy")}</button></div>
              </div>
            </div>
          )}
        </section>
        <aside className="assistant-side">
          <div className="ai-disclaimer">
            <AlertCircle size={17} />
            <div>
              <strong>{t("decisionOnly")}</strong>
              <span>{t("decisionDetail")}</span>
            </div>
          </div>
          <div className="panel prompt-panel">
            <h3>{t("tryAsking")}</h3>
            {[
              t("promptNextVisit"), t("promptTrend"), t("promptProtocol"),
            ].map((prompt) => (
              <button key={prompt} onClick={() => setQuestion(prompt)}>
                {prompt}
                <ArrowUpRight size={14} />
              </button>
            ))}
          </div>
        </aside>
      </div>
    </>
  );
}

function ClinicalNotes({ t }: { t: Translator }) {
  const [note, setNote] = useState(t("noteBody"));
  const [summary, setSummary] = useState("");
  const [noteStatus, setNoteStatus] = useState<"Draft" | "Reviewed" | "Signed">("Draft");
  const [dirty, setDirty] = useState(false);
  const [noteId, setNoteId] = useState<string | null>(null);
  const [patientId, setPatientId] = useState<string | null>(null);
  useEffect(() => { apiGetPatients().then((records) => setPatientId(records[0]?.id ?? null)).catch(() => setPatientId(null)); }, []);
  return (
    <>
      <PageHeading
        eyebrow={t("documentation")}
        title={t("notes")}
        detail={t("notesDetail")}
        action={
            <button
              className="primary-btn"
              onClick={async () => {
                try {
                  if (!patientId) throw new Error("API unavailable");
                  const saved = noteId ? { id: noteId } : await createClinicalNote({ patient_id: patientId, body: note });
                  setNoteId(saved.id);
                  const result = await generateClinicalSummary(saved.id);
                  setSummary(result.ai_draft || "");
                  window.dispatchEvent(new CustomEvent("careos:toast", { detail: "Sandbox summary generated — clinician review required." }));
                } catch { setSummary(t("summaryBody")); window.dispatchEvent(new CustomEvent("careos:toast", { detail: t("demoMode") })); }
              }}
            >
              <FileText size={16} /> {t("generateSummary")}
          </button>
        }
      />
      <div className="notes-layout">
        <section className="panel editor-panel">
          <PanelHeading
            title={t("visitNote")}
            detail={t("visitPatientTime")}
          />
          <div className="editor-toolbar">
            <button aria-label={t("italic")} onClick={() => window.dispatchEvent(new CustomEvent("careos:toast", { detail: t("formattingDemo") }))}>
              <b>B</b>
            </button>
            <button>
              <i>I</i>
            </button>
            <button onClick={() => window.dispatchEvent(new CustomEvent("careos:toast", { detail: t("formattingDemo") }))}>{t("list")}</button>
            <span />
            <button className="icon-btn" aria-label={t("voiceInput")} onClick={() => window.dispatchEvent(new CustomEvent("careos:toast", { detail: t("voiceDemo") }))}>
              <Mic size={17} />
            </button>
          </div>
          <textarea
            className="note-editor"
            value={note}
            onChange={(event) => { setNote(event.target.value); setDirty(true); setNoteStatus("Draft"); }}
          />
        </section>
        <section className="panel summary-panel">
          <PanelHeading title={t("summaryDraft")} detail={`${t("editableDraft")} · ${noteStatus}`} />
          {summary ? (
            <textarea
              className="summary-editor"
              value={summary}
              onChange={(event) => { setSummary(event.target.value); setDirty(true); setNoteStatus("Reviewed"); }}
            />
          ) : (
            <div className="summary-empty">
              <FileText size={22} />
              <span>{t("summaryEmpty")}</span>
              <small>{t("reviewAi")}</small>
            </div>
          )}
          <div className="ai-disclaimer compact">
            <AlertCircle size={15} />
            <span>{t("reviewAi")}</span>
          </div>
          {summary && (
            <button className="primary-btn full-width" disabled={noteStatus !== "Reviewed"} onClick={async () => { try { if (noteId) await signClinicalNote(noteId); setNoteStatus("Signed"); setDirty(false); window.dispatchEvent(new CustomEvent("careos:toast", { detail: t("savedChanges") })); } catch { window.dispatchEvent(new CustomEvent("careos:toast", { detail: t("demoMode") })); } }}>
              <Check size={16} /> {noteStatus === "Signed" ? t("signed") : t("saveRecord")}
            </button>
          )}
          {dirty && <div className="unsaved-warning">{t("unsavedReview")}</div>}
        </section>
      </div>
    </>
  );
}

function Appointments({ t, language }: { t: Translator; language: Language }) {
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState<Appointment["status"] | "All">("All");
  const [dayOffset, setDayOffset] = useState(0);
  const [liveAppointments, setLiveAppointments] = useState<Appointment[] | null>(null);
  const loadAppointments = () => Promise.all([apiGetAppointments(), apiGetPatients()]).then(([records, people]) => {
    const ids = new Map(people.map((patient) => [patient.id, patient.medical_record_number]));
    setLiveAppointments(records.map((item) => ({ time: new Date(item.starts_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }), patientId: ids.get(item.patient_id) || item.patient_id, type: (["Follow-up consultation", "Diabetes review", "Cardiology referral", "Medication review"].includes(item.reason) ? item.reason : "Follow-up consultation") as Appointment["type"], status: ({ confirmed: "Confirmed", arrived: "Arrived", pending: "Pending", cancelled: "Cancelled" }[item.status] || "Pending") as Appointment["status"] })));
  }).catch(() => setLiveAppointments(null));
  useEffect(() => { void loadAppointments(); }, []);

  const currentDate = new Date(2024, 9, 21 + dayOffset);
  const dateFormatted = currentDate.toLocaleDateString(language === "ar" ? "ar-EG" : "en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  });

  // Generate realistic schedule variations for each day
  const dayAppointments: Appointment[] = (() => {
    if (liveAppointments) return liveAppointments;
    if (dayOffset === 0) return appointments; // development display fallback
    const dayOfWeek = currentDate.getDay(); // 0 = Sunday, 5 = Friday, 6 = Saturday
    if (dayOfWeek === 5) {
      // Friday / weekend light schedule
      return [
        { time: "10:00", patientId: "PT-2048", type: "Follow-up consultation", status: "Confirmed" },
        { time: "11:30", patientId: "PT-2040", type: "Medication review", status: "Pending" },
      ];
    }
    // Alternate appointments order and statuses depending on the day
    const shift = Math.abs(dayOffset) % 3;
    if (shift === 1) {
      return [
        { time: "09:30", patientId: "PT-2047", type: "Diabetes review", status: "Confirmed" },
        { time: "11:00", patientId: "PT-2043", type: "Cardiology referral", status: "Confirmed" },
        { time: "13:15", patientId: "PT-2048", type: "Follow-up consultation", status: "Pending" },
      ];
    }
    return [
      { time: "08:45", patientId: "PT-2040", type: "Medication review", status: "Arrived" },
      { time: "10:15", patientId: "PT-2048", type: "Follow-up consultation", status: "Confirmed" },
      { time: "12:30", patientId: "PT-2047", type: "Diabetes review", status: "Pending" },
      { time: "14:00", patientId: "PT-2043", type: "Cardiology referral", status: "Confirmed" },
    ];
  })();

  const visibleAppointments = filter === "All" ? dayAppointments : dayAppointments.filter((appointment) => appointment.status === filter);
  const isToday = dayOffset === 0;
  const countLabel = isToday
    ? t("appointmentsCount")
    : (language === "ar" ? `${dayAppointments.length} مواعيد` : `${dayAppointments.length} appointments`);

  return (
    <>
      <PageHeading
        eyebrow={t("schedule")}
        title={t("appointments")}
        detail={t("scheduleDetail")}
        action={
          <button className="primary-btn" onClick={() => setShowForm(true)}>
            <Plus size={17} /> {t("newAppointment")}
          </button>
        }
      />
      <div className="calendar-bar">
        <button
          className="round-btn"
          aria-label={t("previousDay")}
          onClick={() => setDayOffset((prev) => prev - 1)}
        >
          <ChevronLeft size={16} />
        </button>
        <div>
          <strong>{dateFormatted}</strong>
          <span>{countLabel}</span>
        </div>
        <button
          className="round-btn"
          aria-label={t("nextDay")}
          onClick={() => setDayOffset((prev) => prev + 1)}
        >
          <ChevronRight size={16} />
        </button>
        <div className="calendar-actions">
          <select className="filter-btn" value={filter} onChange={(event) => setFilter(event.target.value as Appointment["status"] | "All")}><option value="All">{t("allStatuses")}</option><option value="Confirmed">{t("confirmed")}</option><option value="Pending">{t("pending")}</option><option value="Arrived">{t("arrived")}</option><option value="Cancelled">{t("cancelled")}</option></select>
        </div>
      </div>
      <section className="panel schedule-panel">
        {visibleAppointments.map((appointment) => (
          <AppointmentRow key={`${appointment.time}-${appointment.patientId}`} appointment={appointment} t={t} />
        ))}
        {visibleAppointments.length === 0 && <div className="empty-state">{t("noAppointments")}</div>}
      </section>
      {showForm && <AppointmentModal close={() => { setShowForm(false); void loadAppointments(); }} t={t} />}
    </>
  );
}

function AppointmentModal({ close, t }: { close: () => void; t: Translator }) {
  const [patientsForAppointment, setPatientsForAppointment] = useState<Array<{ id: string; label: string }>>([]);
  const [patientId, setPatientId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState("15:30");
  const [reason, setReason] = useState("Follow-up consultation");
  useEffect(() => { apiGetPatients().then((items) => { const next = items.map((item) => ({ id: item.id, label: `${item.given_name} ${item.family_name} · ${item.medical_record_number}` })); setPatientsForAppointment(next); setPatientId(next[0]?.id ?? ""); }).catch(() => {}); }, []);
  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-heading">
          <div>
            <div className="eyebrow">{t("schedule")}</div>
            <h2>{t("newAppointment")}</h2>
          </div>
          <button className="icon-btn" onClick={close}>
            <X size={18} />
          </button>
        </div>
        <label>
          {t("patient")}
          <select value={patientId} onChange={(event) => setPatientId(event.target.value)}>
            {patientsForAppointment.length ? patientsForAppointment.map((patient) => <option key={patient.id} value={patient.id}>{patient.label}</option>) : <option>API patient required</option>}
          </select>
        </label>
        <div className="form-row">
          <label>
            {t("date")}
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
          <label>
            {t("time")}
            <input type="time" value={time} onChange={(event) => setTime(event.target.value)} />
          </label>
        </div>
        <label>
          {t("appointmentType")}
          <select value={reason} onChange={(event) => setReason(event.target.value)}>
            <option>Follow-up consultation</option>
            <option>Medication review</option>
          </select>
        </label>
        <button className="primary-btn full-width" disabled={!patientId} onClick={async () => { try { await apiCreateAppointment({ patient_id: patientId, starts_at: new Date(`${date}T${time}:00`).toISOString(), reason, status: "confirmed" }); close(); window.dispatchEvent(new CustomEvent("careos:toast", { detail: "Appointment saved and sandbox reminder queued." })); } catch (error) { window.dispatchEvent(new CustomEvent("careos:toast", { detail: error instanceof Error ? error.message : t("demoMode") })); } }}>
          <Check size={16} /> {t("confirmAppointment")}
        </button>
      </div>
    </div>
  );
}

function Messages({ t }: { t: Translator }) {
  const [selected, setSelected] = useState(0);
  const threads = [
    {
      name: "Nurse Salma Adel",
      subject: "Mariam Hassan follow-up",
      text: t("labReadyMessage"),
      unread: true,
    },
    {
      name: "Dr. Omar Khaled",
      subject: t("cardiologyReferral"),
      text: t("coordinateSlotMessage"),
      unread: true,
    },
    {
      name: "Care coordination",
      subject: t("weeklyHandoff"),
      text: t("followupsDue"),
      unread: false,
    },
  ];
  const thread = threads[selected];
  return (
    <>
      <PageHeading
        eyebrow={t("communication")}
        title={t("messagesTitle")}
        detail={t("messagesDetail")}
        action={
          <button className="primary-btn" onClick={() => window.dispatchEvent(new CustomEvent("careos:toast", { detail: t("actionComplete") }))}>
            <MessageCircle size={16} /> {t("newMessage")}
          </button>
        }
      />
      <div className="messages-layout">
        <section className="panel thread-list">
          {threads.map((item, index) => {
            const isSelected = selected === index;
            return (
              <button
                className={`thread ${isSelected ? "active" : ""}`}
                key={item.subject}
                onClick={() => setSelected(index)}
                style={isSelected ? {
                  backgroundColor: "#203b35",
                  borderInlineStart: "3px solid #65b8aa",
                  borderRadius: "6px"
                } : {
                  backgroundColor: "transparent"
                }}
              >
                <div
                  className="avatar avatar-doctor"
                  style={{
                    backgroundColor: isSelected ? "#2a4d45" : "#1d3b36",
                    color: "#8bd0c1"
                  }}
                >
                  {item.name
                    .split(" ")
                    .map((part) => part[0])
                    .join("")
                    .slice(0, 2)}
                </div>
                <div>
                  <strong style={{ color: "#e7efec" }}>{item.name}</strong>
                  <b style={{ color: isSelected ? "#8bd0c1" : "#74c2b2" }}>{item.subject}</b>
                  <span style={{ color: isSelected ? "#c5d7d0" : "#94a7a0" }}>{item.text}</span>
                </div>
                {item.unread && <i />}
              </button>
            );
          })}
        </section>
        <section className="panel message-view">
          <PanelHeading title={thread.subject} detail={thread.name} />
          <div
            className="message-bubble received"
            style={{
              backgroundColor: "#1e332d",
              color: "#e7efec",
              border: "1px solid #30443f"
            }}
          >
            {thread.text}
            <small style={{ color: "#9cb0a8" }}>09:42</small>
          </div>
          <div
            className="message-bubble sent"
            style={{
              backgroundColor: "#246d63",
              color: "#ffffff"
            }}
          >
            {t("followupMessage")}<small style={{ color: "#d1ebe5" }}>09:45</small>
          </div>
          <div className="message-compose">
            <input
              placeholder={t("secureMessagePlaceholder")}
              style={{
                backgroundColor: "#152420",
                color: "#e7efec",
                borderColor: "#30443f"
              }}
            />
            <button className="primary-btn small" onClick={() => window.dispatchEvent(new CustomEvent("careos:toast", { detail: t("messageSent") }))}>
              <Send size={14} /> {t("reply")}
            </button>
          </div>
        </section>
      </div>
    </>
  );
}

function PatientPortal({ t }: { t: Translator }) {
  return (
    <>
      <PageHeading
        eyebrow={t("patientExperience")}
        title={t("portalTitle")}
        detail={t("portalDetail")}
        action={<span className="demo-badge">{t("demoData")}</span>}
      />
      <section className="portal-banner">
        <div
          className="patient-avatar large"
          style={{ background: patients[0].color }}
        >
          {patients[0].initials}
        </div>
        <div>
          <h2>{t("portalGreeting")}</h2>
          <p>
            {t("careTeamOverview")}
          </p>
        </div>
      </section>
      <div className="portal-grid">
        <section className="panel portal-card">
          <PanelHeading
            title={t("upcomingVisit")}
            detail={t("nextAppointmentValue")}
          />
          <strong>{t("followUpConsultation")}</strong>
          <span>Dr. Rana Samir · {t("internalMedicine")}</span>
          <button className="outline-btn" onClick={() => window.dispatchEvent(new CustomEvent("careos:toast", { detail: t("actionComplete") }))}>{t("viewAppointment")}</button>
        </section>
        <section className="panel portal-card">
          <PanelHeading title={t("carePlan")} detail={t("updatedToday")} />
          <strong>{t("carePlan")}</strong>
          <span>{t("assistantDetail")}</span>
          <button className="outline-btn" onClick={() => window.dispatchEvent(new CustomEvent("careos:toast", { detail: t("actionComplete") }))}>{t("viewPlan")}</button>
        </section>
        <section className="panel portal-card">
          <PanelHeading title={t("secureMessage")} detail={t("careTeam")} />
          <strong>{t("unreadMessage")}</strong>
          <span>{t("secureUpdate")}</span>
          <button className="primary-btn small" onClick={() => window.dispatchEvent(new CustomEvent("careos:toast", { detail: t("actionComplete") }))}>{t("openMessages")}</button>
        </section>
      </div>
    </>
  );
}

function Analytics({ t }: { t: Translator }) {
  return (
    <>
      <PageHeading
        eyebrow={t("operations")}
        title={t("analyticsTitle")}
        detail={t("analyticsDetail")}
        action={<span className="demo-badge">{t("syntheticData")}</span>}
      />
      <section className="stat-grid">
        <Stat icon={<Clock3 />} label={t("ragLatency")} value="1.8s" delta={t("latencyTarget")} tone="blue" />
        <Stat icon={<FileText />} label={t("summaryReviewRate")} value="97%" delta={t("draftsReviewed")} tone="green" />
        <Stat icon={<Database />} label={t("ocrDocuments")} value="1,000" delta={t("syntheticDailyTarget")} tone="orange" />
        <Stat icon={<BookOpen />} label={t("citationCoverage")} value="94%" delta={t("sourcesAttached")} tone="rose" />
      </section>
      <div className="analytics-grid">
        <section className="panel chart-panel">
          <PanelHeading title={t("monthlyTrend")} detail={t("lastSixMonths")} />
          <div className="bar-chart">
            {[55, 72, 48, 82, 68, 92].map((height, index) => (
              <div className="bar-column" key={index}>
                <span style={{ height: `${height}%` }} />
                <small>
                  {["May", "Jun", "Jul", "Aug", "Sep", "Oct"][index]}
                </small>
              </div>
            ))}
          </div>
        </section>
        <section className="panel chart-panel">
          <PanelHeading
            title={t("departmentDistribution")}
            detail={t("currentWorkload")}
          />
          <div className="distribution">
            <div className="donut" />
            <ul>
              <li>
                <i className="dot teal" /> {t("internalMedicine")} <b>38%</b>
              </li>
              <li>
                <i className="dot orange" /> {t("cardiologyReferral")} <b>25%</b>
              </li>
              <li>
                <i className="dot blue" /> {t("pediatrics")} <b>20%</b>
              </li>
              <li>
                <i className="dot rose" /> {t("other")} <b>17%</b>
              </li>
            </ul>
          </div>
        </section>
      </div>
    </>
  );
}

function Departments({ t }: { t: Translator }) {
  const rows = [
    {
      name: "Internal medicine",
      lead: "Dr. Rana Samir",
      patients: 248,
      clinicians: 12,
    },
    {
      name: "Cardiology",
      lead: "Dr. Omar Khaled",
      patients: 184,
      clinicians: 8,
    },
    {
      name: "Pediatrics",
      lead: "Dr. Salma Adel",
      patients: 156,
      clinicians: 10,
    },
  ];
  return (
    <>
      <PageHeading
        eyebrow={t("organization")}
        title={t("departmentsTitle")}
        detail={t("departmentsDetail")}
        action={
          <button className="primary-btn" onClick={() => window.dispatchEvent(new CustomEvent("careos:toast", { detail: t("actionComplete") }))}>
            <Plus size={16} /> {t("addDepartment")}
          </button>
        }
      />
      <section className="panel table-panel">
        <div className="table-header">
          <span>{t("department")}</span>
          <span>{t("primaryPhysician")}</span>
          <span>{t("activePatients")}</span>
          <span>{t("clinicians")}</span>
          <span />
        </div>
        {rows.map((row) => (
          <div className="data-row" key={row.name}>
            <strong>{row.name}</strong>
            <span>{row.lead}</span>
            <span>{row.patients}</span>
            <span>{row.clinicians}</span>
            <button className="round-btn" aria-label={t("moreActions")} onClick={() => window.dispatchEvent(new CustomEvent("careos:toast", { detail: t("actionComplete") }))}>
              <MoreHorizontal size={16} />
            </button>
          </div>
        ))}
      </section>
    </>
  );
}

function Reports({ t }: { t: Translator }) {
  const reports = [
    { name: "Monthly care activity", period: "October 2024", status: "ready" },
    { name: "AI review quality", period: "Q3 2024", status: "ready" },
    { name: "Appointment completion", period: "October 2024", status: "ready" },
  ];
  return (
    <>
      <PageHeading
        eyebrow={t("operations")}
        title={t("reportsTitle")}
        detail={t("reportsDetail")}
        action={
          <button className="primary-btn" onClick={() => window.dispatchEvent(new CustomEvent("careos:toast", { detail: t("actionComplete") }))}>
            <FileBarChart size={16} /> {t("generateReport")}
          </button>
        }
      />
      <section className="panel table-panel">
        <div className="table-header">
          <span>{t("reportName")}</span>
          <span>{t("period")}</span>
          <span>{t("status")}</span>
          <span />
          <span />
        </div>
        {reports.map((report) => (
          <div className="data-row" key={report.name}>
            <strong>{report.name}</strong>
            <span>{report.period}</span>
            <span className="status confirmed">{t("ready")}</span>
            <button className="text-btn" onClick={() => window.dispatchEvent(new CustomEvent("careos:toast", { detail: t("actionComplete") }))}>
              {t("preview")} <ArrowUpRight size={14} />
            </button>
            <button className="round-btn" aria-label={t("moreActions")} onClick={() => window.dispatchEvent(new CustomEvent("careos:toast", { detail: t("actionComplete") }))}>
              <MoreHorizontal size={16} />
            </button>
          </div>
        ))}
      </section>
    </>
  );
}

function SettingsPage({
  language,
  setLanguage,
  theme,
  setTheme,
  doctorName,
  setDoctorName,
  onLogout,
  t,
}: {
  language: Language;
  setLanguage: (language: Language) => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  doctorName: string;
  setDoctorName: (name: string) => void;
  onLogout: () => void;
  t: Translator;
}) {
  return (
    <>
      <PageHeading
        eyebrow={t("workspace")}
        title={t("settingsTitle")}
        detail={t("settingsDetail")}
      />
      <div className="settings-layout">
        <section className="panel settings-nav">
          <button className="active">
            <UserRound size={16} /> {t("profile")}
          </button>
          <button>
            <SlidersHorizontal size={16} /> {t("preferences")}
          </button>
          <button>
            <ShieldCheck size={16} /> {t("security")}
          </button>
          <button>
            <Bell size={16} /> {t("notificationsSetting")}
          </button>
        </section>
        <section className="panel settings-form">
          <PanelHeading
            title={t("profile")}
            detail={t("demoProfile")}
          />
          <label>
            {t("displayName")}
            <input value={doctorName} onChange={(event) => setDoctorName(event.target.value)} />
          </label>
          <label>
            {t("specialtyLabel")}
            <input defaultValue={t("internalMedicine")} />
          </label>
          <label>
            Language
            <select
              value={language}
              onChange={(event) => setLanguage(event.target.value as Language)}
            >
              <option value="en">English</option>
              <option value="ar">العربية</option>
            </select>
          </label>
          <div className="theme-setting">
            <span>{t("preferences")}</span>
            <button
              type="button"
              className="glass-control-btn glass-icon-btn"
              aria-label={theme === "dark" ? t("lightMode") : t("darkMode")}
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
            </button>
          </div>
          <div className="settings-actions">
            <button className="primary-btn" onClick={() => window.dispatchEvent(new CustomEvent("careos:toast", { detail: t("savedChanges") }))}>{t("saveChanges")}</button>
            <button className="danger-btn" onClick={onLogout}>
              <LogOut size={15} /> {t("signOut")}
            </button>
          </div>
        </section>
      </div>
    </>
  );
}

function Login({
  onLogin,
  language,
  setLanguage,
  t,
  initialMode = "signin",
  initialAccessMethod = "email",
  onBackHome,
}: {
  onLogin: (payload: { mode: "signin" | "signup"; email: string; password: string; fullName: string; organizationName: string; authMethod: "email" | "sso" }) => void;
  language: Language;
  setLanguage: (language: Language) => void;
  t: Translator;
  initialMode?: "signin" | "signup";
  initialAccessMethod?: "email" | "sso";
  onBackHome: () => void;
}) {
  const [mode, setMode] = useState<"signin" | "signup">(initialMode);
  const [accessMethod, setAccessMethod] = useState<"email" | "sso">(initialAccessMethod);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("dr.rana@citycare.org");
  const [password, setPassword] = useState("password123");
  const [showPassword, setShowPassword] = useState(false);
  const [organizationName, setOrganizationName] = useState("CityCare");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const isSignUp = mode === "signup";
  const isSso = accessMethod === "sso";
  return (
    <div className="login-screen" dir={language === "ar" ? "rtl" : "ltr"}>
      <div className="login-art">
        <button type="button" className="login-home-button" onClick={onBackHome} aria-label={language === "ar" ? "العودة للرئيسية" : "Back to Home"}>
          <Home size={16} />
        </button>
        <div className="login-brand">
          <div className="brand-mark">
            <HeartPulse size={19} />
          </div>
          <span>
            care<span>os</span>
          </span>
        </div>
        <div className="login-quote">
          <span>{t("loginEyebrow")}</span>
          <h1>
            {t("loginQuoteFirst")}
            <br />
            <em>{t("loginQuoteSecond")}</em>
          </h1>
          <p>
            {t("loginArtDetail")}
          </p>
        </div>
      </div>
      <div className="login-form-wrap">
        <div className="login-form">
          <div className="login-form-top">
            <button type="button" className="back-link login-back-home" onClick={onBackHome}>
              <ChevronLeft size={14} /> {language === "ar" ? "العودة للرئيسية" : "Back to Home"}
            </button>
            <button
              type="button"
              className="glass-control-btn glass-icon-btn login-language"
              onClick={() => setLanguage(language === "en" ? "ar" : "en")}
              aria-label={language === "en" ? "Switch to Arabic" : "Switch to English"}
            >
              {language === "en" ? "AR" : "EN"}
            </button>
          </div>
          <div className="mobile-login-brand">
            <div className="brand-mark">
              <HeartPulse size={19} />
            </div>
            <span>
              care<span>os</span>
            </span>
          </div>
          <div className="auth-tabs" role="tablist">
            <button className={!isSignUp ? "active" : ""} onClick={() => { setMode("signin"); setAccessMethod("email"); }} role="tab" aria-selected={!isSignUp}>
              {t("signIn")}
            </button>
            <button className={isSignUp ? "active" : ""} onClick={() => { setMode("signup"); setAccessMethod("email"); }} role="tab" aria-selected={isSignUp}>
              {t("createAccount")}
            </button>
          </div>
          {!isSignUp && (
            <div className="access-method-panel">
              <button type="button" className={`access-method-button ${accessMethod === "email" ? "active" : ""}`} onClick={() => setAccessMethod("email")}>{t("emailPassword")}</button>
              <button type="button" className={`access-method-button ${accessMethod === "sso" ? "active" : ""}`} onClick={() => setAccessMethod("sso")}>{t("hospitalSso")}</button>
            </div>
          )}
          <div className="eyebrow">{isSignUp ? t("createAccountEyebrow") : t("welcome")}</div>
          <h2>{isSignUp ? t("createAccount") : t("signIn")}</h2>
          <p>{isSignUp ? t("createAccountDetail") : t("signInDetail")}</p>
          {isSignUp && accessMethod === "email" && (
            <label>
              {t("fullName")}
              <input type="text" value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder={t("fullNamePlaceholder")} />
            </label>
          )}
          {isSignUp && accessMethod === "email" && <label>{t("organizationName")}<input type="text" value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} placeholder={t("organizationPlaceholder")} /></label>}
          {accessMethod === "email" && (
            <>
              <label>
                {t("email")}
                <input type="email" placeholder="name@hospital.org" value={isSignUp && email === "dr.rana@citycare.org" ? "" : email} onChange={(event) => setEmail(event.target.value)} />
              </label>
              <label>
                {t("password")}
                <span className="password-input-wrap">
                  <input type={showPassword ? "text" : "password"} placeholder={isSignUp ? t("passwordPlaceholder") : "password123"} value={isSignUp && password === "password123" ? "" : password} onChange={(event) => setPassword(event.target.value)} />
                  <button type="button" className="password-visibility-button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Hide password" : "Show password"}>
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </span>
              </label>
              {isSignUp && (
                <label>
                  {t("confirmPassword")}
                  <span className="password-input-wrap">
                    <input type={showConfirmPassword ? "text" : "password"} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder={t("confirmPasswordPlaceholder")} />
                    <button type="button" className="password-visibility-button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} aria-label={showConfirmPassword ? "Hide password" : "Show password"}>
                      {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </span>
                </label>
              )}
            </>
          )}
          {!isSignUp && accessMethod === "sso" && (
            <div className="sso-provider-panel">
              <div className="sso-provider-title"><Stethoscope size={17} /> {t("hospitalSso")}</div>
              <div className="sso-provider-detail">{t("ssoProviderDetail")}</div>
              <div className="sso-provider-role">{t("ssoPageRole")}</div>
              <div className="sso-provider-actions">
                <button className="primary-btn login-button" onClick={() => onLogin({ mode: "signin", email: "dr.rana@citycare.org", password: "password123", fullName: "Dr. Rana Samir", organizationName: "CityCare", authMethod: "sso" })}>
                  {t("continueWithSso")} <ArrowUpRight size={16} />
                </button>
              </div>
            </div>
          )}
          {!isSignUp && accessMethod === "email" && <div className="form-options">
            <label className="check-label">
              <input type="checkbox" defaultChecked /> {t("remember")}
            </label>
            <button type="button" onClick={() => setForgotOpen(true)}>{t("forgot")}</button>
          </div>}
          {accessMethod === "email" && <button className="primary-btn login-button" disabled={isSignUp && (!fullName || !email || password.length < 8 || password !== confirmPassword || organizationName.length < 2)} onClick={() => onLogin({ mode, email, password, fullName, organizationName, authMethod: "email" })}>
            {isSignUp ? t("createWorkspace") : t("signIn")} <ArrowUpRight size={16} />
          </button>}
          <p className="auth-note">
            {isSignUp ? t("accountConsent") : (
              <>
                {t("newToCareosPrompt")}{" "}
                <button type="button" className="auth-note-link" onClick={() => setMode("signup")}>{t("newToCareosLink")}</button>
              </>
            )}
          </p>
        </div>
      </div>
      {forgotOpen && <PasswordRecovery close={() => setForgotOpen(false)} t={t} />}
    </div>
  );
}

function PasswordRecovery({ close, t }: { close: () => void; t: Translator }) {
  const [sent, setSent] = useState(false);
  const [email, setEmail] = useState("");
  return <div className="modal-backdrop" role="dialog" aria-modal="true">
    <div className="modal auth-recovery-modal">
      <div className="modal-heading"><div><div className="eyebrow">CAREOS</div><h2>{t("forgotTitle")}</h2></div><button className="icon-btn" onClick={close} aria-label={t("close")}><X size={18} /></button></div>
      {!sent ? <><p>{t("forgotDetail")}</p><label>{t("email")}<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@hospital.org" /></label><button className="primary-btn full-width" disabled={!email.includes("@")} onClick={() => setSent(true)}>{t("sendReset")} <ArrowUpRight size={16} /></button></> : <><div className="recovery-success"><Check size={18} />{t("resetSent")}</div><button className="outline-btn full-width" onClick={close}>{t("backToSignIn")}</button></>}
    </div>
  </div>;
}

function HelpModal({ close, t }: { close: () => void; t: Translator }) {
  return (
    <div className="modal-backdrop" onClick={close}>
      <div
        className="modal help-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-heading">
          <div>
            <div className="eyebrow">CAREOS</div>
            <h2>{t("helpTitle")}</h2>
          </div>
          <button className="icon-btn" onClick={close}>
            <X size={18} />
          </button>
        </div>
        <p>{t("helpBody")}</p>
        <div className="help-list">
          <span>1. {t("helpStepOne")}</span>
          <span>2. {t("helpStepTwo")}</span>
          <span>3. {t("helpStepThree")}</span>
        </div>
        <button className="primary-btn full-width" onClick={close}>
          {t("close")}
        </button>
      </div>
    </div>
  );
}

export default App;

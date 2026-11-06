import { createFileRoute } from "@tanstack/react-router";
import { Fragment, Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  Beaker,
  BookOpen,
  Brain,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  ClipboardCheck,
  Clock3,
  FileText,
  Flame,
  GraduationCap,
  Hand,
  HelpCircle,
  Library,
  Lightbulb,
  Leaf,
  Mic,
  MicOff,
  Pause,
  Pencil,
  Play,
  Plus,
  Send,
  Settings,
  Sigma,
  Sparkles,
  Sun,
  Target,
  TrendingUp,
  Upload,
  Trash2,
  Volume2,
  VolumeX,
  Keyboard,
  MoreHorizontal,
  ShieldCheck,
  X,
  Zap,
  Maximize2,
  Minimize2,
  Maximize,
  Minimize,
  PanelRight,
  PanelRightClose,
} from "lucide-react";
import type { CSSProperties, MouseEvent as ReactMouseEvent } from "react";
import { arc, type Concept, type LessonStage, type Module } from "@/lib/curriculum";
import { buildLiveModule, buildPilotModules } from "@/lib/pilot";
import { BlankCard, HintCard, McqCard, SpeechReportCard } from "@/components/ClassroomCards";
import {
  analyseSpeech,
  domainTerms,
  gapReport,
  startMeter,
  type GapReport,
  type Meter,
} from "@/lib/speech-signal";
import { nowMs } from "@/lib/clock";
import { DEFAULT_PLAN } from "@/lib/dialogue";
import { recordFor, useLiveRecords } from "@/lib/knowledge/store";
import { initLearner, localLearnerId, setLearner, useLearner } from "@/lib/learner";
import { answerInContext } from "@/lib/ask-local";
import { delayedCheck, award, closeDoubts, openDoubt } from "@/lib/mastery";
import { POINTS } from "@/lib/session";
import { useHld } from "@/lib/use-hld";
import { EvaluationPanel, StudyPanel } from "@/components/StudyPanels";
import {
  JourneyGuide,
  KnowledgePanel,
  LadderSection,
  TopicSetup,
  loadJourney,
  saveJourney,
  type JourneyFlags,
} from "@/components/HldPanels";
import { resetClock } from "@/lib/clock";
import { resetLearner, setPlan, setSession } from "@/lib/learner";
import {
  ROOMS,
  ARJUN,
  MAYA,
  defaultRoomForModule,
  personaFor,
  roomById,
  type RoomId,
  type Speaker,
} from "@/components/classroom/personas";
import {
  assessKindOf,
  assessLocal,
  buildReference,
  dbAssessmentType,
  nextMastery,
  nextReviewAt,
  parseAiAssessment,
  pointsFor,
  type AssessKind,
  type Assessment,
} from "@/lib/assess";
import {
  cancelSpeech,
  pickVoices,
  speak as speakText,
  startRecognizer,
  sttSupported,
  ttsSupported,
  useVoices,
  type Recognizer,
} from "@/lib/voice";
import {
  MaterialError,
  buildModuleLocally,
  extractMaterial,
  pickExcerpts,
  summarise,
  type DraftModule,
  type Extracted,
  type ReadOptions,
  type Section,
  type VisionReader,
} from "@/lib/materials";
import { SceneBoundary } from "@/components/classroom/SceneBoundary";
import { SettingsPanel } from "@/components/SettingsPanel";
import { ReviewPanel, type SessionDone, type ConceptOutcome } from "@/components/ReviewPanel";
import { ReportPanel } from "@/components/ReportPanel";
import { CheckinCard, DoubtCard, ThinkingSummary } from "@/components/ThinkingChat";
import { EvaluationHub } from "@/components/EvaluationHub";
import { LectureBoard } from "@/components/LectureBoard";
import { canAdvance } from "@/lib/session";
import { addLive, mergeLive, patchLive, useLiveTurns } from "@/lib/live-turns";
import { deepTurns, saveDeep, splitLesson, useDeepLesson } from "@/lib/deep-lessons";
import {
  listenOnce,
  parseChoice,
  parseCommand,
  parseDoubtReply,
  speakOptions,
  type Listen,
} from "@/lib/hands-free";
import {
  CONFIDENCE,
  loadThinking,
  patchThinking,
  thinkingKey,
  type ThinkingLog,
} from "@/lib/thinking-chat";
import { computeReport, type AttemptLog } from "@/lib/analytics";
import {
  refKey,
  summarise as summariseQuiz,
  type Answer,
  type ConceptRef,
  type Mode,
  type Question,
} from "@/lib/quiz";
import { isSrs, scheduleNext, type Srs } from "@/lib/srs";
import { initSettings, useSettings } from "@/lib/settings";
import {
  EN,
  LANGS,
  englishToTranslate,
  hasBundle,
  clearDynamicBundles,
  initLang,
  langInfo,
  loadCachedBundle,
  setDynamicBundle,
  tr,
  useI18n,
  type Key,
  type LangCode,
} from "@/lib/i18n";
import {
  localizeModule,
  moduleToTxSource,
  txKey,
  validateModuleTx,
  type ModuleTx,
} from "@/lib/lesson-i18n";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import type { User } from "@supabase/supabase-js";
import type { Json } from "@/integrations/supabase/types";

// The 3D scene (three.js, ~1 MB) loads only when the classroom is opened.
const ClassroomScene = lazy(() =>
  import("@/components/classroom/ClassroomScene").then((m) => ({ default: m.ClassroomScene })),
);

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "AI KYRO — Metacognitive Classroom" },
      {
        name: "description",
        content:
          "Learn complete university topics through an interactive AI classroom grounded in your own materials.",
      },
      { property: "og:title", content: "AI KYRO — Metacognitive Classroom" },
      {
        property: "og:description",
        content: "An immersive AI classroom for active, measurable learning.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: App,
});

type GenConcept = {
  title: string;
  bloom: string;
  definition: string;
  misconception: string;
  example: string;
  equation: string;
  transfer: string;
};
type VoiceTarget = "topic" | "question" | "response";
/** lesson assessments that start (or advance) a concept's spaced-review schedule */
const SRS_KINDS: AssessKind[] = ["checkpoint", "teachback", "transfer"];
type ResultMeta = { gain: number; from: number; to: number };
type VoiceNote = { target: VoiceTarget | "tts"; text: string; error: boolean };
const PROGRESS_KEY = "kyro_progress_v1";
const ASK_HINT_KEY = "kyro_ask_hint_v1";
const ASK_CHIPS = ["ask.chip.again", "ask.chip.example", "ask.chip.why"] as const;
type Panel =
  | "dashboard"
  | "classroom"
  | "library"
  | "progress"
  | "settings"
  | "review"
  | "setup"
  | "knowledge"
  | "study"
  | "evaluation";
type Material = {
  id: string;
  title: string;
  file_name: string;
  status: string;
  page_count: number | null;
  extracted_summary: string | null;
  storage_path: string;
  /** the readable text, split into slides / pages / sections (used to ground answers) */
  sections?: Section[];
  /** kept only in this browser (not signed in, or the account save failed) */
  local?: boolean;
};
type UsedSource = { name: string; ref: string; title: string };
const LOCAL_MATERIALS_KEY = "kyro_local_materials_v1";
const LESSON_TX_KEY = "kyro_lesson_i18n_v1";
const MATERIAL_COLUMNS =
  "id,title,file_name,status,page_count,extracted_summary,storage_path,source_outline";
const toSections = (j: unknown): Section[] =>
  Array.isArray(j)
    ? (j as Array<Record<string, unknown>>)
        .filter(
          (x) =>
            x &&
            typeof x["title"] === "string" &&
            typeof x["text"] === "string" &&
            typeof x["ref"] === "string",
        )
        .map((x) => ({
          title: x["title"] as string,
          text: x["text"] as string,
          ref: x["ref"] as string,
          ...(x["via"] === "ai" || x["via"] === "ocr" || x["via"] === "text"
            ? { via: x["via"] }
            : {}),
        }))
    : [];
type MasteryRow = { module_slug: string; concept_slug: string; mastery_score: number };
function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`Missing ${label}`);
  return value;
}

/**
 * Sends one page image to the AI page reader (handwriting transcription + figure descriptions).
 * Resolves null when the AI is not set up or out of credits, so the caller can fall back to offline
 * OCR and tell the learner what was skipped; throws for a one-off failure on a single page.
 */
let visionProblem = ""; // why the AI reader was unavailable during the current upload, if it was
const visionReader: VisionReader = async ({ dataUrl, ref, pageText }) => {
  const r = await fetch("/api/read-page", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ image: dataUrl, ref, pageText: pageText.slice(0, 6000) }),
  });
  if (r.status === 401 || r.status === 402) {
    const d = (await r.json().catch(() => ({}))) as { message?: string; code?: string };
    visionProblem =
      d.code === "not_configured"
        ? tr("vision.notConfigured")
        : (d.message ?? tr("vision.unavailable"));
    return null;
  }
  if (!r.ok) throw new Error(`read-page ${r.status}`);
  const d = (await r.json()) as { text?: unknown; figures?: unknown; handwritten?: unknown };
  return {
    text: typeof d.text === "string" ? d.text : "",
    figures: Array.isArray(d.figures)
      ? d.figures.filter((x): x is string => typeof x === "string")
      : [],
    handwritten: d.handwritten === true,
  };
};

function App() {
  useMemo(() => {
    initLang(); // restore the saved language (and its cached dictionary) before the first render
    initSettings(); // and the saved settings / theme
    initLearner(); // and the learner model / classroom sessions
  }, []);
  const { t, tp, lang } = useI18n();
  const { settings, update: updateSetting, theme, quality, reducedMotion } = useSettings();
  const [panel, setPanel] = useState<Panel>("dashboard");
  const [moduleIndex, setModuleIndex] = useState(0);
  const [conceptIndex, setConceptIndex] = useState(1);
  const [stageIndex, setStageIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  /** YouTube-style keyboard control of the class (set further down, once the actions exist) */
  const keysRef = useRef<((e: KeyboardEvent) => boolean) | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  useEffect(() => {
    if (!moreOpen) return;
    const close = (e: Event) => {
      if (!(e.target as HTMLElement | null)?.closest?.(".tb-more")) setMoreOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMoreOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [moreOpen]);
  const [kbdToast, setKbdToast] = useState<{ text: string; n: number } | null>(null);
  const speed = settings.speed;
  const [response, setResponse] = useState("");
  const [showHint, setShowHint] = useState(false);
  const [popupDismissed, setPopupDismissed] = useState<string | null>(null);
  // first visit to the classroom: point at the "ask a doubt" bar so the learner knows it is there
  const [askHint, setAskHint] = useState(false);
  const askRef = useRef<HTMLTextAreaElement>(null);
  // enlarged view: the class fills the whole window, the doubt bar stays docked underneath
  const [focus, setFocus] = useState(false);
  const [thinkingOpen, setThinkingOpen] = useState(false);
  const [thinkTick, setThinkTick] = useState(0);
  /** confidence given before the checkpoint answer is submitted (calibration) */
  const [cpConf, setCpConf] = useState<number | null>(null);
  const [pendingFocus, setPendingFocus] = useState<string | null>(null);
  const resumeRef = useRef(false);
  const [focusPanel, setFocusPanel] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  };
  const leaveFocus = () => {
    setFocus(false);
    setFocusPanel(false);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  };
  const dismissAskHint = () => {
    setAskHint(false);
    try {
      localStorage.setItem(ASK_HINT_KEY, "1");
    } catch {
      /* ignore */
    }
  };
  // enter classes enlarged if the learner chose so; always leave the enlarged view when leaving the classroom
  useEffect(() => {
    if (panel === "classroom") setFocus(settings.startEnlarged);
    else {
      setFocus(false);
      setFocusPanel(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the screen changes
  }, [panel]);
  useEffect(() => {
    const onFs = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);
  useEffect(() => {
    if (panel !== "classroom") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      const typing = el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);
      if (e.key === "Escape" && document.querySelector(".shortcuts-sheet")) {
        setShortcutsOpen(false);
        return;
      }
      if (!typing && keysRef.current?.(e)) {
        e.preventDefault();
        return;
      }
      if (
        e.key === "Escape" &&
        focus &&
        !document.fullscreenElement &&
        !document.querySelector(".question-popup")
      ) {
        setFocus(false);
        setFocusPanel(false);
      } else if ((e.key === "f" || e.key === "F") && !typing) {
        e.preventDefault();
        if (focus) leaveFocus();
        else setFocus(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panel, focus]);
  useEffect(() => {
    if (!focus) return;
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = prev;
    };
  }, [focus]);
  useEffect(() => {
    if (panel !== "classroom") return;
    try {
      if (!localStorage.getItem(ASK_HINT_KEY)) setAskHint(true);
    } catch {
      /* storage blocked: skip the hint */
    }
  }, [panel]);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [asking, setAsking] = useState(false);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [uploading, setUploading] = useState(false);
  const [matError, setMatError] = useState("");
  const [readMsg, setReadMsg] = useState("");
  const [matNote, setMatNote] = useState("");
  const [buildingId, setBuildingId] = useState<string | null>(null);
  const [materialsLoaded, setMaterialsLoaded] = useState(false);
  const [usedSources, setUsedSources] = useState<UsedSource[] | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [points, setPoints] = useState(0);
  const [masteryMap, setMasteryMap] = useState<Record<string, number>>({});
  const [attemptLog, setAttemptLog] = useState<AttemptLog[]>([]);
  const [srsMap, setSrsMap] = useState<Record<string, Srs>>({});
  const [reviewStart, setReviewStart] = useState<{
    mode: Mode;
    conceptKey?: string;
    nonce: number;
  } | null>(null);
  const [progressLoaded, setProgressLoaded] = useState(false);
  const voiceOn = settings.voiceOn;
  const [speakingNow, setSpeakingNow] = useState(false);
  const [voiceNote, setVoiceNote] = useState<VoiceNote | null>(null);
  const [assessing, setAssessing] = useState(false);
  const [result, setResult] = useState<Assessment | null>(null);
  const [resultMeta, setResultMeta] = useState<ResultMeta | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const heroRef = useRef<HTMLButtonElement>(null);
  const [customModules, setCustomModules] = useState<Module[]>([]);
  useEffect(() => {
    try {
      setCustomModules(JSON.parse(localStorage.getItem("kyro_custom_modules") || "[]"));
    } catch {
      /* ignore corrupt saved modules */
    }
  }, []);
  const [lessonTx, setLessonTx] = useState<Record<string, ModuleTx>>({});
  const [i18nNote, setI18nNote] = useState("");
  const [translating, setTranslating] = useState(false);
  const learnerData = useLearner();
  const liveRecs = useLiveRecords();
  /** Pilot modules (+ live verified topics), each concept's dialogue built from its verified record and plan. */
  const baseModules = useMemo(() => {
    const planFor = (k: string) => ({
      ...(learnerData.plans[k] ?? { ...DEFAULT_PLAN, mode: settings.dialogueMode }),
      checkins: settings.thinkingCheckins,
    });
    const pilot = buildPilotModules(planFor, recordFor, liveRecs);
    const live = buildLiveModule(liveRecs, planFor, recordFor);
    return live ? [...pilot, live] : pilot;
  }, [learnerData.plans, liveRecs, settings.dialogueMode, settings.thinkingCheckins]);
  const rawModules = [...baseModules, ...customModules];
  /** Lessons as shown in the chosen language (original content until its translation is ready). */
  const modules = useMemo(
    () => rawModules.map((m) => localizeModule(m, lang, lessonTx[txKey(lang, m.slug)])),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rawModules is derived from customModules
    [baseModules, customModules, lang, lessonTx],
  );
  const [topic, setTopic] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");
  const [listening, setListening] = useState<null | VoiceTarget>(null);
  const attachRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<Recognizer | null>(null);
  const recToken = useRef(0);
  const stopDictation = () => {
    recToken.current++; // ignore the late onDone of the session we are stopping
    recRef.current?.stop();
    recRef.current = null;
    setListening(null);
  };
  const dictate = (target: VoiceTarget) => {
    const wasSame = listening === target;
    if (listening) {
      stopDictation();
      if (wasSame) {
        setVoiceNote(null);
        return;
      }
    }
    if (!sttSupported()) {
      setVoiceNote({
        target,
        text: t("voice.unsupportedInput"),
        error: true,
      });
      return;
    }
    cancelSpeech();
    setSpeakingNow(false);
    if (target === "question") setPlaying(false); // raising your hand pauses the class
    const setter =
      target === "topic" ? setTopic : target === "question" ? setQuestion : setResponse;
    const base = target === "topic" ? topic : target === "question" ? question : response;
    const token = ++recToken.current;
    setVoiceNote({
      target,
      text: t("voice.listening"),
      error: false,
    });
    setListening(target);
    if (target === "response" && stage.kind === "teachback" && settings.speechCapture) {
      setSpeechReport(null);
      startMeter()
        .then((m) => {
          if (token !== recToken.current) void m.stop();
          else meterRef.current = m;
        })
        .catch(() =>
          setVoiceNote({
            target,
            text: "Microphone not available — typing works just as well.",
            error: true,
          }),
        );
    }
    const rec = startRecognizer({
      base,
      lang: speechTag,
      onText: (full) => {
        if (token === recToken.current) setter(full);
      },
      onDone: (error) => {
        if (token !== recToken.current) return;
        recRef.current = null;
        setListening(null);
        setVoiceNote(error ? { target, text: error, error: true } : null);
      },
    });
    if (rec) recRef.current = rec;
  };
  /** Turn an AI or offline draft into a saved custom module and open it in the Seminar Studio. */
  const addCustomModule = (d: DraftModule, openNow: boolean): Module => {
    const slug = `custom-${Date.now()}`;
    const mod: Module = {
      slug,
      code: "MY " + (customModules.length + 1),
      lang,
      title: d.title,
      description: d.description,
      concepts: (d.concepts as GenConcept[]).map((c, i) => ({
        slug: `${slug}-${i}`,
        title: c.title,
        bloom: c.bloom,
        duration: 12,
        mastery: 0,
        src: {
          title: c.title,
          definition: c.definition,
          misconception: c.misconception,
          example: c.example,
          equation: c.equation,
          transfer: c.transfer,
        },
        stages: arc(
          c.title,
          c.definition,
          c.misconception,
          c.example,
          c.equation,
          c.transfer,
          lang,
        ),
      })),
    };
    const next = [...customModules, mod];
    setCustomModules(next);
    try {
      localStorage.setItem("kyro_custom_modules", JSON.stringify(next));
    } catch {
      /* storage full or blocked — the module still works for this session */
    }
    if (openNow) {
      setModuleIndex(baseModules.length + customModules.length);
      setConceptIndex(0);
      setStageIndex(0);
      setPanel("classroom");
    }
    return mod;
  };
  const readOptions: ReadOptions = { vision: visionReader, onProgress: setReadMsg };
  const removeCustomModule = (slug: string) => {
    const next = customModules.filter((m) => m.slug !== slug);
    const removedIndex = baseModules.length + customModules.findIndex((m) => m.slug === slug);
    setCustomModules(next);
    try {
      localStorage.setItem("kyro_custom_modules", JSON.stringify(next));
    } catch {
      /* ignore */
    }
    if (moduleIndex >= removedIndex) {
      setModuleIndex(
        Math.max(
          0,
          Math.min(
            moduleIndex - (moduleIndex === removedIndex ? 0 : 1),
            baseModules.length + next.length - 1,
          ),
        ),
      );
      setConceptIndex(0);
      setStageIndex(0);
    }
  };
  const generateModule = async () => {
    if (!topic.trim() && !attachments.length) return;
    setGenerating(true);
    setGenError("");
    setMatNote("");
    try {
      const texts: string[] = [];
      const read: Section[] = [];
      visionProblem = "";
      for (const f of attachments) {
        const ex = await extractMaterial(f, readOptions); // text, scans, handwriting, figures
        texts.push(`[${f.name}]\n${ex.text.slice(0, 6000)}`);
        read.push(...ex.sections);
        await upload(f, ex); // also keep it in the library
      }
      let draft: DraftModule | null = null;
      let failure = t("err.buildModule");
      try {
        const r = await fetch("/api/generate-module", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            topic: topic.trim(),
            material: texts.join("\n\n").slice(0, 12000),
            language: lang,
          }),
        });
        const d = await r.json();
        if (r.ok) draft = d as DraftModule;
        else failure = d.message || failure;
      } catch {
        failure = t("err.noAi");
      }
      if (!draft) {
        if (!read.length) throw new Error(failure);
        // AI unavailable: still build a class straight from the learner's own sections.
        draft = buildModuleLocally(
          topic.trim() || attachments[0]?.name.replace(/\.[^.]+$/, "") || "My material",
          read,
        );
        draft.description += ` ${t("note.builtWithoutAi")}`;
        setMatNote(t("note.fallbackBuilt", { reason: failure }));
      }
      addCustomModule(draft, false);
      setTopic("");
      setAttachments([]);
    } catch (e) {
      setGenError(e instanceof Error ? e.message : t("err.generic"));
    }
    setGenerating(false);
  };
  const module = required(modules[moduleIndex] ?? modules[0], "module");
  const baseConcept = required(module.concepts[conceptIndex] ?? module.concepts[0], "concept");
  // the learner's own doubts (and the teacher's answers) are real turns of this class, kept with it
  const liveKey = `${module.slug}:${baseConcept.slug}`;
  const liveTurns = useLiveTurns(liveKey);
  // the full lesson (written by the AI as it would teach in a chat), woven into the class
  const deep = useDeepLesson(liveKey, lang);
  const deepSections = useMemo(
    () => (settings.lessonDepth === "full" && deep ? splitLesson(deep.markdown) : []),
    [deep, settings.lessonDepth],
  );
  const deepLive = useMemo(
    () =>
      deep && deepSections.length
        ? deepTurns(baseConcept.stages, deepSections, liveKey, deep.fromId)
        : [],
    [deep, deepSections, baseConcept, liveKey],
  );
  const [deepState, setDeepState] = useState<Record<string, "loading" | "failed">>({});
  // fetch the full lesson once per topic (the AI's own explanation, as in a chat); the class starts
  // straight away with the short version and the lesson is woven in from where the learner is
  useEffect(() => {
    if (panel !== "classroom" || settings.lessonDepth !== "full" || deep || deepState[liveKey])
      return;
    const key = liveKey;
    setDeepState((m) => ({ ...m, [key]: "loading" }));
    const rec = hld.rec;
    void fetch("/api/teach", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        topic: baseConcept.title,
        module: module.title,
        language: lang,
        ...(rec
          ? {
              notes: [
                ...rec.claims.map((c) => `- ${c.text}`),
                ...rec.misconceptions.map((m) => `- Misconception: ${m.wrong} → ${m.right}`),
              ]
                .join("\n")
                .slice(0, 7900),
            }
          : { material: groundFor(baseConcept.title).text.slice(0, 11900) }),
      }),
    })
      .then(async (r) => {
        const md = r.ok ? (await r.text()).trim() : "";
        if (md.length > 200) {
          // placed from where the learner is NOW (the lesson can take a while; never put it behind them)
          const L = latestRef.current;
          const baseIds = new Set(L.base.map((x) => x.id));
          let fromId: string | undefined;
          for (let i = L.index; i >= 0 && !fromId; i--)
            if (baseIds.has(L.stages[i]?.id)) fromId = L.stages[i]!.id;
          saveDeep({
            key,
            lang,
            markdown: md,
            createdAt: Date.now(),
            ...(fromId && L.key === key ? { fromId } : {}),
          });
          setDeepState((m) => {
            const n = { ...m };
            delete n[key];
            return n;
          });
        } else setDeepState((m) => ({ ...m, [key]: "failed" }));
      })
      .catch(() => setDeepState((m) => ({ ...m, [key]: "failed" })));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per topic and language
  }, [panel, liveKey, lang, settings.lessonDepth, deep]);
  const concept = useMemo(() => {
    let st = baseConcept.stages;
    if (deepLive.length) st = mergeLive(st, deepLive);
    if (liveTurns.length) st = mergeLive(st, liveTurns);
    return st === baseConcept.stages ? baseConcept : { ...baseConcept, stages: st };
  }, [baseConcept, deepLive, liveTurns]);
  const stage = required(concept.stages[stageIndex] ?? concept.stages[0], "lesson stage");
  // lecture mode: while the full lesson is being taught, the board shows it and the camera frames the teacher
  const lectureSec = stage.deep ? deepSections[stage.deep.section] : undefined;
  const latestRef = useRef({
    key: liveKey,
    stages: concept.stages,
    base: baseConcept.stages,
    index: stageIndex,
  });
  latestRef.current = {
    key: liveKey,
    stages: concept.stages,
    base: baseConcept.stages,
    index: stageIndex,
  };
  const lecture = !!lectureSec;
  const pointing = lecture && (stage.deep?.kind === "math" || stage.deep?.kind === "plot");
  // Keep the learner on the same turn when turns are woven in around them (a full lesson arriving, a doubt).
  // Only when the list changed while they stayed put — never when they are moving on: correcting a move
  // that happens in the same instant as a list change would undo the move and fight it forever.
  const posRef = useRef<{ id?: string | undefined; stages?: LessonStage[]; index: number }>({
    index: 0,
  });
  useEffect(() => {
    const p = posRef.current;
    if (p.stages && p.stages !== concept.stages && stageIndex === p.index && p.id) {
      const i = concept.stages.findIndex((x) => x.id === p.id);
      if (i >= 0 && i !== stageIndex) {
        posRef.current = { id: p.id, stages: concept.stages, index: i };
        setStageIndex(i);
        return;
      }
    }
    posRef.current = {
      id: concept.stages[stageIndex]?.id,
      stages: concept.stages,
      index: stageIndex,
    };
  }, [concept.stages, stageIndex]);
  // "Automatic" picks the classroom from the subject; otherwise the learner's choice in Settings wins
  const roomId: RoomId =
    settings.room === "auto" ? defaultRoomForModule(module.slug) : settings.room;
  const room = roomById(roomId);
  const lastStage = concept.stages.length - 1;
  const stageKind = assessKindOf(stage);
  const hld = useHld({
    panel,
    module,
    concept,
    stage,
    stageIndex,
    lastStage,
    setStageIndex,
    settings,
    scheduleCheck: (k, srs) => setSrsMap((m) => ({ ...m, [k]: srs })),
  });
  useEffect(() => {
    if (!pendingFocus) return;
    const i = concept.stages.findIndex((x) => x.id === pendingFocus);
    if (i >= 0) {
      setStageIndex(i);
      setPendingFocus(null);
    }
  }, [pendingFocus, concept.stages]);
  const totalPoints = points + hld.ledger;
  // speech signal (opt-in): the meter runs only while the learner dictates their teach-back
  const meterRef = useRef<Meter | null>(null);
  const responseRef = useRef("");
  responseRef.current = response;
  const [speechReport, setSpeechReport] = useState<GapReport | null>(null);
  // guided user journey (the demo): flags persist; steps complete themselves from real activity
  const [journey, setJourneyState] = useState<JourneyFlags>({
    on: false,
    setupSeen: false,
    verifiedSeen: false,
  });
  useEffect(() => setJourneyState(loadJourney()), []);
  const setJourney = (f: JourneyFlags) => {
    setJourneyState(f);
    saveJourney(f);
  };
  useEffect(() => {
    if (panel === "setup" && !journey.setupSeen) setJourney({ ...journey, setupSeen: true });
    if (panel === "knowledge" && !journey.verifiedSeen)
      setJourney({ ...journey, verifiedSeen: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- flags follow the visited panel
  }, [panel]);
  /** Topic Setup -> start: wait for the module list to contain the topic (live topics appear after verification). */
  const [pendingStart, setPendingStart] = useState<{ key: string; fresh: boolean } | null>(null);
  useEffect(() => {
    if (!pendingStart) return;
    const mi = modules.findIndex((m) => pendingStart.key.startsWith(`${m.slug}:`));
    const ci =
      modules[mi]?.concepts.findIndex(
        (c) => `${modules[mi]?.slug}:${c.slug}` === pendingStart.key,
      ) ?? -1;
    if (mi < 0 || ci < 0) return;
    if (pendingStart.fresh) hld.startSession(settings.dialogueMode, pendingStart.key);
    selectModule(mi, ci);
    setPanel("classroom");
    setPendingStart(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run when the target becomes available
  }, [pendingStart, modules]);
  const reference = useMemo(() => buildReference(concept.title, concept.stages), [concept]);
  const masteryOf = (m: Module, c: Concept) => masteryMap[`${m.slug}:${c.slug}`] ?? c.mastery;
  const selectModule = (i: number, ci = 0) => {
    const m = modules[i];
    setModuleIndex(i);
    setConceptIndex(ci);
    setStageIndex(0);
  };

  // ----- voice: one distinct voice per persona -----
  const voices = useVoices();
  const speechTag = langInfo(lang).speech;
  const assigned = useMemo(
    () =>
      pickVoices(
        voices,
        [room.teacher.voice, MAYA.voice, ARJUN.voice],
        lang === "en" ? undefined : speechTag,
      ),
    [voices, room, lang, speechTag],
  );
  // Only English is guaranteed to have a voice; for other languages narration is skipped (rather
  // than reading Hindi/Tamil/… with an English voice) when the device has no matching voice.
  const voiceAvailable = lang === "en" || assigned.some(Boolean);
  const cancelSpeakRef = useRef<(() => void) | null>(null);
  const stopSpeaking = () => {
    cancelSpeakRef.current?.();
    cancelSpeakRef.current = null;
    setSpeakingNow(false);
  };
  const say = (text: string, who: Speaker, onEnd?: () => void) => {
    stopSpeaking();
    if (!ttsSupported()) {
      setVoiceNote({
        target: "tts",
        text: t("voice.noTts"),
        error: true,
      });
      setPlaying(false);
      return;
    }
    if (!voiceAvailable) {
      setVoiceNote({
        target: "tts",
        text: t("lang.noVoice", { language: langInfo(lang).native }),
        error: true,
      });
      setPlaying(false);
      return;
    }
    setVoiceNote((n) => (n?.target === "tts" ? null : n));
    cancelSpeakRef.current = speakText(text, {
      ...(lang === "en" ? {} : { lang: speechTag }),
      profile: personaFor(room, who).voice,
      voice: assigned[who === "teacher" ? 0 : who === "maya" ? 1 : 2] ?? null,
      speed,
      onStart: () => setSpeakingNow(true),
      onEnd: () => {
        setSpeakingNow(false);
        cancelSpeakRef.current = null;
        onEnd?.();
      },
      onError: (message) => {
        setSpeakingNow(false);
        cancelSpeakRef.current = null;
        setVoiceNote({ target: "tts", text: message, error: true });
        setPlaying(false);
      },
    });
  };
  const live = useRef({ say, stopSpeaking });
  live.current = { say, stopSpeaking };

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setUser(s?.user ?? null));
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    // Saved progress for this browser (also used when signed out).
    try {
      const raw = localStorage.getItem(PROGRESS_KEY);
      if (raw) {
        const p = JSON.parse(raw) as {
          mastery?: unknown;
          attempts?: unknown;
          points?: unknown;
          srs?: unknown;
        };
        if (p.srs && typeof p.srs === "object") {
          const clean: Record<string, Srs> = {};
          for (const [k, v] of Object.entries(p.srs as Record<string, unknown>))
            if (isSrs(v)) clean[k] = v;
          setSrsMap(clean);
        }
        if (p.mastery && typeof p.mastery === "object") {
          const clean: Record<string, number> = {};
          for (const [k, v] of Object.entries(p.mastery as Record<string, unknown>))
            if (typeof v === "number" && v >= 0 && v <= 100) clean[k] = v;
          setMasteryMap(clean);
        }
        if (Array.isArray(p.attempts))
          setAttemptLog(
            (p.attempts as AttemptLog[]).filter(
              (a) => a && typeof a.key === "string" && typeof a.score === "number",
            ),
          );
        if (typeof p.points === "number" && p.points >= 0) setPoints(p.points);
      }
    } catch {
      /* ignore unreadable saved progress */
    }
    setProgressLoaded(true);
  }, []);
  useEffect(() => {
    if (!progressLoaded) return;
    try {
      localStorage.setItem(
        PROGRESS_KEY,
        JSON.stringify({
          mastery: masteryMap,
          attempts: attemptLog.slice(-400),
          srs: srsMap,
          points,
        }),
      );
    } catch {
      /* storage full or blocked — progress still works for this session */
    }
  }, [progressLoaded, masteryMap, attemptLog, srsMap, points]);
  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("points")
      .eq("id", user.id)
      .single()
      .then(({ data }) => setPoints((p) => Math.max(p, data?.points ?? 0)));
    supabase
      .from("concept_mastery")
      .select("module_slug,concept_slug,mastery_score")
      .eq("user_id", user.id)
      .then(({ data }) => {
        const rows: MasteryRow[] = data ?? [];
        if (rows.length)
          setMasteryMap((m) => ({
            ...m,
            ...Object.fromEntries(
              rows.map((r) => [`${r.module_slug}:${r.concept_slug}`, r.mastery_score]),
            ),
          }));
      });
  }, [user]);
  useEffect(() => {
    // Materials read on this device (kept in the browser, also used when signed out).
    try {
      const raw = localStorage.getItem(LOCAL_MATERIALS_KEY);
      const saved = raw ? (JSON.parse(raw) as Material[]) : [];
      const clean = saved
        .filter((m) => m && typeof m.id === "string" && typeof m.file_name === "string")
        .map((m) => ({ ...m, local: true, status: "ready", sections: toSections(m.sections) }));
      if (clean.length) setMaterials((prev) => [...clean, ...prev.filter((m) => !m.local)]);
    } catch {
      /* ignore unreadable saved materials */
    }
    setMaterialsLoaded(true);
  }, []);
  useEffect(() => {
    if (!materialsLoaded) return;
    try {
      localStorage.setItem(LOCAL_MATERIALS_KEY, JSON.stringify(materials.filter((m) => m.local)));
    } catch {
      setMatNote(t("err.storageFull"));
    }
  }, [materialsLoaded, materials]);
  useEffect(() => {
    if (!user) {
      setMaterials((m) => m.filter((x) => x.local));
      return;
    }
    supabase
      .from("learning_materials")
      .select(MATERIAL_COLUMNS)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        const rows: Material[] = (data ?? []).map((r) => ({
          id: r.id,
          title: r.title,
          file_name: r.file_name,
          status: r.status,
          page_count: r.page_count,
          extracted_summary: r.extracted_summary,
          storage_path: r.storage_path,
          sections: toSections(r.source_outline),
        }));
        setMaterials((prev) => [...prev.filter((m) => m.local), ...rows]);
      });
  }, [user]);
  // ----- language: load the interface dictionary and translate the current lesson -----
  const reasonFor = (status: number, message?: string) =>
    status === 401 ? t("lang.needAi") : (message ?? t("err.noAi"));
  useEffect(() => {
    const cached = hasBundle(lang) || loadCachedBundle(lang);
    const todo = cached ? englishToTranslate(lang) : englishToTranslate();
    if (cached && Object.keys(todo).length === 0) {
      setI18nNote("");
      return;
    }
    let cancelled = false;
    setTranslating(true);
    setI18nNote("");
    (async () => {
      const all = Object.entries(todo);
      const merged: Record<string, string> = {};
      try {
        for (let i = 0; i < all.length; i += 90) {
          const batch = Object.fromEntries(all.slice(i, i + 90));
          const r = await fetch("/api/translate-ui", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ language: lang, strings: batch }),
          });
          const d = (await r.json().catch(() => ({}))) as Record<string, unknown> & {
            message?: string;
          };
          if (!r.ok) throw new Error(reasonFor(r.status, d.message));
          Object.assign(merged, d);
        }
        if (!cancelled) setDynamicBundle(lang, merged);
      } catch (e) {
        if (!cancelled)
          setI18nNote(t("lang.uiFailed", { reason: e instanceof Error ? e.message : "" }));
      } finally {
        if (!cancelled) setTranslating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run when the language changes
  }, [lang]);
  const inflight = useRef(new Set<string>());
  useEffect(() => {
    const m = rawModules[moduleIndex];
    if (!m || (m.lang ?? "en") === lang) return;
    const key = txKey(lang, m.slug);
    if (lessonTx[key] || inflight.current.has(key)) return;
    inflight.current.add(key);
    setTranslating(true);
    (async () => {
      try {
        const r = await fetch("/api/translate-module", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            language: lang,
            sourceLanguage: m.lang ?? "en",
            module: moduleToTxSource(m),
          }),
        });
        const d = (await r.json().catch(() => ({}))) as { message?: string };
        if (!r.ok) throw new Error(reasonFor(r.status, d.message));
        const tx = validateModuleTx(d, m.concepts.length);
        if (!tx) throw new Error(t("err.noAi"));
        setLessonTx((all) => {
          const next = { ...all, [key]: tx };
          try {
            localStorage.setItem(LESSON_TX_KEY, JSON.stringify(next));
          } catch {
            /* ignore */
          }
          return next;
        });
        setI18nNote("");
      } catch (e) {
        setI18nNote(t("lang.translateFailed", { reason: e instanceof Error ? e.message : "" }));
      } finally {
        inflight.current.delete(key);
        setTranslating(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on language, module and cache
  }, [lang, moduleIndex, customModules, lessonTx]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LESSON_TX_KEY);
      if (raw) setLessonTx(JSON.parse(raw) as Record<string, ModuleTx>);
    } catch {
      /* ignore unreadable saved translations */
    }
  }, []);

  // Playback. With "Voice" on, the class is narrated and advances when each line has been spoken;
  // otherwise it advances on a timer. Either way it waits at turns that need YOUR answer, so the
  // lesson never moves on (and wipes your answer) while you are still typing or speaking.
  useEffect(() => {
    if (panel !== "classroom") return;
    let timer = 0;
    const waits = Boolean(stage.prompt);
    const advance = () => {
      if (stageIndex < lastStage) setStageIndex(stageIndex + 1);
      else setPlaying(false);
    };
    const text = stage.pending ? "" : stage.text;
    // a doubt's answer is read out when it has been written in full (see ask)
    if (voiceOn && text && stage.kind !== "doubt") {
      // each line is read once per visit: pausing or playing again must not read it a second time
      // (nor start a second hands-free conversation for the same question)
      const lineKey = `${module.slug}:${concept.slug}:${stage.id}`;
      if (spokenRef.current === lineKey) {
        if (playing && !waits && !hfOnRef.current && !speakingRef.current)
          timer = window.setTimeout(advance, 450);
        return () => window.clearTimeout(timer);
      }
      spokenRef.current = lineKey;
      live.current.say(text, stage.speaker, () => {
        if (hfOnRef.current) void afterLineRef.current?.(stage.id);
        else if (playingRef.current && !waits) timer = window.setTimeout(advance, 450);
      });
      // the next line's say() stops this one; leaving the class or turning the voice off stops it too
      return () => window.clearTimeout(timer);
    }
    if (!playing || waits) return;
    const words = text.split(/\s+/).filter(Boolean).length;
    // about 230 words a minute plus a short beat between lines; 1.5× / 2× in the toolbar speed it up
    timer = window.setTimeout(advance, Math.max(2000, (words / 3.8) * 1000 + 800) / speed);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stage and lastStage derive from the indices listed here
  }, [playing, voiceOn, stageIndex, conceptIndex, moduleIndex, roomId, panel, speed]);
  // pressing Play while a line is being read lets the class move on when it finishes
  const playingRef = useRef(playing);
  playingRef.current = playing;
  const spokenRef = useRef("");
  const speakingRef = useRef(false);
  speakingRef.current = speakingNow;
  // entering a class starts it playing (Settings → "Play the class automatically")
  useEffect(() => {
    if (panel === "classroom") setPlaying(settings.autoPlay);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when a class is opened
  }, [panel, conceptIndex, moduleIndex]);
  useEffect(() => {
    setShowHint(false);
    setCpConf(null);
    setResponse("");
    setAnswer("");
    setUsedSources(null);
    setResult(null);
    setResultMeta(null);
    setVoiceNote((n) => (n && n.target !== "topic" ? null : n));
    if (listening === "response" || listening === "question") stopDictation();
    // with Read aloud on, the playback effect reads the new line (and stopped the old one); otherwise a
    // replayed line stops when the learner moves on
    if (!voiceOn) live.current.stopSpeaking();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when the lesson position or room changes
  }, [stageIndex, conceptIndex, moduleIndex, roomId]);
  useEffect(
    () => () => {
      recToken.current++;
      recRef.current?.stop();
      cancelSpeech();
    },
    [],
  );
  useEffect(() => {
    if (panel !== "classroom") {
      live.current.stopSpeaking();
      if (listening === "response" || listening === "question") stopDictation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to leaving the classroom panel
  }, [panel]);

  const stageProgress = Math.round(((stageIndex + 1) / concept.stages.length) * 100);
  /** The passages of the learner's own material that are relevant to `query` (may be none). */
  const groundFor = (query: string) =>
    pickExcerpts(
      materials
        .filter((m) => m.sections?.length)
        .map((m) => ({ name: m.file_name, sections: m.sections ?? [] })),
      query,
      5000,
      4,
    );
  useEffect(() => {
    if (panel === "classroom" && stageIndex === lastStage && lastStage > 0) hld.finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the position changes
  }, [stageIndex, panel, conceptIndex, moduleIndex]);
  // when dictation ends, turn the loudness trace into the gap report (and doubts for pauses before key terms)
  useEffect(() => {
    if (listening !== null || !meterRef.current) return;
    const frames = meterRef.current.stop();
    meterRef.current = null;
    const rec = hld.rec;
    const answers = rec
      ? [...rec.blanks.map((b) => b.answer), ...rec.hints.flatMap((h) => h.accept)]
      : [];
    const terms = domainTerms(concept.title, answers);
    const text = responseRef.current;
    const report = gapReport(text, terms.slice(0, 8), analyseSpeech(frames, text, terms));
    setSpeechReport(report);
    if (report.signal.reliable) hld.voiceGaps(report.gapTerms);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run when dictation stops
  }, [listening]);
  useEffect(() => setSpeechReport(null), [stageIndex, conceptIndex, moduleIndex]);
  const speakerName =
    stage.speaker === "teacher"
      ? room.teacher.name
      : stage.speaker === "maya"
        ? t("speaker.student", { name: MAYA.name, role: t("role.maya") })
        : t("speaker.student", { name: ARJUN.name, role: t("role.arjun") });
  const bloom = (b: string) => (`bloom.${b}` in EN ? t(`bloom.${b}` as Key) : b);
  const speak = () => {
    if (speakingNow) stopSpeaking();
    else say(stage.text, stage.speaker);
  };
  const stageKeyRef = useRef("");
  stageKeyRef.current = `${module.slug}:${concept.slug}:${stageIndex}`;
  const bestRef = useRef<Record<string, number>>({});
  const submitAttempt = async () => {
    if (!stageKind || !response.trim() || assessing) return;
    stopDictation();
    const key = stageKeyRef.current;
    const text = response.trim();
    const kind = stageKind;
    setAssessing(true);
    let a: Assessment | null = null;
    try {
      const r = await fetch("/api/assess", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          language: lang,
          kind,
          response: text.slice(0, 4000),
          concept: concept.title,
          prompt: stage.prompt,
          reference: {
            definition: reference.definition,
            example: reference.example,
            misconception: reference.misconception,
            equation: reference.equation,
            transfer: reference.transfer,
          },
          source: groundFor(`${text} ${concept.title}`).text,
        }),
      });
      if (r.ok) a = parseAiAssessment(await r.json());
    } catch {
      /* offline or AI not configured — fall back to the built-in rubric below */
    }
    const graded = a ?? assessLocal({ kind, response: text, reference });
    const mkey = `${module.slug}:${concept.slug}`;
    const from = masteryOf(module, concept);
    const to = nextMastery(from, graded.score, kind);
    const prevBest = bestRef.current[key] ?? 0;
    const gain = Math.max(0, pointsFor(graded.score) - pointsFor(prevBest));
    bestRef.current[key] = Math.max(prevBest, graded.score);
    setMasteryMap((m) => ({ ...m, [mkey]: to }));
    setPoints((pt) => pt + gain);
    const when = nowMs();
    setAttemptLog((l) => [
      ...l.slice(-399),
      {
        key: mkey,
        kind,
        score: graded.score,
        at: when,
        ...(graded.gaps.length ? { gaps: graded.gaps.slice(0, 3) } : {}),
      },
    ]);
    const nextSrs = SRS_KINDS.includes(kind)
      ? scheduleNext(srsMap[mkey], graded.score, when)
      : srsMap[mkey];
    if (nextSrs && SRS_KINDS.includes(kind)) setSrsMap((m) => ({ ...m, [mkey]: nextSrs }));
    hld.assessed(kind, graded.score);
    if (stage.kind === "checkpoint")
      patchThinking(localStorage, thinkingKey(user?.id ?? localLearnerId(), liveKey), {
        scorePct: Math.round(graded.score),
        cpAt: when,
        ...(cpConf !== null ? { cpConf } : {}),
      });
    if (user) {
      const warn = (what: string) => (r: { error: { message: string } | null }) => {
        if (r.error) console.warn(`Could not save ${what}:`, r.error.message);
      };
      supabase
        .from("concept_mastery")
        .upsert(
          {
            user_id: user.id,
            module_slug: module.slug,
            concept_slug: concept.slug,
            bloom_level: concept.bloom.toLowerCase(),
            mastery_score: to,
            next_review_at: nextSrs ? new Date(nextSrs.due).toISOString() : nextReviewAt(to),
          },
          { onConflict: "user_id,module_slug,concept_slug" },
        )
        .then(warn("mastery"));
      supabase
        .from("assessment_attempts")
        .insert({
          user_id: user.id,
          concept_slug: concept.slug,
          assessment_type: dbAssessmentType(kind),
          response_text: text,
          score: graded.score,
          feedback: graded as unknown as Json,
        })
        .then(warn("attempt"));
      if (gain)
        supabase
          .from("profiles")
          .upsert({ id: user.id, points: points + gain })
          .then(warn("points"));
    }
    if (stageKeyRef.current === key) {
      setResult(graded);
      setResultMeta({ gain, from, to });
    }
    setAssessing(false);
  };
  /** Write an answer onto the stage a few characters at a time, so it reads like the teacher speaking. */
  const typeOut = (id: string, full: string) =>
    new Promise<void>((resolve) => {
      if (reducedMotion || full.length < 40) {
        patchLive(liveKey, id, { text: full, pending: false });
        resolve();
        return;
      }
      const step = Math.max(2, Math.ceil(full.length / 80));
      let n = 0;
      const tick = () => {
        n = Math.min(full.length, n + step);
        const done = n >= full.length;
        patchLive(liveKey, id, { text: full.slice(0, n), pending: false }, done);
        if (done) resolve();
        else window.setTimeout(tick, 30);
      };
      tick();
    });
  /** A doubt becomes a real turn of the class: it lands on the stage, the AI answers it with the conversation so far. */
  const ask = async (override?: { question: string; intent?: "again" | "example" }) => {
    const q = (override?.question ?? question).trim();
    if (!q || asking) return;
    stopDictation();
    resumeRef.current = playing;
    setPlaying(false);
    stopSpeaking();
    setAsking(true);
    if (!override) setQuestion("");
    // Search on what was actually asked; only borrow the concept title for very short follow-ups
    const grounding = groundFor(q.split(/\s+/).length < 4 ? `${q} ${concept.title}` : q);
    setUsedSources(materials.some((m) => m.sections?.length) ? grounding.used : null);
    // asked at a turn that still needs an answer (a blank, the checkpoint)? the doubt comes first and that turn waits
    const blocked = !canAdvance(stage, hld.sess).ok;
    const anchorIdx = blocked ? stageIndex - 1 : stageIndex;
    const anchorId = anchorIdx >= 0 ? (concept.stages[anchorIdx]?.id ?? "") : "__start__";
    const id = `doubt-${Date.now().toString(36)}`;
    addLive(liveKey, anchorId, {
      id,
      kind: "doubt",
      speaker: "teacher",
      label: "YOUR DOUBT",
      board: q.length > 40 ? `${q.slice(0, 39)}…` : q,
      asked: q,
      pending: true,
      text: "",
      prompt: "Did that clear it up?",
    });
    setPendingFocus(id);
    const history = (hld.sess.asked ?? []).slice(-6).map((h) => ({ q: h.q, a: h.a }));
    let reply = "";
    let viaNotes = false;
    try {
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          language: lang,
          question: q,
          ...(override?.intent ? { intent: override.intent } : {}),
          history,
          context: concept.stages
            .slice(0, Math.max(anchorIdx, 0) + 1)
            .filter((x) => x.kind !== "checkin" && x.text)
            .map((x) => `${x.speaker}: ${x.text}`)
            .join("\n"),
          source: grounding.text,
          notes: hld.rec ? hld.rec.claims.map((c) => `- ${c.text}`).join("\n") : "",
          teacher: room.teacher.name,
        }),
      });
      if (r.ok) reply = (await r.text()).trim();
    } catch {
      /* no connection: answered from the verified notes below */
    }
    if (!reply) {
      viaNotes = true;
      reply = answerInContext(
        q,
        hld.rec,
        concept.stages,
        Math.max(anchorIdx, 0),
        room.teacher.name,
        { history },
      ).text;
    }
    patchLive(liveKey, id, { viaNotes }, false);
    await typeOut(id, reply);
    hld.asked(q, reply);
    setAsking(false);
    if (hfOnRef.current) void hfAfterDoubt(id, reply);
    else if (settings.voiceOn) say(reply, "teacher");
    void addBridge(q, reply, anchorIdx);
  };
  /** A few turns later the teacher comes back to the doubt, tying the next point to it — the class is a conversation, not a fixed path. */
  const addBridge = async (q: string, a: string, anchorIdx: number) => {
    const ahead = concept.stages
      .slice(Math.max(anchorIdx, 0) + 1)
      .filter((x) => x.kind !== "doubt" && x.kind !== "bridge" && x.kind !== "checkin" && x.id);
    const target = ahead[1] ?? ahead[0];
    if (!target?.id) return;
    const next = (
      ahead.find((x) => x.speaker === "teacher" && x.kind !== "blank" && x.text) ?? target
    ).text;
    const short = q.length > 70 ? `${q.slice(0, 69)}…` : q;
    let text = "";
    try {
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: "bridge",
          language: lang,
          question: q,
          answer: a,
          next,
          context: "",
          teacher: room.teacher.name,
        }),
      });
      if (r.ok) text = (await r.text()).trim();
    } catch {
      /* the plain call-back below is used */
    }
    if (!text)
      text = `Back to your question — “${short}”. Keep it in mind: the next step connects straight to it.`;
    addLive(liveKey, target.id, {
      id: `bridge-${Date.now().toString(36)}`,
      kind: "bridge",
      speaker: "teacher",
      label: "BACK TO YOUR QUESTION",
      board: short,
      asked: q,
      text,
    });
  };
  const upload = async (file: File, pre?: Extracted): Promise<Material | null> => {
    setMatError("");
    setUploading(true);
    if (!pre) visionProblem = "";
    try {
      const ex = pre ?? (await extractMaterial(file, readOptions));
      const base = {
        title: file.name.replace(/\.[^.]+$/, ""),
        file_name: file.name,
        page_count: ex.pages,
        extracted_summary: summarise(ex.sections.map((s) => s.text).join(" ")),
      };
      let saved: Material | null = null;
      if (user) {
        const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
        const path = `${user.id}/${crypto.randomUUID()}-${safe}`;
        const { error } = await supabase.storage.from("learning-materials").upload(path, file);
        if (!error) {
          const { data, error: insErr } = await supabase
            .from("learning_materials")
            .insert({
              user_id: user.id,
              ...base,
              file_type: file.type || "application/octet-stream",
              storage_path: path,
              status: "ready",
              source_outline: ex.sections as unknown as Json,
            })
            .select(MATERIAL_COLUMNS)
            .single();
          if (data && !insErr)
            saved = { ...data, source_outline: undefined, sections: ex.sections } as Material;
        }
        if (!saved) setMatNote(t("err.saveAccount"));
      }
      saved ??= {
        id: `local-${crypto.randomUUID()}`,
        ...base,
        status: "ready",
        storage_path: "",
        sections: ex.sections,
        local: true,
      };
      const result = saved;
      setMaterials((m) => [result, ...m]);
      if (ex.note || visionProblem) setMatNote([ex.note, visionProblem].filter(Boolean).join(" "));
      return result;
    } catch (e) {
      setMatError(
        e instanceof MaterialError
          ? [e.message, visionProblem].filter(Boolean).join(" ")
          : t("err.readFile"),
      );
      return null;
    } finally {
      setUploading(false);
      setReadMsg("");
    }
  };
  const uploadMany = async (files: FileList | File[] | null | undefined) => {
    for (const f of Array.from(files ?? [])) await upload(f);
  };
  const removeMaterial = async (m: Material) => {
    setMaterials((all) => all.filter((x) => x.id !== m.id));
    if (!m.local && user) {
      await supabase.from("learning_materials").delete().eq("id", m.id);
      if (m.storage_path)
        await supabase.storage.from("learning-materials").remove([m.storage_path]);
    }
  };
  const buildClass = async (m: Material) => {
    const sections = m.sections ?? [];
    setMatError("");
    setMatNote("");
    if (!sections.length) {
      setMatError(t("err.noSavedText"));
      return;
    }
    setBuildingId(m.id);
    let draft: DraftModule | null = null;
    let aiNote = "";
    try {
      const r = await fetch("/api/generate-module", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          language: lang,
          topic: m.title,
          material: sections
            .map((s) => `[${s.ref}] ${s.title}\n${s.text}`)
            .join("\n\n")
            .slice(0, 12000),
        }),
      });
      const d = await r.json();
      if (r.ok && Array.isArray(d.concepts) && d.concepts.length >= 2) draft = d as DraftModule;
      else aiNote = d?.message || "";
    } catch {
      aiNote = t("err.noAi");
    }
    if (!draft) {
      try {
        draft = buildModuleLocally(m.title, sections);
        draft.description += ` ${t("note.builtWithoutAi")}`;
        setMatNote(t("note.builtLocal", { reason: aiNote || t("note.aiUnavailable") }));
      } catch (e) {
        setMatError(e instanceof MaterialError ? e.message : t("err.buildClass"));
        setBuildingId(null);
        return;
      }
    }
    addCustomModule(draft, true);
    setBuildingId(null);
  };
  const google = async () => {
    await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
  };
  const heroMove = (e: ReactMouseEvent<HTMLButtonElement>) => {
    const el = heroRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--x", `${e.clientX - r.left}px`);
    el.style.setProperty("--y", `${e.clientY - r.top}px`);
  };
  const openConcept = (mi: number, ci: number) => {
    selectModule(mi, ci);
    setPanel("classroom");
  };
  /** The learner's answer box (prompt, answer, mic, hint, assessment). Shown as a pop-up over the
   *  classroom or, when pop-ups are off or dismissed, in the side panel. */
  const promptBox = (variant: "popup" | "side") => (
    <div className={`transcript-response ${variant === "popup" ? "in-popup" : ""}`}>
      <small>{t(stageKind ? (`kind.${stageKind}` as Key) : "kind.default")}</small>
      <p>{stage.prompt}</p>
      <Textarea
        autoFocus={variant === "popup"}
        value={response}
        onChange={(e) => setResponse(e.target.value)}
        disabled={assessing}
        placeholder={
          listening === "response" ? t("resp.placeholderListening") : t("resp.placeholder")
        }
      />
      {showHint && <p className="feedback-text">{stage.hint ?? t("resp.hintDefault")}</p>}
      {stage.kind === "checkpoint" && (
        <div
          className="conf-row"
          role="radiogroup"
          aria-label="How sure are you about your answer?"
        >
          <span>How sure are you about your answer?</span>
          {CONFIDENCE.map((c, i) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={cpConf === i}
              className={`chip ${cpConf === i ? "primary" : ""}`}
              onClick={() => setCpConf(i)}
            >
              {c}
            </button>
          ))}
        </div>
      )}
      {stage.kind === "teachback" && (
        <SpeechReportCard report={speechReport} optedIn={settings.speechCapture} />
      )}
      {voiceNote?.target === "response" && (
        <p className={`voice-note ${voiceNote.error ? "error" : ""}`} role="status">
          {voiceNote.text}
        </p>
      )}
      <div className="response-actions">
        <Button variant="ghost" onClick={() => setShowHint((h) => !h)} aria-expanded={showHint}>
          <HelpCircle /> {t("ui.hint")}
        </Button>
        <Button
          variant="outline"
          size="icon"
          className={listening === "response" ? "listening" : ""}
          aria-label={listening === "response" ? t("aria.stopDictation") : t("aria.speakAnswer")}
          aria-pressed={listening === "response"}
          disabled={assessing}
          onClick={() => dictate("response")}
        >
          {listening === "response" ? <MicOff /> : <Mic />}
        </Button>
        <Button onClick={submitAttempt} disabled={!response.trim() || assessing}>
          {assessing ? t("resp.assessing") : result ? t("resp.reassess") : t("resp.commit")}
        </Button>
      </div>
      {result && (
        <div
          className={`assessment ${
            result.label === "Strong"
              ? "strong"
              : result.label === "Developing"
                ? "developing"
                : "weak"
          }`}
          role="status"
          aria-live="polite"
        >
          <div className="assessment-head">
            <strong>{t(`label.${result.label}` as Key)}</strong>
            <b>{result.score}%</b>
          </div>
          <Progress value={result.score} />
          {result.strengths.length > 0 && (
            <ul className="assessment-good">
              {result.strengths.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          )}
          {result.gaps.length > 0 && (
            <ul className="assessment-gaps">
              {result.gaps.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          )}
          <p className="assessment-next">{result.next}</p>
          <small className="assessment-meta">
            {resultMeta ? t("assess.mastery", { from: resultMeta.from, to: resultMeta.to }) : ""}
            {resultMeta && resultMeta.gain > 0
              ? ` · ${t("assess.points", { n: resultMeta.gain })}`
              : ""}
            {" · "}
            {result.method === "ai" ? t("assess.byAi") : t("assess.rubric")}
          </small>
          <div className="assessment-actions">
            <Button variant="ghost" onClick={() => setResult(null)}>
              {t("ui.revise")}
            </Button>
            {stageIndex < lastStage && (
              <Button onClick={continueClass}>
                {t("ui.continue")} <ArrowRight />
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
  const nextTurn = () => setStageIndex((i) => Math.min(lastStage, i + 1));
  /** After the learner answers something, the class simply carries on (when it plays by itself). */
  const continueClass = () => {
    nextTurn();
    if (settings.autoPlay) setPlaying(true);
  };
  const flash = (text: string) => setKbdToast((t) => ({ text, n: (t?.n ?? 0) + 1 }));
  const toggleVoice = () => {
    if (voiceOn) {
      stopSpeaking();
      updateSetting({ voiceOn: false, handsFree: false });
    } else {
      updateSetting({ voiceOn: true });
      if (!stage.pending && stage.text) say(stage.text, stage.speaker);
    }
  };
  const goNext = () => {
    if (!hld.gate.ok) {
      flash(hld.gate.reason === "blank" ? "Fill the blank first" : "Answer the checkpoint first");
      return;
    }
    if (stageIndex >= lastStage) return flash("End of the class");
    setStageIndex(stageIndex + 1);
  };
  const jumpDoubt = (dir: 1 | -1) => {
    const idx = concept.stages.map((x, i) => (x.kind === "doubt" ? i : -1)).filter((i) => i >= 0);
    const target =
      dir > 0 ? idx.find((i) => i > stageIndex) : [...idx].reverse().find((i) => i < stageIndex);
    if (target === undefined) return flash(dir > 0 ? "No later doubt" : "No earlier doubt");
    // never jump forward over a turn that still needs an answer
    for (let i = stageIndex; i < target; i++)
      if (!canAdvance(concept.stages[i]!, hld.sess).ok) return flash("Answer this turn first");
    setStageIndex(target);
    flash(dir > 0 ? "Next doubt" : "Previous doubt");
  };
  keysRef.current = (e) => {
    const el = e.target as HTMLElement | null;
    const onControl = !!el?.closest?.(
      "button, a, [role=button], [role=radio], [role=switch], summary",
    );
    const k = e.key;
    if ((k === " " && !onControl) || k === "k" || k === "K") {
      setPlaying((p) => !p);
      flash(playing ? "Paused" : "Playing");
      return true;
    }
    if (k === "ArrowRight" && e.shiftKey) return (jumpDoubt(1), true);
    if (k === "ArrowLeft" && e.shiftKey) return (jumpDoubt(-1), true);
    if (k === "ArrowRight" || k === "l" || k === "L") return (goNext(), true);
    if (k === "ArrowLeft" || k === "j" || k === "J") {
      if (stageIndex > 0) setStageIndex(stageIndex - 1);
      return true;
    }
    if (k === "h" || k === "H") {
      flash(settings.handsFree ? "Hands-free off" : "Hands-free on");
      updateSetting(settings.handsFree ? { handsFree: false } : { handsFree: true, voiceOn: true });
      return true;
    }
    if (k === "m" || k === "M") {
      flash(voiceOn ? "Read aloud off" : "Read aloud on");
      toggleVoice();
      return true;
    }
    if (k === "r" || k === "R") {
      spokenRef.current = "";
      if (stage.text) say(stage.text, stage.speaker);
      flash("Replaying line");
      return true;
    }
    if (k === "/") {
      document.querySelector<HTMLTextAreaElement>(".ask-field textarea")?.focus();
      return true;
    }
    if (k === "?") {
      setShortcutsOpen((o) => !o);
      return true;
    }
    if (k === "Home" || k === "0") {
      setStageIndex(0);
      flash("Back to the start");
      return true;
    }
    return false;
  };

  // ---------------- hands-free class: the teacher asks out loud, the learner answers out loud ----------------
  // It drives the same cards a learner would tap (so every rule — gating, scoring, doubts — still applies),
  // listens only while the teacher is silent (so it never hears itself), and stops whenever the class moves.
  const hfOn = settings.handsFree && sttSupported() && ttsSupported() && panel === "classroom";
  const hfOnRef = useRef(hfOn);
  hfOnRef.current = hfOn;
  const [hf, setHf] = useState<{
    state: "idle" | "listening" | "speaking" | "working";
    heard: string;
  }>({ state: "idle", heard: "" });
  const hfListen = useRef<Listen | null>(null);
  const hfToken = useRef(0);
  const hfApi = useRef({ stage, playing, goNext, continueClass, ask, lastStage, stageIndex });
  hfApi.current = { stage, playing, goNext, continueClass, ask, lastStage, stageIndex };
  const afterLineRef = useRef<((id?: string) => Promise<void>) | null>(null);
  /** the turn the voice controller is handling (only one conversation per turn) */
  const hfBusy = useRef<string | null>(null);
  useEffect(() => {
    if (hfOn && !voiceOn) updateSetting({ voiceOn: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hands-free needs the voice
  }, [hfOn, voiceOn]);
  useEffect(() => {
    hfToken.current++;
    hfBusy.current = null;
    hfListen.current?.stop();
    hfListen.current = null;
    setHf({ state: "idle", heard: "" });
  }, [stageIndex, conceptIndex, moduleIndex, panel, hfOn]);
  const wait = (ms: number) => new Promise((r) => window.setTimeout(r, ms));
  const q$ = (sel: string) => document.querySelector(sel) as HTMLElement | null;
  const btnIn = (sel: string, re: RegExp) =>
    [...document.querySelectorAll<HTMLElement>(`${sel} button`)].find(
      (b) => re.test(b.textContent ?? "") || re.test(b.getAttribute("aria-label") ?? ""),
    );
  const typeInto = (sel: string, value: string) => {
    const el = document.querySelector(sel) as HTMLInputElement | HTMLTextAreaElement | null;
    if (!el) return false;
    const proto =
      el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  };
  const waitFor = async (ok: () => boolean, ms: number) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (ok()) return true;
      await wait(150);
    }
    return false;
  };
  const hfSay = (text: string) =>
    new Promise<void>((res) => {
      hfListen.current?.stop();
      const t = text.replace(/\s+/g, " ").trim();
      if (!t) return res();
      setHf({ state: "speaking", heard: "" });
      let done = false;
      const end = () => {
        if (!done) {
          done = true;
          res();
        }
      };
      say(t, "teacher", end);
      window.setTimeout(end, Math.max(5000, t.length * 110)); // never hang if the voice fails
    });
  /** Listen for one answer. null = the class moved on meanwhile (stop whatever was going on). */
  const hfHear = async (o: { silenceMs?: number; maxMs?: number; startMs?: number }) => {
    hfListen.current?.stop();
    const tok = hfToken.current;
    setHf({ state: "listening", heard: "" });
    const l = listenOnce({
      ...o,
      lang: lang === "en" ? "en-IN" : speechTag,
      onWords: (w) => setHf({ state: "listening", heard: w }),
    });
    hfListen.current = l;
    const said = await l.promise;
    if (tok !== hfToken.current || !hfOnRef.current) return null;
    setHf({ state: "working", heard: said });
    return said;
  };
  const alive = (tok: number) => tok === hfToken.current && hfOnRef.current;
  /** Spoken commands. Returns true when the words were a command (or a doubt) and have been handled. */
  const hfCommand = async (said: string, again?: () => void): Promise<boolean> => {
    const c = parseCommand(said);
    if (!c) return false;
    const A = hfApi.current;
    switch (c.kind) {
      case "pause":
        setPlaying(false);
        await hfSay("Paused. Say “continue” when you're ready.");
        void hfIdle();
        return true;
      case "resume":
        setPlaying(true);
        if (!A.stage.prompt) A.goNext();
        return true;
      case "next":
      case "skip":
        if (A.stage.prompt) A.continueClass();
        else A.goNext();
        return true;
      case "back":
        setStageIndex((i) => Math.max(0, i - 1));
        return true;
      case "repeat":
        if (again) again();
        else if (A.stage.text) {
          await hfSay(A.stage.text);
          hfBusy.current = null;
          void afterLineRef.current?.(A.stage.id);
        }
        return true;
      case "slower":
      case "faster": {
        const steps = [1, 1.5, 2] as const;
        const i = steps.indexOf(settings.speed);
        const n = steps[Math.max(0, Math.min(2, i + (c.kind === "faster" ? 1 : -1)))]!;
        updateSetting({ speed: n });
        await hfSay(c.kind === "faster" ? "Okay, a little faster." : "Okay, I'll slow down.");
        again?.();
        return true;
      }
      case "stop-hands-free":
        updateSetting({ handsFree: false });
        say("Hands-free is off. You can use the screen again.", "teacher");
        return true;
      case "doubt": {
        let q = c.question;
        if (q.split(" ").length < 3) {
          await hfSay("Go ahead — what's your question?");
          q = (await hfHear({ silenceMs: 2000, startMs: 12000, maxMs: 60000 })) ?? "";
        }
        if (q.trim()) void A.ask({ question: q });
        return true;
      }
    }
  };
  /** Paused: keep listening for "continue" (or a doubt) without moving the class. */
  const hfIdle = async () => {
    for (let n = 0; n < 30; n++) {
      const said = await hfHear({ startMs: 20000, silenceMs: 1500, maxMs: 30000 });
      if (said === null || hfApi.current.playing) return;
      if (said && (await hfCommand(said))) return;
    }
  };
  const fb = (sel: string) =>
    (q$(sel)?.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
  /** A turn that needs the learner: ask it out loud, take the spoken answer, read the result, carry on. */
  const hfAnswer = async (st: LessonStage) => {
    const tok = hfToken.current;
    const again = () => void hfAnswer(st);
    if (st.kind === "mcq" && st.mcq) {
      const q = st.mcq;
      const letters = q.qkind !== "truefalse";
      await hfSay(
        `${q.prompt} ${(q.context ?? "").replace(/_{3,}/g, "blank")} ${speakOptions(q.options, letters)}. Which one?`,
      );
      for (let t = 0; t < 3 && alive(tok); t++) {
        const said = await hfHear({ silenceMs: 1300, startMs: 10000, maxMs: 20000 });
        if (said === null) return;
        if (said && (await hfCommand(said, again))) return;
        const i = parseChoice(said, q.options, letters);
        if (i >= 0) {
          document.querySelectorAll<HTMLElement>("[data-card=mcq] .option")[i]?.click();
          await wait(150);
          btnIn("[data-card=mcq]", /Check answer/)?.click();
          await waitFor(() => !!q$("[data-card=mcq] .answer-feedback"), 4000);
          await hfSay(fb("[data-card=mcq] .answer-feedback"));
          if (alive(tok)) hfApi.current.continueClass();
          return;
        }
        await hfSay(
          said
            ? `Sorry, which one was that? Say ${letters ? "A, B, C or D" : "true or false"}.`
            : "Take your time — just say your answer.",
        );
      }
      return;
    }
    if (st.kind === "checkin") {
      let spoken = 0;
      for (let n = 0; n < 10 && alive(tok); n++) {
        // wait for the coach's NEXT line (or Continue) — not the card as it was before the answer was taken
        await waitFor(() => {
          const c = q$("[data-card=checkin]");
          if (!c) return true;
          if (c.querySelector(".bubble.typing")) return false;
          return (
            c.querySelectorAll(".bubble.coach p").length > spoken ||
            !!btnIn("[data-card=checkin]", /Continue/)
          );
        }, 8000);
        const card = q$("[data-card=checkin]");
        if (!card) return;
        const coach = [...card.querySelectorAll(".bubble.coach p")].map((p) => p.textContent ?? "");
        const fresh = coach.slice(spoken).join(" ");
        spoken = coach.length;
        const cont = btnIn("[data-card=checkin]", /Continue/);
        if (cont) {
          if (fresh) await hfSay(fresh);
          cont.click();
          return;
        }
        const chips = [...card.querySelectorAll<HTMLElement>(".chip")];
        const labels = chips.map((c) => c.textContent ?? "");
        if (!fresh && !labels.length && !q$("[data-card=checkin] .chip-input")) continue; // nothing to ask yet
        await hfSay(`${fresh}${labels.length ? ` You can say: ${labels.join(", or ")}.` : ""}`);
        const said = await hfHear({ silenceMs: 1400, startMs: 10000, maxMs: 25000 });
        if (said === null) return;
        if (!said) {
          spoken = Math.max(0, spoken - 1); // nothing heard: ask the same question again
          continue;
        }
        if (/\bskip\b/i.test(said)) {
          (card.querySelector(".skip-link") as HTMLElement | null)?.click();
          continue;
        }
        if (q$("[data-card=checkin] .chip-input input")) {
          typeInto("[data-card=checkin] .chip-input input", said);
          await wait(80);
          (card.querySelector(".chip-input button[type=submit]") as HTMLElement | null)?.click();
          continue;
        }
        const i = parseChoice(said, labels, false);
        if (i >= 0) chips[i]!.click();
        else {
          spoken = Math.max(0, spoken - 1); // ask the same question again
          await hfSay("Sorry, I didn't catch that.");
        }
      }
      return;
    }
    if (st.kind === "blank" && st.blank) {
      await hfSay(`Fill in the blank: ${st.blank.before} … blank … ${st.blank.after}`);
      for (let t = 0; t < 3 && alive(tok); t++) {
        const said = await hfHear({ silenceMs: 1300, startMs: 12000, maxMs: 20000 });
        if (said === null) return;
        if (said && (await hfCommand(said, again))) return;
        if (!said) {
          await hfSay("Have a go — say the missing word.");
          continue;
        }
        typeInto("[data-card=blank] .blank-input", said);
        await wait(80);
        (
          q$("[data-card=blank] .response-actions button:last-child") as HTMLElement | null
        )?.click();
        await waitFor(() => !!q$("[data-card=blank] .blank-result"), 3000);
        await hfSay(fb("[data-card=blank] .blank-result"));
        if (alive(tok)) btnIn("[data-card=blank]", /Continue/)?.click();
        return;
      }
      return;
    }
    if ((st.kind === "hint" || st.kind === "recall") && st.hintCard) {
      await hfSay(`${st.hintCard.question} Have a guess first — then I'll tell you.`);
      for (let t = 0; t < 3 && alive(tok); t++) {
        const said = await hfHear({ silenceMs: 1800, startMs: 12000, maxMs: 40000 });
        if (said === null) return;
        if (/\b(hint|clue|nudge)\b/i.test(said)) {
          await hfSay(`Here's a nudge: ${st.hintCard.hint}`);
          continue;
        }
        if (said && (await hfCommand(said, again))) return;
        if (!said) {
          await hfSay("Any guess is fine — say what you think.");
          continue;
        }
        typeInto("[data-card=hint] textarea", said);
        await wait(80);
        btnIn("[data-card=hint]", /Commit guess/)?.click();
        await wait(250);
        (q$("[data-card=hint] button[aria-label='Reveal answer']") as HTMLElement | null)?.click();
        await waitFor(() => !!q$("[data-card=hint] .answer-feedback"), 3000);
        await hfSay(fb("[data-card=hint] .answer-feedback"));
        if (alive(tok)) btnIn("[data-card=hint]", /Continue/)?.click();
        return;
      }
      return;
    }
    // a question that wants a spoken explanation (checkpoint, teach-back, transfer…)
    if (st.prompt) {
      await hfSay(
        `${st.prompt}${st.kind === "teachback" ? " Take your time and speak when you're ready." : ""}`,
      );
      for (let t = 0; t < 2 && alive(tok); t++) {
        const said = await hfHear({ silenceMs: 2600, startMs: 15000, maxMs: 120000 });
        if (said === null) return;
        if (/^\s*(hint|give me a hint|clue)\b/i.test(said)) {
          await hfSay(st.hint ?? "Think about the main idea and the example from the class.");
          continue;
        }
        if (said && said.split(" ").length <= 4 && (await hfCommand(said, again))) return;
        if (!said) {
          await hfSay("I didn't hear an answer. Try again, or say skip.");
          continue;
        }
        typeInto(".transcript-response textarea", said);
        await wait(120);
        if (q$(".transcript-response .conf-row")) {
          await hfSay("Before I mark it: how sure are you — guessing, fairly sure, or certain?");
          const sure = await hfHear({ silenceMs: 1300, startMs: 10000, maxMs: 20000 });
          if (sure === null) return;
          const ci = parseChoice(sure, [...CONFIDENCE], false);
          if (ci >= 0)
            document
              .querySelectorAll<HTMLElement>(".transcript-response .conf-row .chip")
              [ci]?.click();
          await wait(120);
        }
        btnIn(".transcript-response .response-actions", /Commit|Submit|Check/)?.click();
        await waitFor(() => !!q$(".transcript-response .assessment"), 45000);
        await hfSay(
          fb(".transcript-response .assessment-head") || fb(".transcript-response .assessment"),
        );
        if (alive(tok)) btnIn(".transcript-response .assessment-actions", /Continue/)?.click();
        return;
      }
    }
  };
  /** After a doubt is answered on the stage: read it, then ask whether it helped. */
  const hfAfterDoubt = async (id: string, reply: string) => {
    await hfSay(reply);
    if (hfApi.current.stage.id !== id || !hfOnRef.current) return;
    await hfSay("Did that clear it up?");
    const said = await hfHear({ silenceMs: 1400, startMs: 10000, maxMs: 30000 });
    if (said === null) return;
    const r = parseDoubtReply(said ?? "");
    if (r === "again") btnIn("[data-card=doubt]", /Not clear/)?.click();
    else if (r === "example") btnIn("[data-card=doubt]", /example/i)?.click();
    else if (said && r === null && (await hfCommand(said))) return;
    else btnIn("[data-card=doubt]", /Got it/)?.click();
  };
  /** After each spoken line: a turn that needs an answer is asked; otherwise a moment to raise your hand. */
  afterLineRef.current = async (id?: string) => {
    const A = hfApi.current;
    if (!hfOnRef.current || A.stage.id !== id || hfBusy.current === id) return;
    hfBusy.current = id ?? null;
    if (A.stage.prompt && A.stage.kind !== "doubt") return hfAnswer(A.stage);
    const said = await hfHear({ startMs: 1300, silenceMs: 1500, maxMs: 30000 });
    if (said === null) return;
    if (said && (await hfCommand(said))) return;
    if (hfApi.current.playing) {
      if (hfApi.current.stageIndex < hfApi.current.lastStage)
        setStageIndex(hfApi.current.stageIndex + 1);
      else setPlaying(false);
    } else void hfIdle();
  };
  const answerBox = (variant: "popup" | "side") => {
    if (stage.kind === "blank" && stage.blank)
      return (
        <BlankCard
          key={stage.id}
          stage={stage}
          sess={hld.sess}
          popup={variant === "popup"}
          canContinue={stageIndex < lastStage}
          onFill={(v) => void hld.blank(v)}
          onContinue={continueClass}
        />
      );
    if (stage.kind === "checkin" && stage.checkin) {
      const tk = thinkingKey(user?.id ?? localLearnerId(), liveKey);
      const cpId = concept.stages.find((x) => x.kind === "checkpoint")?.id;
      const cp = cpId ? hld.sess.checkpoints[cpId] : undefined;
      return (
        <CheckinCard
          key={stage.id}
          stage={stage}
          topic={concept.title}
          popup={variant === "popup"}
          log={loadThinking(localStorage, tk)}
          {...(cp ? { score: Math.round(cp.score) } : {})}
          shakyOptions={[
            "The main idea",
            "The example",
            hld.rec?.equation ? "The formula" : "Why it happens",
          ]}
          onSave={(patch) => {
            patchThinking(localStorage, tk, patch);
            setThinkTick((n) => n + 1);
          }}
          onDoubt={(text) => void ask({ question: text })}
          onPractise={() => openReview()}
          onNextTopic={() => {
            if (conceptIndex < module.concepts.length - 1) {
              setConceptIndex(conceptIndex + 1);
              setStageIndex(0);
            } else openReview();
          }}
          onDone={continueClass}
        />
      );
    }
    if (stage.kind === "doubt")
      return (
        <DoubtCard
          key={stage.id}
          stage={stage}
          onGotIt={continueClass}
          onAgain={() =>
            void ask({
              question: "I didn't get that — can you explain it differently?",
              intent: "again",
            })
          }
          onExample={() => void ask({ question: "Can you show me an example?", intent: "example" })}
        />
      );
    if (stage.kind === "mcq" && stage.mcq)
      return (
        <McqCard
          key={stage.id}
          stage={stage}
          sess={hld.sess}
          popup={variant === "popup"}
          onAnswer={(i) => void hld.mcq(i)}
          onContinue={continueClass}
        />
      );
    if ((stage.kind === "hint" || stage.kind === "recall") && stage.hintCard)
      return (
        <HintCard
          key={stage.id}
          stage={stage}
          sess={hld.sess}
          popup={variant === "popup"}
          onGuess={hld.guess}
          onReveal={() => void hld.reveal()}
          onContinue={continueClass}
        />
      );
    return promptBox(variant);
  };
  const popupKey = `${module.slug}:${concept.slug}:${stageIndex}`;
  // Prior-knowledge turns no longer appear in new lessons, but custom modules saved before they were
  // removed keep their stages verbatim in localStorage, so one can still turn up at the start of an old
  // lesson. It must not take over the screen there: nothing has been taught yet. (A doubt's answer is
  // read on the stage itself, so it never pops up either.)
  const NO_POPUP_KINDS: LessonStage["kind"][] = ["question", "doubt"];
  const popupOpen =
    settings.popupQuestions &&
    Boolean(stage.prompt) &&
    !NO_POPUP_KINDS.includes(stage.kind) &&
    popupDismissed !== popupKey;
  // A pop-up question takes over the screen, so the class stops behind it rather than carrying on unseen:
  // playback pauses (the Play button shows what is happening) and the room holds still. With Read aloud
  // on, the question's own line is still read out — the class continues by itself after the answer.
  useEffect(() => {
    if (popupOpen) setPlaying(false);
  }, [popupOpen]);

  // ----- Review & retention -----
  const reviewPool = useMemo<ConceptRef[]>(
    () =>
      modules.flatMap((m) =>
        m.concepts.map((c) => ({ moduleSlug: m.slug, moduleTitle: m.title, concept: c })),
      ),
    [modules],
  );
  const masteryOfRef = (r: ConceptRef) => masteryMap[refKey(r)] ?? r.concept.mastery;
  const openReview = (mode?: Mode, conceptKey?: string) => {
    setPanel("review");
    if (mode) setReviewStart({ mode, ...(conceptKey ? { conceptKey } : {}), nonce: Date.now() });
    else setReviewStart(null);
  };
  /** Grade a free-text recall answer: AI when available, the built-in rubric otherwise. */
  const gradeRecall = async (q: Question, text: string) => {
    const ref = q.reference;
    if (!ref) return { score: 0, feedback: [] as string[] };
    let a: Assessment | null = null;
    try {
      const r = await fetch("/api/assess", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          language: lang,
          kind: "checkpoint",
          response: text.slice(0, 4000),
          concept: q.conceptTitle,
          prompt: q.prompt,
          reference: {
            definition: ref.definition,
            example: ref.example,
            misconception: ref.misconception,
            equation: ref.equation,
            transfer: ref.transfer,
          },
          source: "",
        }),
      });
      if (r.ok) a = parseAiAssessment(await r.json());
    } catch {
      /* offline: built-in rubric */
    }
    const g = a ?? assessLocal({ kind: "checkpoint", response: text, reference: ref });
    return { score: g.score, feedback: [...g.strengths.slice(0, 1), ...g.gaps.slice(0, 2)] };
  };
  /** Apply a finished quiz: mastery, spaced-review schedule, points, activity log, cloud save. */
  const completeReview = (questions: Question[], answers: Answer[]): SessionDone => {
    const sum = summariseQuiz(questions, answers);
    const when = nowMs();
    const outcomes: ConceptOutcome[] = [];
    const nextMasteries: Record<string, number> = {};
    const nextSrsMap: Record<string, Srs> = {};
    const logs: AttemptLog[] = [];
    for (const c of sum.byConcept) {
      const ref = reviewPool.find((p) => refKey(p) === c.conceptKey);
      if (!ref) continue;
      const from = masteryOfRef(ref);
      const to = nextMastery(from, c.score, "retention");
      const sched = scheduleNext(srsMap[c.conceptKey], c.score, when);
      nextMasteries[c.conceptKey] = to;
      nextSrsMap[c.conceptKey] = sched;
      const missed = questions.filter(
        (q) =>
          q.conceptKey === c.conceptKey && !answers.find((a) => a.questionId === q.id)?.correct,
      );
      logs.push({
        key: c.conceptKey,
        kind: "retention",
        score: c.score,
        at: when,
        ...(missed.length
          ? { gaps: [...new Set(missed.map((q) => q.explanation.slice(0, 180)))].slice(0, 2) }
          : {}),
      });
      outcomes.push({
        conceptKey: c.conceptKey,
        title: c.conceptTitle,
        from,
        to,
        nextDue: sched.due,
        correct: c.correct,
        total: c.total,
      });
    }
    for (const c of sum.byConcept) {
      const passed = c.score >= 60;
      const at = nowMs();
      setLearner((l) => {
        const r = delayedCheck(l, c.conceptKey, passed, at, settings.retentionDays);
        return r.counted && passed
          ? award(r.learner, `ret:${c.conceptKey}:${at}`, POINTS.retention).learner
          : r.learner;
      });
      const rec = recordFor(c.conceptKey);
      const mis = rec?.misconceptions[0];
      if (!passed && mis)
        setLearner((l) => openDoubt(l, c.conceptKey, mis.id, mis.name, "retention", at));
      // a correct answer on a LATER occasion closes the concept's open doubts (HLD §6.6)
      if (passed && rec)
        setLearner((l) => {
          const r = closeDoubts(
            l,
            c.conceptKey,
            rec.misconceptions.map((m) => m.id),
            at,
          );
          return r.closed.reduce(
            (acc, d) => award(acc, `closed:${d.id}`, POINTS.doubtClosed).learner,
            r.learner,
          );
        });
    }
    const earned = sum.correct * 2 + (sum.total >= 4 && sum.correct === sum.total ? 5 : 0);
    setMasteryMap((m) => ({ ...m, ...nextMasteries }));
    setSrsMap((m) => ({ ...m, ...nextSrsMap }));
    setAttemptLog((l) => [...l.slice(-400 + logs.length), ...logs]);
    setPoints((pt) => pt + earned);
    if (user) {
      const warn = (what: string) => (r: { error: { message: string } | null }) => {
        if (r.error) console.warn(`Could not save ${what}:`, r.error.message);
      };
      for (const o of outcomes) {
        const ref = reviewPool.find((p) => refKey(p) === o.conceptKey);
        if (!ref) continue;
        supabase
          .from("concept_mastery")
          .upsert(
            {
              user_id: user.id,
              module_slug: ref.moduleSlug,
              concept_slug: ref.concept.slug,
              bloom_level: ref.concept.bloom.toLowerCase(),
              mastery_score: o.to,
              next_review_at: new Date(o.nextDue).toISOString(),
            },
            { onConflict: "user_id,module_slug,concept_slug" },
          )
          .then(warn("mastery"));
      }
      if (earned)
        supabase
          .from("profiles")
          .upsert({ id: user.id, points: points + earned })
          .then(warn("points"));
    }
    return { points: earned, outcomes };
  };
  const report = useMemo(
    () =>
      computeReport({
        pool: reviewPool,
        mastery: masteryMap,
        attempts: attemptLog,
        srs: srsMap,
        points,
        now: Date.now(),
      }),
    [reviewPool, masteryMap, attemptLog, srsMap, totalPoints],
  );
  const openByKey = (key: string) => {
    const [ms, cs] = key.split(":");
    const mi = modules.findIndex((m) => m.slug === ms);
    const ci = modules[mi]?.concepts.findIndex((c) => c.slug === cs) ?? -1;
    if (mi >= 0 && ci >= 0) openConcept(mi, ci);
  };

  // ----- Settings actions -----
  const exportProgress = () => {
    const data = {
      exportedAt: new Date().toISOString(),
      points,
      mastery: masteryMap,
      attempts: attemptLog,
      reviewSchedule: srsMap,
      settings,
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `ai-kyro-progress-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const resetProgress = () => {
    setMasteryMap({});
    setAttemptLog([]);
    setSrsMap({});
    setPoints(0);
    resetLearner();
    resetClock();
    bestRef.current = {};
    try {
      localStorage.removeItem(PROGRESS_KEY);
    } catch {
      /* ignore */
    }
  };
  const clearMaterials = () => materials.forEach((m) => void removeMaterial(m));
  const clearTranslations = () => {
    setLessonTx({});
    setI18nNote("");
    try {
      localStorage.removeItem(LESSON_TX_KEY);
    } catch {
      /* ignore */
    }
    clearDynamicBundles();
  };

  const masteryValues = Object.values(masteryMap);
  const conceptsStarted = masteryValues.length;
  const conceptsRetained = masteryValues.filter((v) => v >= 80).length;
  const openDoubts = masteryValues.filter((v) => v < 60).length;
  const allConcepts = modules.flatMap((m) => m.concepts.map((c) => ({ m, c, v: masteryOf(m, c) })));
  const activeConcepts = allConcepts.filter((x) => x.v > 0);
  const reviewConcepts = activeConcepts.filter((x) => x.v < 60);
  const transferScores = attemptLog.filter((a) => a.kind === "transfer");
  const transferAvg = transferScores.length
    ? Math.round(transferScores.reduce((t, a) => t + a.score, 0) / transferScores.length)
    : null;
  const retainedPct = conceptsStarted ? Math.round((conceptsRetained / conceptsStarted) * 100) : 0;
  const firstName = user?.email?.split("@")[0];
  const hour = new Date().getHours();
  const dayKey = hour < 12 ? "greet.morning" : hour < 17 ? "greet.afternoon" : "greet.evening";

  const visibleStages = concept.stages.slice(0, stageIndex + 1);

  return (
    <main className="app-shell">
      <aside className="main-sidebar">
        <div className="brand">
          <span className="brand-mark">
            <Sun />
          </span>
          <div>
            <strong>{t("ui.ai_kyro")}</strong>
            <small>{t("ui.learn_think_grow")}</small>
          </div>
        </div>
        <div className="room-card">
          <span>
            <BookOpen />
          </span>
          <div>
            <strong>{t("ui.room_617")}</strong>
            <small>{t("ui.your_learning_space")}</small>
          </div>
          <b>›</b>
        </div>
        <nav aria-label={t("ui.primary")}>
          <Button
            variant="ghost"
            className={panel === "dashboard" ? "active" : ""}
            onClick={() => setPanel("dashboard")}
          >
            <BookOpen />
            <span>{t("ui.my_desk")}</span>
          </Button>
          <Button
            variant="ghost"
            className={panel === "classroom" ? "active" : ""}
            onClick={() => setPanel("classroom")}
          >
            <GraduationCap />
            <span>{t("ui.classroom")}</span>
          </Button>
          <Button
            variant="ghost"
            className={panel === "review" ? "active" : ""}
            onClick={() => openReview()}
          >
            <Brain />
            <span>{t("nav.review")}</span>
          </Button>
          <Button
            variant="ghost"
            className={panel === "library" ? "active" : ""}
            onClick={() => setPanel("library")}
          >
            <Library />
            <span>{t("ui.class_library")}</span>
          </Button>
          <Button
            variant="ghost"
            className={panel === "progress" ? "active" : ""}
            onClick={() => setPanel("progress")}
          >
            <TrendingUp />
            <span>{t("ui.report_card")}</span>
          </Button>
          <Button
            variant="ghost"
            className={panel === "settings" ? "active" : ""}
            onClick={() => setPanel("settings")}
          >
            <Settings />
            <span>{t("nav.settings")}</span>
          </Button>
        </nav>
        <div className="sidebar-profile">
          <span>{user?.email?.charAt(0).toUpperCase() ?? "S"}</span>
          <div>
            <strong>{user?.email?.split("@")[0] ?? "Student"}</strong>
            <small>{t("ui.keep_exploring")}</small>
          </div>
          <button
            type="button"
            className="profile-gear"
            aria-label={t("nav.settings")}
            onClick={() => setPanel("settings")}
          >
            <Settings />
          </button>
        </div>
      </aside>

      <div className="app-content">
        <header className="topbar">
          <div>
            <span className="header-icon">
              <Sun />
            </span>
            <div>
              <strong>
                {panel === "dashboard"
                  ? t("ui.my_desk")
                  : panel === "classroom"
                    ? t("ui.classroom")
                    : panel === "library"
                      ? t("ui.class_library")
                      : panel === "settings"
                        ? t("nav.settings")
                        : panel === "review"
                          ? t("nav.review")
                          : panel === "setup"
                            ? "Topic Setup"
                            : panel === "knowledge"
                              ? "Verified knowledge"
                              : panel === "study"
                                ? "Comparative study"
                                : panel === "evaluation"
                                  ? "Evaluation"
                                  : t("ui.report_card")}
              </strong>
              <small>
                {panel === "dashboard"
                  ? t("header.deskSub")
                  : panel === "classroom"
                    ? `${module.code} · ${concept.title}`
                    : "AI KYRO"}
              </small>
            </div>
          </div>
          <div className="top-actions">
            <span className="encouragement">
              <Sparkles /> {t("ui.keep_going")}
            </span>
            <span className="points">
              {totalPoints} {t("ui.points")}
            </span>
            {user ? (
              <Button variant="outline" onClick={() => supabase.auth.signOut()}>
                {t("ui.sign_out")}
              </Button>
            ) : (
              <Button variant="outline" onClick={() => setAuthOpen(true)}>
                {t("ui.sign_in")}
              </Button>
            )}
          </div>
        </header>

        {panel === "dashboard" && (
          <div className="kyro-dashboard">
            <section className="dashboard-greeting">
              <div>
                <div className="eyebrow">
                  <Sun size={14} /> {t(dayKey)}
                  {user ? t("greet.student") : ""}
                </div>
                <h2 className="kyro-title">
                  {firstName
                    ? t("welcome.name", { name: firstName })
                    : Object.keys(learnerData.sessions).length
                      ? t("welcome")
                      : t("welcome.first")}
                </h2>
                <p className="kyro-subtitle">
                  {conceptsStarted > 0
                    ? t("stat.retainedSoFar", {
                        retained: conceptsRetained,
                        started: conceptsStarted,
                      })
                    : t("dash.goodDay")}
                </p>
              </div>
              <div className="desk-note">
                <Pencil size={15} />
                <span>{t("ui.small_steps_build_big_ideas")}</span>
              </div>
            </section>
            <div className="hero-wrap">
              <button
                ref={heroRef}
                onMouseMove={heroMove}
                onClick={() => setPanel("setup")}
                className="classroom-hero group"
              >
                <div className="hero-window-glow" />
                <div className="hero-sunbeam beam-one" />
                <div className="hero-sunbeam beam-two" />
                <div className="hero-window">
                  <div className="window-sky" />
                  <div className="window-cross horizontal" />
                  <div className="window-cross vertical" />
                  <div className="window-trees" />
                </div>
                <div className="hero-clock">
                  <span>10</span>
                  <i />
                  <span>2</span>
                  <b />
                  <span>4</span>
                  <em />
                  <span>8</span>
                </div>
                <div className="hero-board">
                  <div className="board-pin pin-a" />
                  <div className="board-pin pin-b" />
                  <span className="board-kicker">
                    <BookOpen size={13} /> {t("ui.today_s_lesson")}
                  </span>
                  <strong>{t("ui.think_question_test")}</strong>
                  <div className="board-rule" />
                  <p>
                    {t("ui.no_answer_is_accepted")}
                    <br />
                    {t("ui.without_a_second_thought")}
                  </p>
                  <span className="board-smile">☼</span>
                  <div className="chalk-lines">
                    <i />
                    <i />
                    <i />
                  </div>
                </div>
                <div className="hero-copy">
                  <div className="hero-mini">
                    <span className="sun-doodle">☼</span> {t("ui.next_period")}
                  </div>
                  <h1>
                    {t("ui.step_into_the")}
                    <br />
                    <span>{t("ui.classroom_2")}</span>
                  </h1>
                  <p>{t("ui.pick_a_concept_and_learn")}</p>
                  <span className="hero-cta">
                    {t("ui.enter_class")} <ArrowRight size={16} />
                  </span>
                  <span className="hero-meta">
                    <Clock3 size={13} /> {t("ui.10_min_interactive")}
                  </span>
                </div>
                <div className="hero-desk desk-books">
                  <span />
                  <span />
                  <span />
                  <i />
                </div>
                <div className="hero-desk desk-pencil">
                  <i />
                  <b />
                  <em />
                </div>
                <div className="hero-plant">
                  <Leaf size={35} />
                  <span />
                  <i />
                  <b />
                </div>
                <div className="hero-cursor-light" />
              </button>
              <button
                type="button"
                className="hero-demo"
                onClick={() => setJourney({ ...journey, on: true })}
              >
                ▶ Start the guided demo
              </button>
            </div>
            <section className="stats-ribbon">
              <div className="stat-pill">
                <span className="stat-icon gold">
                  <Sparkles size={16} />
                </span>
                <strong>{totalPoints}</strong>
                <small>{t("ui.points")}</small>
              </div>
              <div className="stat-pill">
                <span className="stat-icon green">
                  <Flame size={16} />
                </span>
                <strong>
                  {conceptsRetained}
                  <small>/{conceptsStarted}</small>
                </strong>
                <small>{t("ui.retained")}</small>
              </div>
              <div className="stat-pill">
                <span className="stat-icon violet">
                  <ClipboardCheck size={16} />
                </span>
                <strong>{openDoubts}</strong>
                <small>{tp("stat.openDoubt", openDoubts)}</small>
              </div>
              <button className="stats-progress" onClick={() => setPanel("progress")}>
                <BarChart3 size={16} /> {t("ui.view_learning_progress")} <ArrowRight size={14} />
              </button>
            </section>
            <div className="dashboard-grid">
              <main className="dashboard-main">
                <section>
                  <div className="section-heading">
                    <div>
                      <span className="section-icon book">
                        <BookOpen size={17} />
                      </span>
                      <div>
                        <h3>{t("ui.continue_learning")}</h3>
                        <p>{t("ui.pick_up_where_your_thinking")}</p>
                      </div>
                    </div>
                    <button onClick={() => setPanel("classroom")}>
                      {t("ui.view_all")} <ArrowRight size={14} />
                    </button>
                  </div>
                  <div className="module-grid">
                    {modules.map((mod, index) => {
                      const Icon = mod.slug.includes("thermo") ? Beaker : Sigma;
                      const explored = Object.keys(masteryMap).filter((k) =>
                        k.startsWith(`${mod.slug}:`),
                      ).length;
                      return (
                        <article key={mod.slug} className="module-card group">
                          <div
                            className={
                              index % 2
                                ? "module-visual module-visual-gold"
                                : "module-visual module-visual-green"
                            }
                          >
                            <span className="module-badge">
                              {explored > 0 ? t("mod.inProgress") : t("mod.nextUp")}
                            </span>
                            <Icon className="module-main-icon" size={42} strokeWidth={1.35} />
                            <span className="module-scribble">
                              {explored > 0 ? t("mod.keepGoing") : t("mod.newIdea")}
                            </span>
                            <span className="module-shape shape-one" />
                            <span className="module-shape shape-two" />
                          </div>
                          <div className="module-body">
                            <div className="module-title-row">
                              <h4>{mod.title}</h4>
                              <span className="module-arrow">
                                <ArrowRight size={15} />
                              </span>
                            </div>
                            <p>
                              {mod.concepts.length} {t("ui.concepts_build_it_step_by")}
                            </p>
                            <div className="module-progress">
                              <span style={{ width: `${Math.min(82, 22 + explored * 12)}%` }} />
                            </div>
                            <span className="module-progress-label">
                              {explored} / {mod.concepts.length} {t("ui.concepts_explored")}
                            </span>
                            {mod.concepts.slice(0, 2).map((c, ci) => (
                              <button
                                key={c.slug}
                                className="concept-row"
                                onClick={() => openConcept(index, ci)}
                              >
                                <span className="concept-dot" />
                                <span className="concept-name">{c.title}</span>
                                <span className="bloom-tag">{bloom(c.bloom)}</span>
                                <ArrowRight size={13} />
                              </button>
                            ))}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
                <section className="journey-card">
                  <div className="section-heading compact">
                    <div>
                      <span className="section-icon journey">
                        <Target size={17} />
                      </span>
                      <div>
                        <h3>{t("ui.your_learning_journey")}</h3>
                        <p>{t("ui.progress_not_perfection")}</p>
                      </div>
                    </div>
                  </div>
                  <div className="journey-content">
                    <div
                      className="progress-ring"
                      style={{ "--progress": `${retainedPct}%` } as CSSProperties}
                    >
                      <div>
                        <strong>{retainedPct}%</strong>
                        <span>{t("ui.retained")}</span>
                      </div>
                    </div>
                    <div className="journey-copy">
                      <strong>
                        {conceptsRetained} {t("ui.concepts_retained")}
                      </strong>
                      <span>
                        {conceptsStarted} {t("ui.concepts_explored_so_far")}
                      </span>
                      <em>{t("ui.curiosity_first_answers_second")}</em>
                    </div>
                    <div className="journey-mini">
                      <span>
                        <Flame size={15} />
                        {t("ui.streak")}
                      </span>
                      <strong>{conceptsRetained}</strong>
                      <small>{t("ui.concepts")}</small>
                    </div>
                    <div className="journey-mini">
                      <span>
                        <Brain size={15} />
                        {t("ui.thinking")}
                      </span>
                      <strong>{openDoubts}</strong>
                      <small>{t("ui.open_doubts")}</small>
                    </div>
                  </div>
                </section>
                <section>
                  <div className="section-heading compact">
                    <div>
                      <span className="section-icon practice">
                        <Zap size={17} />
                      </span>
                      <div>
                        <h3>{t("ui.quick_practice")}</h3>
                        <p>{t("ui.short_activities_to_keep_your")}</p>
                      </div>
                    </div>
                  </div>
                  <div className="practice-grid">
                    <button
                      onClick={() =>
                        openReview(
                          "concept",
                          refKey({ moduleSlug: module.slug, moduleTitle: module.title, concept }),
                        )
                      }
                      className="practice-card yellow"
                    >
                      <span>
                        <Lightbulb size={19} />
                      </span>
                      <div>
                        <strong>{t("ui.concept_check")}</strong>
                        <small>{t("ui.quick_focused_questions")}</small>
                      </div>
                      <ArrowRight size={15} />
                    </button>
                    <button onClick={() => openReview("mixed")} className="practice-card coral">
                      <span>
                        <Target size={19} />
                      </span>
                      <div>
                        <strong>{t("ui.mixed_practice")}</strong>
                        <small>{t("ui.variety_of_concepts")}</small>
                      </div>
                      <ArrowRight size={15} />
                    </button>
                    <button onClick={() => setPanel("progress")} className="practice-card blue">
                      <span>
                        <ClipboardCheck size={19} />
                      </span>
                      <div>
                        <strong>{t("ui.past_progress")}</strong>
                        <small>{t("ui.see_what_needs_review")}</small>
                      </div>
                      <ArrowRight size={15} />
                    </button>
                  </div>
                </section>
              </main>
              <aside className="dashboard-rail">
                <div className="rail-card lesson-card">
                  <div className="rail-title">
                    <span>
                      <Clock3 size={16} /> {t("ui.today_at_a_glance")}
                    </span>
                    <span className="rail-live">{t("ui.live")}</span>
                  </div>
                  <div className="rail-timeline">
                    <div className="timeline-item active">
                      <span className="timeline-dot" />
                      <div>
                        <small>{t("ui.now")}</small>
                        <strong>{t("ui.interactive_classroom")}</strong>
                        <p>{t("ui.think_question_test")}</p>
                      </div>
                    </div>
                    <div className="timeline-item">
                      <span className="timeline-dot" />
                      <div>
                        <small>{t("ui.next")}</small>
                        <strong>
                          {materials.length
                            ? tp("sources.ready", materials.length)
                            : t("desk.keepExploring")}
                        </strong>
                        <p>
                          {materials.length ? t("desk.materialGrounds") : t("desk.chooseConcept")}
                        </p>
                      </div>
                    </div>
                  </div>
                  <button onClick={() => setPanel("library")} className="rail-link">
                    {t("ui.open_class_library")} <ArrowRight size={14} />
                  </button>
                </div>
                <div className="rail-card activity-card">
                  <div className="rail-title">
                    <span>
                      <CheckCircle2 size={16} /> {t("ui.your_desk")}
                    </span>
                  </div>
                  <div className="desk-stat">
                    <span className="desk-stat-icon yellow">
                      <Sparkles size={15} />
                    </span>
                    <div>
                      <strong>{totalPoints}</strong>
                      <small>{t("ui.learning_points")}</small>
                    </div>
                  </div>
                  <div className="desk-stat">
                    <span className="desk-stat-icon green">
                      <Leaf size={15} />
                    </span>
                    <div>
                      <strong>{conceptsRetained}</strong>
                      <small>{t("ui.concepts_retained")}</small>
                    </div>
                  </div>
                  <div className="desk-stat">
                    <span className="desk-stat-icon violet">
                      <HelpCircle size={15} />
                    </span>
                    <div>
                      <strong>{openDoubts}</strong>
                      <small>{t("ui.open_doubts_to_revisit")}</small>
                    </div>
                  </div>
                </div>
                <div className="quote-note">
                  <span className="pin" />
                  <span className="quote-icon">✦</span>
                  <p>{t("ui.the_goal_isn_t_to")}</p>
                  <small>{t("ui.ai_kyro_2")}</small>
                </div>
              </aside>
            </div>
            <div className="kyro-footer">
              <span /> {t("ui.et_617_metacognitive_ai_scaffold")} <span />
            </div>
          </div>
        )}

        {panel === "classroom" && (
          <div
            className={`classroom-page ${focus ? "is-focus" : ""} ${focus && focusPanel ? "focus-panel" : ""}`}
          >
            <div className="classroom-toolbar">
              <div>
                <span>{t("ui.now_learning")}</span>
                <strong>{module.title}</strong>
                <small>
                  {concept.title} · {bloom(concept.bloom)}
                </small>
              </div>
              <div className="module-tabs" role="group" aria-label={t("ui.module")}>
                {modules.map((m, i) => (
                  <Button
                    size="sm"
                    variant="ghost"
                    key={m.slug}
                    className={i === moduleIndex ? "active" : ""}
                    onClick={() => selectModule(i)}
                  >
                    {m.code}
                  </Button>
                ))}
              </div>
              <div className="toolbar-right">
                {sttSupported() && (
                  <Button
                    variant={settings.handsFree ? "default" : "outline"}
                    aria-pressed={settings.handsFree}
                    aria-label={`Hands-free: ${settings.handsFree ? "On" : "Off"}`}
                    title="Hands-free: the teacher asks, you answer out loud (H)"
                    onClick={() =>
                      updateSetting(
                        settings.handsFree
                          ? { handsFree: false }
                          : { handsFree: true, voiceOn: true },
                      )
                    }
                  >
                    <Mic />
                    <span className="sr-only">Hands-free: {settings.handsFree ? "On" : "Off"}</span>
                  </Button>
                )}
                <Button
                  variant={voiceOn ? "default" : "outline"}
                  aria-pressed={voiceOn}
                  title="Read every line aloud (M)"
                  aria-label={`Read aloud: ${voiceOn ? "On" : "Off"}`}
                  onClick={toggleVoice}
                >
                  {voiceOn ? <Volume2 /> : <VolumeX />}
                  <span className="sr-only">Read aloud: {voiceOn ? "On" : "Off"}</span>
                </Button>
                {focus && (
                  <Button
                    size="icon"
                    variant="default"
                    className="toolbar-exit"
                    aria-label={t("view.exit")}
                    title={`${t("view.exit")} (Esc)`}
                    onClick={leaveFocus}
                  >
                    <Minimize2 />
                  </Button>
                )}
                <Button
                  variant={thinkingOpen ? "default" : "outline"}
                  aria-expanded={thinkingOpen}
                  aria-controls="my-thinking-panel"
                  onClick={() => setThinkingOpen((open) => !open)}
                >
                  <Brain /> My Thinking
                </Button>
                <div className={`tb-more ${moreOpen ? "open" : ""}`}>
                  <Button
                    size="icon"
                    variant="outline"
                    aria-label="More"
                    title="More"
                    aria-haspopup="menu"
                    aria-expanded={moreOpen}
                    onClick={() => setMoreOpen((o) => !o)}
                  >
                    <MoreHorizontal />
                  </Button>
                  <div className="tb-menu" role="menu" onClick={() => setMoreOpen(false)}>
                    <button type="button" role="menuitem" onClick={() => setPanel("setup")}>
                      <Plus /> New topic
                    </button>
                    {hld.rec && (
                      <button
                        type="button"
                        role="menuitem"
                        title="How this topic was verified"
                        onClick={() => setPanel("knowledge")}
                      >
                        <ShieldCheck /> How verified
                      </button>
                    )}
                    <button
                      type="button"
                      role="menuitem"
                      aria-label="Keyboard shortcuts"
                      aria-expanded={shortcutsOpen}
                      onClick={() => setShortcutsOpen((o) => !o)}
                    >
                      <Keyboard /> Keyboard shortcuts
                    </button>
                    <button type="button" role="menuitem" onClick={() => setPanel("settings")}>
                      <Settings /> {t("classroom.changeRoom")}
                    </button>
                  </div>
                </div>
              </div>
            </div>
            {(translating || i18nNote) && (
              <p className={`voice-note ${i18nNote && !translating ? "error" : ""}`} role="status">
                {translating ? t("lang.translating") : i18nNote}
              </p>
            )}
            {voiceNote?.target === "tts" && (
              <p className={`voice-note ${voiceNote.error ? "error" : ""}`} role="status">
                {voiceNote.text}
              </p>
            )}
            <div className="classroom-layout">
              <section className={`classroom-stage ${lecture ? "lecture-mode" : ""}`}>
                <div className="scene">
                  {lectureSec && stage.deep && (
                    <LectureBoard
                      title={lectureSec.title}
                      blocks={lectureSec.blocks}
                      active={stage.deep.block}
                      part={stage.deep.section}
                      parts={deepSections.length}
                    />
                  )}
                  <SceneBoundary>
                    <Suspense
                      fallback={
                        <div className="scene-fallback">{t("ui.loading_the_classroom")}</div>
                      }
                    >
                      <ClassroomScene
                        quality={quality}
                        night={theme === "dark"}
                        effects={settings.effects}
                        nameTags={settings.nameTags}
                        reduced={
                          reducedMotion ||
                          popupOpen || // the room holds still behind a pop-up question
                          (listening === "response" && settings.speechCapture)
                        } // idle while measuring speech
                        speaker={stage.speaker}
                        lecture={lecture}
                        pointing={pointing}
                        roomId={roomId}
                        board={stage.board}
                        moduleTitle={module.title}
                        conceptTitle={concept.title}
                        lessonText={`${stage.text}. ${stage.prompt ?? ""}`}
                      />
                    </Suspense>
                  </SceneBoundary>
                  {popupOpen && (
                    <div
                      className="question-popup"
                      role="dialog"
                      aria-label={t(stageKind ? (`kind.${stageKind}` as Key) : "kind.default")}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") setPopupDismissed(popupKey);
                      }}
                    >
                      <div className="question-popup-card">
                        <header>
                          <span className="popup-badge">{t("popup.yourTurn")}</span>
                          <button
                            type="button"
                            className="popup-x"
                            aria-label={t("popup.close")}
                            onClick={() => setPopupDismissed(popupKey)}
                          >
                            ×
                          </button>
                        </header>
                        {answerBox("popup")}
                        <footer>
                          <button type="button" onClick={() => setPopupDismissed(popupKey)}>
                            {t("popup.later")}
                          </button>
                          <button
                            type="button"
                            onClick={() => updateSetting({ popupQuestions: false })}
                          >
                            {t("popup.hide")}
                          </button>
                        </footer>
                      </div>
                    </div>
                  )}
                  <div className="scene-top">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={
                        materials.length
                          ? t("sources.count", { n: materials.length })
                          : t("sources.course")
                      }
                      title={
                        materials.length
                          ? t("sources.count", { n: materials.length })
                          : t("sources.course")
                      }
                      onClick={() => setSourceOpen(!sourceOpen)}
                    >
                      <FileText />
                    </Button>
                    {focus && (
                      <>
                        <Button
                          variant="ghost"
                          aria-pressed={focusPanel}
                          title={t("view.transcript")}
                          onClick={() => setFocusPanel(!focusPanel)}
                        >
                          {focusPanel ? <PanelRightClose /> : <PanelRight />} {t("view.transcript")}
                        </Button>
                        <Button
                          variant="ghost"
                          aria-pressed={fullscreen}
                          onClick={toggleFullscreen}
                        >
                          {fullscreen ? <Minimize /> : <Maximize />}{" "}
                          {t(fullscreen ? "view.exitFullscreen" : "view.fullscreen")}
                        </Button>
                      </>
                    )}
                    <Button
                      variant="ghost"
                      className="enlarge-btn"
                      aria-pressed={focus}
                      title={`${t(focus ? "view.exit" : "view.enlarge")} (F)`}
                      onClick={() => (focus ? leaveFocus() : setFocus(true))}
                    >
                      {focus ? <Minimize2 /> : <Maximize2 />}
                      <span className="sr-only">{t(focus ? "view.exit" : "view.enlarge")}</span>
                    </Button>
                  </div>
                  {focus && !focusPanel && stage.prompt && !popupOpen && (
                    <button
                      type="button"
                      className="focus-answer-pill"
                      onClick={() => setFocusPanel(true)}
                    >
                      {t("view.answerPill")}
                    </button>
                  )}
                  <div
                    className={`speaker-card ${stage.kind === "doubt" || stage.kind === "bridge" ? "live-turn" : ""}`}
                  >
                    <div className={`speaker-avatar ${stage.speaker}`}>
                      {stage.speaker === "teacher" ? (
                        <GraduationCap />
                      ) : stage.speaker === "maya" ? (
                        <BookOpen />
                      ) : (
                        <Brain />
                      )}
                    </div>
                    <div>
                      <small>{stage.label}</small>
                      <strong>{speakerName}</strong>
                      {stage.kind === "doubt" && stage.asked && (
                        <span className="you-asked">You asked: “{stage.asked}”</span>
                      )}
                      {stage.pending ? (
                        <p
                          className="thinking-dots"
                          role="status"
                          aria-label={`${speakerName} is thinking`}
                        >
                          <i />
                          <i />
                          <i />
                        </p>
                      ) : (
                        <p>{stage.text}</p>
                      )}
                    </div>
                  </div>
                  {hfOn && (hf.state === "listening" || hf.state === "working") && (
                    <div className={`hf-pill ${hf.state}`} role="status" aria-live="polite">
                      <Mic />
                      <span>
                        {hf.state === "working"
                          ? "Got it…"
                          : hf.heard
                            ? `“${hf.heard.slice(-90)}”`
                            : "Listening — speak now"}
                      </span>
                    </div>
                  )}
                  {kbdToast && (
                    <div
                      key={kbdToast.n}
                      className="kbd-toast"
                      role="status"
                      aria-live="polite"
                      onAnimationEnd={() => setKbdToast(null)}
                    >
                      {kbdToast.text}
                    </div>
                  )}
                  {shortcutsOpen && (
                    <div className="shortcuts-sheet" role="dialog" aria-label="Keyboard shortcuts">
                      <header>
                        <strong>Keyboard shortcuts</strong>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Close shortcuts"
                          onClick={() => setShortcutsOpen(false)}
                        >
                          <X />
                        </Button>
                      </header>
                      <dl>
                        {(
                          [
                            ["Space or K", "Play / pause"],
                            ["→ or L", "Next line"],
                            ["← or J", "Previous line"],
                            ["Shift + →", "Next doubt"],
                            ["Shift + ←", "Previous doubt"],
                            ["M", "Read aloud on / off"],
                            ["R", "Replay this line"],
                            ["/", "Ask a doubt"],
                            ["F", "Enlarge class · Esc to leave"],
                            ["0 or Home", "Back to the start"],
                            ["?", "Show / hide this list"],
                          ] as const
                        ).map(([k, v]) => (
                          <div key={k}>
                            <dt>{k}</dt>
                            <dd>{v}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  )}
                  {sourceOpen && (
                    <div className="source-drawer">
                      <div>
                        <strong>{t("ui.sources_in_this_class")}</strong>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setSourceOpen(false)}
                          aria-label={t("ui.close_sources")}
                        >
                          <X />
                        </Button>
                      </div>
                      {materials.length ? (
                        materials.map((m) => (
                          <article key={m.id}>
                            <FileText />
                            <div>
                              <b>{m.title}</b>
                              <small>
                                {m.file_name} · {m.sections?.length ?? 0} {t("ui.sections")}
                              </small>
                            </div>
                            <span>{t("ui.ready")}</span>
                          </article>
                        ))
                      ) : (
                        <p>{t("ui.this_lesson_uses_the_verified")}</p>
                      )}
                    </div>
                  )}
                </div>
                <div className="transport">
                  <div>
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() => setStageIndex((i) => Math.max(0, i - 1))}
                      aria-label={t("ui.previous_turn")}
                    >
                      <ChevronLeft />
                    </Button>
                    <Button
                      size="icon"
                      onClick={() => setPlaying((p) => !p)}
                      aria-label={playing ? "Pause" : "Play"}
                    >
                      {playing ? <Pause /> : <Play />}
                    </Button>
                    <Button
                      size="icon"
                      variant="outline"
                      disabled={!hld.gate.ok}
                      title={
                        hld.gate.reason === "blank"
                          ? "Fill the blank to continue"
                          : hld.gate.reason === "checkpoint"
                            ? "Attempt the checkpoint to continue"
                            : undefined
                      }
                      onClick={() =>
                        setStageIndex((i) => Math.min(concept.stages.length - 1, i + 1))
                      }
                      aria-label={t("ui.next_turn")}
                    >
                      <ChevronRight />
                    </Button>
                  </div>
                  <div className="timeline">
                    <Progress value={stageProgress} />
                    <small>
                      {t("discussion.count", { n: stageIndex + 1, total: concept.stages.length })}
                      {playing && stage.prompt && !result ? ` · ${t("discussion.waiting")}` : ""}
                      {settings.lessonDepth === "full" && deepState[liveKey] === "loading"
                        ? " · preparing the full lesson…"
                        : settings.lessonDepth === "full" && deepState[liveKey] === "failed"
                          ? " · short version (the full lesson needs the AI)"
                          : ""}
                    </small>
                  </div>
                  <Button
                    variant="outline"
                    className="speed"
                    onClick={() =>
                      updateSetting({ speed: speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1 })
                    }
                  >
                    {speed}×
                  </Button>
                </div>
              </section>
              <aside className="class-transcript">
                <div className="transcript-header">
                  <div>
                    <small>{t("ui.class_transcript")}</small>
                    <h2>{t("ui.follow_the_discussion")}</h2>
                  </div>
                  <span>
                    <i /> {t("ui.live")}
                  </span>
                </div>
                {settings.showTranscript && (
                  <div
                    className="transcript-list"
                    tabIndex={0}
                    role="log"
                    aria-label="Class transcript"
                  >
                    {visibleStages.map((item, i) => (
                      <Fragment key={`${item.speaker}-${i}`}>
                        {item.kind === "doubt" && item.asked && (
                          <div className="you-bubble">
                            <p>{item.asked}</p>
                          </div>
                        )}
                        <article className={i === stageIndex ? "current" : ""}>
                          <span className={`transcript-avatar ${item.speaker}`}>
                            {item.speaker === "teacher" ? (
                              <GraduationCap />
                            ) : item.speaker === "maya" ? (
                              <BookOpen />
                            ) : (
                              <Brain />
                            )}
                          </span>
                          <div>
                            <header>
                              <strong>{personaFor(room, item.speaker).name}</strong>
                              {i === stageIndex && <em>{t("ui.speaking")}</em>}
                            </header>
                            <p>{item.pending ? "…" : item.text}</p>
                          </div>
                        </article>
                      </Fragment>
                    ))}
                  </div>
                )}
                {stage.prompt && !popupOpen && answerBox("side")}
              </aside>
            </div>
            {thinkingOpen && (
              <ThinkingSummary
                key={`${liveKey}:${thinkTick}`}
                topic={concept.title}
                log={
                  loadThinking(
                    localStorage,
                    thinkingKey(user?.id ?? localLearnerId(), liveKey),
                  ) as ThinkingLog
                }
                onClose={() => setThinkingOpen(false)}
              />
            )}
            <div className="question-bar ask-bar" data-ask-bar>
              <div className="ask-lead">
                <span className="ask-icon">
                  <Hand />
                </span>
                <div>
                  <b>{t("ask.tag")}</b>
                </div>
              </div>
              <div className="ask-field">
                <Textarea
                  ref={askRef}
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onFocus={dismissAskHint}
                  aria-label={t("ask.tag")}
                  placeholder={
                    listening === "question"
                      ? t("ask.placeholderListening")
                      : t("ask.placeholder", { teacher: room.teacher.name })
                  }
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className={listening === "question" ? "listening" : ""}
                  aria-label={
                    listening === "question" ? t("aria.stopDictation") : t("aria.speakQuestion")
                  }
                  aria-pressed={listening === "question"}
                  onClick={() => {
                    dismissAskHint();
                    dictate("question");
                  }}
                >
                  {listening === "question" ? <MicOff /> : <Mic />}
                </Button>
                <Button
                  size="icon"
                  onClick={() => {
                    dismissAskHint();
                    void ask();
                  }}
                  disabled={asking || !question.trim()}
                  aria-label={t("ui.send_question")}
                >
                  <Send />
                </Button>
              </div>
              {/* Always on screen. Unmounting them when there was text shrank the doubt bar, and the classroom
                  flexed into the freed space — the room jumped on the keystroke that hid them. */}
              <div className="ask-chips" role="group" aria-label={t("ask.tag")}>
                {ASK_CHIPS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      dismissAskHint();
                      setQuestion(t(k));
                      askRef.current?.focus();
                    }}
                  >
                    {t(k)}
                  </button>
                ))}
              </div>
            </div>
            {voiceNote?.target === "question" && (
              <p className={`voice-note ${voiceNote.error ? "error" : ""}`} role="status">
                {voiceNote.text}
              </p>
            )}
            <div className="concept-strip">
              {module.concepts.map((c, i) => (
                <Button
                  variant="ghost"
                  key={c.slug}
                  className={i === conceptIndex ? "active" : ""}
                  onClick={() => {
                    setConceptIndex(i);
                    setStageIndex(0);
                  }}
                >
                  <span>{i + 1}</span>
                  <div>
                    <strong>{c.title}</strong>
                    <small>
                      {bloom(c.bloom)} · {masteryOf(module, c)}
                      {t("ui.mastery")}
                    </small>
                  </div>
                </Button>
              ))}
            </div>
          </div>
        )}

        {panel === "library" && (
          <section
            className="page-view"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void uploadMany(e.dataTransfer.files);
            }}
          >
            <div className="page-title">
              <div>
                <small>{t("ui.personal_knowledge_base")}</small>
                <h1>{t("ui.learn_from_your_own_material")}</h1>
                <p>{t("ui.bring_slides_notes_readings_or")}</p>
              </div>
              <input
                ref={inputRef}
                hidden
                multiple
                type="file"
                accept=".pdf,.pptx,.docx,.txt,.md,.png,.jpg,.jpeg,.webp"
                onChange={(e) => {
                  void uploadMany(e.target.files);
                  e.target.value = "";
                }}
              />
              <Button onClick={() => inputRef.current?.click()} disabled={uploading}>
                <Upload /> {uploading ? t("mat.reading") : t("mat.upload")}
              </Button>
            </div>
            <div className="module-composer">
              <h2>
                <Sparkles size={18} /> {t("ui.add_a_module_with_ai")}
              </h2>
              <p>{t("ui.describe_a_topic_and_optionally")}</p>
              {attachments.length > 0 && (
                <div className="attach-chips">
                  {attachments.map((f, i) => (
                    <span key={i}>
                      <FileText size={14} />
                      {f.name}
                      <button
                        aria-label={`Remove ${f.name}`}
                        onClick={() => setAttachments((a) => a.filter((_, j) => j !== i))}
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="composer-bar">
                <button
                  className="composer-icon"
                  aria-label={t("ui.attach_files_optional")}
                  onClick={() => attachRef.current?.click()}
                >
                  <Plus />
                </button>
                <input
                  ref={attachRef}
                  hidden
                  multiple
                  type="file"
                  accept=".pdf,.pptx,.docx,.txt,.md,.png,.jpg,.jpeg,.webp"
                  onChange={(e) => {
                    const fs = Array.from(e.target.files ?? []);
                    setAttachments((a) => [...a, ...fs]);
                    e.target.value = "";
                  }}
                />
                <input
                  className="composer-input"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") generateModule();
                  }}
                  placeholder={listening === "topic" ? t("voice.listeningShort") : t("ph.topic")}
                />
                <button
                  className={`composer-icon ${listening === "topic" ? "listening" : ""}`}
                  aria-label={t("ui.speak_topic")}
                  onClick={() => dictate("topic")}
                >
                  <Mic />
                </button>
                <button
                  className="composer-send"
                  aria-label={t("ui.generate_module")}
                  disabled={generating || (!topic.trim() && !attachments.length)}
                  onClick={generateModule}
                >
                  {generating ? <Clock3 /> : <ArrowRight />}
                </button>
              </div>
              {generating && (
                <small className="composer-note">{t("ui.building_your_concept_sequence")}</small>
              )}
              {genError && <small className="composer-note error">{genError}</small>}
              {voiceNote?.target === "topic" && (
                <small className={`composer-note ${voiceNote.error ? "error" : ""}`} role="status">
                  {voiceNote.text}
                </small>
              )}
              {customModules.length > 0 && (
                <div className="custom-modules">
                  {customModules.map((m) => (
                    <article key={m.slug} className="material-card">
                      <Brain />
                      <div>
                        <small>
                          {m.code} · {m.concepts.length} {t("ui.concepts_2")}
                        </small>
                        <h3>{m.title}</h3>
                        <p>{m.description}</p>
                      </div>
                      <Button
                        onClick={() => {
                          selectModule(
                            Math.max(
                              0,
                              modules.findIndex((x) => x.slug === m.slug),
                            ),
                          );
                          setPanel("classroom");
                        }}
                      >
                        {t("ui.start_class")}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Delete ${m.title}`}
                        onClick={() => removeCustomModule(m.slug)}
                      >
                        <Trash2 />
                      </Button>
                    </article>
                  ))}
                </div>
              )}
            </div>
            {uploading && readMsg && (
              <p className="voice-note library-msg" role="status">
                {readMsg}
              </p>
            )}
            {matError && (
              <p className="voice-note error library-msg" role="alert">
                {matError}
              </p>
            )}
            {matNote && (
              <p className="voice-note library-msg" role="status">
                {matNote}
              </p>
            )}
            <div className="material-grid">
              {materials.map((m) => (
                <article key={m.id} className="material-card">
                  <FileText />
                  <div>
                    <small>
                      {m.local
                        ? t("mat.device")
                        : `mat.status.${m.status}` in EN
                          ? t(`mat.status.${m.status}` as Key)
                          : m.status.toUpperCase()}{" "}
                      · {m.sections?.length ?? 0} {t("ui.sections_2")}
                      {m.page_count ? ` · ${t("mat.pages", { n: m.page_count })}` : ""}
                      {m.sections?.some((x) => x.via === "ai") ? ` · ${t("mat.aiRead")}` : ""}
                      {m.sections?.some((x) => x.via === "ocr") ? ` · ${t("mat.ocr")}` : ""}
                    </small>
                    <h3>{m.title}</h3>
                    <p>{m.extracted_summary}</p>
                    <span>{m.file_name}</span>
                  </div>
                  <div className="material-actions">
                    <Button onClick={() => buildClass(m)} disabled={buildingId !== null}>
                      {buildingId === m.id ? t("mat.building") : t("mat.build")}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Remove ${m.file_name}`}
                      onClick={() => removeMaterial(m)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </article>
              ))}
              {!materials.length && (
                <div className="empty-material">
                  <Library />
                  <h3>{t("ui.your_materials_will_appear_here")}</h3>
                  <p>{t("ui.upload_a_pdf_powerpoint_word")}</p>
                </div>
              )}
            </div>
          </section>
        )}

        <JourneyGuide
          flags={journey}
          setFlags={setJourney}
          data={learnerData}
          panel={panel}
          go={(p) => setPanel(p as Panel)}
          due={report.due.length}
        />

        {panel === "setup" && (
          <TopicSetup
            modules={modules}
            data={learnerData}
            settings={settings}
            update={updateSetting}
            onStart={(key) => setPendingStart({ key, fresh: true })}
            onResume={(key) => setPendingStart({ key, fresh: false })}
          />
        )}

        {panel === "knowledge" && <KnowledgePanel />}

        {panel === "study" && (
          <StudyPanel
            pool={reviewPool}
            doubtsClosed={learnerData.learner.counters.doubtsClosed}
            onOpenClass={(key) => setPendingStart({ key, fresh: true })}
            grade={async (key, text) => {
              const r = recordFor(key);
              if (!r) return 0;
              const ref = buildReference(r.title, [], undefined);
              void ref;
              return assessLocal({
                kind: "transfer",
                response: text,
                reference: {
                  title: r.title,
                  definition: r.claims
                    .filter((c) => c.role === "define")
                    .map((c) => c.text)
                    .join(" "),
                  example: r.example,
                  misconception: r.misconceptions[0]?.right ?? "",
                  equation: r.equation,
                  transfer: r.transfer,
                },
              }).score;
            }}
          />
        )}

        {panel === "evaluation" && (
          <>
            <EvaluationHub participant={user?.id ?? localLearnerId()} />
            <EvaluationPanel />
          </>
        )}

        {panel === "settings" && (
          <SettingsPanel
            actions={{
              onExport: exportProgress,
              onResetProgress: resetProgress,
              onClearMaterials: clearMaterials,
              onClearTranslations: clearTranslations,
              onStartJourney: () => setJourney({ ...journey, on: true }),
              onOpenKnowledge: () => setPanel("knowledge"),
              onOpenStudy: () => setPanel("study"),
              onOpenEvaluation: () => setPanel("evaluation"),
              translating,
              note: i18nNote,
            }}
          />
        )}

        {panel === "progress" && (
          <div className="report-eval-row">
            <button type="button" className="eval-link" onClick={() => setPanel("evaluation")}>
              How is learning evaluated? See the evaluation →
            </button>
          </div>
        )}

        {panel === "progress" && (
          <ReportPanel
            report={report}
            onReview={() => openReview()}
            onStudy={openByKey}
            bloom={bloom}
          >
            <LadderSection data={learnerData} modules={modules} onStudy={openByKey} />
          </ReportPanel>
        )}

        {panel === "review" && (
          <ReviewPanel
            pool={reviewPool}
            srs={srsMap}
            masteryOf={masteryOfRef}
            goal={settings.reviewGoal}
            start={reviewStart}
            grade={gradeRecall}
            onComplete={completeReview}
            onOpenReport={() => setPanel("progress")}
            bloom={bloom}
          />
        )}

        {authOpen && (
          <div className="modal-backdrop">
            <div className="auth-dialog">
              <Button
                size="icon"
                variant="ghost"
                className="modal-close"
                onClick={() => setAuthOpen(false)}
              >
                <X />
              </Button>
              <span className="brand-mark">{t("ui.ak")}</span>
              <h2>{t("ui.keep_your_learning_with_you")}</h2>
              <p>{t("ui.sign_in_to_save_materials")}</p>
              <Button className="google" onClick={google}>
                {t("ui.continue_with_google")}
              </Button>
              <small>{t("ui.your_uploads_remain_private_to")}</small>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

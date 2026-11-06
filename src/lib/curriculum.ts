import { trFor, type Key, type LangCode } from "@/lib/i18n";

export type LessonStage = {
  kind:
    | "question"
    | "explain"
    | "example"
    | "challenge"
    | "predict"
    | "checkpoint"
    | "teachback"
    | "transfer"
    // HLD classroom turns
    | "ask"
    | "blank"
    | "hint"
    | "recall"
    | "mcq"
    | "doubt"
    | "bridge"
    | "checkin";
  speaker: "teacher" | "maya" | "arjun";
  label: string;
  text: string;
  board: string;
  prompt?: string;
  hint?: string;
  source?: string;
  /** unique id of this turn within its dialogue */
  id?: string;
  /** verified-record claims this turn draws on (so checkpoints derive from the dialogue) */
  claimIds?: string[];
  /** fill-in-the-blank: the dialogue does not continue until it is attempted */
  blank?: {
    id: string;
    before: string;
    answer: string;
    after: string;
    accept: string[];
    misconceptionId?: string;
  };
  /** hint card: the answer stays hidden until a guess is committed */
  hintCard?: {
    id: string;
    question: string;
    hint: string;
    answer: string;
    accept: string[];
    misconceptionId?: string;
  };
  /** for "recall" turns: the earlier concept being re-tested in context */
  recallKey?: string;
  /** quick check: a multiple-choice question (including fill-in-the-blank with choices) that pops up in the class */
  mcq?: {
    id: string;
    prompt: string;
    context?: string;
    options: string[];
    answer: number;
    explanation: string;
    qkind: string;
  };
  misconceptionId?: string;
  /** "doubt" / "bridge" turns: the learner's own question this turn answers or comes back to */
  asked?: string;
  /** a live turn whose text is still being written */
  pending?: boolean;
  /** the answer came from the verified notes because the AI could not be reached */
  viaNotes?: boolean;
  /** a turn of the full lesson: which board section and block it reads (the board shows the section) */
  deep?: { section: number; block: number; kind: string };
  /** "checkin" turns: which one-question-at-a-time check-in this is */
  checkin?: { phase: "before" | "during" | "after" };
};

export type Concept = {
  /** content this concept was built from (stored for custom modules so they can be translated) */
  src?: ArcSource;
  slug: string;
  title: string;
  bloom: string;
  duration: number;
  mastery: number;
  stages: LessonStage[];
};
export type Module = {
  /** language the content is written in (default English) */
  lang?: LangCode;
  slug: string;
  code: string;
  title: string;
  description: string;
  concepts: Concept[];
};

/** The raw lesson content a concept was built from — kept so it can be rebuilt in another language. */
export type ArcSource = {
  /** short phrase used inside sentences ("energy accounting") */
  title: string;
  definition: string;
  misconception: string;
  example: string;
  equation: string;
  transfer: string;
};

const ARC_SOURCE = new WeakMap<object, ArcSource>();
/** The content an `arc()` result was built from (built-in lessons; custom ones also store `src`). */
/** Register the content a hand-built stage list came from (so rubric grading and quizzes can find it). */
export const registerSource = (stages: LessonStage[], src: ArcSource) =>
  void ARC_SOURCE.set(stages, src);
export const sourceOf = (stages: LessonStage[]): ArcSource | undefined => ARC_SOURCE.get(stages);

/**
 * The content a concept was built from. Built-in lessons are looked up from their `arc()` call;
 * custom lessons store it in `src`; very old saved lessons are reconstructed from the English text.
 */
export function conceptSource(c: { stages: LessonStage[]; src?: ArcSource }): ArcSource {
  const known = c.src ?? sourceOf(c.stages);
  if (known) return known;
  const by = (k: LessonStage["kind"]) => c.stages.find((x) => x.kind === k);
  const strip = (text: string | undefined, key: Key, v: Record<string, string>) => {
    const prefix = trFor("en", key, v).replace(/\s+$/, "");
    return (text ?? "").startsWith(prefix)
      ? (text ?? "").slice(prefix.length).trim()
      : (text ?? "").trim();
  };
  return {
    title: by("question")?.board ?? "",
    definition: by("explain")?.text ?? "",
    example: strip(by("example")?.text, "arc.ex.text", { example: "" }),
    misconception: strip(by("challenge")?.text, "arc.ch.text", { misconception: "" }),
    equation: by("explain")?.board ?? "",
    transfer: by("transfer")?.text ?? "",
  };
}

export const arc = (
  title: string,
  definition: string,
  misconception: string,
  example: string,
  equation: string,
  transfer: string,
  lang: LangCode = "en",
): LessonStage[] => {
  const T = (k: Key, v?: Record<string, string | number>) => trFor(lang, k, v);
  // Opens on the core idea. The prior-knowledge question that used to come first was removed:
  // it asked the learner to commit a belief before anything had been taught.
  const stages: LessonStage[] = [
    {
      kind: "explain",
      speaker: "teacher",
      label: T("arc.label.core"),
      text: definition,
      board: equation,
    },
    {
      kind: "example",
      speaker: "maya",
      label: T("arc.label.example"),
      text: T("arc.ex.text", { example }),
      board: equation,
    },
    {
      kind: "challenge",
      speaker: "arjun",
      label: T("arc.label.misconception"),
      text: T("arc.ch.text", { misconception }),
      board: T("arc.ch.board", { misconception }),
    },
    {
      kind: "predict",
      speaker: "teacher",
      label: T("arc.label.predict"),
      text: T("arc.pr.text"),
      board: T("arc.pr.board"),
      prompt: T("arc.pr.prompt"),
      hint: T("arc.pr.hint"),
    },
    {
      kind: "checkpoint",
      speaker: "teacher",
      label: T("arc.label.checkpoint"),
      text: T("arc.cp.text", { title }),
      board: T("arc.cp.board"),
      prompt: T("arc.cp.prompt"),
    },
    {
      kind: "teachback",
      speaker: "maya",
      label: T("arc.label.teachback"),
      text: T("arc.tb.text"),
      board: T("arc.tb.board"),
      prompt: T("arc.tb.prompt"),
    },
    {
      kind: "transfer",
      speaker: "arjun",
      label: T("arc.label.transfer"),
      text: transfer,
      board: T("arc.tr.board"),
      prompt: T("arc.tr.prompt"),
    },
  ];
  ARC_SOURCE.set(stages, { title, definition, misconception, example, equation, transfer });
  return stages;
};

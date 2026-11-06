// Retention quizzes built from the lessons themselves, in whatever language the lesson is shown in.
// Questions use only things that are always true of a concept (its definition, example and title),
// never its "misconception" field (built-in lessons store a correct clarification there while
// AI-built lessons store a wrong belief, so it can't be used as a true/false statement).

import { STOP, buildReference, type Reference } from "./assess";
import { conceptSource, type Concept } from "./curriculum";
import { tr } from "./i18n";
import { dueState, type Srs } from "./srs";

export type QuestionKind = "definition" | "example" | "truefalse" | "cloze" | "recall";
export type Mode = "due" | "mixed" | "concept";

export type ConceptRef = { moduleSlug: string; moduleTitle: string; concept: Concept };
export const keyOf = (moduleSlug: string, conceptSlug: string) => `${moduleSlug}:${conceptSlug}`;
export const refKey = (r: ConceptRef) => keyOf(r.moduleSlug, r.concept.slug);

export type Question = {
  id: string;
  conceptKey: string;
  conceptTitle: string;
  bloom: string;
  kind: QuestionKind;
  prompt: string;
  /** the passage / statement the question is about (example text, statement to judge, sentence with a blank) */
  context?: string;
  options: string[];
  /** index of the right option; -1 for free-text recall */
  answer: number;
  explanation: string;
  reference?: Reference;
};

export type Answer = {
  questionId: string;
  correct: boolean;
  picked: number | null;
  text?: string;
  score?: number;
};

// ------------------------------------------------------------------ helpers
export const mulberry32 = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
export function shuffle<T>(arr: T[], r: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);
/** First sentence (handles the Devanagari danda), trimmed for use as a short option. */
export function firstSentence(s: string, max = 200): string {
  const t = s.trim();
  const m = /^[\s\S]*?[.!?।॥](?=\s|$)/u.exec(t)?.[0] ?? t;
  return clip(m.trim(), max);
}

const wordsOf = (s: string) => s.match(/[\p{L}\p{M}]+/gu) ?? [];

/** Words worth blanking out: long enough, not a stop word, not part of the concept's own title. */
function clozeCandidates(sentence: string, title: string): string[] {
  const titleWords = new Set(wordsOf(title).map((w) => w.toLowerCase()));
  return [...new Set(wordsOf(sentence))].filter(
    (w) => w.length >= 5 && !STOP.has(w.toLowerCase()) && !titleWords.has(w.toLowerCase()),
  );
}

type Ctx = { ref: ConceptRef; pool: ConceptRef[]; r: () => number; n: number };
const sameFamily = (a: ConceptRef, b: ConceptRef) => a.moduleSlug === b.moduleSlug;

/** Other concepts to draw wrong answers from (same module first, then the rest). */
function distractors(
  ref: ConceptRef,
  pool: ConceptRef[],
  r: () => number,
  max: number,
): ConceptRef[] {
  const others = pool.filter((p) => refKey(p) !== refKey(ref));
  const same = shuffle(
    others.filter((p) => sameFamily(p, ref)),
    r,
  );
  const rest = shuffle(
    others.filter((p) => !sameFamily(p, ref)),
    r,
  );
  return [...same, ...rest].slice(0, max);
}

const mk = (
  c: Ctx,
  kind: QuestionKind,
  q: Omit<Question, "id" | "conceptKey" | "conceptTitle" | "bloom" | "kind">,
): Question => ({
  id: `${refKey(c.ref)}#${kind}#${c.n}`,
  conceptKey: refKey(c.ref),
  conceptTitle: c.ref.concept.title,
  bloom: c.ref.concept.bloom,
  kind,
  ...q,
});

// ------------------------------------------------------------------ question builders
function definitionQ(c: Ctx): Question | null {
  const src = conceptSource(c.ref.concept);
  const right = firstSentence(src.definition);
  if (!right) return null;
  const wrong = distractors(c.ref, c.pool, c.r, 6)
    .map((d) => firstSentence(conceptSource(d.concept).definition))
    .filter((t, i, a) => t && t !== right && a.indexOf(t) === i)
    .slice(0, 3);
  if (!wrong.length) return null;
  const options = shuffle([right, ...wrong], c.r);
  return mk(c, "definition", {
    prompt: tr("q.definition", { title: c.ref.concept.title }),
    options,
    answer: options.indexOf(right),
    explanation: tr("q.explain", { title: c.ref.concept.title, definition: src.definition }),
  });
}

function exampleQ(c: Ctx): Question | null {
  const src = conceptSource(c.ref.concept);
  if (!src.example.trim()) return null;
  const wrong = distractors(c.ref, c.pool, c.r, 3)
    .map((d) => d.concept.title)
    .filter((t) => t !== c.ref.concept.title);
  if (!wrong.length) return null;
  const options = shuffle([c.ref.concept.title, ...wrong], c.r);
  return mk(c, "example", {
    prompt: tr("q.example"),
    context: clip(src.example, 320),
    options,
    answer: options.indexOf(c.ref.concept.title),
    explanation: tr("q.explain", { title: c.ref.concept.title, definition: src.definition }),
  });
}

/** True/false: either the concept with its own definition (true) or with another concept's (false). */
function trueFalseQ(c: Ctx): Question | null {
  const src = conceptSource(c.ref.concept);
  const own = firstSentence(src.definition, 220);
  if (!own) return null;
  const other = distractors(c.ref, c.pool, c.r, 1)[0];
  const otherDef = other ? firstSentence(conceptSource(other.concept).definition, 220) : "";
  // without a second concept to compare against the answer would always be "True"
  if (!other || !otherDef || otherDef === own) return null;
  const useFalse = c.r() < 0.5;
  const options = [tr("q.true"), tr("q.false")];
  return mk(c, "truefalse", {
    prompt: tr("q.tf"),
    context: tr("q.tfStatement", { title: c.ref.concept.title, text: useFalse ? otherDef : own }),
    options,
    answer: useFalse ? 1 : 0,
    explanation: useFalse
      ? tr("q.explainFalse", {
          title: c.ref.concept.title,
          definition: src.definition,
          other: other.concept.title,
        })
      : tr("q.explain", { title: c.ref.concept.title, definition: src.definition }),
  });
}

function clozeQ(c: Ctx): Question | null {
  const src = conceptSource(c.ref.concept);
  const sentence = firstSentence(src.definition, 260);
  const cands = clozeCandidates(sentence, c.ref.concept.title).sort((a, b) => b.length - a.length);
  const word = cands[Math.floor(c.r() * Math.min(3, cands.length))];
  if (!word) return null;
  const pool = new Set<string>();
  for (const d of distractors(c.ref, c.pool, c.r, 8))
    for (const w of clozeCandidates(
      firstSentence(conceptSource(d.concept).definition, 260),
      d.concept.title,
    ))
      if (w.toLowerCase() !== word.toLowerCase() && Math.abs(w.length - word.length) <= 4)
        pool.add(w);
  const wrong = shuffle([...pool], c.r).slice(0, 3);
  if (wrong.length < 2) return null;
  const options = shuffle([word, ...wrong], c.r);
  const blank = sentence.replace(
    new RegExp(
      `(?<![\\p{L}\\p{M}])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{M}])`,
      "u",
    ),
    "_____",
  );
  if (blank === sentence) return null;
  return mk(c, "cloze", {
    prompt: tr("q.cloze"),
    context: blank,
    options,
    answer: options.indexOf(word),
    explanation: tr("q.explain", { title: c.ref.concept.title, definition: src.definition }),
  });
}

function recallQ(c: Ctx): Question | null {
  const ref = buildReference(c.ref.concept.title, c.ref.concept.stages, c.ref.concept.src);
  if (!ref.definition) return null;
  return mk(c, "recall", {
    prompt: tr("q.recall", { title: c.ref.concept.title }),
    options: [],
    answer: -1,
    explanation: tr("q.explain", { title: c.ref.concept.title, definition: ref.definition }),
    reference: ref,
  });
}

const BUILDERS: Record<QuestionKind, (c: Ctx) => Question | null> = {
  definition: definitionQ,
  example: exampleQ,
  truefalse: trueFalseQ,
  cloze: clozeQ,
  recall: recallQ,
};

/** Easier question types while a concept is new to you; harder ones as mastery grows. */
export function kindsFor(mastery: number): QuestionKind[] {
  if (mastery < 35) return ["definition", "truefalse", "example"];
  if (mastery < 70) return ["definition", "cloze", "example", "truefalse"];
  return ["cloze", "example", "recall", "truefalse", "definition"];
}

export function questionsFor(
  ref: ConceptRef,
  pool: ConceptRef[],
  mastery: number,
  count: number,
  r: () => number,
  startAt = 0,
): Question[] {
  const order = shuffle(kindsFor(mastery), r);
  const out: Question[] = [];
  const seen = new Set<string>();
  for (let i = 0; out.length < count && i < order.length * 2; i++) {
    const kind = order[(i + startAt) % order.length] as QuestionKind;
    const q = BUILDERS[kind]({ ref, pool, r, n: i });
    if (q && !seen.has(`${q.kind}:${q.context ?? ""}:${q.options.join("|")}`)) {
      seen.add(`${q.kind}:${q.context ?? ""}:${q.options.join("|")}`);
      out.push(q);
    }
  }
  return out;
}

// ------------------------------------------------------------------ sessions
export type SessionInput = {
  mode: Mode;
  pool: ConceptRef[];
  size: number;
  now: number;
  srs: Record<string, Srs>;
  mastery: (r: ConceptRef) => number;
  /** concept key for mode "concept" */
  conceptKey?: string;
  seed?: number;
};

/** Which concepts a "due" review would cover, most urgent first. */
export function dueConcepts(
  pool: ConceptRef[],
  srs: Record<string, Srs>,
  now: number,
): ConceptRef[] {
  return pool
    .filter((p) => dueState(srs[refKey(p)], now) === "due")
    .sort((a, b) => (srs[refKey(a)]?.due ?? 0) - (srs[refKey(b)]?.due ?? 0));
}

export function buildSession(inp: SessionInput): Question[] {
  const r = mulberry32(inp.seed ?? Math.floor(inp.now / 1000) % 2_147_483_647);
  const { pool, size } = inp;
  if (!pool.length) return [];
  let chosen: ConceptRef[];
  if (inp.mode === "concept") {
    const one = pool.find((p) => refKey(p) === inp.conceptKey) ?? pool[0];
    chosen = one ? [one] : [];
  } else if (inp.mode === "due") {
    const due = dueConcepts(pool, inp.srs, inp.now);
    // top up with the weakest concepts you have started if fewer are due than the session needs
    const started = pool
      .filter((p) => inp.srs[refKey(p)] && !due.includes(p))
      .sort((a, b) => inp.mastery(a) - inp.mastery(b));
    chosen = [...due, ...started].slice(0, Math.max(1, Math.ceil(size / 2)));
  } else {
    const started = pool.filter((p) => inp.srs[refKey(p)]);
    chosen = shuffle(started.length >= 2 ? started : pool, r).slice(
      0,
      Math.max(1, Math.ceil(size / 2)),
    );
  }
  if (!chosen.length) return [];
  const per = inp.mode === "concept" ? size : Math.max(1, Math.ceil(size / chosen.length));
  const buckets = chosen.map((ref, i) =>
    questionsFor(ref, pool, inp.mastery(ref), Math.min(per, inp.mode === "concept" ? 6 : 4), r, i),
  );
  // interleave so the same concept is not asked twice in a row, and allow at most one free-text question
  const out: Question[] = [];
  let recall = 0;
  for (let round = 0; out.length < size; round++) {
    let added = false;
    for (const b of buckets) {
      const q = b[round];
      if (!q || out.length >= size) continue;
      if (q.kind === "recall" && inp.mode !== "concept" && recall++ >= 1) continue;
      out.push(q);
      added = true;
    }
    if (!added) break;
  }
  return out;
}

export type ConceptResult = {
  conceptKey: string;
  conceptTitle: string;
  correct: number;
  total: number;
  score: number;
};
export function summarise(
  questions: Question[],
  answers: Answer[],
): { score: number; correct: number; total: number; byConcept: ConceptResult[] } {
  const ans = new Map(answers.map((a) => [a.questionId, a]));
  const by = new Map<string, ConceptResult>();
  let correct = 0;
  for (const q of questions) {
    const a = ans.get(q.id);
    const row = by.get(q.conceptKey) ?? {
      conceptKey: q.conceptKey,
      conceptTitle: q.conceptTitle,
      correct: 0,
      total: 0,
      score: 0,
    };
    row.total++;
    if (a?.correct) {
      row.correct++;
      correct++;
    }
    by.set(q.conceptKey, row);
  }
  const byConcept = [...by.values()].map((r) => ({
    ...r,
    score: Math.round((r.correct / Math.max(1, r.total)) * 100),
  }));
  return {
    score: Math.round((correct / Math.max(1, questions.length)) * 100),
    correct,
    total: questions.length,
    byConcept,
  };
}

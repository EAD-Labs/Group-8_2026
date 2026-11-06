// Assessment of a learner's typed or spoken answer.
//
// Previously "Commit" only revealed a canned hint — nothing was graded, mastery never moved and
// points were never awarded. This module grades against the concept's own reference content with
// a transparent rubric (key ideas, reasoning, depth, equation/example use). When the AI endpoint
// is configured it is used for richer feedback; the rubric is always the fallback so the learner
// gets feedback even offline.

import { getLang, langInfo, tr } from "./i18n";
import { conceptSource, type ArcSource, type LessonStage } from "./curriculum";

export type AssessKind =
  "question" | "predict" | "checkpoint" | "teachback" | "transfer" | "retention";
export type AssessLabel = "Strong" | "Developing" | "Needs another pass";

export type Assessment = {
  score: number; // 0-100
  label: AssessLabel;
  strengths: string[];
  gaps: string[];
  next: string;
  method: "ai" | "rubric";
};

export type Reference = {
  definition: string;
  example: string;
  misconception: string;
  equation: string;
  transfer: string;
  title: string;
};

/** Stage kinds that ask the learner for a response, mapped to a rubric kind. */
export function assessKindOf(stage: LessonStage): AssessKind | null {
  if (!stage.prompt) return null;
  switch (stage.kind) {
    case "question":
    case "predict":
    case "checkpoint":
    case "teachback":
    case "transfer":
      return stage.kind;
    default:
      return null;
  }
}

/** The concept's reference content (in whatever language the lesson is currently shown in). */
export function buildReference(title: string, stages: LessonStage[], src?: ArcSource): Reference {
  const c = conceptSource(src ? { stages, src } : { stages });
  return {
    title,
    definition: c.definition,
    example: c.example,
    misconception: c.misconception,
    equation: c.equation,
    transfer: c.transfer,
  };
}

// ---------------------------------------------------------------- text helpers
export const STOP = new Set(
  "about above after again also always another because been before being between both could does doing done each either else every from have having here into just like made make many more most much must only other over same should some such than that their them then there these they this those through under until very were what when where which while will with would your itself ourselves first second third basic general".split(
    " ",
  ),
);
export const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
export const stem = (w: string) =>
  w
    .replace(
      /(ational|ations|ation|ities|ity|ings|ing|ness|ment|ibly|ably|ies|ied|ed|es|ly|s)$/,
      "",
    )
    .slice(0, 6);

/** Distinct content stems with the original word kept for display. */
function keyTerms(text: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const w of words(text)) {
    if (w.length < 4 || STOP.has(w)) continue;
    const s = stem(w);
    if (s.length >= 3 && !m.has(s)) m.set(s, w);
  }
  return m;
}

function longestCommonRun(a: string[], b: string[]): number {
  let best = 0;
  const prev = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let diag = 0;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j] ?? 0;
      prev[j] = a[i - 1] === b[j - 1] ? diag + 1 : 0;
      if ((prev[j] ?? 0) > best) best = prev[j] ?? 0;
      diag = tmp;
    }
  }
  return best;
}

const TARGET_WORDS: Record<AssessKind, number> = {
  question: 8,
  predict: 14,
  checkpoint: 24,
  teachback: 34,
  transfer: 30,
  retention: 24,
};

const nextFor = (k: AssessKind) => tr(`fb.next.${k}`);

/** Does the answer contain an explanation connector ("because", "इसलिए", …) in the current language? */
function hasReasoning(text: string): boolean {
  const markers = langInfo(getLang()).reasoning;
  const lower = text.toLowerCase();
  return markers.some((m) =>
    /^[a-z ]+$/.test(m) ? new RegExp(`\\b${m}\\b`, "i").test(lower) : lower.includes(m),
  );
}

// ---------------------------------------------------------------- rubric grader
export function assessLocal(input: {
  kind: AssessKind;
  response: string;
  reference: Reference;
}): Assessment {
  const { kind, reference } = input;
  const response = input.response.trim();
  const resWords = words(response);
  const n = resWords.length;
  const refText = `${reference.definition} ${reference.example} ${reference.misconception} ${reference.title}`;
  const terms = keyTerms(refText);
  const resStems = new Set(resWords.map(stem));

  const matched: string[] = [];
  const missing: string[] = [];
  for (const [s, w] of terms) (resStems.has(s) ? matched : missing).push(w);

  const needed = Math.min(8, Math.max(3, Math.round(terms.size * 0.3)));
  const coverage = Math.min(1, matched.length / needed);
  const reasoning = hasReasoning(response) ? 1 : 0;
  const lengthScore = Math.min(1, n / TARGET_WORDS[kind]);

  // equation / worked-example use
  const eqTokens = (reference.equation.match(/[A-Za-zΔΣσμ][A-Za-z0-9]*|[ΔΣσμ√±]/g) ?? []).filter(
    (t) => t.length <= 6 && /[ΔΣσμ√±]|^[A-Z]/.test(t),
  );
  const eqHit = eqTokens.some((t) => response.includes(t));
  const exTerms = [...keyTerms(reference.example).keys()];
  const exHit = exTerms.filter((s) => resStems.has(s)).length >= 2;
  const evidence = eqHit || exHit ? 1 : 0;

  // copy-paste detection: a long verbatim run from the definition is recitation, not understanding
  const run = longestCommonRun(resWords, words(reference.definition));
  const copied = (kind === "teachback" || kind === "checkpoint") && run >= 9;

  let score: number;
  if (n < 3) score = 0;
  else if (kind === "question") {
    // prior-knowledge probes measure engagement, not correctness
    score = 55 + 20 * Math.min(1, n / TARGET_WORDS.question) + 25 * coverage;
  } else {
    score = 100 * (0.5 * coverage + 0.2 * reasoning + 0.15 * lengthScore + 0.15 * evidence);
    if (n < 6) score = Math.min(score, 30);
  }
  if (copied) score = Math.min(score, 62);
  score = Math.max(0, Math.min(100, Math.round(score)));

  const strengths: string[] = [];
  if (matched.length)
    strengths.push(tr("fb.str.keyIdeas", { terms: matched.slice(0, 4).join(", ") }));
  if (reasoning) strengths.push(tr("fb.str.reasoning"));
  if (eqHit) strengths.push(tr("fb.str.equation"));
  else if (exHit) strengths.push(tr("fb.str.example"));
  if (kind === "question" && n >= 3 && !strengths.length) strengths.push(tr("fb.str.firstGuess"));

  const gaps: string[] = [];
  if (n < 3) gaps.push(tr("fb.gap.short"));
  else {
    if (copied) gaps.push(tr("fb.gap.copied"));
    // Suggest the concept's own vocabulary (title / misconception), not filler from the definition.
    const conceptTerms = keyTerms(`${reference.title} ${reference.misconception}`);
    const conceptMissing = [...conceptTerms]
      .filter(([st, w]) => !resStems.has(st) && w.length >= 5)
      .map(([, w]) => w);
    const trapHit = [...keyTerms(reference.misconception).keys()].filter((st) =>
      resStems.has(st),
    ).length;
    if (kind !== "question" && conceptMissing.length && coverage < 0.75)
      gaps.push(tr("fb.gap.missing", { terms: conceptMissing.slice(0, 3).join(", ") }));
    if (kind !== "question" && reference.misconception && trapHit < 2 && score < 90)
      gaps.push(tr("fb.gap.trap", { misconception: reference.misconception }));
    if (kind !== "question" && !reasoning) gaps.push(tr("fb.gap.because"));
    if (kind !== "question" && lengthScore < 0.6) gaps.push(tr("fb.gap.more"));
    if (kind !== "question" && !evidence && (kind === "checkpoint" || kind === "transfer"))
      gaps.push(tr("fb.gap.support"));
  }

  const label: AssessLabel =
    score >= 75 ? "Strong" : score >= 50 ? "Developing" : "Needs another pass";
  const next = score >= 85 ? tr("fb.next.strong") : nextFor(kind);
  return { score, label, strengths, gaps, next, method: "rubric" };
}

/** Validate an untrusted AI reply into an Assessment, or null if it is unusable. */
export function parseAiAssessment(raw: unknown): Assessment | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const score = typeof o["score"] === "number" ? Math.round(o["score"]) : NaN;
  if (!Number.isFinite(score) || score < 0 || score > 100) return null;
  const list = (v: unknown) =>
    Array.isArray(v)
      ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, 4)
      : [];
  const next = typeof o["next"] === "string" ? o["next"].slice(0, 300) : "";
  return {
    score,
    label: score >= 75 ? "Strong" : score >= 50 ? "Developing" : "Needs another pass",
    strengths: list(o["strengths"]),
    gaps: list(o["gaps"]),
    next: next || tr("fb.next.default"),
    method: "ai",
  };
}

// ---------------------------------------------------------------- mastery & points
const WEIGHT: Record<AssessKind, number> = {
  question: 0.12,
  predict: 0.3,
  checkpoint: 0.4,
  teachback: 0.45,
  transfer: 0.5,
  retention: 0.35,
};

/** Move mastery toward the new score; weightier tasks move it more. Never leaves 0..100. */
export function nextMastery(old: number, score: number, kind: AssessKind): number {
  const m = old + (score - old) * WEIGHT[kind];
  return Math.max(0, Math.min(100, Math.round(m)));
}

export const pointsFor = (score: number): number =>
  score >= 40 ? Math.max(1, Math.round(score / 10)) : 0;

/** database `assessment_type` values allowed by the schema */
export const dbAssessmentType = (k: AssessKind) =>
  k === "teachback"
    ? "teach_back"
    : k === "question"
      ? "prediction"
      : k === "predict"
        ? "prediction"
        : k;

/** Spaced review: weaker mastery comes back sooner. */
export function nextReviewAt(mastery: number, from = new Date()): string {
  const days = mastery >= 80 ? 7 : mastery >= 60 ? 3 : 1;
  return new Date(from.getTime() + days * 86400000).toISOString();
}

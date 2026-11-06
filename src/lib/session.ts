// Classroom session rules (HLD Part 2): what blocks progress and what earns points.
import type { LessonStage } from "./curriculum";

export type Guess = { text: string; at: number; revealed: boolean; correct: boolean };
export type BlankTry = { text: string; correct: boolean; attempts: number; at: number };
export type McqTry = { picked: number; correct: boolean; at: number };
export type SessionState = {
  key: string;
  startedAt: number;
  guesses: Record<string, Guess>;
  blanks: Record<string, BlankTry>;
  /** quick-check multiple-choice answers by question id (absent in sessions saved by older builds) */
  mcqs?: Record<string, McqTry>;
  /** checkpoint turn id -> score once attempted */
  checkpoints: Record<string, { score: number; at: number }>;
  asked: Array<{ q: string; a: string; at: number; turn: number }>;
  stageIndex: number;
  completed: boolean;
};

export const newSession = (key: string, now: number): SessionState => ({
  key,
  startedAt: now,
  guesses: {},
  blanks: {},
  checkpoints: {},
  asked: [],
  stageIndex: 0,
  completed: false,
});

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‘’“”"'`.,;:!?()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const squash = (s: string) => norm(s).replace(/[\s\-_]/g, "");

/** Does `text` contain one of the accepted terms? Short terms must match as whole words. */
export function matchesAny(text: string, accept: string[]): boolean {
  const t = norm(text);
  const sq = squash(text);
  return accept.some((a) => {
    const n = norm(a);
    if (!n) return false;
    if (n.length <= 3)
      return (
        new RegExp(`(^|\\s)${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`).test(t) ||
        sq === squash(a)
      );
    return t.includes(n) || sq.includes(squash(a));
  });
}
/** A blank is correct when the answer equals the expected word/phrase (spacing and case ignored). */
export const blankCorrect = (text: string, answer: string, accept: string[]) =>
  [answer, ...accept].some((a) => squash(a) === squash(text)) ||
  (norm(text).length > 0 && norm(text) === norm(answer));

export type Gate = { ok: boolean; reason?: "blank" | "checkpoint" };
/** Whether the dialogue may move past `stage`. Blanks and checkpoints are blocking (HLD §6.3). */
export function canAdvance(stage: LessonStage, s: SessionState): Gate {
  if (stage.kind === "blank" && stage.blank && !s.blanks[stage.blank.id])
    return { ok: false, reason: "blank" };
  if (stage.kind === "checkpoint" && stage.id && !s.checkpoints[stage.id])
    return { ok: false, reason: "checkpoint" };
  return { ok: true };
}

export function commitGuess(
  s: SessionState,
  stage: LessonStage,
  text: string,
  now: number,
): SessionState {
  const h = stage.hintCard;
  if (!h || !text.trim()) return s;
  const prev = s.guesses[h.id];
  if (prev?.revealed) return s; // a guess is final once the answer has been shown
  return {
    ...s,
    guesses: {
      ...s.guesses,
      [h.id]: { text: text.trim(), at: now, revealed: false, correct: matchesAny(text, h.accept) },
    },
  };
}
/** Reveal is blocked until a guess has been committed. */
export function revealHint(
  s: SessionState,
  stage: LessonStage,
): { state: SessionState; error?: "guess-required" } {
  const h = stage.hintCard;
  const g = h ? s.guesses[h.id] : undefined;
  if (!h || !g) return { state: s, error: "guess-required" };
  return { state: { ...s, guesses: { ...s.guesses, [h.id]: { ...g, revealed: true } } } };
}
export function fillBlank(
  s: SessionState,
  stage: LessonStage,
  text: string,
  now: number,
): { state: SessionState; correct: boolean } {
  const b = stage.blank;
  if (!b || !text.trim()) return { state: s, correct: false };
  const correct = blankCorrect(text, b.answer, b.accept);
  const prev = s.blanks[b.id];
  return {
    state: {
      ...s,
      blanks: {
        ...s.blanks,
        [b.id]: {
          text: text.trim(),
          correct: prev?.correct || correct,
          attempts: (prev?.attempts ?? 0) + 1,
          at: now,
        },
      },
    },
    correct,
  };
}
/** Answer a quick-check question. The first answer is final; the result shows right away. */
export function answerMcq(
  s: SessionState,
  stage: LessonStage,
  picked: number,
  now: number,
): { state: SessionState; correct: boolean } {
  const q = stage.mcq;
  if (!q || picked < 0 || picked >= q.options.length) return { state: s, correct: false };
  const prev = s.mcqs?.[q.id];
  if (prev) return { state: s, correct: prev.correct };
  const correct = picked === q.answer;
  return {
    state: { ...s, mcqs: { ...(s.mcqs ?? {}), [q.id]: { picked, correct, at: now } } },
    correct,
  };
}
export const recordCheckpoint = (
  s: SessionState,
  stage: LessonStage,
  score: number,
  now: number,
): SessionState =>
  stage.id ? { ...s, checkpoints: { ...s.checkpoints, [stage.id]: { score, at: now } } } : s;

/** Points follow learning events only: never for revealing an answer or for time spent. */
export const POINTS = {
  guess: 3,
  blank: 2,
  doubtClosed: 5,
  checkpoint: 5,
  transfer: 8,
  retention: 4,
} as const;

/** Participation measures reported in the pilot (HLD §6.6). */
export function participation(s: SessionState) {
  const g = Object.values(s.guesses);
  const b = Object.values(s.blanks);
  return {
    guessesCommittedBeforeReveal: g.length,
    guessesCorrect: g.filter((x) => x.correct).length,
    blanksAnswered: b.length,
    blanksCorrectFirstTry: b.filter((x) => x.correct && x.attempts === 1).length,
    quickChecksAnswered: Object.keys(s.mcqs ?? {}).length,
    quickChecksCorrect: Object.values(s.mcqs ?? {}).filter((x) => x.correct).length,
    questionsAsked: s.asked.length,
  };
}

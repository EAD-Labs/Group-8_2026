// Spaced repetition (SM-2 style). Each concept has a review schedule; a good quiz result pushes the
// next review further out, a poor one brings it back tomorrow.

export type Srs = {
  /** when the next review is due (ms since epoch) */
  due: number;
  /** current gap between reviews, in days */
  interval: number;
  /** how easy this concept is for you (1.3 = hard … 2.6 = easy) */
  ease: number;
  /** successful reviews in a row */
  reps: number;
  lapses: number;
  /** last time it was reviewed (ms) */
  last: number;
};

export const DAY = 86_400_000;

/** Map a 0-100 score to SM-2's 0-5 recall quality. */
export const qualityOf = (score: number) =>
  score >= 90 ? 5 : score >= 75 ? 4 : score >= 60 ? 3 : score >= 40 ? 2 : score >= 20 ? 1 : 0;

export function scheduleNext(prev: Srs | undefined, score: number, now: number): Srs {
  const q = qualityOf(score);
  const ease0 = prev?.ease ?? 2.3;
  if (q < 3) {
    // forgot: start the ladder again tomorrow
    return {
      due: now + DAY,
      interval: 1,
      ease: Math.max(1.3, ease0 - 0.2),
      reps: 0,
      lapses: (prev?.lapses ?? 0) + 1,
      last: now,
    };
  }
  const reps = (prev?.reps ?? 0) + 1;
  const ease = Math.min(2.8, Math.max(1.3, ease0 + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))));
  const interval = reps === 1 ? 1 : reps === 2 ? 3 : Math.max(prev?.interval ?? 1, 1) * ease;
  return {
    due: now + Math.round(interval * DAY),
    interval: Math.round(interval * 10) / 10,
    ease: Math.round(ease * 100) / 100,
    reps,
    lapses: prev?.lapses ?? 0,
    last: now,
  };
}

export type DueState = "new" | "due" | "scheduled";
export function dueState(s: Srs | undefined, now: number): DueState {
  if (!s) return "new";
  return s.due <= now ? "due" : "scheduled";
}

/** Whole days until due (negative when overdue). */
export const daysUntil = (s: Srs, now: number) => Math.ceil((s.due - now) / DAY);

// Forgetting curve: R(t) = exp(-t / S). Stability S is chosen so recall is ~90% when the review is due.
const K = -Math.log(0.9);
export function recallAt(s: Srs, at: number): number {
  const stability = Math.max(0.5, s.interval) / K;
  const t = Math.max(0, (at - s.last) / DAY);
  return Math.exp(-t / stability);
}

/** Average predicted recall across reviewed concepts for each of the next `days` days if nothing is reviewed. */
export function forecast(all: Srs[], now: number, days = 30): number[] {
  if (!all.length) return [];
  return Array.from(
    { length: days + 1 },
    (_, d) => all.reduce((t, s) => t + recallAt(s, now + d * DAY), 0) / all.length,
  );
}

export function isSrs(v: unknown): v is Srs {
  const o = v as Record<string, unknown> | null;
  return (
    !!o &&
    typeof o === "object" &&
    ["due", "interval", "ease", "reps", "lapses", "last"].every(
      (k) => typeof o[k] === "number" && Number.isFinite(o[k] as number),
    )
  );
}

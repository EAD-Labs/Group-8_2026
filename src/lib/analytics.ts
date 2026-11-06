// Everything the report card shows, computed from the learner's real activity only.

import type { AssessKind } from "./assess";
import { keyOf, refKey, type ConceptRef } from "./quiz";
import { DAY, daysUntil, dueState, forecast, type Srs } from "./srs";

export type AttemptLog = {
  key: string;
  kind: AssessKind;
  score: number;
  at: number;
  /** specific gaps feedback found */ gaps?: string[];
};
export type ConceptState = "new" | "learning" | "strong" | "due";

export type ConceptRow = {
  key: string;
  moduleSlug: string;
  moduleTitle: string;
  title: string;
  bloom: string;
  mastery: number;
  started: boolean;
  state: ConceptState;
  srs?: Srs;
  attempts: number;
  lastAt?: number;
  lastScore?: number;
};

export type Report = {
  overall: number;
  startedCount: number;
  totalCount: number;
  coverage: number;
  streak: number;
  bestStreak: number;
  activeDays: number;
  retention: number | null;
  quizCount: number;
  points: number;
  due: ConceptRow[];
  upcoming: Array<ConceptRow & { inDays: number }>;
  modules: Array<{
    slug: string;
    title: string;
    mastery: number;
    started: number;
    total: number;
    bloom: Record<string, number>;
    concepts: ConceptRow[];
  }>;
  /** attempts per day for the last 84 days, oldest first */
  activity: number[];
  forecast: number[];
  doubts: Array<{
    key: string;
    title: string;
    moduleTitle: string;
    mastery: number;
    lastScore: number;
    gaps: string[];
    at: number;
  }>;
  recent: Array<AttemptLog & { title: string; moduleTitle: string }>;
  transferAvg: number | null;
};

export const dayNumber = (ms: number) =>
  Math.floor((ms - new Date(ms).getTimezoneOffset() * 60000) / DAY);

export function streakOf(
  times: number[],
  now: number,
): { current: number; best: number; activeDays: number } {
  const days = new Set(times.map(dayNumber));
  const today = dayNumber(now);
  let current = 0;
  for (let d = days.has(today) ? today : today - 1; days.has(d); d--) current++;
  let best = 0;
  let run = 0;
  for (const d of [...days].sort((a, b) => a - b)) {
    run = days.has(d - 1) ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return { current, best, activeDays: days.size };
}

export function computeReport(input: {
  pool: ConceptRef[];
  mastery: Record<string, number>;
  attempts: AttemptLog[];
  srs: Record<string, Srs>;
  points: number;
  now: number;
}): Report {
  const { pool, mastery, attempts, srs, now } = input;
  const byKey = new Map(pool.map((p) => [refKey(p), p]));
  const rows: ConceptRow[] = pool.map((p) => {
    const key = refKey(p);
    const mine = attempts.filter((a) => a.key === key).sort((a, b) => a.at - b.at);
    const started = mastery[key] !== undefined || mine.length > 0 || srs[key] !== undefined;
    const m = mastery[key] ?? 0;
    const s = srs[key];
    const st = dueState(s, now);
    const state: ConceptState = !started
      ? "new"
      : st === "due"
        ? "due"
        : m >= 80
          ? "strong"
          : "learning";
    const last = mine.at(-1);
    return {
      key,
      moduleSlug: p.moduleSlug,
      moduleTitle: p.moduleTitle,
      title: p.concept.title,
      bloom: p.concept.bloom,
      mastery: m,
      started,
      state,
      ...(s ? { srs: s } : {}),
      attempts: mine.length,
      ...(last ? { lastAt: last.at, lastScore: last.score } : {}),
    };
  });
  const started = rows.filter((r) => r.started);
  const overall = started.length
    ? Math.round(started.reduce((t, r) => t + r.mastery, 0) / started.length)
    : 0;

  const modules = [...new Set(pool.map((p) => p.moduleSlug))].map((slug) => {
    const cs = rows.filter((r) => r.moduleSlug === slug);
    const st = cs.filter((r) => r.started);
    const bloom: Record<string, number> = {};
    for (const lvl of new Set(cs.map((c) => c.bloom))) {
      const l = st.filter((c) => c.bloom === lvl);
      bloom[lvl] = l.length ? Math.round(l.reduce((t, c) => t + c.mastery, 0) / l.length) : 0;
    }
    return {
      slug,
      title: cs[0]?.moduleTitle ?? slug,
      mastery: st.length ? Math.round(st.reduce((t, c) => t + c.mastery, 0) / st.length) : 0,
      started: st.length,
      total: cs.length,
      bloom,
      concepts: cs,
    };
  });

  const { current, best, activeDays } = streakOf(
    attempts.map((a) => a.at),
    now,
  );
  const today = dayNumber(now);
  const activity = Array.from({ length: 84 }, () => 0);
  for (const a of attempts) {
    const idx = 83 - (today - dayNumber(a.at));
    if (idx >= 0 && idx < 84) activity[idx] = (activity[idx] ?? 0) + 1;
  }
  const quizzes = attempts.filter((a) => a.kind === "retention" && now - a.at <= 30 * DAY);
  const transfers = attempts.filter((a) => a.kind === "transfer");
  const due = rows
    .filter((r) => r.state === "due" && r.srs)
    .sort((a, b) => (a.srs?.due ?? 0) - (b.srs?.due ?? 0));
  const upcoming = rows
    .filter((r) => r.srs && r.state !== "due" && daysUntil(r.srs, now) <= 7)
    .map((r) => ({ ...r, inDays: daysUntil(r.srs as Srs, now) }))
    .sort((a, b) => a.inDays - b.inDays);
  const doubts = rows
    .filter((r) => r.started && r.mastery < 60)
    .map((r) => {
      const mine = attempts.filter((a) => a.key === r.key).sort((a, b) => b.at - a.at);
      const withGaps = mine.find((a) => a.gaps?.length);
      return {
        key: r.key,
        title: r.title,
        moduleTitle: r.moduleTitle,
        mastery: r.mastery,
        lastScore: mine[0]?.score ?? 0,
        gaps: (withGaps?.gaps ?? []).slice(0, 3),
        at: mine[0]?.at ?? 0,
      };
    })
    .sort((a, b) => a.mastery - b.mastery)
    .slice(0, 8);
  const recent = attempts
    .slice()
    .sort((a, b) => b.at - a.at)
    .slice(0, 12)
    .map((a) => ({
      ...a,
      title: byKey.get(a.key)?.concept.title ?? a.key.split(":")[1] ?? a.key,
      moduleTitle: byKey.get(a.key)?.moduleTitle ?? "",
    }));

  return {
    overall,
    startedCount: started.length,
    totalCount: rows.length,
    coverage: rows.length ? Math.round((started.length / rows.length) * 100) : 0,
    streak: current,
    bestStreak: best,
    activeDays,
    retention: quizzes.length
      ? Math.round(quizzes.reduce((t, a) => t + a.score, 0) / quizzes.length)
      : null,
    quizCount: quizzes.length,
    points: input.points,
    due,
    upcoming,
    modules,
    activity,
    forecast: forecast(Object.values(srs), now, 30).map((v) => Math.round(v * 100)),
    doubts,
    recent,
    transferAvg: transfers.length
      ? Math.round(transfers.reduce((t, a) => t + a.score, 0) / transfers.length)
      : null,
  };
}

export { keyOf };

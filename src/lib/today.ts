// The front page: today's to-do list. New lectures for today (a fixed number per day, in course order,
// kept for the whole day once planned), the retention quizzes that fall due today, anything left
// half-way, and doubts still open. Everything is derived from real progress; nothing is ticked by hand.
import type { Ladder } from "./mastery";

export type Lecture = {
  key: string;
  mi: number;
  ci: number;
  title: string;
  module: string;
  minutes: number;
};
export type TodayLecture = Lecture & {
  status: "todo" | "in-progress" | "done";
  at?: number;
  total?: number;
};
export type TodayQuiz = {
  key: string;
  title: string;
  module: string;
  dueAt: number;
  overdueDays: number;
};
export type TodayPlan = { day: string; keys: string[] };
export type Today = {
  day: string;
  plan: TodayPlan;
  lectures: TodayLecture[];
  quizzes: TodayQuiz[];
  /** an unfinished lecture that is not already on today's list */
  resume: TodayLecture | null;
  doubts: string[];
  done: number;
  total: number;
};

const RANK: Record<Ladder, number> = {
  "not-started": 0,
  exposed: 1,
  understood: 2,
  retained: 3,
  mastered: 4,
};
const DAY = 86_400_000;

/** Local calendar day (the demo clock moves it too). */
export const dayOf = (now: number) => {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const endOfDay = (now: number) => {
  const d = new Date(now);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
};

export function planToday(i: {
  order: Lecture[];
  ladder: (key: string) => Ladder;
  session: (key: string) => { stageIndex: number; completed: boolean; total: number } | undefined;
  nextCheckAt: (key: string) => number | undefined;
  openDoubts: string[];
  now: number;
  perDay: number;
  saved?: TodayPlan | null;
}): Today {
  const day = dayOf(i.now);
  const learned = (k: string) => RANK[i.ladder(k)] >= RANK.understood;
  const started = (k: string) => {
    const s = i.session(k);
    return !!s && s.stageIndex > 0 && !s.completed;
  };
  const known = new Set(i.order.map((l) => l.key));
  // once today's lectures are chosen they stay for the day (finishing one does not pull the next one in)
  let keys = i.saved?.day === day ? i.saved.keys.filter((k) => known.has(k)) : [];
  if (!keys.length) {
    const unfinished = i.order.filter((l) => !learned(l.key));
    const firstStarted = unfinished.filter((l) => started(l.key));
    const rest = unfinished.filter((l) => !started(l.key));
    keys = [...firstStarted, ...rest].slice(0, Math.max(1, i.perDay)).map((l) => l.key);
  }
  const byKey = new Map(i.order.map((l) => [l.key, l]));
  const status = (k: string): TodayLecture["status"] =>
    learned(k) ? "done" : started(k) ? "in-progress" : "todo";
  const withStatus = (l: Lecture): TodayLecture => {
    const s = i.session(l.key);
    return {
      ...l,
      status: status(l.key),
      ...(s && !s.completed && s.stageIndex > 0 ? { at: s.stageIndex + 1, total: s.total } : {}),
    };
  };
  const lectures = keys
    .map((k) => byKey.get(k))
    .filter((l): l is Lecture => !!l)
    .map(withStatus);
  const cutoff = endOfDay(i.now);
  const quizzes = i.order
    .filter((l) => [RANK.understood, RANK.retained].includes(RANK[i.ladder(l.key)]))
    .map((l) => ({ l, due: i.nextCheckAt(l.key) }))
    .filter((x): x is { l: Lecture; due: number } => typeof x.due === "number" && x.due <= cutoff)
    .sort((a, b) => a.due - b.due)
    .map(({ l, due }) => ({
      key: l.key,
      title: l.title,
      module: l.module,
      dueAt: due,
      overdueDays: Math.max(0, Math.floor((i.now - due) / DAY)),
    }));
  const resumeL = i.order.find((l) => started(l.key) && !learned(l.key) && !keys.includes(l.key));
  const doneLectures = lectures.filter((l) => l.status === "done").length;
  return {
    day,
    plan: { day, keys },
    lectures,
    quizzes,
    resume: resumeL ? withStatus(resumeL) : null,
    doubts: i.openDoubts,
    done: doneLectures,
    total: lectures.length + quizzes.length,
  };
}

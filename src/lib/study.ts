// Comparative study (HLD §6.3, §6.4, D-03): within-subject, counterbalanced, matched by Bloom tier.
// Each learner gets one same-tier pair of concepts; one is learned on the platform, the other in a
// plain chat window, with the same time budget. After a 3-5 day delay both are tested (retention +
// transfer), and the comparison is a within-learner delta.
import { STUDY_PAIRS } from "./knowledge/seed";

export type Condition = "platform" | "chat";
export type TestResult = { retention: number; transfer: number; at: number };
export type StudyRun = {
  participantId: string;
  participantNo: number;
  pairId: string;
  assignments: Record<string, Condition>;
  budgetMin: number;
  /** minutes spent per concept (platform class or chat) */
  minutes: Record<string, number>;
  chatTurns: Record<string, number>;
  startedAt: number;
  learningDoneAt?: number;
  delayDays: number;
  tests: Record<string, TestResult>;
  doubtsClosed: number;
  exportedAt?: number;
};

const mulberry = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
/** The 8 slots (4 pairs x 2 platform choices) in a seeded random order. */
export function slotOrder(seed = 617): number[] {
  const r = mulberry(seed);
  const a = [0, 1, 2, 3, 4, 5, 6, 7];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j] as number, a[i] as number];
  }
  return a;
}
/**
 * Participant n (1-based) -> pair and which concept is learned on the platform. Every block of 8
 * participants covers all four pairs with each concept on the platform exactly once, so neither topic
 * nor order biases the result; the order within a block is random.
 */
export function assignParticipant(
  n: number,
  seed = 617,
): { pairId: string; assignments: Record<string, Condition> } {
  const block = Math.floor((n - 1) / 8);
  const slot = slotOrder(seed + block)[(n - 1) % 8] as number;
  const pair = STUDY_PAIRS[slot % 4]!;
  const platformIdx = Math.floor(slot / 4);
  const [a, b] = pair.concepts;
  return {
    pairId: pair.id,
    assignments:
      platformIdx === 0 ? { [a]: "platform", [b]: "chat" } : { [a]: "chat", [b]: "platform" },
  };
}
export const newRun = (
  participantId: string,
  participantNo: number,
  now: number,
  budgetMin = 15,
  delayDays = 3,
): StudyRun => {
  const { pairId, assignments } = assignParticipant(participantNo);
  return {
    participantId,
    participantNo,
    pairId,
    assignments,
    budgetMin,
    minutes: {},
    chatTurns: {},
    startedAt: now,
    delayDays,
    tests: {},
    doubtsClosed: 0,
  };
};
export const testsOpenAt = (r: StudyRun) =>
  r.learningDoneAt ? r.learningDoneAt + r.delayDays * 86_400_000 : undefined;
export const runComplete = (r: StudyRun) => Object.keys(r.assignments).every((k) => r.tests[k]);

// ------------------------------------------------------------------ statistics
function lgamma(x: number): number {
  const c = [
    76.18009172947146, -86.5053203294168, 24.01409824083091, -1.231739572450155,
    0.12086509738662e-2, -0.5395239384953e-5,
  ];
  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.00000000019002;
  for (const cj of c) ser += cj / ++y;
  return -tmp + Math.log((2.506628274631 * ser) / x);
}
function betacf(a: number, b: number, x: number): number {
  let qab = a + b,
    qap = a + 1,
    qam = a - 1,
    c = 1,
    d = 1 - (qab * x) / qap;
  if (Math.abs(d) < 1e-30) d = 1e-30;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 200; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + aa / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + aa / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 3e-12) break;
  }
  qab = 0;
  qap = 0;
  qam = 0;
  return h;
}
const ibeta = (x: number, a: number, b: number) => {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(
    lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x),
  );
  return x < (a + 1) / (a + b + 2)
    ? (bt * betacf(a, b, x)) / a
    : 1 - (bt * betacf(b, a, 1 - x)) / b;
};
/** Two-sided p-value of Student's t with `df` degrees of freedom. */
export const tTwoSidedP = (t: number, df: number) => ibeta(df / (df + t * t), df / 2, 0.5);
/** Critical t for a two-sided 95% interval (bisection on the CDF). */
export function tCrit95(df: number): number {
  let lo = 0,
    hi = 50;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (tTwoSidedP(mid, df) > 0.05) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
const mean = (x: number[]) => x.reduce((a, b) => a + b, 0) / Math.max(1, x.length);
const sd = (x: number[]) => {
  const m = mean(x);
  return Math.sqrt(x.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, x.length - 1));
};

export type Delta = {
  n: number;
  platformMean: number;
  chatMean: number;
  meanDelta: number;
  sd: number;
  ci: [number, number];
  t: number;
  df: number;
  p: number;
  dz: number;
};
/** Paired comparison from per-learner (platform, chat) scores. */
export function pairedDelta(platform: number[], chat: number[]): Delta {
  const n = Math.min(platform.length, chat.length);
  const d = Array.from({ length: n }, (_, i) => (platform[i] as number) - (chat[i] as number));
  const md = mean(d);
  const s = sd(d);
  const se = s / Math.sqrt(Math.max(1, n));
  const t = se > 0 ? md / se : md === 0 ? 0 : Infinity * Math.sign(md);
  const df = Math.max(1, n - 1);
  const crit = n > 1 ? tCrit95(df) : 0;
  return {
    n,
    platformMean: mean(platform.slice(0, n)),
    chatMean: mean(chat.slice(0, n)),
    meanDelta: md,
    sd: s,
    ci: [md - crit * se, md + crit * se],
    t,
    df,
    p: Number.isFinite(t) ? tTwoSidedP(t, df) : 0,
    dz: s > 0 ? md / s : 0,
  };
}

export type Cohort = {
  n: number;
  reportable: boolean;
  retention: Delta;
  transfer: Delta;
  retainedShare: { platform: number; chat: number };
  meanDoubtsClosed: number;
  byPair: Record<string, number>;
  platformFirstShare: number;
};
const RETAINED = 60;
/** Cohort report from completed runs (HLD: the three headline figures + the within-learner delta). */
export function cohortReport(runs: StudyRun[], minForReport = 15): Cohort {
  const done = runs.filter(runComplete);
  const pick = (r: StudyRun, c: Condition) =>
    r.tests[Object.keys(r.assignments).find((k) => r.assignments[k] === c)!]!;
  const plat = done.map((r) => pick(r, "platform"));
  const chat = done.map((r) => pick(r, "chat"));
  const byPair: Record<string, number> = {};
  for (const r of done) byPair[r.pairId] = (byPair[r.pairId] ?? 0) + 1;
  return {
    n: done.length,
    reportable: done.length >= minForReport,
    retention: pairedDelta(
      plat.map((x) => x.retention),
      chat.map((x) => x.retention),
    ),
    transfer: pairedDelta(
      plat.map((x) => x.transfer),
      chat.map((x) => x.transfer),
    ),
    retainedShare: {
      platform: done.length ? plat.filter((x) => x.retention >= RETAINED).length / done.length : 0,
      chat: done.length ? chat.filter((x) => x.retention >= RETAINED).length / done.length : 0,
    },
    meanDoubtsClosed: mean(done.map((r) => r.doubtsClosed)),
    byPair,
    platformFirstShare: done.length
      ? done.filter(
          (r) =>
            Object.keys(r.assignments)[0] !== undefined &&
            r.assignments[Object.keys(r.assignments)[0]!] === "platform",
        ).length / done.length
      : 0,
  };
}
export function isRun(v: unknown): v is StudyRun {
  const o = v as StudyRun | null;
  return (
    !!o &&
    typeof o.participantId === "string" &&
    typeof o.pairId === "string" &&
    !!o.assignments &&
    typeof o.assignments === "object" &&
    !!o.tests &&
    typeof o.tests === "object"
  );
}
export const toCsv = (runs: StudyRun[]) => {
  const rows = [
    [
      "participant",
      "pair",
      "platform_concept",
      "chat_concept",
      "platform_retention",
      "chat_retention",
      "platform_transfer",
      "chat_transfer",
      "doubts_closed",
    ],
  ];
  for (const r of runs.filter(runComplete)) {
    const keys = Object.keys(r.assignments);
    const p = keys.find((k) => r.assignments[k] === "platform")!;
    const c = keys.find((k) => r.assignments[k] === "chat")!;
    rows.push([
      r.participantId,
      r.pairId,
      p,
      c,
      String(r.tests[p]!.retention),
      String(r.tests[c]!.retention),
      String(r.tests[p]!.transfer),
      String(r.tests[c]!.transfer),
      String(r.doubtsClosed),
    ]);
  }
  return rows.map((x) => x.join(",")).join("\n");
};

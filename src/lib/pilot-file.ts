// Pilot files: each tester downloads one file at the end (their check-in answers, feedback and progress —
// no audio, no names); the Evaluation screen pools every file into the pilot report.
import { CLAIMED, judge, loadGuesses, type RetentionGuess } from "./calibration";
import { loadThinking, type ThinkingLog } from "./thinking-chat";

export type PilotFile = {
  kind: "aikyro-pilot";
  v: 1;
  participant: string;
  exportedAt: string;
  /** per concept: the check-in answers and feedback */
  classes: Record<string, ThinkingLog>;
  /** per concept: where it stands on the ladder */
  ladder: Record<string, string>;
  doubtsOpen: number;
  doubtsClosed: number;
  /** predictions made before retention quizzes, with the results (absent in files from older builds) */
  retention?: RetentionGuess[];
};

/** Gather this browser's pilot data (works offline; nothing leaves the device until the learner shares the file). */
export function buildPilotFile(storage: Storage, participant: string): PilotFile {
  const classes: Record<string, ThinkingLog> = {};
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i) ?? "";
    if (!k.startsWith("kyro_thinking_v2:")) continue;
    const concept = decodeURIComponent(k.split(":").slice(2).join(":"));
    const log = loadThinking(storage, k);
    if (Object.keys(log).length) classes[concept] = log;
  }
  let ladder: Record<string, string> = {};
  let open = 0,
    closed = 0;
  try {
    const l = JSON.parse(storage.getItem("kyro_learner_v1") ?? "{}");
    const concepts = l?.learner?.concepts ?? {};
    ladder = Object.fromEntries(
      Object.entries(concepts).map(([k, v]) => [
        k,
        String((v as { state?: string }).state ?? "not-started"),
      ]),
    );
    const doubts: Array<{ closedAt?: number }> = l?.learner?.doubts ?? [];
    open = doubts.filter((d) => !d.closedAt).length;
    closed = doubts.filter((d) => d.closedAt).length;
  } catch {
    /* no progress yet */
  }
  return {
    kind: "aikyro-pilot",
    v: 1,
    participant,
    exportedAt: new Date().toISOString(),
    classes,
    ladder,
    doubtsOpen: open,
    doubtsClosed: closed,
  };
}

export function parsePilotFile(text: string): PilotFile | null {
  try {
    const o = JSON.parse(text);
    return o && o.kind === "aikyro-pilot" && o.v === 1 && typeof o.classes === "object"
      ? (o as PilotFile)
      : null;
  } catch {
    return null;
  }
}

export type PilotReport = {
  learners: number;
  classes: number;
  usefulness: { mean: number | null; n: number; counts: number[] };
  felt: { expected: number; better: number; worse: number };
  confidence: { up: number; same: number; down: number; n: number };
  ladder: Record<string, number>;
  doubtsClosed: number;
  doubtsOpen: number;
  comments: string[];
  calibration: {
    /** confidence given before the checkpoint result vs the score */
    checkpoint: { n: number; matched: number; over: number; under: number; gap: number | null };
    /** matched rate in each learner's earlier vs later checkpoints (learners with 2+), pooled */
    trend: { early: number | null; late: number | null; learners: number };
    /** prediction before a retention quiz vs the result */
    retention: { n: number; matched: number; over: number; under: number };
    /** of the concepts a learner was "Certain" about at the checkpoint, how many retention quizzes they passed */
    certainThenRetained: { n: number; passed: number };
    pulse: { yes: number; mostly: number; lost: number };
  };
};

/** Pool many pilot files into one report. Same participant twice: the newer file wins. */
export function pilotReport(files: PilotFile[]): PilotReport {
  const latest = new Map<string, PilotFile>();
  for (const f of files) {
    const prev = latest.get(f.participant);
    if (!prev || prev.exportedAt < f.exportedAt) latest.set(f.participant, f);
  }
  const all = [...latest.values()];
  const logs = all.flatMap((f) => Object.values(f.classes));
  const useful = logs.map((l) => l.useful).filter((x): x is number => typeof x === "number");
  const counts = [1, 2, 3, 4, 5].map((v) => useful.filter((x) => x === v).length);
  const conf = logs.filter((l) => l.know !== undefined && l.sureNow !== undefined);
  const ladder: Record<string, number> = {};
  for (const f of all) for (const st of Object.values(f.ladder)) ladder[st] = (ladder[st] ?? 0) + 1;
  return {
    learners: all.length,
    classes: logs.length,
    usefulness: {
      mean: useful.length
        ? Math.round((useful.reduce((a, b) => a + b, 0) / useful.length) * 10) / 10
        : null,
      n: useful.length,
      counts,
    },
    felt: {
      expected: logs.filter((l) => l.felt === "expected").length,
      better: logs.filter((l) => l.felt === "better").length,
      worse: logs.filter((l) => l.felt === "worse").length,
    },
    confidence: {
      up: conf.filter((l) => l.sureNow! > l.know!).length,
      same: conf.filter((l) => l.sureNow === l.know).length,
      down: conf.filter((l) => l.sureNow! < l.know!).length,
      n: conf.length,
    },
    ladder,
    doubtsClosed: all.reduce((a, f) => a + f.doubtsClosed, 0),
    doubtsOpen: all.reduce((a, f) => a + f.doubtsOpen, 0),
    comments: logs.map((l) => l.improve).filter((x): x is string => !!x && x.trim().length > 2),
    calibration: calibrationOf(all),
  };
}

const rate = (xs: boolean[]) =>
  xs.length ? Math.round((xs.filter(Boolean).length / xs.length) * 100) : null;
function calibrationOf(all: PilotFile[]): PilotReport["calibration"] {
  const cps = all.flatMap((f) =>
    Object.values(f.classes).filter(
      (l): l is ThinkingLog & { cpConf: number; scorePct: number } =>
        l.cpConf !== undefined && l.scorePct !== undefined,
    ),
  );
  const j = cps.map((l) => judge(l.cpConf, l.scorePct));
  const early: boolean[] = [];
  const late: boolean[] = [];
  let learners = 0;
  for (const f of all) {
    const mine = Object.values(f.classes)
      .filter((l) => l.cpConf !== undefined && l.scorePct !== undefined)
      .sort((a, b) => (a.cpAt ?? 0) - (b.cpAt ?? 0));
    if (mine.length < 2) continue;
    learners++;
    const half = Math.floor(mine.length / 2);
    mine.forEach((l, i) =>
      (i < half ? early : late).push(judge(l.cpConf!, l.scorePct!) === "matched"),
    );
  }
  const guesses = all.flatMap((f) => f.retention ?? []);
  const gj = guesses.map((g) => judge(g.predicted, g.scorePct));
  let certainN = 0;
  let certainPassed = 0;
  for (const f of all)
    for (const [concept, l] of Object.entries(f.classes)) {
      if (l.cpConf !== 2) continue;
      const later = (f.retention ?? []).filter(
        (g) => g.concepts.includes(concept) && g.at > (l.cpAt ?? 0),
      );
      if (!later.length) continue;
      certainN++;
      if (later[later.length - 1]!.scorePct >= 60) certainPassed++;
    }
  const logs = all.flatMap((f) => Object.values(f.classes));
  return {
    checkpoint: {
      n: cps.length,
      matched: j.filter((x) => x === "matched").length,
      over: j.filter((x) => x === "over").length,
      under: j.filter((x) => x === "under").length,
      gap: cps.length
        ? Math.round(
            cps.reduce((a, l) => a + Math.abs(CLAIMED[l.cpConf as 0 | 1 | 2] - l.scorePct), 0) /
              cps.length,
          )
        : null,
    },
    trend: { early: rate(early), late: rate(late), learners },
    retention: {
      n: guesses.length,
      matched: gj.filter((x) => x === "matched").length,
      over: gj.filter((x) => x === "over").length,
      under: gj.filter((x) => x === "under").length,
    },
    certainThenRetained: { n: certainN, passed: certainPassed },
    pulse: {
      yes: logs.filter((l) => l.pulse === "yes").length,
      mostly: logs.filter((l) => l.pulse === "mostly").length,
      lost: logs.filter((l) => l.pulse === "lost").length,
    },
  };
}

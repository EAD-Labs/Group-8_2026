import {
  assignParticipant,
  newRun,
  pairedDelta,
  tTwoSidedP,
  tCrit95,
  cohortReport,
  slotOrder,
  testsOpenAt,
  runComplete,
  toCsv,
  isRun,
  type StudyRun,
} from "../src/lib/study";
import { STUDY_PAIRS } from "../src/lib/knowledge/seed";
let f = 0;
const ok = (c: boolean, m: string) => {
  console.log((c ? "PASS " : "FAIL ") + m);
  if (!c) f++;
};
// reference values for Student's t
ok(
  Math.abs(tTwoSidedP(2.145, 14) - 0.05) < 0.002,
  `t=2.145, df=14 → p ≈ 0.05 (${tTwoSidedP(2.145, 14).toFixed(4)})`,
);
ok(
  Math.abs(tTwoSidedP(2.977, 14) - 0.01) < 0.001,
  `t=2.977, df=14 → p ≈ 0.01 (${tTwoSidedP(2.977, 14).toFixed(4)})`,
);
ok(Math.abs(tTwoSidedP(0, 9) - 1) < 1e-9 && tTwoSidedP(10, 20) < 1e-8, "t=0 → p=1; huge t → p≈0");
ok(
  Math.abs(tCrit95(14) - 2.145) < 0.005 &&
    Math.abs(tCrit95(29) - 2.045) < 0.005 &&
    Math.abs(tCrit95(9) - 2.262) < 0.005,
  `95% critical values match tables (df14 ${tCrit95(14).toFixed(3)}, df29 ${tCrit95(29).toFixed(3)})`,
);
// a worked paired example computed by hand: d = [10,12,8,15,9,11,14,7], mean 10.75, sd 2.76 → t = 11.0 / ...
const plat = [70, 80, 60, 85, 75, 90, 65, 72],
  chat = [60, 68, 52, 70, 66, 79, 51, 65];
const d = pairedDelta(plat, chat);
ok(
  Math.abs(d.meanDelta - 10.75) < 1e-9 && d.n === 8 && d.df === 7,
  `paired delta: mean ${d.meanDelta}, n=${d.n}`,
);
const dd = plat.map((x, i) => x - chat[i]!);
const m = dd.reduce((a, b) => a + b) / 8;
const s = Math.sqrt(dd.reduce((a, b) => a + (b - m) ** 2, 0) / 7);
ok(
  Math.abs(d.t - m / (s / Math.sqrt(8))) < 1e-9 &&
    d.ci[0] < d.meanDelta &&
    d.ci[1] > d.meanDelta &&
    d.p < 0.01,
  `t=${d.t.toFixed(2)}, p=${d.p.toFixed(4)}, 95% CI [${d.ci[0].toFixed(1)}, ${d.ci[1].toFixed(1)}], dz=${d.dz.toFixed(2)}`,
);
const z = pairedDelta([50, 60, 70], [50, 60, 70]);
ok(z.meanDelta === 0 && z.p === 1 && z.dz === 0, "identical scores → no effect, p = 1");
// assignment is balanced and counterbalanced
const slots = slotOrder(617);
ok(
  [...slots].sort().join() === "0,1,2,3,4,5,6,7",
  "slot order is a permutation of the 8 (pair × platform-side) combinations",
);
const first8 = Array.from({ length: 8 }, (_, i) => assignParticipant(i + 1));
ok(
  new Set(first8.map((a) => a.pairId)).size === 4 &&
    STUDY_PAIRS.every((p) => first8.filter((a) => a.pairId === p.id).length === 2),
  "every block of 8 participants covers all four pairs twice",
);
ok(
  STUDY_PAIRS.every((p) => {
    const rows = first8.filter((a) => a.pairId === p.id);
    return (
      rows.length === 2 &&
      rows.some((a) => a.assignments[p.concepts[0]] === "platform") &&
      rows.some((a) => a.assignments[p.concepts[1]] === "platform")
    );
  }),
  "…and within each pair each concept is on the platform exactly once (counterbalanced)",
);
ok(
  first8.every((a) => Object.values(a.assignments).sort().join() === "chat,platform"),
  "every learner gets one platform concept and one plain-chat concept from the SAME pair",
);
const forty = Array.from({ length: 40 }, (_, i) => assignParticipant(i + 1));
const share = forty.filter((a) => Object.values(a.assignments)[0] === "platform").length / 40;
ok(
  share === 0.5,
  `over 40 learners exactly half have the first concept on the platform (${share})`,
);
ok(
  JSON.stringify(assignParticipant(13)) === JSON.stringify(assignParticipant(13)),
  "assignment is reproducible for a given participant number",
);
ok(
  forty
    .slice(0, 8)
    .map((a) => a.pairId)
    .join() !==
    forty
      .slice(8, 16)
      .map((a) => a.pairId)
      .join(),
  "the order differs between blocks (randomised), so it is not a fixed rotation",
);
// cohort report
const NOW = 1_800_000_000_000;
const mk = (i: number, bonus: number): StudyRun => {
  const r = newRun("P" + i, i, NOW);
  const [a, b] = Object.keys(r.assignments) as [string, string];
  const pk = r.assignments[a] === "platform" ? a : b,
    ck = pk === a ? b : a;
  r.tests[pk] = {
    retention: Math.min(100, 62 + bonus + (i % 5) * 3),
    transfer: 55 + bonus + (i % 4) * 4,
    at: NOW,
  };
  r.tests[ck] = { retention: 50 + (i % 5) * 4, transfer: 45 + (i % 4) * 4, at: NOW };
  r.doubtsClosed = 2 + (i % 3);
  return r;
};
const runs = Array.from({ length: 16 }, (_, i) => mk(i + 1, 12));
const rep = cohortReport(runs);
ok(
  rep.n === 16 && rep.reportable,
  "T3.9 16 completed learners → the comparison is reportable (≥15)",
);
ok(
  rep.retention.meanDelta > 5 && rep.retention.p < 0.05 && rep.transfer.meanDelta > 5,
  `headline figures: retention Δ ${rep.retention.meanDelta.toFixed(1)} pts (p=${rep.retention.p.toFixed(4)}), transfer Δ ${rep.transfer.meanDelta.toFixed(1)} pts`,
);
ok(
  rep.retainedShare.platform > rep.retainedShare.chat && rep.meanDoubtsClosed > 0,
  `share Retained: platform ${(rep.retainedShare.platform * 100).toFixed(0)}% vs chat ${(rep.retainedShare.chat * 100).toFixed(0)}%; mean doubts closed ${rep.meanDoubtsClosed.toFixed(1)}`,
);
ok(!cohortReport(runs.slice(0, 10)).reportable, "only 10 learners → flagged as NOT reportable");
const partial = newRun("PX", 99, NOW);
ok(
  !runComplete(partial) && cohortReport([...runs, partial]).n === 16,
  "an incomplete run (missing a test) is excluded from the report",
);
ok(
  testsOpenAt(partial) === undefined &&
    testsOpenAt({ ...partial, learningDoneAt: NOW }) === NOW + 3 * 86_400_000,
  "the delayed tests open `delayDays` after learning finished",
);
ok(
  toCsv(runs).split("\n").length === 17 && isRun(runs[0]) && !isRun({ x: 1 }) && !isRun(null),
  "CSV export has one row per completed learner; import validation rejects junk",
);
console.log(f ? `${f} FAILED` : "ALL PASSED");
process.exit(f ? 1 : 0);

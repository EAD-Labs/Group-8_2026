// Pilot files and the pooled evaluation report.
import { buildPilotFile, parsePilotFile, pilotReport, type PilotFile } from "../src/lib/pilot-file";
import { thinkingKey } from "../src/lib/thinking-chat";
import { judge, scoreBucket } from "../src/lib/calibration";
let f = 0; const ok = (c: boolean, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) f++; };
const mem = (init: Record<string, string>) => { const m = new Map(Object.entries(init)); return { get length() { return m.size; }, key: (i: number) => [...m.keys()][i] ?? null, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), clear: () => m.clear() } as Storage; };
const s = mem({
  [thinkingKey("u1", "thermodynamics:second-law")]: JSON.stringify({ know: 1, sureNow: 2, felt: "expected", scorePct: 70, useful: 4, improve: "slower voice" }),
  [thinkingKey("u1", "thermodynamics:first-law")]: JSON.stringify({ know: 2, sureNow: 1, felt: "worse", scorePct: 40, useful: 2 }),
  kyro_learner_v1: JSON.stringify({ learner: { concepts: { "thermodynamics:second-law": { state: "understood" }, "thermodynamics:first-law": { state: "exposed" } }, doubts: [{ closedAt: 5 }, {}] } }),
  unrelated: "x",
});
const file = buildPilotFile(s, "u1");
ok(file.kind === "aikyro-pilot" && Object.keys(file.classes).length === 2 && file.classes["thermodynamics:second-law"]!.useful === 4, "a pilot file holds each class's check-in answers and feedback");
ok(file.ladder["thermodynamics:second-law"] === "understood" && file.doubtsClosed === 1 && file.doubtsOpen === 1, "…and the progress and doubts");
ok(!JSON.stringify(file).includes("unrelated") && !/audio|password|email/i.test(JSON.stringify(file)), "…and nothing else from the device");
ok(parsePilotFile(JSON.stringify(file))?.participant === "u1" && parsePilotFile("{}") === null && parsePilotFile("nope") === null, "only real pilot files are accepted");
const other: PilotFile = { ...file, participant: "u2", classes: { "x:y": { useful: 5, felt: "better", know: 0, sureNow: 3 } }, ladder: { "x:y": "retained" }, doubtsClosed: 2, doubtsOpen: 0 };
const old: PilotFile = { ...file, exportedAt: "2000-01-01T00:00:00Z", classes: { "z:z": { useful: 1 } } };
const r = pilotReport([file, other, old]);
ok(r.learners === 2, "the same tester loading two files counts once (the newer file wins)");
ok(r.usefulness.n === 3 && r.usefulness.mean === 3.7 && r.usefulness.counts.join() === "0,1,0,1,1", "usefulness: average and the 1–5 spread");
ok(r.felt.expected === 1 && r.felt.worse === 1 && r.felt.better === 1, "how often learners judged themselves correctly / over / under");
ok(r.confidence.up === 2 && r.confidence.down === 1, "confidence before vs after each class");
ok(r.ladder["understood"] === 1 && r.ladder["retained"] === 1 && r.doubtsClosed === 3, "progress and cleared doubts are pooled");
ok(r.comments.join() === "slower voice", "improvement comments are collected");
ok(pilotReport([]).learners === 0 && pilotReport([]).usefulness.mean === null, "no files: an empty report, not an error");

ok([scoreBucket(30), scoreBucket(65), scoreBucket(85)].join() === "0,1,2" && judge(2, 40) === "over" && judge(0, 90) === "under" && judge(1, 70) === "matched", "a confidence level is matched, over- or under-confident against the score");
const calFile: PilotFile = { kind: "aikyro-pilot", v: 1, participant: "c1", exportedAt: "2026-11-05T00:00:00Z", ladder: {}, doubtsOpen: 0, doubtsClosed: 0,
  classes: {
    "a:1": { cpConf: 2, scorePct: 40, cpAt: 1, pulse: "lost" },   // early: over-confident
    "a:2": { cpConf: 0, scorePct: 85, cpAt: 2, pulse: "yes" },    // early: under-confident
    "a:3": { cpConf: 1, scorePct: 70, cpAt: 3, pulse: "yes" },    // later: matched
    "a:4": { cpConf: 2, scorePct: 90, cpAt: 4, pulse: "mostly" }, // later: matched
  },
  retention: [ { at: 10, predicted: 2, scorePct: 90, concepts: ["a:4"] }, { at: 11, predicted: 2, scorePct: 30, concepts: ["a:1"] } ] };
const c = pilotReport([calFile]).calibration;
ok(c.checkpoint.n === 4 && c.checkpoint.matched === 2 && c.checkpoint.over === 1 && c.checkpoint.under === 1, "checkpoint calibration: 2 matched, 1 over-confident, 1 under-confident");
ok(c.checkpoint.gap === Math.round((50 + 55 + 5 + 0) / 4), "the average gap between claimed and actual score, in points: " + c.checkpoint.gap);
ok(c.trend.learners === 1 && c.trend.early === 0 && c.trend.late === 100, "the trend shows the learner getting better at judging themselves (0% → 100% matched)");
ok(c.retention.n === 2 && c.retention.matched === 1 && c.retention.over === 1, "retention predictions are compared with the quiz results");
ok(c.certainThenRetained.n === 2 && c.certainThenRetained.passed === 1, "of the concepts a learner was certain about, how many they passed days later");
ok(c.pulse.yes === 2 && c.pulse.mostly === 1 && c.pulse.lost === 1, "the mid-class pulse is counted");
const old2 = { ...calFile, participant: "c2" } as PilotFile; delete (old2 as { retention?: unknown }).retention;
ok(pilotReport([old2]).calibration.retention.n === 0, "files from older builds (no predictions) still work");
console.log(f ? `${f} FAILED` : "ALL PASSED"); process.exit(f ? 1 : 0);

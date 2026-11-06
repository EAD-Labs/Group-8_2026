import { modules } from "../src/lib/pilot";
import { computeReport, dayNumber, streakOf, type AttemptLog } from "../src/lib/analytics";
import { DAY, scheduleNext, type Srs } from "../src/lib/srs";
import { refKey, type ConceptRef } from "../src/lib/quiz";
let f = 0;
const ok = (c: boolean, m: string) => {
  console.log((c ? "PASS " : "FAIL ") + m);
  if (!c) f++;
};
const NOW = new Date(2026, 10, 15, 14, 0, 0).getTime(); // local time
const pool: ConceptRef[] = modules.flatMap((m) =>
  m.concepts.map((c) => ({ moduleSlug: m.slug, moduleTitle: m.title, concept: c })),
);
ok(
  pool.every((p) => p.concept.mastery === 0),
  "built-in lessons no longer ship invented mastery numbers",
);

// fresh learner
const empty = computeReport({ pool, mastery: {}, attempts: [], srs: {}, points: 0, now: NOW });
ok(
  empty.overall === 0 &&
    empty.startedCount === 0 &&
    empty.streak === 0 &&
    empty.retention === null &&
    empty.due.length === 0 &&
    empty.forecast.length === 0 &&
    empty.doubts.length === 0 &&
    empty.recent.length === 0,
  "empty state: zeros/nulls, nothing invented",
);
ok(
  empty.modules.length === 2 &&
    empty.modules.every((m) => m.mastery === 0 && m.started === 0) &&
    empty.activity.length === 84 &&
    empty.activity.every((n) => n === 0),
  "modules listed, empty 84-day activity",
);
ok(
  empty.modules[0]!.concepts.every((c) => c.state === "new"),
  "unstarted concepts are 'new'",
);

// streaks
const at = (daysAgo: number, h = 10) => new Date(2026, 10, 15 - daysAgo, h).getTime();
ok(
  streakOf([at(0), at(1), at(2)], NOW).current === 3,
  "streak counts consecutive days including today",
);
ok(streakOf([at(1), at(2)], NOW).current === 2, "streak survives if you haven't studied yet today");
ok(streakOf([at(2), at(3)], NOW).current === 0, "streak broken after a missed day");
ok(
  streakOf([at(0), at(0, 18), at(0, 21)], NOW).current === 1,
  "several attempts in one day = one day",
);
const sb = streakOf([at(0), at(1), at(2), at(3), at(10), at(11)], NOW);
ok(sb.best === 4 && sb.activeDays === 6, "best streak and active days");
ok(
  dayNumber(new Date(2026, 10, 15, 0, 5).getTime()) ===
    dayNumber(new Date(2026, 10, 15, 23, 55).getTime()) &&
    dayNumber(new Date(2026, 10, 15, 23, 55).getTime()) + 1 ===
      dayNumber(new Date(2026, 10, 16, 0, 5).getTime()),
  "day boundaries follow the local clock",
);

// a realistic history
const k = (i: number) => refKey(pool[i]!);
const attempts: AttemptLog[] = [
  { key: k(0), kind: "checkpoint", score: 85, at: at(6) },
  {
    key: k(1),
    kind: "checkpoint",
    score: 40,
    at: at(5),
    gaps: ["Still missing key ideas: entropy, spread."],
  },
  { key: k(1), kind: "retention", score: 50, at: at(2) },
  { key: k(0), kind: "retention", score: 100, at: at(1) },
  { key: k(2), kind: "transfer", score: 70, at: at(0) },
  { key: k(0), kind: "retention", score: 90, at: at(40) }, // older than 30 days: ignored for retention
];
const mastery = { [k(0)]: 88, [k(1)]: 45, [k(2)]: 62 };
const srs: Record<string, Srs> = {
  [k(0)]: scheduleNext(undefined, 90, at(1)),
  [k(1)]: scheduleNext(undefined, 40, at(2)),
  [k(2)]: scheduleNext(scheduleNext(undefined, 80, at(0)), 90, at(0)),
};
srs[k(0)] = { ...srs[k(0)]!, due: NOW + 3 * DAY };
const rep = computeReport({ pool, mastery, attempts, srs, points: 42, now: NOW });
ok(
  rep.overall === Math.round((88 + 45 + 62) / 3) &&
    rep.startedCount === 3 &&
    rep.coverage === Math.round((3 / 10) * 100),
  `overall = average of concepts you started (${rep.overall}%), coverage ${rep.coverage}%`,
);
ok(
  rep.retention === 75 && rep.quizCount === 2,
  `retention uses only the last 30 days of quizzes (${rep.retention}% from ${rep.quizCount})`,
);
ok(rep.transferAvg === 70 && rep.points === 42, "transfer average and points");
ok(
  rep.streak === 3 &&
    rep.activity[83] === 1 &&
    rep.activity.reduce((a, b) => a + b, 0) === 6 &&
    rep.activity[83 - 40] === 1,
  `streak ${rep.streak}; today is the last activity bar and the 40-day-old attempt sits 40 bars back`,
);
const rows = rep.modules.flatMap((m) => m.concepts);
ok(
  rows.find((r) => r.key === k(0))!.state === "scheduled" ||
    rows.find((r) => r.key === k(0))!.state === "strong",
  `concept 0 is strong, not due (${rows.find((r) => r.key === k(0))!.state})`,
);
ok(
  rows.find((r) => r.key === k(1))!.state === "due" && rep.due.some((d) => d.key === k(1)),
  "a concept whose review date passed is 'due'",
);
ok(
  rep.due.length >= 1 && rep.due.every((d) => d.srs && d.srs.due <= NOW),
  "due list only has overdue concepts",
);
ok(
  rep.upcoming.every((u) => u.inDays >= 0 && u.inDays <= 7) &&
    rep.upcoming.some((u) => u.key === k(0)),
  "upcoming list = reviews in the next 7 days",
);
ok(
  rep.doubts.length === 1 &&
    rep.doubts[0]!.key === k(1) &&
    rep.doubts[0]!.gaps[0]!.includes("entropy"),
  "doubt log: low-mastery concept with the specific gap feedback found",
);
ok(
  rep.recent.length === 6 &&
    rep.recent[0]!.at >= rep.recent[1]!.at &&
    rep.recent[0]!.title.length > 3,
  "recent activity newest first, with concept titles",
);
ok(
  rep.forecast.length === 31 && rep.forecast[0]! >= 80 && rep.forecast[30]! < rep.forecast[0]!,
  `memory forecast starts ${rep.forecast[0]}% and fades to ${rep.forecast[30]}%`,
);
const m0 = rep.modules[0]!;
ok(
  Object.keys(m0.bloom).length >= 3 &&
    m0.started === 3 &&
    m0.mastery === Math.round((88 + 45 + 62) / 3),
  "per-module mastery and Bloom-level breakdown",
);
// robustness
const odd = computeReport({
  pool,
  mastery: { "gone:concept": 50 },
  attempts: [{ key: "gone:concept", kind: "retention", score: 80, at: at(0) }],
  srs: {},
  points: 0,
  now: NOW,
});
ok(
  odd.recent[0]!.title === "concept" && odd.startedCount === 0,
  "activity for a deleted module doesn't crash and isn't counted",
);
console.log(f ? `${f} FAILED` : "ALL PASSED");
process.exit(f ? 1 : 0);

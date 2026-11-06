// The front page's to-do list: today's lectures, due retention quizzes, unfinished lectures, open doubts.
import { dayOf, planToday, type Lecture } from "../src/lib/today";
import type { Ladder } from "../src/lib/mastery";
let f = 0;
const ok = (c: boolean, m: string) => {
  console.log((c ? "PASS " : "FAIL ") + m);
  if (!c) f++;
};
const DAY = 86_400_000;
const NOW = new Date(2026, 10, 4, 10, 0).getTime();
const order: Lecture[] = ["a", "b", "c", "d", "e"].map((k, i) => ({
  key: `m:${k}`,
  mi: 0,
  ci: i,
  title: k.toUpperCase(),
  module: "ME 201",
  minutes: 15,
}));
const run = (
  o: {
    ladder?: Record<string, Ladder>;
    sess?: Record<string, { stageIndex: number; completed: boolean; total: number }>;
    next?: Record<string, number>;
    now?: number;
    perDay?: number;
    saved?: { day: string; keys: string[] } | null;
    doubts?: string[];
  } = {},
) =>
  planToday({
    order,
    ladder: (k) => o.ladder?.[k] ?? "not-started",
    session: (k) => o.sess?.[k],
    nextCheckAt: (k) => o.next?.[k],
    openDoubts: o.doubts ?? [],
    now: o.now ?? NOW,
    perDay: o.perDay ?? 2,
    saved: o.saved ?? null,
  });

const t0 = run();
ok(
  t0.lectures.map((l) => l.key).join() === "m:a,m:b" &&
    t0.lectures.every((l) => l.status === "todo"),
  "a fresh learner gets the first two lectures of the course for today",
);
ok(
  run({ perDay: 3 }).lectures.length === 3 && run({ perDay: 1 }).lectures.length === 1,
  "the number per day follows the setting",
);
const t1 = run({ ladder: { "m:a": "understood" } });
ok(t1.lectures[0]!.key === "m:b", "lectures already understood are not scheduled again");
const t2 = run({ ladder: { "m:a": "understood" }, saved: t0.plan });
ok(
  t2.lectures.map((l) => l.key).join() === "m:a,m:b" &&
    t2.lectures[0]!.status === "done" &&
    t2.done === 1,
  "once planned, today's list stays for the day: finishing one ticks it off instead of pulling in the next",
);
const t3 = run({
  saved: t0.plan,
  now: NOW + DAY,
  ladder: { "m:a": "understood", "m:b": "understood" },
});
ok(
  t3.day !== t0.day && t3.lectures.map((l) => l.key).join() === "m:c,m:d",
  "the next day brings the next lectures",
);
const t4 = run({ sess: { "m:d": { stageIndex: 6, completed: false, total: 22 } } });
ok(
  t4.lectures[0]!.key === "m:d" &&
    t4.lectures[0]!.status === "in-progress" &&
    t4.lectures[0]!.at === 7 &&
    t4.lectures[0]!.total === 22,
  "a lecture left half-way comes first, marked 'stopped at 7 of 22'",
);
const t5 = run({
  saved: { day: dayOf(NOW), keys: ["m:a", "m:b"] },
  sess: { "m:e": { stageIndex: 3, completed: false, total: 22 } },
});
ok(
  t5.resume?.key === "m:e",
  "an unfinished lecture that is not on today's list still shows under 'also waiting'",
);
const t6 = run({
  ladder: { "m:a": "understood", "m:b": "retained", "m:c": "understood", "m:d": "mastered" },
  next: { "m:a": NOW - 2 * DAY, "m:b": NOW + 3 * 3600_000, "m:c": NOW + 2 * DAY, "m:d": NOW - DAY },
});
ok(
  t6.quizzes.map((q) => q.key).join() === "m:a,m:b",
  "retention quizzes due today or overdue are listed (not future ones, not mastered concepts), most overdue first",
);
ok(
  t6.quizzes[0]!.overdueDays === 2 && t6.quizzes[1]!.overdueDays === 0,
  "overdue quizzes say by how many days",
);
ok(
  run({ doubts: ["entropy is disorder"] }).doubts.length === 1,
  "open doubts are carried onto the list",
);
const all = run({ ladder: Object.fromEntries(order.map((l) => [l.key, "mastered" as Ladder])) });
ok(
  all.lectures.length === 0 && all.total === 0,
  "when every lecture is done there is nothing left to schedule",
);
ok(
  run({ saved: { day: dayOf(NOW), keys: ["m:gone", "m:b"] } })
    .lectures.map((l) => l.key)
    .join() === "m:b",
  "a saved lecture that no longer exists is dropped",
);
console.log(f ? `${f} FAILED` : "ALL PASSED");
process.exit(f ? 1 : 0);

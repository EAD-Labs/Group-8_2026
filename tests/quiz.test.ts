import { conceptSource } from "../src/lib/curriculum";
import { modules } from "../src/lib/pilot";
import { localizeModule } from "../src/lib/lesson-i18n";
import {
  DAY,
  scheduleNext,
  dueState,
  forecast,
  recallAt,
  isSrs,
  qualityOf,
  daysUntil,
  type Srs,
} from "../src/lib/srs";
import {
  buildSession,
  dueConcepts,
  firstSentence,
  keyOf,
  mulberry32,
  questionsFor,
  refKey,
  summarise,
  type ConceptRef,
  type Question,
} from "../src/lib/quiz";
import { setLang } from "../src/lib/i18n";
let f = 0;
const ok = (c: boolean, m: string) => {
  console.log((c ? "PASS " : "FAIL ") + m);
  if (!c) f++;
};
const NOW = Date.UTC(2026, 10, 1, 9, 0, 0);

// ---- SRS
const s1 = scheduleNext(undefined, 80, NOW);
ok(
  s1.reps === 1 && s1.interval === 1 && s1.due === NOW + DAY,
  "first good result -> review tomorrow",
);
const s2 = scheduleNext(s1, 90, NOW + DAY);
ok(
  s2.reps === 2 && s2.interval === 3 && s2.ease >= s1.ease,
  "second good result -> 3 days, ease rises",
);
const s3 = scheduleNext(s2, 95, NOW + 4 * DAY);
ok(s3.interval > 5 && s3.reps === 3, `third -> interval grows (${s3.interval} d)`);
const lapse = scheduleNext(s3, 20, NOW + 20 * DAY);
ok(
  lapse.reps === 0 && lapse.interval === 1 && lapse.lapses === 1 && lapse.ease < s3.ease,
  "forgetting resets the ladder, counts a lapse, lowers ease",
);
ok(
  scheduleNext(undefined, 0, NOW).due === NOW + DAY && scheduleNext(lapse, 0, NOW).ease >= 1.3,
  "ease never drops below 1.3",
);
let e = scheduleNext(undefined, 100, NOW);
for (let i = 0; i < 40; i++) e = scheduleNext(e, 100, e.due);
ok(e.ease <= 2.8 && Number.isFinite(e.due), "ease capped; no overflow after many reviews");
ok(
  dueState(undefined, NOW) === "new" &&
    dueState(s1, NOW) === "scheduled" &&
    dueState(s1, NOW + DAY) === "due" &&
    daysUntil(s1, NOW) === 1,
  "due states",
);
ok(
  Math.abs(recallAt(s1, s1.due) - 0.9) < 1e-6 &&
    recallAt(s1, s1.last) === 1 &&
    recallAt(s1, s1.last + 30 * DAY) < 0.1,
  "forgetting curve: 100% now, 90% when due, fading after",
);
const fc = forecast([s1, s3], NOW, 30);
ok(
  fc.length === 31 &&
    fc.every((v, i) => i === 0 || v <= fc[i - 1]! + 1e-9) &&
    forecast([], NOW).length === 0,
  "forecast decreases monotonically; empty when nothing reviewed",
);
ok(
  isSrs(s1) && !isSrs({ due: "x" }) && !isSrs(null) && qualityOf(95) === 5 && qualityOf(10) === 0,
  "srs validation + quality mapping",
);

// ---- quiz generation over every concept of both built-in modules
const pool: ConceptRef[] = modules.flatMap((m) =>
  m.concepts.map((c) => ({ moduleSlug: m.slug, moduleTitle: m.title, concept: c })),
);
ok(pool.length === 10, "10 pilot concepts in the pool");
const r = mulberry32(42);
let total = 0;
const kinds: Record<string, number> = {};
let bad = 0;
const sample: Question[] = [];
for (const ref of pool)
  for (const mastery of [10, 50, 90])
    for (const q of questionsFor(ref, pool, mastery, 4, r)) {
      total++;
      kinds[q.kind] = (kinds[q.kind] ?? 0) + 1;
      if (sample.length < 200) sample.push(q);
      const mcq = q.kind !== "recall";
      if (!q.prompt || !q.explanation) bad++;
      if (
        mcq &&
        (q.options.length < 2 ||
          q.answer < 0 ||
          q.answer >= q.options.length ||
          new Set(q.options).size !== q.options.length)
      )
        bad++;
      if (q.kind === "cloze" && !q.context!.includes("_____")) bad++;
      if (q.kind === "cloze" && !q.options[q.answer]) bad++;
      if (q.kind === "example" && !q.options.includes(ref.concept.title)) bad++;
      if (q.kind === "truefalse" && (q.options.length !== 2 || (q.answer !== 0 && q.answer !== 1)))
        bad++;
      if (q.kind === "recall" && (!q.reference || q.answer !== -1)) bad++;
    }
ok(
  bad === 0,
  `every generated question is well-formed (${total} questions: ${JSON.stringify(kinds)})`,
);
ok(
  kinds["definition"]! > 0 &&
    kinds["example"]! > 0 &&
    kinds["truefalse"]! > 0 &&
    kinds["cloze"]! > 0 &&
    kinds["recall"]! > 0,
  "all five question types are produced",
);
// the right answer is not given away by position or length
const pos = [0, 0, 0, 0];
let longest = 0,
  mcqN = 0;
for (const q of sample.filter((q) => q.kind === "definition")) {
  pos[q.answer] = (pos[q.answer] ?? 0) + 1;
  mcqN++;
  if (q.options[q.answer]!.length === Math.max(...q.options.map((o) => o.length))) longest++;
}
ok(
  pos.slice(0, 3).every((n) => n > mcqN * 0.12),
  `correct answer position is shuffled (${pos.join("/")})`,
);
ok(
  longest / mcqN < 0.7,
  `correct option is not always the longest (${Math.round((longest / mcqN) * 100)}%)`,
);
// true/false statements really are true/false
// Read the definition from the same place the quiz generator does, not from a stage position: the
// lesson's opening turn has changed before and a positional lookup silently tests the wrong text.
const defOf = (title: string) =>
  conceptSource(modules.flatMap((m) => m.concepts).find((c) => c.title === title)!).definition;
let tfOk = true;
for (const q of sample.filter((q) => q.kind === "truefalse")) {
  const own = firstSentence(defOf(q.conceptTitle), 220);
  const says = q.context!.includes(own);
  if (says !== (q.answer === 0)) tfOk = false;
}
ok(tfOk, "true/false: 'True' only when the statement is the concept's own definition");
// cloze: the blanked word restored gives back the definition
let clozeOk = true;
for (const q of sample.filter((q) => q.kind === "cloze")) {
  const def = defOf(q.conceptTitle);
  if (!def.includes(q.context!.replace("_____", q.options[q.answer]!))) clozeOk = false;
}
ok(clozeOk, "cloze: filling the blank with the right option reproduces the lesson's own sentence");

// ---- sessions
const mastery = (ref: ConceptRef) => ref.concept.mastery;
const srs: Record<string, Srs> = {};
const some = pool.slice(0, 6);
some.forEach((p, i) => {
  srs[refKey(p)] = {
    due: NOW - (i % 3 === 0 ? 2 * DAY : -3 * DAY),
    interval: 2,
    ease: 2.3,
    reps: 1,
    lapses: 0,
    last: NOW - 3 * DAY,
  };
});
const due = dueConcepts(pool, srs, NOW);
ok(
  due.length === 2 && due[0]!.concept.slug === pool[0]!.concept.slug,
  `due concepts = those whose review date passed (${due.length}), most overdue first`,
);
const sess = buildSession({ mode: "due", pool, size: 8, now: NOW, srs, mastery, seed: 7 });
ok(
  sess.length === 8 && new Set(sess.map((q) => q.id)).size === 8,
  "due session: exactly the requested size, no duplicate questions",
);
ok(
  due.every((d) => sess.some((q) => q.conceptKey === refKey(d))),
  "due session always includes the due concepts",
);
ok(
  sess.every((q, i) => i === 0 || q.conceptKey !== sess[i - 1]!.conceptKey) || sess.length < 4,
  "the same concept is not asked twice in a row",
);
ok(
  sess.filter((q) => q.kind === "recall").length <= 1,
  "at most one free-text question per mixed session",
);
const cc = buildSession({
  mode: "concept",
  pool,
  size: 5,
  now: NOW,
  srs,
  mastery,
  conceptKey: refKey(pool[3]!),
  seed: 3,
});
ok(
  cc.length >= 4 && cc.every((q) => q.conceptKey === refKey(pool[3]!)),
  `concept check: ${cc.length} questions, all about the chosen concept`,
);
ok(
  buildSession({ mode: "mixed", pool, size: 6, now: NOW, srs: {}, mastery, seed: 1 }).length === 6,
  "mixed practice works even before anything is scheduled",
);
ok(
  buildSession({ mode: "due", pool: [], size: 6, now: NOW, srs, mastery }).length === 0,
  "empty pool -> empty session, no crash",
);
const tiny = pool.slice(0, 1);
ok(
  buildSession({ mode: "mixed", pool: tiny, size: 5, now: NOW, srs: {}, mastery }).every(
    (q) => q.kind === "recall",
  ),
  "a single-concept pool can only ask recall (no distractors available)",
);
const a = buildSession({ mode: "mixed", pool, size: 8, now: NOW, srs, mastery, seed: 99 });
const b = buildSession({ mode: "mixed", pool, size: 8, now: NOW, srs, mastery, seed: 99 });
ok(JSON.stringify(a) === JSON.stringify(b), "same seed -> same quiz (reproducible)");
const sm = summarise(
  sess,
  sess.map((q, i) => ({ questionId: q.id, correct: i % 2 === 0, picked: 0 })),
);
ok(
  sm.total === 8 &&
    sm.correct === 4 &&
    sm.score === 50 &&
    sm.byConcept.reduce((t, c) => t + c.total, 0) === 8,
  "summary: score and per-concept breakdown",
);

// ---- works in another language from the translated lesson
const m0 = modules[1]!;
const hiTx = {
  title: "संभाव्यता",
  description: "d",
  concepts: m0.concepts.map((c, i) => ({
    title: `अवधारणा ${i + 1}`,
    phrase: `वाक्यांश ${i + 1}`,
    definition: `यह अवधारणा ${i + 1} की परिभाषा है और इसमें ऊर्जा तथा तापमान जैसे शब्द आते हैं। दूसरा वाक्य।`,
    misconception: "भ्रांति",
    example: `उदाहरण ${i + 1}: एक सिक्का उछालना।`,
    transfer: "प्रश्न",
  })),
};
const hiMod = localizeModule(m0, "hi", hiTx);
const hiPool: ConceptRef[] = hiMod.concepts.map((c) => ({
  moduleSlug: hiMod.slug,
  moduleTitle: hiMod.title,
  concept: c,
}));
setLang("hi");
const hq = buildSession({
  mode: "mixed",
  pool: hiPool,
  size: 6,
  now: NOW,
  srs: {},
  mastery,
  seed: 5,
});
ok(
  hq.length === 6 &&
    hq.some((q) => q.kind === "definition") &&
    hq.every((q) => /[\u0900-\u097F]/.test(q.prompt + (q.context ?? ""))),
  `quizzes follow the lesson language: "${hq[0]!.prompt}"`,
);
ok(
  firstSentence("यह पहला वाक्य है। यह दूसरा है।") === "यह पहला वाक्य है।",
  "sentence splitting understands the Devanagari danda",
);
setLang("en");
console.log(f ? `${f} FAILED` : "ALL PASSED");
process.exit(f ? 1 : 0);

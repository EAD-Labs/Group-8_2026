import { SEEDED, seededByKey } from "../src/lib/knowledge/seed";
import { buildPilotModules } from "../src/lib/pilot";
import { answerMcq } from "../src/lib/session";
import { buildDialogue, speakersOf, DEFAULT_PLAN } from "../src/lib/dialogue";
import {
  canAdvance,
  commitGuess,
  revealHint,
  fillBlank,
  newSession,
  recordCheckpoint,
  matchesAny,
  blankCorrect,
  participation,
} from "../src/lib/session";
import {
  emptyLearner,
  stateOf,
  dialogueCompleted,
  checkpointResult,
  delayedCheck,
  transferResult,
  openDoubt,
  closeDoubts,
  openDoubtIds,
  award,
  moduleBadge,
  participationBadges,
  DAY,
} from "../src/lib/mastery";
let f = 0;
const ok = (c: boolean, m: string) => {
  console.log((c ? "PASS " : "FAIL ") + m);
  if (!c) f++;
};
const rec = seededByKey.get("thermodynamics:second-law")!;
const full = buildDialogue(rec, DEFAULT_PLAN);
const red = buildDialogue(rec, { ...DEFAULT_PLAN, mode: "reduced" });

// T2.1 / T2.2 / T2.3
ok(
  speakersOf(full).length === 3,
  "T2.1 all three personas contribute (" + speakersOf(full).join(", ") + ")",
);
ok(
  full.some((s) => s.kind === "ask" && s.speaker === "maya" && /\?/.test(s.text)),
  "T2.2 the basic student asks a foundational question: “" +
    full.find((s) => s.kind === "ask")!.text +
    "”",
);
ok(
  full.some((s) => s.speaker === "arjun" && s.kind === "challenge" && /\?/.test(s.text)),
  "T2.3 the advanced student probes: “" +
    full.find((s) => s.kind === "challenge")!.text.slice(0, 70) +
    "…”",
);
ok(
  full[full.length - 1]!.kind === "transfer" &&
    full.some((s) => s.kind === "checkpoint") &&
    full.some((s) => s.kind === "teachback"),
  "dialogue ends with checkpoint → teach-back → transfer",
);
// reaches the right answer: the core claims are all voiced
ok(
  rec.claims
    .filter((c) => ["define", "mechanism", "pitfall", "example"].includes(c.role))
    .every((c) => full.some((s) => s.claimIds?.includes(c.id))),
  "the dialogue voices the definition, mechanism, pitfall and example claims (reasoning reaches the answer)",
);
ok(
  full.every((s, i) => s.id && full.findIndex((x) => x.id === s.id) === i),
  "every turn has a unique id",
);
// T2.7 reduced mode
ok(
  !red.some((s) => s.kind === "ask") &&
    red.length < full.length - 3 &&
    speakersOf(red).includes("arjun"),
  `T2.7 reduced mode: basic student suppressed, shorter (${red.length} vs ${full.length} turns)`,
);
ok(
  red.some((s) => s.kind === "blank") && red.some((s) => s.kind === "checkpoint"),
  "reduced mode keeps a blank and the checkpoint",
);
// T3.1 checkpoint derives from this dialogue
const cp = full.find((s) => s.kind === "checkpoint")!;
ok(
  cp.prompt!.includes(full.find((s) => s.kind === "challenge")!.text.replace(/[?.]+$/, "")),
  "T3.1 the checkpoint quotes what was said in this dialogue",
);

// T2.4 hints gated on a guess
const hint = full.find((s) => s.kind === "hint")!;
let s = newSession(rec.key, 1000);
ok(revealHint(s, hint).error === "guess-required", "T2.4 reveal without a guess is blocked");
ok(
  revealHint(commitGuess(s, hint, "   ", 1), hint).error === "guess-required",
  "…an empty guess does not count",
);
s = commitGuess(s, hint, "it increases", 2000);
const rv = revealHint(s, hint);
ok(
  !rv.error &&
    rv.state.guesses[hint.hintCard!.id]!.revealed &&
    rv.state.guesses[hint.hintCard!.id]!.correct,
  "after committing a guess the reveal works and the guess is scored",
);
ok(
  commitGuess(rv.state, hint, "totally different", 3000).guesses[hint.hintCard!.id]!.text ===
    "it increases",
  "a guess cannot be changed after the answer was shown",
);
ok(
  !commitGuess(newSession("x", 0), hint, "decreases", 1).guesses[hint.hintCard!.id]!.correct,
  "a wrong guess is recorded as wrong",
);
// T2.5 blanks block
const blank = full.find((s) => s.kind === "blank")!;
s = newSession(rec.key, 0);
ok(
  !canAdvance(blank, s).ok && canAdvance(blank, s).reason === "blank",
  "T2.5 the dialogue cannot continue past an unanswered blank",
);
const fb = fillBlank(s, blank, "increase", 5);
ok(
  canAdvance(blank, fb.state).ok && !fb.correct,
  "a wrong attempt is marked incorrect but unblocks the dialogue (answer is then shown)",
);
ok(
  fillBlank(s, blank, "decrease", 5).correct && blankCorrect("DECREASE.", "decrease", []),
  "the right word is accepted (case/punctuation ignored)",
);
ok(!fillBlank(s, blank, "  ", 5).state.blanks[blank.blank!.id], "an empty blank is not an attempt");
// checkpoint is blocking
ok(
  !canAdvance(cp, s).ok && canAdvance(cp, recordCheckpoint(s, cp, 40, 9)).ok,
  "the checkpoint is blocking until attempted (even a poor attempt)",
);
ok(
  canAdvance(hint, s).ok && canAdvance(full[0]!, s).ok,
  "hints and prior-knowledge questions do not block",
);
// matching helpers
ok(
  matchesAny("It goes up a lot", ["up"]) &&
    !matchesAny("I know it", ["no"]) &&
    matchesAny("increases", ["increase"]),
  "answer matching: short terms need whole words, longer ones can be substrings",
);
ok(
  participation(fillBlank(s, blank, "decrease", 1).state).blanksCorrectFirstTry === 1,
  "participation measures count first-try blanks",
);
// all 10 records produce valid dialogues
ok(
  SEEDED.every((r) => {
    const d = buildDialogue(r);
    return (
      d.length >= 12 &&
      d.filter((x) => x.kind === "blank").length === 2 &&
      d.filter((x) => x.kind === "hint").length === 2 &&
      speakersOf(d).length === 3
    );
  }),
  "all 10 pilot concepts yield a full 3-persona dialogue with 2 blanks and 2 hints",
);
// doubt-seeded & linked & revisit
const mis = rec.misconceptions[0]!;
const seeded = buildDialogue(rec, { ...DEFAULT_PLAN, openDoubts: [mis.id] });
ok(
  seeded.some((x) => x.kind === "ask" && x.text.includes(mis.wrong.replace(/\.$/, ""))),
  "open doubts are voiced by the basic student in the next dialogue",
);
const sign = seededByKey.get("thermodynamics:sign-conventions")!;
const linked = buildDialogue(sign, { ...DEFAULT_PLAN, linked: ["thermodynamics:first-law"] }, (k) =>
  seededByKey.get(k),
);
ok(
  linked.some(
    (x) => x.kind === "recall" && x.recallKey === "thermodynamics:first-law" && x.hintCard,
  ),
  "T3.4 a dependent concept re-tests the earlier one in context (recall turn)",
);
ok(
  buildDialogue(rec, { ...DEFAULT_PLAN, revisit: true }).some((x) => x.label === "REVISITING"),
  "T3.3 after a failed delayed check the next dialogue revisits what tripped the learner",
);

// ---- ladder (HLD §6.6)
const K = "thermodynamics:second-law",
  N = 3,
  T0 = Date.UTC(2026, 10, 1);
let L = emptyLearner();
ok(stateOf(L, K).state === "not-started", "ladder: starts Not started");
L = dialogueCompleted(L, K, T0);
ok(stateOf(L, K).state === "exposed", "dialogue completed → Exposed");
L = checkpointResult(L, K, false, T0, N);
ok(stateOf(L, K).state === "exposed", "failed checkpoint → still Exposed");
L = checkpointResult(L, K, true, T0, N);
ok(
  stateOf(L, K).state === "understood" && stateOf(L, K).nextCheckAt === T0 + 3 * DAY,
  "passed checkpoint → Understood, delayed check scheduled in 3 days",
);
let r = delayedCheck(L, K, true, T0 + 1 * DAY, N);
ok(
  !r.promoted && stateOf(r.learner, K).state === "understood",
  "a check passed too early cannot promote (cannot reach Retained on the day it was learned)",
);
r = delayedCheck(L, K, true, T0 + 3 * DAY, N);
ok(
  r.promoted && stateOf(r.learner, K).state === "retained",
  "delayed check passed on day 3 → Retained",
);
L = r.learner;
ok(
  !transferResult(emptyLearner(), K, true, T0).promoted,
  "transfer cannot skip the ladder (not Retained → no promotion)",
);
const tr = transferResult(L, K, true, T0 + 4 * DAY);
ok(
  tr.promoted && stateOf(tr.learner, K).state === "mastered",
  "transfer passed on a Retained concept → Mastered",
);
L = tr.learner;
const fail = delayedCheck(L, K, false, T0 + 12 * DAY, N);
ok(
  stateOf(fail.learner, K).state === "understood" &&
    fail.demoted &&
    stateOf(fail.learner, K).revise &&
    !stateOf(fail.learner, K).transferPassed,
  "a failed later check demotes Mastered → Understood and queues revision",
);
// doubts
let D = openDoubt(emptyLearner(), K, mis.id, mis.name, "blank", 100);
D = openDoubt(D, K, mis.id, mis.name, "hint", 200);
ok(
  D.doubts.length === 1,
  "a doubt is named by its misconception (“" +
    D.doubts[0]!.name +
    "”) and not duplicated while open",
);
ok(openDoubtIds(D, K).includes(mis.id), "open doubts are listed for seeding the next dialogue");
const same = closeDoubts(D, K, [mis.id], 100);
ok(same.closed.length === 0, "a doubt cannot be closed on the same occasion it opened");
const later = closeDoubts(D, K, [mis.id], 5000);
ok(
  later.closed.length === 1 &&
    openDoubtIds(later.learner, K).length === 0 &&
    later.learner.counters.doubtsClosed === 1,
  "a correct answer on a later occasion closes it",
);
// ledger & badges
let P = emptyLearner();
const a1 = award(P, "guess:x", 3);
const a2 = award(a1.learner, "guess:x", 3);
ok(
  a1.gained === 3 && a2.gained === 0,
  "points are awarded once per learning event (no double counting on resume)",
);
const keys = ["a", "b"];
let B = emptyLearner();
B = {
  ...B,
  concepts: {
    a: { ...stateOf(B, "a"), state: "retained" },
    b: { ...stateOf(B, "b"), state: "understood" },
  },
};
ok(!moduleBadge(B, "m", "Mod", keys).earned, "module badge needs every concept Retained");
B = { ...B, concepts: { ...B.concepts, b: { ...stateOf(B, "b"), state: "retained" } } };
ok(moduleBadge(B, "m", "Mod", keys).earned, "…earned once all are Retained");
B = { ...B, concepts: { ...B.concepts, a: { ...stateOf(B, "a"), state: "understood" } } };
ok(!moduleBadge(B, "m", "Mod", keys).earned, "…and lost again if one is demoted");
ok(
  participationBadges({
    ...emptyLearner(),
    counters: { guesses: 1, blanks: 5, asked: 0, doubtsClosed: 0 },
  })
    .filter((b) => b.earned)
    .map((b) => b.id)
    .join() === "first-guess,blank-builder",
  "participation badges",
);

// ---- quick checks: multiple-choice / fill-in-the-blank-with-choices popups inside the class
{
  const fullMods = buildPilotModules();
  const redMods = buildPilotModules(() => ({ ...DEFAULT_PLAN, mode: "reduced" }));
  const fullC = fullMods.flatMap((m) => m.concepts.map((c) => ({ m, c })));
  const redC = redMods.flatMap((m) => m.concepts);
  const mcqs = (c: { stages: any[] }) => c.stages.filter((x) => x.kind === "mcq");
  ok(
    fullC.every(({ c }) => mcqs(c).length >= 1) &&
      fullC.filter(({ c }) => mcqs(c).length === 2).length >= 8,
    `every concept has quick checks; ${fullC.filter(({ c }) => mcqs(c).length === 2).length} of 10 have two (full class)`,
  );
  ok(
    redC.every((c) => mcqs(c).length === 1),
    "reduced mode keeps one quick check per concept (shorter class)",
  );
  ok(
    fullC.filter(({ c }) => mcqs(c)[0]?.mcq.qkind === "cloze").length >= 8,
    "the first quick check is a fill-in-the-blank with choices",
  );
  const kindsSeen = new Set(fullC.flatMap(({ c }) => mcqs(c).map((x) => x.mcq.qkind)));
  ok(
    ["cloze", "definition", "example", "truefalse"].every((k) => kindsSeen.has(k)),
    "the quick checks cover fill-in-the-blank, definition, example and true/false types: " +
      [...kindsSeen].join(", "),
  );
  const again = buildPilotModules().flatMap((m) => m.concepts);
  ok(
    JSON.stringify(fullC.map(({ c }) => mcqs(c).map((x) => x.mcq))) ===
      JSON.stringify(again.map((c) => mcqs(c).map((x) => x.mcq))),
    "quick checks are deterministic: rebuilding the class never changes them (so a saved session stays valid)",
  );
  let valid = true;
  for (const { m, c } of fullC) {
    for (const st of mcqs(c)) {
      const q = st.mcq;
      if (
        q.options.length < 2 ||
        new Set(q.options).size !== q.options.length ||
        q.answer < 0 ||
        q.answer >= q.options.length ||
        !q.explanation ||
        !st.prompt
      )
        valid = false;
      if (q.qkind === "cloze") {
        const def = seededByKey
          .get(`${m.slug}:${c.slug}`)!
          .claims.filter((x) => x.role === "define")
          .map((x) => x.text)
          .join(" ");
        if (
          !q.context.includes("_____") ||
          !def.includes(q.context.replace("_____", q.options[q.answer]))
        )
          valid = false;
      }
      if (q.qkind === "example" && !q.options.includes(c.title)) valid = false;
    }
  }
  ok(
    valid,
    "every quick check is well-formed: 2–4 distinct options, a valid answer, an explanation; the blank restores the lesson's own sentence",
  );
  ok(
    fullC.every(
      ({ c }) =>
        c.stages.findIndex((x) => x.kind === "mcq") <
        c.stages.findIndex((x) => x.kind === "checkpoint"),
    ) &&
      fullC.every(({ c }) =>
        c.stages
          .filter((x) => x.kind === "mcq")
          .every((x) => x.id && c.stages.findIndex((y) => y.id === x.id) === c.stages.indexOf(x)),
      ),
    "quick checks come before the checkpoint and have unique turn ids",
  );
  const st = mcqs(fullC[1]!.c)[0]!;
  const s0 = newSession(rec.key, 1);
  ok(
    canAdvance(st, s0).ok,
    "a quick check does not block the dialogue (it pops up but can be answered later)",
  );
  const wrongIdx = (st.mcq.answer + 1) % st.mcq.options.length;
  const w = answerMcq(s0, st, wrongIdx, 5);
  ok(!w.correct && w.state.mcqs![st.mcq.id]!.picked === wrongIdx, "a wrong answer is marked wrong");
  const w2 = answerMcq(w.state, st, st.mcq.answer, 6);
  ok(
    !w2.correct && w2.state.mcqs![st.mcq.id]!.picked === wrongIdx,
    "the first answer is final: answering again cannot turn it right",
  );
  const r1 = answerMcq(s0, st, st.mcq.answer, 5);
  ok(
    r1.correct && participation(r1.state).quickChecksCorrect === 1,
    "the right answer is correct and counted in the participation measures",
  );
  const old: any = { ...s0 };
  delete old.mcqs;
  ok(
    answerMcq(old, st, st.mcq.answer, 2).correct,
    "a session saved by an older build (no quick-check record) still works",
  );
  ok(
    answerMcq(s0, st, 99, 1).state === s0 && answerMcq(s0, full[0]!, 0, 1).state === s0,
    "an out-of-range pick or a non-quick-check turn is ignored",
  );
}
// ---- the Hint option is back on ordinary answer boxes, with a real nudge for each question type
ok(
  !full.some((x) => x.kind === "question"),
  "the class no longer opens with a 'first thought' question (nothing to comment on before the topic)",
);
ok(
  ["checkpoint", "teachback", "transfer"].every((k) => {
    const x = full.find((s) => s.kind === k);
    return !!x && typeof x.hint === "string" && x.hint.length > 20;
  }),
  "the checkpoint, teach-back and transfer prompts each carry a hint nudge",
);
ok(
  !full
    .find((s) => s.kind === "checkpoint")!
    .hint!.includes(rec.claims.find((c) => c.role === "define")!.text.slice(0, 40)),
  "…and the checkpoint nudge points at the idea without giving the answer away",
);
console.log(f ? `${f} FAILED` : "ALL PASSED");
process.exit(f ? 1 : 0);

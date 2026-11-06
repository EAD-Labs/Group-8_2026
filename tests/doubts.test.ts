// Doubts as real turns of the class, the one-tap thinking check-ins, and the answerer's variety/honesty.
import { mergeLive, type LiveTurn } from "../src/lib/live-turns";
import {
  KNOW_LEVELS,
  SURE_LEVELS,
  changeLine,
  loadThinking,
  patchThinking,
  thinkingKey,
} from "../src/lib/thinking-chat";
import { answerInContext, kindOfQuestion } from "../src/lib/ask-local";
import { buildPilotModules } from "../src/lib/pilot";
import { canAdvance, newSession } from "../src/lib/session";
import { SEEDED } from "../src/lib/knowledge/seed";
import type { LessonStage } from "../src/lib/curriculum";

let f = 0;
const ok = (c: boolean, m: string) => {
  console.log((c ? "PASS " : "FAIL ") + m);
  if (!c) f++;
};
const st = (id: string, extra: Partial<LessonStage> = {}): LessonStage =>
  ({
    id,
    kind: "explain",
    speaker: "teacher",
    label: id,
    board: id,
    text: id,
    ...extra,
  }) as LessonStage;
const live = (afterId: string, id: string): LiveTurn => ({
  afterId,
  stage: st(id, { kind: "doubt" }),
});

// ---- live turns are spliced into the class right after the turn they were asked at
{
  const base = [st("a"), st("b"), st("c")];
  ok(mergeLive(base, []) === base, "no live turns: the lesson is returned untouched");
  ok(
    mergeLive(base, [live("b", "d1")])
      .map((s) => s.id)
      .join() === "a,b,d1,c",
    "a doubt lands right after the turn it was asked at",
  );
  ok(
    mergeLive(base, [live("b", "d1"), live("b", "d2")])
      .map((s) => s.id)
      .join() === "a,b,d1,d2,c",
    "two doubts at the same turn keep the order they were asked in",
  );
  ok(
    mergeLive(base, [live("b", "d1"), live("d1", "d2")])
      .map((s) => s.id)
      .join() === "a,b,d1,d2,c",
    "a follow-up asked at a doubt chains after it",
  );
  ok(
    mergeLive(base, [live("__start__", "d0")])
      .map((s) => s.id)
      .join() === "d0,a,b,c",
    "a doubt raised before the first turn comes first",
  );
  ok(
    mergeLive(base, [live("gone", "d9")])
      .map((s) => s.id)
      .join() === "a,b,c,d9",
    "a doubt whose turn no longer exists is kept at the end, never lost",
  );
  ok(base.length === 3 && base[0]!.id === "a", "merging never changes the original lesson");
}

// ---- check-ins sit at three natural moments and never block
{
  const c = buildPilotModules().flatMap((m) => m.concepts);
  const pos = (cc: (typeof c)[number]) =>
    cc.stages
      .map((s, i) => (s.kind === "checkin" ? `${s.checkin!.phase}@${i}` : ""))
      .filter(Boolean);
  ok(
    c.every((cc) => cc.stages.filter((s) => s.kind === "checkin").length === 3),
    "every concept has exactly three check-ins (before, during, after)",
  );
  ok(
    c.every(
      (cc) =>
        cc.stages[0]!.checkin?.phase === "before" && !cc.stages.some((x) => x.kind === "question"),
    ),
    "the class opens with the one-tap 'before' check-in (no 'first thought' question any more)",
  );
  ok(
    c.every((cc) => {
      const i = cc.stages.findIndex((s) => s.kind === "checkpoint");
      return cc.stages[i + 1]!.checkin?.phase === "after";
    }),
    "the 'after' check-in comes right after the checkpoint result",
  );
  ok(
    c.every((cc) => {
      const d = cc.stages.findIndex((s) => s.checkin?.phase === "during");
      return cc.stages[d - 1]!.kind === "hint";
    }),
    "the 'during' pulse comes right after the first hint card",
  );
  ok(
    c.every((cc) =>
      cc.stages
        .filter((s) => s.kind === "checkin")
        .every((s) => canAdvance(s, newSession(cc.slug, 1)).ok && !!s.prompt),
    ),
    "check-ins are skippable: they never block the class",
  );
  const off = buildPilotModules(() => ({
    mode: "full",
    openDoubts: [],
    revisit: false,
    linked: [],
    checkins: false,
  })).flatMap((m) => m.concepts);
  ok(
    off.every((cc) => !cc.stages.some((s) => s.kind === "checkin")),
    "with check-ins switched off the class has none",
  );
  ok(c[0] && pos(c[0]).length === 3, "positions: " + pos(c[1]!).join(" "));
}

// ---- the thinking record: tiny, validated, per learner and concept
{
  const mem = new Map<string, string>();
  const storage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
  };
  const k1 = thinkingKey("u1", "thermodynamics:second-law"),
    k2 = thinkingKey("u2", "thermodynamics:second-law");
  ok(
    k1 !== k2 && k1 !== thinkingKey("u1", "thermodynamics:first-law"),
    "records are kept apart per learner and per concept",
  );
  patchThinking(storage, k1, { know: 1 });
  const after = patchThinking(storage, k1, { sureNow: 2, felt: "better", scorePct: 80 });
  ok(
    after.know === 1 && after.sureNow === 2 && after.felt === "better",
    "each answer is merged into the same record, nothing overwritten",
  );
  ok(
    changeLine(after)!.includes(KNOW_LEVELS[1]) &&
      changeLine(after)!.includes(SURE_LEVELS[2]) &&
      /up/.test(changeLine(after)!),
    "after the class the learner sees their before and now, side by side: " + changeLine(after),
  );
  ok(changeLine({ know: 2 }) === null, "no comparison is shown until both answers exist");
  mem.set(
    k2,
    JSON.stringify({
      know: 99,
      sureNow: -1,
      pulse: "banana",
      felt: "better",
      scorePct: 400,
      tricky: "x".repeat(500),
    }),
  );
  const bad = loadThinking(storage, k2);
  ok(
    bad.know === undefined &&
      bad.sureNow === undefined &&
      bad.pulse === undefined &&
      bad.scorePct === undefined &&
      bad.tricky === undefined &&
      bad.felt === "better",
    "corrupt or out-of-range saved values are ignored, valid ones kept",
  );
  mem.set(k1, "{not json");
  ok(
    Object.keys(loadThinking(storage, k1)).length === 0,
    "unreadable saved data falls back to an empty record",
  );
  ok(
    patchThinking(
      {
        getItem: () => null,
        setItem: () => {
          throw new Error("full");
        },
      },
      k1,
      { know: 0 },
    ).know === 0,
    "a storage failure never breaks the class",
  );
}

// ---- the offline answerer: answers the question asked, varies, and is honest
{
  const rec = SEEDED.find((r) => r.key.includes("second-law"))!;
  const stages = buildPilotModules().find((m) => m.slug === "thermodynamics")!.concepts[1]!.stages;
  const A = (q: string, history: Array<{ q: string; a: string }> = []) =>
    answerInContext(q, rec, stages, 11, "Dr Rao", { history });
  ok(
    ["example", "why", "define", "again", "pitfall", "other"].join() ===
      [
        "Give me an example",
        "Why does it happen?",
        "What is entropy?",
        "Explain it differently",
        "Is that a common mistake?",
        "hello",
      ]
        .map(kindOfQuestion)
        .join(),
    "questions are sorted into kinds (example, why, define, again, pitfall, other)",
  );
  const answers = [
    "Give me an example",
    "Why does entropy never decrease?",
    "What is entropy?",
    "Is entropy just disorder?",
  ].map((q) => A(q).text);
  ok(new Set(answers).size === 4, "four different doubts get four different answers");
  ok(
    answers.every((a) => !/^Good question/.test(a)),
    "answers no longer all open with the same line",
  );
  const first = A("Give me an example"),
    again = A("Give me an example again", [{ q: "x", a: first.text }]);
  ok(
    first.text !== again.text && again.claimIds.every((id) => !first.claimIds.includes(id)),
    "asking again never repeats a note it already used",
  );
  const off = A("How do jet engines work?");
  ok(
    !off.grounded && /don't have a verified note/.test(off.text) && off.claimIds.length === 0,
    "a question the notes do not cover is answered honestly, not with an arbitrary note",
  );
  ok(
    A("Why does entropy never decrease?").grounded && A("Give me an example").grounded,
    "questions about the topic are grounded in the verified notes",
  );
  ok(
    A("Is entropy just disorder?").text.includes("better:"),
    "a doubt that matches a named misconception gets the correction",
  );
  ok(
    /said earlier/.test(A("Why does the coffee never reheat itself?").text),
    "when the question touches something said in class, the answer points back to it",
  );
  const none = answerInContext("anything", undefined, stages, 5, "Dr Rao");
  ok(
    !none.grounded && none.text.length > 20,
    "without verified notes (your own material) it still answers without inventing",
  );
}

console.log(f ? `${f} FAILED` : "ALL PASSED");
process.exit(f ? 1 : 0);

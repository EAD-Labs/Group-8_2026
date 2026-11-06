// Dialogue Orchestrator (HLD Part 2): converts one verified record into the classroom conversation
// between the teacher, a basic student and an advanced student, with hint cards (answer behind a
// reveal that needs a guess first) and blanks (blocking). English content; other languages use the
// translated lesson arc.

import { registerSource, type ArcSource, type LessonStage } from "./curriculum";
import { mulberry32, questionsFor, type ConceptRef, type Question } from "./quiz";
import type { Claim, VerifiedRecord } from "./knowledge/types";

export type DialogueMode = "full" | "reduced";
export type DialoguePlan = {
  mode: DialogueMode;
  /** misconception ids the learner currently has open: the basic student voices them */
  openDoubts: string[];
  /** the learner failed a delayed check on this concept: open by revisiting what tripped them */
  revisit: boolean;
  /** earlier concepts this one builds on and that the learner has met: re-tested in context */
  linked: string[];
  /** include the short one-tap thinking check-ins (default on) */
  checkins?: boolean;
};
export const DEFAULT_PLAN: DialoguePlan = {
  mode: "full",
  openDoubts: [],
  revisit: false,
  linked: [],
};

const first = (cs: Claim[], role: Claim["role"]) => cs.find((c) => c.role === role);
const all = (cs: Claim[], role: Claim["role"]) => cs.filter((c) => c.role === role);
const lower = (s: string) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);
const strip = (s: string) => s.replace(/[.\s]+$/, "");

export function sourceFromRecord(r: VerifiedRecord): ArcSource {
  return {
    title: r.topic,
    definition: all(r.claims, "define")
      .map((c) => c.text)
      .join(" "),
    misconception: r.misconceptions[0]?.right ? lower(strip(r.misconceptions[0].right)) : "",
    example: r.example,
    equation: r.equation,
    transfer: r.transfer,
  };
}

const hashKey = (s: string) => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return h >>> 0;
};
/** Lightweight stand-in so other records can supply wrong answers for the quick checks. */
const stubRef = (x: VerifiedRecord): ConceptRef => ({
  moduleSlug: x.key.split(":")[0] ?? "m",
  moduleTitle: x.key.split(":")[0] ?? "m",
  concept: {
    slug: x.key.split(":").slice(1).join(":"),
    title: x.title,
    bloom: x.bloom,
    duration: 0,
    mastery: 0,
    stages: [],
    src: sourceFromRecord(x),
  },
});
/**
 * Multiple-choice quick checks for this concept: first a fill-in-the-blank with choices, then a
 * different type (definition match, example match or true/false). Deterministic for a given concept,
 * so rebuilding the dialogue never changes the questions or their order.
 */
export function quickChecks(r: VerifiedRecord, pool: VerifiedRecord[], count: number): Question[] {
  const refs = [r, ...pool.filter((p) => p.key !== r.key)].map(stubRef);
  if (refs.length < 2) return [];
  const qs = questionsFor(refs[0]!, refs, 50, 8, mulberry32(hashKey(r.key))).filter(
    (q) => q.kind !== "recall",
  );
  const cloze = qs.find((q) => q.kind === "cloze");
  // first a fill-in-the-blank with choices; if the concept has none, two questions of different types
  const kinds = new Set<string>();
  const picks = (cloze ? [cloze, ...qs] : qs).filter((q) =>
    kinds.has(q.kind) ? false : (kinds.add(q.kind), true),
  );
  return picks.slice(0, count);
}

export function buildDialogue(
  r: VerifiedRecord,
  plan: DialoguePlan = DEFAULT_PLAN,
  lookup?: (key: string) => VerifiedRecord | undefined,
  /** all known records: lets the class include multiple-choice quick checks */
  pool?: VerifiedRecord[],
): LessonStage[] {
  const full = plan.mode === "full";
  const T: LessonStage[] = [];
  let n = 0;
  const id = () => `${r.key}#${++n}`;
  const push = (s: Omit<LessonStage, "id">) => void T.push({ id: id(), ...s });
  const checks = pool && pool.length > 1 ? quickChecks(r, pool, full ? 2 : 1) : [];
  /** One-question-at-a-time check-ins: what I know before, is it making sense, how sure I am after. Skippable. */
  const pushCheckin = (phase: "before" | "during" | "after") => {
    if (plan.checkins === false) return;
    const copy = {
      before: {
        label: "BEFORE WE START",
        text: "Before we dive in — one quick question about where you are.",
      },
      during: { label: "QUICK PULSE", text: "Quick pulse — let's see how this is landing." },
      after: { label: "LOOKING BACK", text: "Let's look back at how that went — one tap each." },
    }[phase];
    push({
      kind: "checkin",
      speaker: "teacher",
      label: copy.label,
      board: r.title,
      text: copy.text,
      prompt: "Quick check-in — one tap, skippable.",
      checkin: { phase },
    });
  };
  const pushCheck = (i: number, speaker: LessonStage["speaker"]) => {
    const q = checks[i];
    if (!q) return;
    push({
      kind: "mcq",
      speaker,
      label: "QUICK CHECK",
      board: r.equation,
      prompt: "Quick check — choose the best answer.",
      text: q.context ? `Quick check: ${q.prompt} ${q.context}` : `Quick check: ${q.prompt}`,
      mcq: {
        id: `${r.key}#q${i + 1}`,
        prompt: q.prompt,
        ...(q.context ? { context: q.context } : {}),
        options: q.options,
        answer: q.answer,
        explanation: q.explanation,
        qkind: q.kind,
      },
    });
  };
  const defs = all(r.claims, "define");
  const mech = first(r.claims, "mechanism");
  const pit = first(r.claims, "pitfall");
  const ex = first(r.claims, "example");
  const bound = first(r.claims, "boundary") ?? first(r.claims, "formula");
  const mis = r.misconceptions;
  const doubts = mis.filter((m) => plan.openDoubts.includes(m.id));

  // The class opens with a one-tap check-in, then teaching — not a free-text question. A prior-knowledge
  // turn used to run first, asking what the learner believed before a word had been said; it was removed
  // because it asked for an answer the learner had had no chance to form.
  pushCheckin("before");

  if (plan.revisit && mis[0]) {
    push({
      kind: "ask",
      speaker: "maya",
      label: "REVISITING",
      board: mis[0].wrong,
      misconceptionId: mis[0].id,
      text: `Last time I got stuck on this: “${strip(mis[0].wrong)}”. Can we go over why that does not hold?`,
    });
    push({
      kind: "explain",
      speaker: "teacher",
      label: "REVISITING",
      board: r.equation,
      claimIds: [],
      misconceptionId: mis[0].id,
      text: `Good thing to revisit. ${mis[0].right}`,
    });
  }

  const linked = plan.linked
    .map((k) => lookup?.(k))
    .filter((x): x is VerifiedRecord => Boolean(x))
    .slice(0, 1);
  for (const prev of linked) {
    const h = prev.hints[0];
    if (!h) continue;
    push({
      kind: "recall",
      speaker: "teacher",
      label: "BUILDING ON EARLIER",
      board: prev.title,
      recallKey: prev.key,
      misconceptionId: h.misconceptionId ?? "",
      text: `${r.title} builds on ${prev.title}, which you met earlier. A quick check before we continue.`,
      prompt: h.question,
      hintCard: {
        id: `${r.key}#recall-${prev.key}`,
        question: h.question,
        hint: h.hint,
        answer: h.answer,
        accept: h.accept,
        ...(h.misconceptionId ? { misconceptionId: h.misconceptionId } : {}),
      },
    });
  }

  push({
    kind: "explain",
    speaker: "teacher",
    label: "CORE IDEA",
    board: r.equation,
    claimIds: defs.map((c) => c.id),
    text: defs.map((c) => c.text).join(" "),
  });

  if (full) {
    const q = doubts[0]
      ? `I always assumed “${strip(doubts[0].wrong)}”. Is that not right?`
      : r.basic[0];
    push({
      kind: "ask",
      speaker: "maya",
      label: doubts[0] ? "YOUR DOUBT, VOICED" : "FOUNDATIONAL QUESTION",
      board: r.title,
      ...(doubts[0] ? { misconceptionId: doubts[0].id } : {}),
      text: q ?? "",
    });
  }
  if (mech)
    push({
      kind: "explain",
      speaker: "teacher",
      label: "WHY IT WORKS",
      board: r.equation,
      claimIds: [mech.id],
      text: mech.text,
    });
  const b1 = r.blanks[0];
  if (b1)
    push({
      kind: "blank",
      speaker: "teacher",
      label: "FILL THE BLANK",
      board: r.equation,
      claimIds: [b1.claimId],
      prompt: "Fill the blank to continue.",
      text: `${b1.before} ____ ${b1.after}`.trim(),
      blank: {
        id: b1.id,
        before: b1.before,
        answer: b1.answer,
        after: b1.after,
        accept: b1.accept,
        ...(b1.misconceptionId ? { misconceptionId: b1.misconceptionId } : {}),
      },
    });

  if (r.probes[0])
    push({
      kind: "challenge",
      speaker: "arjun",
      label: "PROBING",
      board: mis[0]?.wrong ?? r.title,
      ...(mis[0] ? { misconceptionId: mis[0].id } : {}),
      text: r.probes[0],
    });
  if (pit)
    push({
      kind: "explain",
      speaker: "teacher",
      label: "THE TRAP",
      board: mis[0]?.right ?? r.equation,
      claimIds: [pit.id],
      text: pit.text,
    });

  if (full && r.basic[1])
    push({
      kind: "ask",
      speaker: "maya",
      label: "FOUNDATIONAL QUESTION",
      board: r.title,
      text: doubts[1] ? `And I also thought “${strip(doubts[1].wrong)}”…` : r.basic[1],
    });
  if (ex)
    push({
      kind: "example",
      speaker: "maya",
      label: "WORKED EXAMPLE",
      board: r.equation,
      claimIds: [ex.id],
      text: `Can we make that concrete? ${ex.text}`,
    });
  pushCheck(0, "teacher");

  const h1 = r.hints[0];
  if (h1)
    push({
      kind: "hint",
      speaker: "maya",
      label: "HINT · GUESS FIRST",
      board: r.equation,
      claimIds: [h1.claimId],
      prompt: h1.question,
      text: `Quick one before we go on: ${h1.question}`,
      hintCard: {
        id: h1.id,
        question: h1.question,
        hint: h1.hint,
        answer: h1.answer,
        accept: h1.accept,
        ...(h1.misconceptionId ? { misconceptionId: h1.misconceptionId } : {}),
      },
    });

  pushCheckin("during");

  if (r.probes[1])
    push({
      kind: "challenge",
      speaker: "arjun",
      label: "EDGE CASE",
      board: r.equation,
      text: r.probes[1],
    });
  if (bound)
    push({
      kind: "explain",
      speaker: "teacher",
      label: "BOUNDARIES",
      board: r.equation,
      claimIds: [bound.id],
      text: bound.text,
    });
  if (full) pushCheck(1, "maya");
  const b2 = r.blanks[1];
  if (b2 && full)
    push({
      kind: "blank",
      speaker: "teacher",
      label: "FILL THE BLANK",
      board: r.equation,
      claimIds: [b2.claimId],
      prompt: "Fill the blank to continue.",
      text: `${b2.before} ____ ${b2.after}`.trim(),
      blank: {
        id: b2.id,
        before: b2.before,
        answer: b2.answer,
        after: b2.after,
        accept: b2.accept,
        ...(b2.misconceptionId ? { misconceptionId: b2.misconceptionId } : {}),
      },
    });
  const h2 = r.hints[1];
  if (h2 && full)
    push({
      kind: "hint",
      speaker: "arjun",
      label: "HINT · GUESS FIRST",
      board: r.equation,
      claimIds: [h2.claimId],
      prompt: h2.question,
      text: `My turn to ask: ${h2.question}`,
      hintCard: {
        id: h2.id,
        question: h2.question,
        hint: h2.hint,
        answer: h2.answer,
        accept: h2.accept,
        ...(h2.misconceptionId ? { misconceptionId: h2.misconceptionId } : {}),
      },
    });

  // checkpoint questions derive from THIS dialogue: they quote what was actually said
  const probe = r.probes[0] ?? r.title;
  push({
    kind: "checkpoint",
    speaker: "teacher",
    label: "CHECKPOINT",
    board: "Checkpoint",
    claimIds: r.claims
      .filter((c) => ["define", "pitfall", "example"].includes(c.role))
      .map((c) => c.id),
    text: `Checkpoint — one question drawn from today's class.`,
    prompt: `Arjun asked: “${strip(probe)}?” Using the idea we developed${ex ? " and the worked example" : ""}, answer him in your own words.`,
    hint: `Use the core idea and the worked example from the class.${mis[0] ? ` Watch for the common trap: ${mis[0].name}.` : ""}`,
  });
  pushCheckin("after");
  push({
    kind: "teachback",
    speaker: "maya",
    label: "TEACH-BACK",
    board: "Teach it back",
    text: `I think I follow — but could you explain ${r.topic} back to me in your own words? Speaking is best; typing works too.`,
    prompt: `Explain ${r.topic} to Maya in your own words.`,
    hint: "Start with a one-line definition, add one example, then name the trap to avoid.",
  });
  push({
    kind: "transfer",
    speaker: "arjun",
    label: "TRANSFER",
    board: "Transfer",
    text: r.transfer,
    prompt: "Apply the idea to this new situation.",
    hint: "Say first what the system and the key quantities are, then apply the idea step by step.",
  });

  registerSource(T, sourceFromRecord(r));
  return T;
}

/** Number of turns by persona (used to verify all three personas contribute). */
export const speakersOf = (stages: LessonStage[]) => [...new Set(stages.map((s) => s.speaker))];

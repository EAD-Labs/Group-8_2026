// Answers to the learner's own doubts when the AI cannot be reached. It answers the question that was
// actually asked — shaped by what kind of question it is, drawn only from the verified notes, never
// repeating a note it already used, and honest when the notes do not cover it.
import { STOP } from "./assess";
import type { LessonStage } from "./curriculum";
import type { VerifiedRecord } from "./knowledge/types";

const words = (s: string) =>
  (s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((w) => w.length > 2 && !STOP.has(w));
const overlap = (q: string[], text: string) => {
  const t = new Set(words(text));
  return q.reduce((n, w) => n + (t.has(w) ? 1 : 0), 0);
};
const clip = (s: string, n = 110) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);
const NAMES: Record<string, string> = { maya: "Maya", arjun: "Arjun" };
const pick = <T>(list: T[], seed: string): T => {
  let h = 7;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return list[h % list.length]!;
};

export type QuestionKind = "example" | "why" | "define" | "again" | "pitfall" | "other";
export function kindOfQuestion(q: string): QuestionKind {
  const l = q.toLowerCase();
  if (/(again|differently|another way|simpl|don.?t (get|understand)|not clear|confus|lost)/.test(l))
    return "again";
  if (/(example|instance|concrete|real.?life|show me)/.test(l)) return "example";
  if (/(why|reason|how come|because|how does|how do)/.test(l)) return "why";
  if (/(wrong|trap|mistake|common|misconception|confuse with|versus|\bvs\b|difference)/.test(l))
    return "pitfall";
  if (/(what is|what are|what does|mean|define|definition)/.test(l)) return "define";
  return "other";
}

export type LocalAnswer = {
  text: string;
  refersTo: { speaker: string; snippet: string } | null;
  claimIds: string[];
  /** false when the notes did not cover the question and the answer says so */
  grounded: boolean;
};

export function answerInContext(
  question: string,
  rec: VerifiedRecord | undefined,
  turns: LessonStage[],
  upTo: number,
  teacher: string,
  opts: { history?: Array<{ q: string; a: string }> } = {},
): LocalAnswer {
  const q = words(question);
  const kind = kindOfQuestion(question);
  const used = (opts.history ?? []).map((h) => h.a).join(" ");
  const seen = turns
    .slice(0, upTo + 1)
    .filter((s) => s.kind !== "blank" && s.kind !== "checkin" && s.text);

  // the earlier line of the class the question is closest to — mentioned only when it genuinely matches
  const ranked = seen
    .filter((s) => s.kind !== "doubt" && s.kind !== "bridge")
    .map((s, i) => ({ s, i, score: overlap(q, s.text) }))
    .sort((a, b) => b.score - a.score || b.i - a.i);
  const near = ranked[0] && ranked[0].score >= 1 ? ranked[0].s : undefined;
  const who = near ? (NAMES[near.speaker] ?? teacher) : teacher;
  const refersTo = near ? { speaker: who, snippet: clip(near.text) } : null;
  const tie = refersTo ? ` That ties to what ${who} said earlier: “${refersTo.snippet}”` : "";

  const roleWanted = {
    example: "example",
    why: "mechanism",
    define: "define",
    pitfall: "pitfall",
    again: "define",
    other: "",
  }[kind];
  const claims = rec
    ? rec.claims
        .map((c) => ({
          c,
          score:
            overlap(q, c.text) * 2 +
            (c.role === roleWanted ? 1 : 0) -
            (used.includes(c.text) ? 2 : 0),
        }))
        .sort((a, b) => b.score - a.score)
    : [];
  // enough of the question's own words must appear in a note (one stray word like "work" is not a match)
  const matched = claims.some((x) => {
    const o = overlap(q, x.c.text);
    return o >= 1 && o / Math.max(q.length, 1) >= 0.4;
  });
  // "explain that again" / "give me an example" are follow-ups about the topic itself and need no keyword;
  // anything longer has to actually touch the verified notes, or the honest answer is "that's not covered"
  const followUp = (kind === "again" || kind === "example") && q.length <= 4;

  // a matching misconception is the most useful thing to say about "is it X?" style doubts
  const mis = rec?.misconceptions.find((m) => overlap(q, `${m.name} ${m.wrong}`) >= 2);

  if (rec && (matched || followUp)) {
    const take = claims.slice(0, kind === "again" ? 2 : 1).map((x) => x.c);
    const body = take.map((c) => c.text).join(" ");
    const lead = {
      example: pick(
        ["Here's a concrete one:", "Take this case:", "Try it on this example:"],
        question,
      ),
      why: pick(["Here's the reason:", "The reason is this:", "It comes down to this:"], question),
      define: pick(["In plain terms:", "Put simply:", "The short version:"], question),
      again: pick(
        ["Let me come at it another way:", "Different angle:", "Okay, again, more simply:"],
        question,
      ),
      pitfall: pick(
        ["Watch out for this:", "This is the usual trap:", "The thing people get wrong:"],
        question,
      ),
      other: pick(
        ["From what we have verified:", "Here's what the notes say:", "Short answer:"],
        question,
      ),
    }[kind];
    const fix = mis ? `\n\nA common mix-up here: “${mis.wrong}” — better: “${mis.right}”.` : "";
    const ask = kind === "again" ? "\n\nDoes that land, or should I try an example?" : "";
    return {
      text: `${lead} ${body}${fix}${tie}${ask}`.trim(),
      refersTo,
      claimIds: take.map((c) => c.id),
      grounded: true,
    };
  }

  // no verified note covers it: say so, and offer the closest thing from this class instead of guessing
  const closest = claims[0]?.c.text ?? ranked[0]?.s.text ?? "";
  const text = closest
    ? `I don't have a verified note that answers that directly, so I won't guess. The closest idea from this class is: ${clip(closest, 220)}\n\nIf you rephrase what's confusing, I'll try again — or ask it as a smaller question.`
    : `I don't have anything verified on that yet, so I won't guess. Could you say a little more about what's confusing?`;
  return { text, refersTo, claimIds: [], grounded: false };
}

// Hands-free classroom: the teacher asks out loud and the learner answers out loud. This file holds the
// pure parts — understanding what was said (an option, a command, a doubt) — and a "listen once"
// helper on top of the browser's speech recognition. The page wires them to the class.
import { startRecognizer, sttSupported } from "./voice";

const clean = (s: string) =>
  s
    .toLowerCase()
    .replace(/[“”"'’.,!?;:()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const words = (s: string) => clean(s).split(" ").filter(Boolean);

const ORD: Record<string, number> = {
  first: 0,
  second: 1,
  third: 2,
  fourth: 3,
  one: 0,
  two: 1,
  three: 2,
  four: 3,
  "1": 0,
  "2": 1,
  "3": 2,
  "4": 3,
};
const LETTER: Record<string, number> = {
  a: 0,
  b: 1,
  c: 2,
  d: 3,
  ay: 0,
  bee: 1,
  be: 1,
  see: 2,
  sea: 2,
  cee: 2,
  dee: 3,
};

/**
 * Which of the shown options did the learner say? Understands "B", "option b", "the second one",
 * "true"/"false", or (part of) the option's own words. Returns -1 when it is not clear.
 */
export function parseChoice(said: string, options: string[], letters = true): number {
  const s = clean(said);
  if (!s) return -1;
  const w = words(s);
  // true / false
  const tf = options.map((o) => clean(o));
  if (tf.length === 2 && tf.includes("true") && tf.includes("false")) {
    if (/\b(true|right|correct|yes)\b/.test(s) && !/\b(false|not true|wrong|incorrect)\b/.test(s))
      return tf.indexOf("true");
    if (/\b(false|wrong|not true|incorrect|no)\b/.test(s)) return tf.indexOf("false");
  }
  if (letters) {
    // "option b", "answer c", "it's a", or a lone letter
    const m = s.match(
      /\b(?:option|answer|letter|choice|it s|its|is)\s+([a-d]|ay|bee|be|see|sea|cee|dee)\b/,
    );
    if (m && LETTER[m[1]!] !== undefined && LETTER[m[1]!]! < options.length) return LETTER[m[1]!]!;
    if (w.length <= 2)
      for (const x of w)
        if (LETTER[x] !== undefined && LETTER[x]! < options.length) return LETTER[x]!;
  }
  const ord = s.match(
    /\b(first|second|third|fourth|one|two|three|four|[1-4])\b(?:\s+(?:one|option))?/,
  );
  if (ord && w.length <= 4 && ORD[ord[1]!] !== undefined && ORD[ord[1]!]! < options.length)
    return ORD[ord[1]!]!;
  // the option's own words: best overlap, and clearly better than the runner-up
  const scores = options.map((o) => {
    const ow = words(o).filter((x) => x.length > 2);
    if (!ow.length) return 0;
    const hit = ow.filter((x) => w.includes(x)).length;
    return clean(o) === s ? 99 : hit / ow.length;
  });
  const best = Math.max(...scores);
  const i = scores.indexOf(best);
  const second = Math.max(...scores.filter((_, j) => j !== i), 0);
  return best >= 0.5 && best - second >= 0.2 ? i : -1;
}

export type Command =
  | { kind: "pause" }
  | { kind: "resume" }
  | { kind: "next" }
  | { kind: "back" }
  | { kind: "repeat" }
  | { kind: "slower" }
  | { kind: "faster" }
  | { kind: "skip" }
  | { kind: "stop-hands-free" }
  | { kind: "doubt"; question: string };

/** A spoken command, or a doubt. `null` when it is neither (e.g. silence or a stray word). */
export function parseCommand(said: string): Command | null {
  const s = clean(said);
  if (!s) return null;
  if (/^(stop|turn off|switch off) (hands free|handsfree|voice( mode)?|listening)/.test(s))
    return { kind: "stop-hands-free" };
  if (
    /^(pause|stop|wait|hold on|one (sec|second|moment)|hang on)\b/.test(s) &&
    s.split(" ").length <= 4
  )
    return { kind: "pause" };
  if (
    /^(continue|resume|play|go on|carry on|okay go|ok go|go ahead|start)\b/.test(s) &&
    s.split(" ").length <= 4
  )
    return { kind: "resume" };
  if (/^(next|move on|next line|skip this)\b/.test(s) && s.split(" ").length <= 3)
    return { kind: "next" };
  if (/^(skip)\b/.test(s) && s.split(" ").length <= 3) return { kind: "skip" };
  if (/^(go back|back|previous|last line)\b/.test(s) && s.split(" ").length <= 4)
    return { kind: "back" };
  if (
    /^(repeat|say (that|it) again|again|come again|pardon|what did you say)\b/.test(s) &&
    s.split(" ").length <= 5
  )
    return { kind: "repeat" };
  if (/\b(slow(er)? down|slower|too fast)\b/.test(s) && s.split(" ").length <= 5)
    return { kind: "slower" };
  if (/\b(faster|speed up|too slow)\b/.test(s) && s.split(" ").length <= 5)
    return { kind: "faster" };
  // a doubt: "I have a doubt, why …", "question: …", or just a question
  const m = s.match(
    /^(?:i have a (?:doubt|question)|(?:a )?doubt|(?:a )?question|excuse me|sir|madam|ma am|professor|teacher)\b[\s,:-]*(.*)$/,
  );
  if (m) return { kind: "doubt", question: m[1]!.trim() };
  if (
    /^(why|what|how|when|where|which|who|is|are|can|could|does|do|should|would|will|explain|tell me)\b/.test(
      s,
    ) &&
    s.split(" ").length >= 3
  )
    return { kind: "doubt", question: said.trim() };
  return null;
}

/** Spoken answers to the "Did that clear it up?" question after a doubt. */
export function parseDoubtReply(said: string): "got" | "again" | "example" | null {
  const s = clean(said);
  if (/\b(example|show me|instance)\b/.test(s)) return "example";
  if (/\b(not clear|no|didn t|did not|don t|still|again|differently|confus|explain)\b/.test(s))
    return "again";
  if (/\b(got it|yes|clear|okay|ok|understood|makes sense|thanks|thank you|fine|good)\b/.test(s))
    return "got";
  return null;
}

/** Read a list of options out loud: "A: …, B: …". */
export const speakOptions = (opts: string[], letters = true) =>
  opts.map((o, i) => (letters ? `${"ABCD"[i]}: ${o}` : o)).join(letters ? ". " : ", or ");

export type Listen = { promise: Promise<string>; stop: () => void };
/**
 * Listen until the learner has spoken and then gone quiet for `silenceMs`, or `maxMs` has passed.
 * Resolves with what was said ("" if nothing). Interim words are reported through `onWords`.
 */
export function listenOnce(o: {
  lang?: string;
  silenceMs?: number;
  maxMs?: number;
  /** give up early if nothing at all is said within this time */
  startMs?: number;
  onWords?: (text: string) => void;
}): Listen {
  let resolve!: (s: string) => void;
  const promise = new Promise<string>((r) => (resolve = r));
  if (!sttSupported()) {
    resolve("");
    return { promise, stop: () => {} };
  }
  let text = "";
  let done = false;
  let silence = 0;
  const finish = () => {
    if (done) return;
    done = true;
    window.clearTimeout(silence);
    window.clearTimeout(cap);
    window.clearTimeout(early);
    rec?.stop();
    resolve(text.trim());
  };
  const rec = startRecognizer({
    base: "",
    ...(o.lang ? { lang: o.lang } : {}),
    onText: (full) => {
      if (done) return; // the recognizer reports its last words after it was stopped
      text = full;
      o.onWords?.(full);
      window.clearTimeout(silence);
      window.clearTimeout(early);
      if (full.trim()) silence = window.setTimeout(finish, o.silenceMs ?? 1600);
    },
    onDone: () => finish(),
  });
  const cap = window.setTimeout(finish, o.maxMs ?? 30000);
  const early = window.setTimeout(() => {
    if (!text.trim()) finish();
  }, o.startMs ?? 9000);
  if (!rec) finish();
  return { promise, stop: finish };
}

// Full lessons: the AI teaches the topic the way it would in a chat (same depth, same explanations), and
// the classroom delivers that text as spoken turns — woven between the interactive turns (quick checks,
// blanks, hints, check-ins, checkpoint). Cached per concept so a class is prepared once.
import { useSyncExternalStore } from "react";
import type { LessonStage } from "./curriculum";
import type { LiveTurn } from "./live-turns";
import { toBlocks, type Block } from "./lesson-md";

/** `fromId`: where the learner was when the lesson arrived — it is placed from there on, never behind them. */
export type DeepLesson = {
  key: string;
  lang: string;
  markdown: string;
  createdAt: number;
  fromId?: string;
};
const KEY = "kyro_deep_lessons_v1";
let cache: Record<string, DeepLesson> | null = null;
const subs = new Set<() => void>();
const read = () => {
  if (cache) return cache;
  try {
    cache = JSON.parse(localStorage.getItem(KEY) ?? "{}");
  } catch {
    cache = {};
  }
  return cache!;
};
export const deepId = (key: string, lang: string) => `${key}|${lang}`;
export function saveDeep(l: DeepLesson) {
  const all = read();
  all[deepId(l.key, l.lang)] = l;
  // keep the newest 30 lessons (a lesson is a few kB)
  const keep = Object.values(all)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 30);
  cache = Object.fromEntries(keep.map((x) => [deepId(x.key, x.lang), x]));
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* the lesson still shows for this visit */
  }
  subs.forEach((f) => f());
}
export function useDeepLesson(key: string, lang: string): DeepLesson | undefined {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => (typeof localStorage === "undefined" ? undefined : read()[deepId(key, lang)]),
    () => undefined,
  );
}

/** Text as it should be spoken: markdown symbols removed, maths kept readable. */
export const spokenText = (s: string) =>
  s
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/(^|\s)\*(\S.*?)\*(?=\s|$)/g, "$1$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\$\$?([^$]+)\$\$?/g, (_m: string, t: string) => speakTex(t))
    .replace(/\[(.+?)\]\((.+?)\)/g, "$1")
    .replace(/^\s*>\s?/gm, "")
    .replace(/\s+/g, " ")
    .trim();

export type Section = {
  title: string;
  blocks: Block[];
  turns: Array<{ text: string; board: string; block: number; kind: string }>;
};

const GREEK: Record<string, string> = {
  alpha: "alpha",
  beta: "beta",
  gamma: "gamma",
  delta: "delta",
  Delta: "delta",
  eta: "eta",
  theta: "theta",
  lambda: "lambda",
  mu: "mu",
  pi: "pi",
  rho: "rho",
  sigma: "sigma",
  Sigma: "sum",
  tau: "tau",
  omega: "omega",
  Omega: "omega",
  epsilon: "epsilon",
};
/** Formula as it is read aloud: \frac{a}{b} → "a over b", x^2 → "x squared", T_c → "T c". */
export const speakTex = (tex: string) =>
  tex
    .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, "$1 over $2")
    .replace(/\^\{?2\}?/g, " squared")
    .replace(/\^\{([^{}]+)\}|\^(\w)/g, " to the power $1$2")
    .replace(/_\{([^{}]+)\}|_(\w)/g, " $1$2")
    .replace(/\\(ge|geq)\b/g, " is at least ")
    .replace(/\\(le|leq)\b/g, " is at most ")
    .replace(/\\(approx)\b/g, " is about ")
    .replace(/\\(cdot|times)\b/g, " times ")
    .replace(/\\([A-Za-z]+)/g, (_, w: string) => GREEK[w] ?? "")
    .replace(/[{}]/g, "")
    .replace(/=/g, " equals ")
    .replace(/\s+/g, " ")
    .trim();

/** Split a chat-style markdown lesson into sections: the board blocks to show, and short spoken turns. */
export function splitLesson(markdown: string, maxChars = 420): Section[] {
  const out: Section[] = [];
  let cur: Section = { title: "", blocks: [], turns: [] };
  const say = (text: string, board: string, block: number, kind: string) => {
    const t = spokenText(text);
    if (!t) return;
    const sentences = t.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) ?? [t];
    let buf = "";
    for (const s of sentences) {
      if ((buf + s).length > maxChars && buf) {
        cur.turns.push({ text: buf.trim(), board, block, kind });
        buf = "";
      }
      buf += s;
    }
    if (buf.trim()) cur.turns.push({ text: buf.trim(), board, block, kind });
  };
  for (const bl of toBlocks(markdown)) {
    if (bl.kind === "heading") {
      if (cur.turns.length) out.push(cur);
      cur = { title: spokenText(bl.text), blocks: [], turns: [] };
      continue;
    }
    cur.blocks.push(bl);
    const i = cur.blocks.length - 1;
    if (bl.kind === "p")
      say(bl.text, (bl.text.match(/\$([^$]+)\$/)?.[1] ?? cur.title) || cur.title, i, "p");
    else if (bl.kind === "list")
      say(
        bl.items.map((x) => spokenText(x).replace(/[.;]?$/, ".")).join(" "),
        cur.title || "Key points",
        i,
        "list",
      );
    else if (bl.kind === "math")
      cur.turns.push({
        text: speakTex(bl.tex) || "Look at the board.",
        board: bl.tex.slice(0, 220),
        block: i,
        kind: "math",
      });
    else if (bl.kind === "plot")
      cur.turns.push({
        text: `Look at the graph on the board${bl.spec.title ? `: ${bl.spec.title}` : ""}.`,
        board: bl.spec.title ?? cur.title,
        block: i,
        kind: "plot",
      });
    else if (bl.kind === "code")
      cur.turns.push({
        text: "Look at the board.",
        board: bl.text.slice(0, 220),
        block: i,
        kind: "code",
      });
  }
  if (cur.turns.length) out.push(cur);
  return out.filter((s) => s.turns.length);
}

/**
 * Place the lesson in the class: section k goes right after the k-th teaching turn of the short class
 * (core idea, explanations, example), any sections left over go just before the checkpoint — so the
 * quick checks, blanks and hints still come after the teaching they test.
 */
export function deepTurns(
  stages: LessonStage[],
  sections: Section[],
  conceptKey: string,
  fromId?: string,
): LiveTurn[] {
  if (!sections.length) return [];
  const from = fromId
    ? Math.max(
        0,
        stages.findIndex((s) => s.id === fromId),
      )
    : 0;
  const anchors = stages
    .map((s, i) => ({ s, i }))
    .filter(({ s, i }) => i >= from && (s.kind === "explain" || s.kind === "example") && s.id)
    .map(({ s }) => s.id!);
  const cp = stages.findIndex((s) => s.kind === "checkpoint");
  const cpAt = cp > 0 ? cp : stages.length;
  // left-over sections go just before the checkpoint — or right where the learner is, if they are past it
  const beforeCp =
    from >= cpAt && fromId
      ? fromId
      : (stages[Math.max(0, cpAt - 1)]?.id ?? stages[stages.length - 1]?.id ?? "__start__");
  const out: LiveTurn[] = [];
  sections.forEach((sec, k) => {
    const after = anchors[k] ?? beforeCp;
    sec.turns.forEach((t, j) =>
      out.push({
        afterId: after,
        stage: {
          id: `${conceptKey}#deep${k}.${j}`,
          kind: "explain",
          speaker: "teacher",
          label: (sec.title || "IN DEPTH").toUpperCase().slice(0, 40),
          board: t.board || sec.title,
          text: t.text,
          deep: { section: k, block: t.block, kind: t.kind },
        },
      }),
    );
  });
  return out;
}

// "My thinking", as a conversation: three short check-ins (before, during, after a class), one tap each.
// What the learner says is kept per learner and concept, and a few answers change what happens next.
export const KNOW_LEVELS = [
  "Nothing yet",
  "A little",
  "Fairly well",
  "I could explain it",
] as const;
export const SURE_LEVELS = ["Not at all", "A little", "Fairly", "Very sure"] as const;

export type ThinkingLog = {
  /** index into KNOW_LEVELS, before the class */
  know?: number;
  tricky?: string;
  pulse?: "yes" | "mostly" | "lost";
  shaky?: string;
  felt?: "expected" | "better" | "worse";
  scorePct?: number;
  /** index into SURE_LEVELS, after the class */
  sureNow?: number;
  next?: string;
  /** confidence given just before the checkpoint answer was submitted: 0 guessing, 1 fairly sure, 2 certain */
  cpConf?: number;
  /** when the checkpoint was scored (orders a learner's classes for the calibration trend) */
  cpAt?: number;
  /** pilot feedback: how useful the class was (1–5) and one thing to improve */
  useful?: number;
  improve?: string;
  updatedAt?: string;
};

export interface ThinkingStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const thinkingKey = (learnerId: string, conceptKey: string) =>
  `kyro_thinking_v2:${encodeURIComponent(learnerId)}:${encodeURIComponent(conceptKey)}`;

const idx = (v: unknown, max: number) =>
  typeof v === "number" && Number.isInteger(v) && v >= 0 && v < max ? v : undefined;
const oneOf = <T extends string>(v: unknown, list: readonly T[]): T | undefined =>
  (list as readonly unknown[]).includes(v) ? (v as T) : undefined;
const str = (v: unknown) => (typeof v === "string" && v.length <= 200 ? v : undefined);

export function loadThinking(storage: ThinkingStorage, key: string): ThinkingLog {
  try {
    const raw = storage.getItem(key);
    if (!raw) return {};
    const o = JSON.parse(raw) as Record<string, unknown>;
    const out: ThinkingLog = {};
    const know = idx(o["know"], KNOW_LEVELS.length);
    if (know !== undefined) out.know = know;
    const sure = idx(o["sureNow"], SURE_LEVELS.length);
    if (sure !== undefined) out.sureNow = sure;
    const pulse = oneOf(o["pulse"], ["yes", "mostly", "lost"] as const);
    if (pulse) out.pulse = pulse;
    const felt = oneOf(o["felt"], ["expected", "better", "worse"] as const);
    if (felt) out.felt = felt;
    const cpc = idx(o["cpConf"], 3);
    if (cpc !== undefined) out.cpConf = cpc;
    if (typeof o["cpAt"] === "number" && o["cpAt"] > 0) out.cpAt = o["cpAt"];
    if (
      typeof o["useful"] === "number" &&
      Number.isInteger(o["useful"]) &&
      o["useful"] >= 1 &&
      o["useful"] <= 5
    )
      out.useful = o["useful"];
    for (const k of ["tricky", "shaky", "next", "improve"] as const) {
      const v = str(o[k]);
      if (v) out[k] = v;
    }
    if (typeof o["scorePct"] === "number" && o["scorePct"] >= 0 && o["scorePct"] <= 100)
      out.scorePct = Math.round(o["scorePct"]);
    if (typeof o["updatedAt"] === "string") out.updatedAt = o["updatedAt"];
    return out;
  } catch {
    return {};
  }
}

/** Merge new answers into what is already saved. Returns the saved log (storage problems never break the class). */
export function patchThinking(
  storage: ThinkingStorage,
  key: string,
  patch: Partial<ThinkingLog>,
): ThinkingLog {
  const next: ThinkingLog = {
    ...loadThinking(storage, key),
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  try {
    storage.setItem(key, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

/** "Before you said “A little”; now “Fairly”." — the comparison the learner sees after the class. */
export function changeLine(log: ThinkingLog): string | null {
  if (log.know === undefined || log.sureNow === undefined) return null;
  const was = log.know,
    now = log.sureNow;
  const dir = now > was ? "up" : now < was ? "down" : "the same";
  return `Before the class you said “${KNOW_LEVELS[was]}”; now “${SURE_LEVELS[now]}” — ${dir === "the same" ? "about the same" : dir}.`;
}

export const KNOW_REPLY = [
  "Perfect — we'll start from the very basics.",
  "Good — we'll build on what you have.",
  "Nice — Arjun will probe the tricky edges for you.",
  "Great — try to catch any gaps as we go.",
] as const;

export const CONFIDENCE = ["Guessing", "Fairly sure", "Certain"] as const;

// Live turns: the learner's own doubts (and the teacher's answers and call-backs) become real turns of
// the class, spliced into the lesson right after the turn they were asked at. They are saved with the
// class so a reload keeps them, and rebuilt into the timeline every time the lesson is shown.
import { useSyncExternalStore } from "react";
import type { LessonStage } from "./curriculum";

export type LiveTurn = { afterId: string; stage: LessonStage };
type Store = Record<string, LiveTurn[]>;

const KEY = "kyro_live_turns_v1";
const EMPTY: LiveTurn[] = [];
let cache: Store | null = null;
const subs = new Set<() => void>();

const INTERRUPTED = "That answer was interrupted. Ask again and I'll pick it up from here.";

function read(): Store {
  if (cache) return cache;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Store;
    // a turn that was still being written when the page closed can never finish: close it honestly
    for (const list of Object.values(raw))
      for (const t of list)
        if (t.stage.pending) {
          t.stage.pending = false;
          t.stage.text = t.stage.text || INTERRUPTED;
        }
    cache = raw;
  } catch {
    cache = {};
  }
  return cache;
}
function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(cache ?? {}));
  } catch {
    /* storage unavailable: the turns still work for this visit */
  }
}
function emit() {
  subs.forEach((f) => f());
}

export const liveTurnsFor = (key: string): LiveTurn[] => read()[key] ?? EMPTY;

export function addLive(key: string, afterId: string, stage: LessonStage) {
  const all = read();
  all[key] = [...(all[key] ?? []), { afterId, stage }];
  persist();
  emit();
}
/** Update one live turn. While text is being typed out, pass save=false so storage is written once at the end. */
export function patchLive(key: string, id: string, patch: Partial<LessonStage>, save = true) {
  const all = read();
  all[key] = (all[key] ?? []).map((t) =>
    t.stage.id === id ? { ...t, stage: { ...t.stage, ...patch } } : t,
  );
  if (save) persist();
  emit();
}
export function clearLive(key: string) {
  const all = read();
  if (!all[key]?.length) return;
  delete all[key];
  persist();
  emit();
}

export function useLiveTurns(key: string): LiveTurn[] {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => (typeof localStorage === "undefined" ? EMPTY : liveTurnsFor(key)),
    () => EMPTY,
  );
}

/** The lesson with its live turns placed right after the turn each was asked at (in the order they were added). */
export function mergeLive(stages: LessonStage[], live: LiveTurn[]): LessonStage[] {
  if (!live.length) return stages;
  const byAnchor = new Map<string, LessonStage[]>();
  for (const t of live) byAnchor.set(t.afterId, [...(byAnchor.get(t.afterId) ?? []), t.stage]);
  const out: LessonStage[] = [];
  const placed = new Set<string>();
  const place = (s: LessonStage) => {
    out.push(s);
    for (const l of byAnchor.get(s.id ?? "") ?? []) {
      if (placed.has(l.id ?? "")) continue;
      placed.add(l.id ?? "");
      place(l);
    }
  };
  // a doubt raised while the first turn was still blocking comes before everything else
  for (const l of byAnchor.get("__start__") ?? []) {
    placed.add(l.id ?? "");
    place(l);
  }
  for (const s of stages) place(s);
  // a turn whose anchor no longer exists (the lesson was rebuilt) goes at the end rather than vanishing
  for (const t of live) if (!placed.has(t.stage.id ?? "")) out.push(t.stage);
  return out;
}

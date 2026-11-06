// The learner model + classroom sessions, persisted in the browser (and exported for the pilot).
import { useSyncExternalStore } from "react";
import type { DialoguePlan } from "./dialogue";
import { emptyLearner, type Learner } from "./mastery";
import type { SessionState } from "./session";

const KEY = "kyro_learner_v1";
const LOCAL_LEARNER_ID_KEY = "kyro_local_learner_id_v1";
/** Stable browser-local identity for learners who have not signed in. */
export function localLearnerId(): string {
  try {
    let id = localStorage.getItem(LOCAL_LEARNER_ID_KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(LOCAL_LEARNER_ID_KEY, id);
    }
    return id;
  } catch {
    return "anonymous-session";
  }
}
export type StoredPlan = DialoguePlan & { startedAt: number };
export type LearnerData = {
  learner: Learner;
  sessions: Record<string, SessionState>;
  plans: Record<string, StoredPlan>;
};

let data: LearnerData = { learner: emptyLearner(), sessions: {}, plans: {} };
let loaded = false;
let version = 0;
const listeners = new Set<() => void>();
const bump = () => {
  version++;
  listeners.forEach((l) => l());
};
function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* storage full/blocked: the session still works in memory */
  }
}
export function initLearner(): LearnerData {
  if (loaded || typeof window === "undefined") return data;
  loaded = true;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<LearnerData>;
      data = {
        learner: { ...emptyLearner(), ...(p.learner ?? {}) },
        sessions: p.sessions ?? {},
        plans: p.plans ?? {},
      };
    }
  } catch {
    /* unreadable: start clean */
  }
  bump();
  return data;
}
export const getLearnerData = () => data;
export function setLearner(fn: (l: Learner) => Learner) {
  data = { ...data, learner: fn(data.learner) };
  persist();
  bump();
}
export function setSession(key: string, fn: (s: SessionState | undefined) => SessionState) {
  data = { ...data, sessions: { ...data.sessions, [key]: fn(data.sessions[key]) } };
  persist();
  bump();
}
export function setPlan(key: string, plan: StoredPlan | null) {
  const plans = { ...data.plans };
  if (plan) plans[key] = plan;
  else delete plans[key];
  data = { ...data, plans };
  persist();
  bump();
}
export function resetLearner() {
  data = { learner: emptyLearner(), sessions: {}, plans: {} };
  persist();
  bump();
}
const subscribe = (l: () => void) => (listeners.add(l), () => listeners.delete(l));
export function useLearner() {
  useSyncExternalStore(
    subscribe,
    () => version,
    () => version,
  );
  return data;
}

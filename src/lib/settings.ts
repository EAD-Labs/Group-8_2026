// User settings, persisted in the browser. Everything that used to sit on the front screen
// (language, classroom, narration) lives in the Settings page and is stored here.

import { useSyncExternalStore } from "react";
import type { RoomId } from "@/components/classroom/personas";

export type ThemeMode = "system" | "light" | "dark";
export type Graphics = "auto" | "low" | "medium" | "high";
export type MotionMode = "system" | "on" | "off";

export type Settings = {
  theme: ThemeMode;
  /** "auto" picks the classroom from the subject; otherwise always use this room */
  room: RoomId | "auto";
  /** narrate lessons aloud while they play */
  voiceOn: boolean;
  /** narration / playback speed multiplier */
  speed: 1 | 1.5 | 2;
  /** pop the learner's question up over the classroom when it is their turn */
  popupQuestions: boolean;
  /** short one-tap thinking check-ins (before, during, after a class) */
  thinkingCheckins: boolean;
  showTranscript: boolean;
  nameTags: boolean;
  /** open every class in the enlarged (fill-the-window) view */
  startEnlarged: boolean;
  /** full dialogue, or reduced (advanced student only, shorter) for self-directed learners */
  dialogueMode: "full" | "reduced";
  /** opt in to the speech signal (speech rate and pauses, measured in the browser; no audio is kept) */
  speechCapture: boolean;
  /** days before the delayed retention check (HLD: 3 to 5) */
  retentionDays: 3 | 4 | 5;
  graphics: Graphics;
  /** dust, light shafts, glows, spotlight ring */
  effects: boolean;
  /** reduce motion: "system" follows the OS setting */
  motion: MotionMode;
  /** questions per review session */
  reviewGoal: 5 | 10 | 15 | 20;
  /** the class plays on by itself, stopping only where the learner has to answer */
  autoPlay: boolean;
  /** how many new lectures the Today list schedules per day */
  lecturesPerDay: 1 | 2 | 3;
  /** the class is run by voice: the teacher asks out loud and the learner answers out loud */
  handsFree: boolean;
  /** "full": the AI teaches the topic in depth (as in a chat); "brief": the short verified class */
  lessonDepth: "full" | "brief";
};

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  room: "auto",
  voiceOn: true,
  speed: 1,
  popupQuestions: true,
  thinkingCheckins: true,
  showTranscript: true,
  nameTags: true,
  startEnlarged: false,
  dialogueMode: "full",
  speechCapture: false,
  retentionDays: 3,
  graphics: "auto",
  effects: true,
  motion: "system",
  reviewGoal: 10,
  autoPlay: true,
  lecturesPerDay: 2,
  handsFree: true,
  lessonDepth: "full",
};

const KEY = "kyro_settings_v1";
const ROOMS = ["green-hall", "lecture-theatre", "studio"];
const oneOf = <T>(v: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback;
const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);

/** Accept only well-formed values from storage; anything else falls back to the default. */
export function sanitizeSettings(raw: unknown): Settings {
  const o = { ...((raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>) };
  if (raw && typeof raw === "object" && !("autoPlay" in o)) o["voiceOn"] = true;
  const d = DEFAULT_SETTINGS;
  return {
    theme: oneOf(o["theme"], ["system", "light", "dark"] as const, d.theme),
    room:
      o["room"] === "auto" || ROOMS.includes(o["room"] as string)
        ? (o["room"] as Settings["room"])
        : d.room,
    voiceOn: bool(o["voiceOn"], d.voiceOn),
    speed: oneOf(o["speed"], [1, 1.5, 2] as const, d.speed),
    popupQuestions: bool(o["popupQuestions"], d.popupQuestions),
    thinkingCheckins: bool(o["thinkingCheckins"], d.thinkingCheckins),
    showTranscript: bool(o["showTranscript"], d.showTranscript),
    nameTags: bool(o["nameTags"], d.nameTags),
    startEnlarged: bool(o["startEnlarged"], d.startEnlarged),
    dialogueMode: oneOf(o["dialogueMode"], ["full", "reduced"] as const, d.dialogueMode),
    speechCapture: bool(o["speechCapture"], d.speechCapture),
    retentionDays: oneOf(o["retentionDays"], [3, 4, 5] as const, d.retentionDays),
    graphics: oneOf(o["graphics"], ["auto", "low", "medium", "high"] as const, d.graphics),
    effects: bool(o["effects"], d.effects),
    motion: oneOf(o["motion"], ["system", "on", "off"] as const, d.motion),
    reviewGoal: oneOf(o["reviewGoal"], [5, 10, 15, 20] as const, d.reviewGoal),
    autoPlay: bool(o["autoPlay"], d.autoPlay),
    lecturesPerDay: oneOf(o["lecturesPerDay"], [1, 2, 3] as const, d.lecturesPerDay),
    handsFree: bool(o["handsFree"], d.handsFree),
    lessonDepth: oneOf(o["lessonDepth"], ["full", "brief"] as const, d.lessonDepth),
  };
}

let current: Settings = DEFAULT_SETTINGS;
let version = 0;
let loaded = false;
const listeners = new Set<() => void>();
const bump = () => {
  version++;
  listeners.forEach((l) => l());
};

export const getSettings = () => current;

/** Load from storage once (browser only) and apply the theme. */
export function initSettings(): Settings {
  if (loaded || typeof window === "undefined") return current;
  loaded = true;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) current = sanitizeSettings(JSON.parse(raw));
  } catch {
    /* unreadable settings -> defaults */
  }
  applyTheme(current.theme);
  watchSystemTheme();
  bump();
  return current;
}

export function updateSettings(patch: Partial<Settings>) {
  current = sanitizeSettings({ ...current, ...patch });
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* storage blocked — the choice still applies for this session */
  }
  if (patch.theme !== undefined) applyTheme(current.theme);
  bump();
}

export function resetSettings() {
  updateSettings({ ...DEFAULT_SETTINGS });
}

// ------------------------------------------------------------------ theme
export const systemPrefersDark = () =>
  typeof window !== "undefined" &&
  !!window.matchMedia &&
  window.matchMedia("(prefers-color-scheme: dark)").matches;

export const resolveTheme = (mode: ThemeMode): "light" | "dark" =>
  mode === "system" ? (systemPrefersDark() ? "dark" : "light") : mode;

export function applyTheme(mode: ThemeMode) {
  if (typeof document === "undefined") return;
  const t = resolveTheme(mode);
  const root = document.documentElement;
  root.classList.toggle("dark", t === "dark");
  root.dataset["theme"] = t;
  root.style.colorScheme = t;
}

let watching = false;
function watchSystemTheme() {
  if (watching || typeof window === "undefined" || !window.matchMedia) return;
  watching = true;
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (current.theme === "system") {
      applyTheme("system");
      bump();
    }
  });
}

// ------------------------------------------------------------------ graphics / motion
export type Quality = "low" | "medium" | "high";

/** Pick a quality tier. "auto" is conservative on phones and low-core devices. */
export function resolveQuality(g: Graphics): Quality {
  if (g !== "auto") return g;
  if (typeof navigator === "undefined") return "medium";
  const nav = navigator as Navigator & { deviceMemory?: number };
  const mobile = /Mobi|Android|iPhone|iPad/i.test(nav.userAgent ?? "");
  const cores = nav.hardwareConcurrency ?? 4;
  const mem = nav.deviceMemory ?? 8;
  if (mobile || cores <= 2 || mem <= 2) return "low";
  if (cores >= 8 && mem >= 8) return "high";
  return "medium";
}

export function resolveReducedMotion(m: MotionMode): boolean {
  if (m === "on") return true;
  if (m === "off") return false;
  return (
    typeof window !== "undefined" &&
    !!window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

// ------------------------------------------------------------------ React
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const getVersion = () => version;

export function useSettings() {
  useSyncExternalStore(subscribe, getVersion, getVersion);
  return {
    settings: current,
    update: updateSettings,
    reset: resetSettings,
    theme: resolveTheme(current.theme),
    quality: resolveQuality(current.graphics),
    reducedMotion: resolveReducedMotion(current.motion),
  };
}

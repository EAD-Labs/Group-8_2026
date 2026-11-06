// Tiny i18n engine: dictionary lookup with English fallback, {placeholders}, plural suffixes,
// a persisted language choice, and cached AI-translated dictionaries for languages that are not
// bundled. Works outside React too (tr / trFor), so library code can use it.

import { useSyncExternalStore } from "react";
import { EN, type Dict, type Key } from "./en";
import { HI } from "./hi";
import { MR } from "./mr";
import { isLangCode, langInfo, type LangCode } from "./registry";

export { LANGS, langInfo, isLangCode, type LangCode, type LangInfo } from "./registry";
export { EN } from "./en";
export type { Key, Dict } from "./en";

/** Dictionaries shipped in the app (always available, no AI needed). */
const STATIC: Partial<Record<LangCode, Partial<Dict>>> = { en: EN as Dict, hi: HI, mr: MR };
/** AI-translated dictionaries loaded from the browser cache or fetched on demand. */
const dynamic: Partial<Record<LangCode, Partial<Dict>>> = {};

const LANG_KEY = "kyro_lang_v1";
const BUNDLE_KEY = (l: LangCode) => `kyro_ui_i18n_v1:${l}`;

let current: LangCode = "en";
let version = 0;
const listeners = new Set<() => void>();
const bump = () => {
  version++;
  listeners.forEach((l) => l());
};

const fill = (s: string, vars?: Record<string, string | number>) =>
  vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;

export const hasStaticBundle = (lang: LangCode) => lang in STATIC;

export function dictFor(lang: LangCode): Partial<Dict> {
  return STATIC[lang] ?? dynamic[lang] ?? {};
}

/** Translate `key` into `lang`, falling back to English for anything missing. */
export function trFor(lang: LangCode, key: Key, vars?: Record<string, string | number>): string {
  const s = dictFor(lang)[key] ?? EN[key];
  return fill(s, vars);
}

/** Translate into the currently selected language. */
export const tr = (key: Key, vars?: Record<string, string | number>) => trFor(current, key, vars);

/** Plural-aware: uses `${key}_one` for n === 1 and `${key}_other` otherwise. */
export function trpFor(
  lang: LangCode,
  key: string,
  n: number,
  vars?: Record<string, string | number>,
): string {
  const k = (n === 1 ? `${key}_one` : `${key}_other`) as Key;
  return trFor(lang, k, { n, ...vars });
}
export const trp = (key: string, n: number, vars?: Record<string, string | number>) =>
  trpFor(current, key, n, vars);

export const getLang = () => current;

export function setLang(lang: LangCode) {
  if (lang === current) return;
  current = lang;
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    /* storage blocked — the choice just won't persist */
  }
  if (typeof document !== "undefined") document.documentElement.lang = lang;
  bump();
}

/** Restore the saved language (and its cached dictionary) in the browser. Safe to call many times. */
export function initLang(): LangCode {
  if (typeof window === "undefined") return current;
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (isLangCode(saved) && saved !== current) {
      loadCachedBundle(saved);
      current = saved;
      document.documentElement.lang = saved;
      bump();
    }
  } catch {
    /* ignore */
  }
  return current;
}

// ------------------------------------------------------------------ AI-translated dictionaries
const placeholders = (s: string) =>
  [...s.matchAll(/\{(\w+)\}/g)]
    .map((m) => m[1])
    .sort()
    .join(",");

/** Keep only entries that are strings and keep every {placeholder} of the English source. */
export function validateBundle(raw: unknown): Partial<Dict> {
  const out: Partial<Dict> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!(k in EN) || typeof v !== "string" || !v.trim()) continue;
    if (placeholders(v) !== placeholders(EN[k as Key])) continue;
    out[k as Key] = v.slice(0, 1200);
  }
  return out;
}

export function loadCachedBundle(lang: LangCode): boolean {
  if (hasStaticBundle(lang)) return true;
  if (dynamic[lang]) return true;
  try {
    const raw = localStorage.getItem(BUNDLE_KEY(lang));
    if (!raw) return false;
    const b = validateBundle(JSON.parse(raw));
    if (Object.keys(b).length < 20) return false;
    dynamic[lang] = b;
    bump();
    return true;
  } catch {
    return false;
  }
}

export function setDynamicBundle(lang: LangCode, raw: unknown): number {
  const b = { ...dynamic[lang], ...validateBundle(raw) }; // merge: a top-up adds only the new strings
  dynamic[lang] = b;
  try {
    localStorage.setItem(BUNDLE_KEY(lang), JSON.stringify(b));
  } catch {
    /* ignore */
  }
  bump();
  return Object.keys(b).length;
}

/** Forget every AI-translated interface dictionary (memory and browser storage). */
export function clearDynamicBundles() {
  for (const k of Object.keys(dynamic)) delete dynamic[k as LangCode];
  try {
    for (const l of Object.keys(localStorage))
      if (l.startsWith("kyro_ui_i18n_v1:")) localStorage.removeItem(l);
  } catch {
    /* ignore */
  }
  bump();
}

export const hasBundle = (lang: LangCode) => hasStaticBundle(lang) || loadCachedBundle(lang);

/**
 * The strings that still need translating for `lang`: all of them for a fresh language, or only the
 * ones a cached dictionary lacks (so strings added in an update get translated too).
 */
export function englishToTranslate(lang?: LangCode): Record<string, string> {
  if (!lang) return { ...EN };
  if (hasStaticBundle(lang)) return {};
  const have = dynamic[lang] ?? {};
  return Object.fromEntries(Object.entries(EN).filter(([k]) => !(k in have)));
}

// ------------------------------------------------------------------ React
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const getVersion = () => version;

export function useI18n() {
  useSyncExternalStore(subscribe, getVersion, getVersion);
  const lang = current;
  return {
    lang,
    info: langInfo(lang),
    setLang,
    t: (key: Key, vars?: Record<string, string | number>) => trFor(lang, key, vars),
    tp: (key: string, n: number, vars?: Record<string, string | number>) =>
      trpFor(lang, key, n, vars),
  };
}

// Voice helpers for the classroom: text-to-speech with a distinct voice per persona, and a
// speech-recognition wrapper that survives Chrome's silence time-outs and explains failures.
// Everything here is browser-API based and degrades gracefully when an API is missing.

import { useEffect, useState } from "react";
import type { VoiceProfile } from "@/components/classroom/personas";
import { tr } from "./i18n";

// ------------------------------------------------------------------ voice selection
export type VoiceLike = { name: string; lang: string; localService?: boolean };

const FEMALE =
  /female|woman|zira|hazel|susan|samantha|victoria|karen|moira|tessa|veena|fiona|heera|neerja|swara|kalpana|lekha|pallavi|shruti|tanishaa|aarohi|dhwani|sapna|vani|ananya|paulina|monica|marisol|helena|elena|denise|elsa|julie|amelie|lucia|carmen|sabina|aria|jenny|libby|sonia|natasha|catherine|allison|ava\b|serena|kate\b|joanna|salli|kimberly|ivy|emma|amy/i;
const MALE =
  /\bmale\b|david|mark\b|george|james|daniel|alex\b|fred\b|ravi|prabhat|hemant|rishi|madhur|valluvar|mohan|bashkar|manohar|niranjan|jorge|diego|pablo|enrique|paul\b|claude|henri|guy\b|ryan|thomas|oliver|arthur|aaron|richard|sean|liam|brian|matthew|joey|justin|kevin|russell/i;

export function guessGender(name: string): "female" | "male" | null {
  if (FEMALE.test(name)) return "female"; // test first: "female" contains "male"
  if (MALE.test(name)) return "male";
  return null;
}

const langScore = (voiceLang: string, prefs: string[]) => {
  const v = voiceLang.toLowerCase().replace("_", "-");
  for (let i = 0; i < prefs.length; i++) {
    const p = (prefs[i] ?? "").toLowerCase();
    if (v === p) return 12 - i * 2;
    if (v.startsWith(p.split("-")[0] ?? "")) return 5 - i;
  }
  return 0;
};

/**
 * Give each profile the best-matching voice, preferring a *different* voice per profile so the
 * teacher, Maya and Arjun do not all sound the same. Returns null for a profile when the device
 * has no English voice at all (the browser default is then used).
 */
export function pickVoices<T extends VoiceLike>(
  voices: T[],
  profiles: VoiceProfile[],
  /** BCP-47 tag of the lesson language (e.g. "hi-IN"); omit for English */
  lang?: string,
): Array<T | null> {
  const base = (lang ?? "en").split("-")[0]?.toLowerCase() ?? "en";
  const candidates = voices.filter((v) => v.lang.toLowerCase().replace("_", "-").startsWith(base));
  const used = new Set<T>();
  return profiles.map((p) => {
    const prefs = base === "en" ? p.langs : [lang as string];
    let best: T | null = null;
    let bestScore = -Infinity;
    for (const v of candidates) {
      let s = langScore(v.lang, prefs);
      const g = guessGender(v.name);
      if (g === p.gender) s += 10;
      else if (g !== null) s -= 12;
      if (v.localService) s += 1;
      if (used.has(v)) s -= 30;
      if (s > bestScore) {
        bestScore = s;
        best = v;
      }
    }
    if (best) used.add(best);
    return best;
  });
}

export function useVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", load);
  }, []);
  return voices;
}

// ------------------------------------------------------------------ text to speech
export const ttsSupported = () =>
  typeof window !== "undefined" &&
  "speechSynthesis" in window &&
  "SpeechSynthesisUtterance" in window;

/** Split into sentence-sized chunks. Chrome silently stops utterances longer than ~15 s. */
export function chunkForSpeech(text: string, max = 200): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const sentences = clean.match(/[^.!?…]+[.!?…]*\s*/g) ?? [clean];
  const out: string[] = [];
  let cur = "";
  const push = () => {
    if (cur.trim()) out.push(cur.trim());
    cur = "";
  };
  for (const s of sentences) {
    if (s.length > max) {
      push();
      // break an over-long sentence on commas / spaces
      let rest = s;
      while (rest.length > max) {
        let cut = rest.lastIndexOf(",", max);
        if (cut < max * 0.4) cut = rest.lastIndexOf(" ", max);
        if (cut <= 0) cut = max;
        out.push(rest.slice(0, cut + 1).trim());
        rest = rest.slice(cut + 1);
      }
      cur = rest;
      continue;
    }
    if ((cur + s).length > max) push();
    cur += s;
  }
  push();
  return out;
}

/** Make symbols read sensibly ("ΔU = Q − W" → "delta U equals Q minus W"). */
export function speakable(text: string, lang = "en"): string {
  if (lang.split("-")[0] !== "en")
    // other languages: leave the notation alone (their voices read symbols their own way)
    return text.replace(/→/g, ", ").replace(/−/g, "-").replace(/\s+/g, " ").trim();
  return text
    .replace(/ΔU/g, "delta U")
    .replace(/ΔS/g, "delta S")
    .replace(/ΔH/g, "delta H")
    .replace(/Δ/g, "delta ")
    .replace(/Σ/g, "sum of ")
    .replace(/σ/g, "sigma")
    .replace(/μ/g, "mu")
    .replace(/√/g, "square root of ")
    .replace(/≥/g, " is at least ")
    .replace(/≤/g, " is at most ")
    .replace(/≠/g, " is not equal to ")
    .replace(/∩/g, " intersect ")
    .replace(/±/g, " plus or minus ")
    .replace(/−/g, " minus ")
    .replace(/→/g, ", then ")
    .replace(/=/g, " equals ")
    .replace(/\s+/g, " ")
    .trim();
}

export type SpeakOptions = {
  profile: VoiceProfile;
  voice?: SpeechSynthesisVoice | null;
  /** BCP-47 tag of the lesson language; defaults to the persona's English tag */
  lang?: string;
  /** playback speed multiplier from the speed button */
  speed?: number;
  onStart?: () => void;
  /** called once, after the last chunk finished naturally (not when cancelled) */
  onEnd?: () => void;
  onError?: (message: string) => void;
};

/** Speak `text`; returns a cancel function. Always cancels anything already speaking. */
export function speak(text: string, o: SpeakOptions): () => void {
  if (!ttsSupported()) {
    o.onError?.(tr("voice.noTts"));
    return () => {};
  }
  const synth = window.speechSynthesis;
  synth.cancel();
  const chunks = chunkForSpeech(speakable(text, o.lang));
  let cancelled = false;
  let i = 0;
  const next = () => {
    if (cancelled) return;
    const part = chunks[i++];
    if (part === undefined) {
      o.onEnd?.();
      return;
    }
    const u = new SpeechSynthesisUtterance(part);
    if (o.voice) {
      u.voice = o.voice;
      u.lang = o.voice.lang;
    } else {
      u.lang = o.lang ?? o.profile.langs[0] ?? "en-US";
    }
    u.rate = Math.min(2, Math.max(0.5, o.profile.rate * (o.speed ?? 1)));
    u.pitch = o.profile.pitch;
    if (i === 1) u.onstart = () => !cancelled && o.onStart?.();
    u.onend = next;
    u.onerror = (e) => {
      if (cancelled) return;
      const code = (e as SpeechSynthesisErrorEvent).error;
      if (code === "canceled" || code === "interrupted") return;
      cancelled = true;
      o.onError?.(code === "not-allowed" ? tr("speech.blocked") : tr("speech.failed"));
    };
    synth.speak(u);
  };
  if (chunks.length === 0) {
    queueMicrotask(() => o.onEnd?.());
    return () => {};
  }
  // Chrome needs a tick after cancel() before a new speak() is reliably accepted.
  const t = window.setTimeout(next, 60);
  return () => {
    cancelled = true;
    window.clearTimeout(t);
    synth.cancel();
  };
}

export function cancelSpeech() {
  if (ttsSupported()) window.speechSynthesis.cancel();
}

// ------------------------------------------------------------------ speech to text
type RecResult = { isFinal: boolean; 0: { transcript: string }; length: number };
type RecEvent = { resultIndex: number; results: ArrayLike<RecResult> };
type Rec = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: RecEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type RecCtor = new () => Rec;

const recCtor = (): RecCtor | undefined => {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as Record<string, RecCtor | undefined>;
  return w["SpeechRecognition"] ?? w["webkitSpeechRecognition"];
};
export const sttSupported = () => recCtor() !== undefined;

export function describeRecognitionError(code: string): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return tr("rec.blocked");
    case "no-speech":
      return tr("rec.noSpeech");
    case "audio-capture":
      return tr("rec.noMic");
    case "network":
      return tr("rec.network");
    case "language-not-supported":
      return tr("rec.langUnsupported");
    default:
      return tr("rec.stopped");
  }
}

export type Recognizer = { stop: () => void };

export type RecognizerOptions = {
  /** text already in the box; the transcript is appended to it */
  base: string;
  lang?: string;
  /** full text (base + spoken so far) on every update */
  onText: (full: string, interim: boolean) => void;
  /** called exactly once when listening has fully ended; `error` is a user-facing message */
  onDone: (error?: string) => void;
};

/**
 * Start dictation. Chrome ends a "continuous" session after a few seconds of silence, which cut
 * learners off mid-thought; we transparently restart (a few times) until the user presses stop.
 */
export function startRecognizer(o: RecognizerOptions): Recognizer | null {
  const Ctor = recCtor();
  if (!Ctor) return null;
  let finalText = "";
  let interimText = "";
  let stoppedByUser = false;
  let finished = false;
  let restarts = 0;
  let lang = o.lang ?? "en-IN";
  let lastError: string | undefined;
  let startedAt = 0;
  let rec: Rec;

  const emit = (interim: boolean) => {
    const spoken = `${finalText} ${interimText}`.replace(/\s+/g, " ").trim();
    o.onText([o.base.trim(), spoken].filter(Boolean).join(" "), interim);
  };
  const finish = (error?: string) => {
    if (finished) return;
    finished = true;
    interimText = "";
    emit(false);
    o.onDone(error);
  };
  const create = () => {
    rec = new Ctor();
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = true;
    rec.onresult = (e) => {
      interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (!r) continue;
        const t = r[0]?.transcript ?? "";
        if (r.isFinal) finalText = `${finalText} ${t}`;
        else interimText += t;
      }
      emit(true);
    };
    rec.onerror = (e) => {
      lastError = e.error;
    };
    rec.onend = () => {
      const code = lastError;
      lastError = undefined;
      if (stoppedByUser || finished) return finish();
      if (code === "language-not-supported" && lang === "en-IN") {
        lang = "en-US";
        return begin();
      }
      const fatal = code && code !== "no-speech" && code !== "aborted";
      if (fatal) return finish(describeRecognitionError(code));
      // Silence time-out: restart unless we already did so several times without hearing anything.
      const heardSomething = finalText.trim().length > 0 || interimText.trim().length > 0;
      if (restarts < 6 && Date.now() - startedAt > 400) {
        restarts++;
        return begin();
      }
      finish(heardSomething ? undefined : describeRecognitionError("no-speech"));
    };
  };
  const begin = () => {
    try {
      create();
      startedAt = Date.now();
      rec.start();
    } catch {
      finish(describeRecognitionError("audio-capture"));
    }
  };
  begin();
  return {
    stop: () => {
      stoppedByUser = true;
      try {
        rec.stop();
      } catch {
        finish();
      }
    },
  };
}

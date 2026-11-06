// Speech signal (HLD §6.5/§10.6): speech rate and hesitation from how the learner explains a concept
// aloud. Computed in the browser from the microphone's loudness over time. NOTHING is recorded or
// uploaded: only a list of loudness numbers exists, and it is discarded after scoring.

export const FRAME_MS = 50;
export type Pause = { at: number; length: number; nextWord: string; term?: string };
export type SpeechSignal = {
  words: number;
  /** seconds from first to last speech */
  span: number;
  /** words per minute over the whole span, pauses included */
  speechRate: number;
  /** words per minute while actually speaking */
  articulationRate: number;
  /** share of the span spent in long pauses, 0-100 */
  hesitationIndex: number;
  longestPause: number;
  pauses: Pause[];
  /** plain-language markers such as "Long pause (2.4 s) before “entropy”" */
  markers: string[];
  reliable: boolean;
};

const words = (s: string) => s.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? [];
const pct = (sorted: number[], p: number) =>
  sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))))] ?? 0;

/** Split a loudness trace into speech segments (start/end in frames), bridging very short dips. */
export function segments(frames: number[]): Array<[number, number]> {
  if (frames.length < 8) return [];
  const sorted = [...frames].sort((a, b) => a - b);
  const floor = pct(sorted, 0.2);
  const loud = pct(sorted, 0.9);
  if (loud - floor < 0.004) return []; // flat: no speech
  const thr = floor + 0.25 * (loud - floor);
  const on = frames.map((f) => f > thr);
  const segs: Array<[number, number]> = [];
  let start = -1;
  for (let i = 0; i <= on.length; i++) {
    if (on[i] && start < 0) start = i;
    if (!on[i] && start >= 0) {
      segs.push([start, i]);
      start = -1;
    }
  }
  // bridge dips shorter than 250 ms (a stop consonant is not a pause), drop blips shorter than 100 ms
  const bridge = Math.round(250 / FRAME_MS);
  const merged: Array<[number, number]> = [];
  for (const s of segs) {
    const last = merged[merged.length - 1];
    if (last && s[0] - last[1] <= bridge) last[1] = s[1];
    else merged.push([s[0], s[1]]);
  }
  return merged.filter(([a, b]) => (b - a) * FRAME_MS >= 100);
}

export function analyseSpeech(
  frames: number[],
  transcript: string,
  terms: string[] = [],
  opts: { pauseMs?: number } = {},
): SpeechSignal {
  const ws = words(transcript);
  const segs = segments(frames);
  const empty: SpeechSignal = {
    words: ws.length,
    span: 0,
    speechRate: 0,
    articulationRate: 0,
    hesitationIndex: 0,
    longestPause: 0,
    pauses: [],
    markers: [],
    reliable: false,
  };
  if (!segs.length || ws.length < 3) return empty;
  const first = segs[0]![0];
  const last = segs[segs.length - 1]![1];
  const span = ((last - first) * FRAME_MS) / 1000;
  const speakingFrames = segs.reduce((n, [a, b]) => n + (b - a), 0);
  const speaking = (speakingFrames * FRAME_MS) / 1000;
  const minPause = (opts.pauseMs ?? 700) / FRAME_MS;
  const termSet = new Set(terms.map((t) => t.toLowerCase()));
  const pauses: Pause[] = [];
  let spokenBefore = 0;
  for (let i = 0; i < segs.length - 1; i++) {
    spokenBefore += segs[i]![1] - segs[i]![0];
    const gap = segs[i + 1]![0] - segs[i]![1];
    if (gap < minPause) continue;
    // which word follows the pause? words are spread over the time actually spent speaking
    const idx = Math.min(ws.length - 1, Math.round((spokenBefore / speakingFrames) * ws.length));
    const near = ws.slice(idx, idx + 3);
    const term = near.find((w) => termSet.has(w.toLowerCase()));
    pauses.push({
      at: ((segs[i]![1] - first) * FRAME_MS) / 1000,
      length: (gap * FRAME_MS) / 1000,
      nextWord: ws[idx] ?? "",
      ...(term ? { term } : {}),
    });
  }
  const pauseTime = pauses.reduce((n, p) => n + p.length, 0);
  const markers = pauses
    .filter((p) => p.length >= 1.0)
    .map((p) => `Long pause (${p.length.toFixed(1)} s) before “${p.term ?? p.nextWord}”`);
  return {
    words: ws.length,
    span,
    speechRate: Math.round((ws.length / Math.max(span, 1)) * 60),
    articulationRate: Math.round((ws.length / Math.max(speaking, 1)) * 60),
    hesitationIndex: Math.min(100, Math.round((pauseTime / Math.max(span, 1)) * 100)),
    longestPause: Math.round(Math.max(0, ...pauses.map((p) => p.length)) * 10) / 10,
    pauses,
    markers,
    reliable: span >= 5 && ws.length >= 8,
  };
}

/** Terms worth listening for: the concept's key words (title, blanks, hint keywords). */
export function domainTerms(title: string, answers: string[]): string[] {
  const out = new Set<string>();
  for (const s of [title, ...answers])
    for (const w of words(s)) if (w.length >= 5) out.add(w.toLowerCase());
  return [...out];
}

export type GapReport = {
  coverage: number;
  covered: string[];
  missing: string[];
  signal: SpeechSignal;
  gapTerms: string[];
};
/** Concept coverage of the explanation (typed or transcribed) plus the hesitation markers. */
export function gapReport(transcript: string, keyTerms: string[], signal: SpeechSignal): GapReport {
  const t = transcript.toLowerCase();
  const covered = keyTerms.filter((k) =>
    t.includes(k.toLowerCase().slice(0, Math.max(5, k.length - 2))),
  );
  const missing = keyTerms.filter((k) => !covered.includes(k));
  return {
    coverage: keyTerms.length ? Math.round((covered.length / keyTerms.length) * 100) : 0,
    covered,
    missing,
    signal,
    gapTerms: [
      ...new Set(
        signal.pauses.filter((p) => p.length >= 1.0 && p.term).map((p) => p.term as string),
      ),
    ],
  };
}

// ---------------------------------------------------------------- microphone meter (browser only)
export type Meter = { stop: () => number[] };
/**
 * Listen to the microphone and keep only its loudness over time. No audio is stored, kept or sent
 * anywhere. Rejects if the microphone is refused (callers fall back to typing).
 */
export async function startMeter(): Promise<Meter> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const Ctx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  // browsers may create the context 'suspended' (autoplay rules); until it runs, speech would go unmeasured
  if (ctx.state === "suspended") await ctx.resume().catch(() => undefined);
  const src = ctx.createMediaStreamSource(stream);
  const frames: number[] = [];
  // Time must come from the AUDIO clock, not a timer: on a busy page timers stall and would squash
  // pauses. The processor receives every block in order, so each 50 ms window is exactly 50 ms of sound.
  const windowSamples = Math.max(1, Math.round((ctx.sampleRate * FRAME_MS) / 1000));
  let acc = 0;
  let n = 0;
  const proc = ctx.createScriptProcessor(2048, 1, 1);
  proc.onaudioprocess = (e) => {
    const d = e.inputBuffer.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      const v = d[i] ?? 0;
      acc += v * v;
      if (++n >= windowSamples) {
        frames.push(Math.sqrt(acc / n));
        acc = 0;
        n = 0;
      }
    }
  };
  const mute = ctx.createGain();
  mute.gain.value = 0; // the processor must be connected to run, but nothing is played back
  src.connect(proc);
  proc.connect(mute);
  mute.connect(ctx.destination);
  return {
    stop: () => {
      proc.onaudioprocess = null;
      try {
        src.disconnect();
        proc.disconnect();
      } catch {
        /* already disconnected */
      }
      stream.getTracks().forEach((t) => t.stop());
      void ctx.close();
      return frames;
    },
  };
}
